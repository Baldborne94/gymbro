import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './db';

export const PASSWORD = process.env.GYMBRO_PASSWORD ?? '';
export const COOKIE = 'gb_session';
export const SESSION_SECONDS = 60 * 60 * 24 * 365;

// Segreto generato al primo avvio e conservato insieme ai dati.
const secretFile = path.join(DATA_DIR, '.secret');
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
const secret = fs.readFileSync(secretFile, 'utf8').trim();

// La chiave dipende anche dalla password: cambiandola, le sessioni aperte decadono.
const key = crypto.createHash('sha256').update(`${secret}:${PASSWORD}`).digest();
const sign = (payload: string) => crypto.createHmac('sha256', key).update(payload).digest('base64url');

const safeEqual = (a: string, b: string) => {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};

export const checkPassword = (candidate: string) => safeEqual(candidate, PASSWORD);

export function createToken(): string {
  const exp = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  return `${exp}.${sign(exp)}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || !safeEqual(sig, sign(exp))) return false;
  return Number(exp) > Date.now() / 1000;
}

// Freno ai tentativi di accesso: dopo 5 errori si aspetta un quarto d'ora.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
let failures: number[] = [];

export function loginBlocked(): boolean {
  failures = failures.filter((t) => Date.now() - t < WINDOW_MS);
  return failures.length >= MAX_FAILURES;
}
export const recordFailure = () => { failures.push(Date.now()); };
export const resetFailures = () => { failures = []; };
