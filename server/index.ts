import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { PHOTOS_DIR, sync } from './db';
import {
  COOKIE, PASSWORD, SESSION_SECONDS, checkPassword, createToken, loginBlocked,
  recordFailure, resetFailures, verifyToken,
} from './auth';
import type { SyncRequest } from '../shared/schema';

if (!PASSWORD) {
  console.error('GYMBRO_PASSWORD non impostata: definiscila nel file .env e riavvia.');
  process.exit(1);
}

const PORT = Number(process.env.PORT ?? 8080);
const WEB_DIR = path.join(import.meta.dirname, 'web');
const PHOTO_ID = /^[0-9a-f-]{36}$/;

const app = Fastify({ logger: { level: 'warn' }, trustProxy: true, bodyLimit: 20 * 1024 * 1024 });
await app.register(cookie);

app.addContentTypeParser(/^image\//, { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

// Tutte le API richiedono la sessione, tranne accesso e stato.
const OPEN = new Set(['/api/login', '/api/logout', '/api/me', '/api/health']);
app.addHook('onRequest', async (req, reply) => {
  const url = req.url.split('?')[0];
  if (!url.startsWith('/api/') || OPEN.has(url)) return;
  if (!verifyToken(req.cookies[COOKIE])) return reply.code(401).send({ error: 'Non autenticato' });
});

app.get('/api/health', async () => ({ ok: true }));

app.get('/api/me', async (req) => ({
  authenticated: verifyToken(req.cookies[COOKIE]),
  features: { coach: Boolean(process.env.ANTHROPIC_API_KEY) },
}));

app.post('/api/login', async (req, reply) => {
  if (loginBlocked()) return reply.code(429).send({ error: 'Troppi tentativi. Riprova tra qualche minuto.' });
  const { password } = (req.body ?? {}) as { password?: string };
  if (typeof password !== 'string' || !checkPassword(password)) {
    recordFailure();
    return reply.code(401).send({ error: 'Password errata' });
  }
  resetFailures();
  reply.setCookie(COOKIE, createToken(), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_SECONDS,
    secure: req.protocol === 'https',
  });
  return { ok: true };
});

app.post('/api/logout', async (_req, reply) => {
  reply.clearCookie(COOKIE, { path: '/' });
  return { ok: true };
});

app.post('/api/sync', async (req) => {
  const body = (req.body ?? {}) as Partial<SyncRequest>;
  return sync(Number(body.since) || 0, body.changes ?? {});
});

app.put('/api/photos/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  if (!PHOTO_ID.test(id) || !Buffer.isBuffer(req.body)) return reply.code(400).send({ error: 'Foto non valida' });
  await fs.promises.writeFile(path.join(PHOTOS_DIR, `${id}.jpg`), req.body);
  return { ok: true };
});

app.get('/api/photos/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  if (!PHOTO_ID.test(id)) return reply.code(400).send({ error: 'Foto non valida' });
  const file = path.join(PHOTOS_DIR, `${id}.jpg`);
  if (!fs.existsSync(file)) return reply.code(404).send({ error: 'Foto non trovata' });
  return reply
    .header('Content-Type', 'image/jpeg')
    .header('Cache-Control', 'private, max-age=31536000, immutable')
    .send(fs.createReadStream(file));
});

// PWA compilata: file statici e index.html per tutte le altre pagine.
if (fs.existsSync(WEB_DIR)) {
  await app.register(fastifyStatic, {
    root: WEB_DIR,
    setHeaders(res, file) {
      const name = path.basename(file);
      if (name === 'index.html' || name === 'sw.js' || name.endsWith('.webmanifest')) {
        res.header('Cache-Control', 'no-cache');
      } else if (file.includes(`${path.sep}assets${path.sep}`)) {
        res.header('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.method !== 'GET' || req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Non trovato' });
    return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
  });
}

await app.listen({ port: PORT, host: '0.0.0.0' });
console.log(`GymBro in ascolto sulla porta ${PORT}`);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => { app.close().then(() => process.exit(0)); });
}
