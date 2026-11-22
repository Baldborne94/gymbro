import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROUTINE, TEXT, startFakeAnthropic } from '../support/fake-anthropic.mjs';
import { startServer, type Client, type TestServer } from '../support/server';

let server: TestServer;
let anthropic: Awaited<ReturnType<typeof startFakeAnthropic>>;
let api: Client;

beforeAll(async () => {
  anthropic = await startFakeAnthropic();
  server = await startServer({ ANTHROPIC_API_KEY: 'sk-ant-test', ANTHROPIC_BASE_URL: anthropic.url });
  api = await server.client().login();
});
afterAll(async () => {
  await server?.stop();
  await anthropic?.close();
});

const PHOTO = '0b8f6c2e-1d3a-4c5b-9e7f-112233445566';

describe('accesso', () => {
  it('lo stato del server è pubblico', async () => {
    expect(await (await fetch(`${server.url}/api/health`)).json()).toEqual({ ok: true });
  });

  it('senza accesso le API sono chiuse', async () => {
    const anon = server.client();
    expect(await anon.json('GET', '/api/me')).toMatchObject({ authenticated: false });
    for (const [method, p] of [
      ['POST', '/api/sync'], ['GET', `/api/photos/${PHOTO}`], ['PUT', `/api/photos/${PHOTO}`],
      ['GET', '/api/export/gymbro.json'], ['GET', '/api/export/sessioni.csv'], ['POST', '/api/import'],
      ['GET', '/api/backups'], ['POST', '/api/backups'], ['POST', '/api/coach'], ['POST', '/api/push/test'],
    ]) {
      expect((await anon.request(method, p, method === 'GET' ? undefined : {})).status, `${method} ${p}`).toBe(401);
    }
  });

  it('una password sbagliata non entra, quella giusta sì con un cookie protetto', async () => {
    const c = server.client();
    const wrong = await c.post('/api/login', { password: 'sbagliata' });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'Password errata' });

    const ok = await c.post('/api/login', { password: 'segreta' });
    const cookie = ok.headers.get('set-cookie')!;
    expect(cookie).toMatch(/gb_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/Secure/);
    expect(await c.json('GET', '/api/me')).toMatchObject({ authenticated: true });
  });

  it('dietro un proxy HTTPS il cookie diventa sicuro', async () => {
    const c = server.client();
    const res = await c.post('/api/login', { password: 'segreta' }, { 'x-forwarded-proto': 'https' });
    expect(res.headers.get('set-cookie')).toMatch(/Secure/);
  });

  it('un cookie falsificato non vale', async () => {
    const c = server.client();
    c.cookie = 'gb_session=9999999999.firmafalsa';
    expect((await c.post('/api/sync', {})).status).toBe(401);
  });

  it('l’uscita cancella la sessione', async () => {
    const c = await server.client().login();
    const res = await c.post('/api/logout');
    expect(res.headers.get('set-cookie')).toMatch(/gb_session=;/);
    expect(await c.json('GET', '/api/me')).toMatchObject({ authenticated: false });
  });
});

describe('sincronizzazione', () => {
  const row = (over: object = {}) => ({
    id: 'api-ex', updated_at: 5, deleted: false, name: 'Da API', muscle: 'petto', secondary: [], equipment: 'manubri',
    kind: 'pesi', unilateral: false, load_unit: 'kg', step: 2, notch_kg: null, notes: '', photo_id: null, custom: true, ...over,
  });

  it('il primo scaricamento contiene gli esercizi precaricati', async () => {
    const res = await api.json('POST', '/api/sync', { since: 0, changes: {} });
    expect(res.changes.exercises.length).toBeGreaterThanOrEqual(100);
    expect(res.rev).toBeGreaterThan(0);
    expect(typeof res.epoch).toBe('string');
  });

  it('salva, non duplica a un nuovo invio e restituisce solo le novità', async () => {
    const before = await api.json('POST', '/api/sync', { since: 0, changes: {} });
    const first = await api.json('POST', '/api/sync', { since: before.rev, changes: { exercises: [row()] } });
    expect(first.changes.exercises.map((r: { id: string }) => r.id)).toEqual(['api-ex']);
    const again = await api.json('POST', '/api/sync', { since: first.rev, changes: { exercises: [row()] } });
    expect(again.changes).toEqual({});
    expect(again.rev).toBe(first.rev);
  });

  it('una richiesta malformata non rompe il server', async () => {
    expect((await api.post('/api/sync', { since: 'boh', changes: { exercises: 'non una lista' } })).status).toBe(200);
    expect((await api.request('POST', '/api/sync', 'testo', { 'content-type': 'text/plain' })).status).toBeLessThan(500);
    expect((await fetch(`${server.url}/api/health`)).ok).toBe(true);
  });
});

describe('foto', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

  it('carica e restituisce una foto, con cache lunga', async () => {
    expect((await api.request('PUT', `/api/photos/${PHOTO}`, jpeg, { 'content-type': 'image/jpeg' })).status).toBe(200);
    const res = await api.get(`/api/photos/${PHOTO}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toMatch(/immutable/);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(jpeg);
    expect(fs.existsSync(path.join(server.dataDir, 'photos', `${PHOTO}.jpg`))).toBe(true);
  });

  it('rifiuta identificativi non validi e risponde 404 per foto inesistenti', async () => {
    expect((await api.request('PUT', '/api/photos/..%2F..%2Fevil', jpeg, { 'content-type': 'image/jpeg' })).status).toBe(400);
    expect((await api.get('/api/photos/non-valido')).status).toBe(400);
    expect((await api.get('/api/photos/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });
});

describe('dati', () => {
  it('esporta il JSON completo come file da scaricare', async () => {
    const res = await api.get('/api/export/gymbro.json?photos=1');
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="gymbro-\d{4}-\d{2}-\d{2}\.json"/);
    const data = await res.json();
    expect(data.app).toBe('gymbro');
    expect(data.tables.exercises.length).toBeGreaterThanOrEqual(100);
    expect(Object.keys(data.photos)).toContain(PHOTO);
  });

  it('esporta sessioni e cardio in CSV', async () => {
    for (const p of ['/api/export/sessioni.csv', '/api/export/cardio.csv']) {
      const res = await api.get(p);
      expect(res.headers.get('content-type')).toMatch(/text\/csv/);
      expect(res.headers.get('content-disposition')).toMatch(/\.csv"/);
    }
  });

  it('importa un’esportazione e rifiuta file estranei', async () => {
    const bad = await api.post('/api/import', { qualcosa: 1 });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/GymBro/);
    const data = await (await api.get('/api/export/gymbro.json')).json();
    const res = await api.json('POST', '/api/import', data);
    expect(res.rows.exercises).toBe(data.tables.exercises.length);
  });

  it('esegue un backup su richiesta e lo elenca', async () => {
    const done = await api.json('POST', '/api/backups');
    expect(done.name).toMatch(/^gymbro-.*\.db$/);
    expect(fs.existsSync(path.join(server.backupDir, 'db', done.name))).toBe(true);
    const status = await api.json('GET', '/api/backups');
    expect(status).toMatchObject({ enabled: false, keep: 0 });
    expect(status.list.map((b: { name: string }) => b.name)).toContain(done.name);
  });
});

describe('notifiche', () => {
  it('fornisce la chiave pubblica e gestisce le iscrizioni', async () => {
    const info = await api.json('GET', '/api/push');
    expect(info.key.length).toBeGreaterThan(40);
    expect(info.devices).toBe(0);
    expect((await api.post('/api/push/subscribe', { endpoint: 'http://non-sicuro' })).status).toBe(400);
    const sub = { endpoint: 'https://push.invalid/abc', keys: { p256dh: 'x', auth: 'y' } };
    expect((await api.post('/api/push/subscribe', sub)).status).toBe(200);
    expect((await api.json('GET', '/api/push')).devices).toBe(1);
    await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint });
    expect((await api.json('GET', '/api/push')).devices).toBe(0);
  });
});

describe('coach AI', () => {
  it('con la chiave il coach è attivo', async () => {
    expect((await api.json('GET', '/api/me')).features.coach).toBe(true);
  });

  it('rifiuta richieste non valide', async () => {
    expect((await api.post('/api/coach', { mode: 'altro' })).status).toBe(400);
  });

  it('propone la progressione usando lo storico e il modello previsto', async () => {
    await api.post('/api/sync', {
      since: 0,
      changes: {
        workouts: [{ id: 'cw1', updated_at: 9, deleted: false, routine_id: null, day_id: null, name: 'Push', date: '2026-11-20', started_at: Date.now() - 86_400_000, finished_at: Date.now() - 82_800_000, notes: '' }],
        sets: [{ id: 'cs1', updated_at: 9, deleted: false, workout_id: 'cw1', workout_exercise_id: 'cwe1', exercise_id: 'base-panca-piana', position: 0, kind: 'normale', load: 80, reps: 8, seconds: null, rpe: 8, rir: null, done: true, done_at: 1 }],
      },
    });
    anthropic.state.mode = 'ok';
    anthropic.state.requests.length = 0;
    const res = await api.json('POST', '/api/coach', { mode: 'progressione' });
    expect(res.text).toBe(TEXT);

    const [req] = anthropic.state.requests;
    expect(req.url).toMatch(/^\/v1\/messages/);
    expect(req.headers.authorization).toBe('Bearer sk-ant-test');
    expect(req.headers['anthropic-beta']).toMatch(/server-side-fallback/);
    expect(req.body).toMatchObject({ model: 'claude-opus-5-5', stream: true, fallbacks: 'default', thinking: { type: 'adaptive' } });
    expect(req.body.output_config.format).toBeUndefined();
    const prompt = req.body.messages[0].content as string;
    expect(prompt).toContain('Panca piana');
    expect(prompt).toContain('80×8@8');
    // Senza richiesta di scheda la libreria non viene inviata.
    expect(prompt).not.toContain('Libreria esercizi');
  });

  it('genera una scheda strutturata scartando esercizi inesistenti e giorni vuoti', async () => {
    anthropic.state.requests.length = 0;
    const res = await api.json('POST', '/api/coach', { mode: 'scheda', goal: 'Forza', days: 3, minutes: 60 });
    expect(res.routine.name).toBe(ROUTINE.name);
    expect(res.routine.days).toHaveLength(1);
    expect(res.routine.days[0].exercises.map((e: { exercise_id: string }) => e.exercise_id)).toEqual(['base-panca-piana', 'base-squat']);
    const body = anthropic.state.requests[0].body;
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.messages[0].content).toContain('Libreria esercizi');
    expect(body.messages[0].content).toContain('Giorni a settimana: 3');
  });

  it('spiega in italiano un rifiuto o una chiave non valida', async () => {
    anthropic.state.mode = 'refusal';
    let res = await api.post('/api/coach', { mode: 'stalli' });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/non può rispondere/);

    anthropic.state.mode = 'unauthorized';
    res = await api.post('/api/coach', { mode: 'stalli' });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/chiave API di Anthropic non è valida/);
    anthropic.state.mode = 'ok';
  });
});

describe('server senza chiave Anthropic', () => {
  let plain: TestServer;
  beforeAll(async () => { plain = await startServer(); });
  afterAll(async () => { await plain?.stop(); });

  it('nasconde il coach', async () => {
    const c = await plain.client().login();
    expect((await c.json('GET', '/api/me')).features.coach).toBe(false);
    expect((await c.post('/api/coach', { mode: 'stalli' })).status).toBe(404);
  });

  it('dopo cinque password sbagliate blocca anche quella giusta', async () => {
    const c = plain.client();
    for (let i = 0; i < 5; i++) expect((await c.post('/api/login', { password: `no${i}` })).status).toBe(401);
    const blocked = await c.post('/api/login', { password: 'segreta' });
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/Troppi tentativi/);
  });
});

describe('avvio', () => {
  it('senza password il server si rifiuta di partire', async () => {
    await expect(startServer({ GYMBRO_PASSWORD: '' })).rejects.toThrow(/GYMBRO_PASSWORD non impostata/);
  });
});
