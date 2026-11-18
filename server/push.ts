import fs from 'node:fs';
import path from 'node:path';
import * as webpush from 'web-push';
import type { Routine, RoutineDay, Setting, Workout } from '../shared/schema';
import { DATA_DIR, db, liveRows } from './db';

// Chiavi VAPID generate al primo avvio e conservate con i dati.
const keyFile = path.join(DATA_DIR, '.vapid.json');
if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, JSON.stringify(webpush.generateVAPIDKeys()), { mode: 0o600 });
const keys = JSON.parse(fs.readFileSync(keyFile, 'utf8')) as { publicKey: string; privateKey: string };
webpush.setVapidDetails(process.env.PUSH_CONTACT ?? 'mailto:gymbro@example.com', keys.publicKey, keys.privateKey);

export const PUBLIC_KEY = keys.publicKey;

export function subscribe(sub: { endpoint?: string }) {
  if (!sub || typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://')) throw new Error('Iscrizione non valida');
  db.prepare('INSERT OR REPLACE INTO push_subscriptions (endpoint, data, created_at) VALUES (?, ?, ?)')
    .run(sub.endpoint, JSON.stringify(sub), Date.now());
}
export function unsubscribe(endpoint: string) {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}
export const subscriptionCount = () => (db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get() as { n: number }).n;

/** Invia una notifica a tutti i dispositivi iscritti; le iscrizioni scadute vengono rimosse. */
export async function sendToAll(payload: { title: string; body: string; url?: string }): Promise<{ sent: number; failed: number }> {
  const subs = db.prepare('SELECT endpoint, data FROM push_subscriptions').all() as { endpoint: string; data: string }[];
  let sent = 0;
  let failed = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(JSON.parse(s.data), JSON.stringify(payload), { TTL: 6 * 3600 });
      sent++;
    } catch (err) {
      failed++;
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) unsubscribe(s.endpoint);
    }
  }
  return { sent, failed };
}

const pad = (n: number) => String(n).padStart(2, '0');
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localTime = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const setting = <T>(key: string, fallback: T): T => {
  const row = liveRows<Setting>('settings').find((s) => s.id === key);
  return row && row.value !== null && row.value !== undefined ? (row.value as T) : fallback;
};

/** Il promemoria di oggi, se è un giorno di allenamento previsto e non ti sei ancora allenato. */
export function dueReminder(now = new Date()): { title: string; body: string; url: string } | null {
  if (!setting('reminders_enabled', false)) return null;
  const time = setting('reminder_time', '18:00');
  const current = localTime(now);
  // Si invia solo entro due ore dall'orario scelto, per non disturbare a notte fonda dopo un riavvio.
  const [h, m] = time.split(':').map(Number);
  const minutes = now.getHours() * 60 + now.getMinutes() - (h * 60 + m);
  if (!(current >= time) || minutes < 0 || minutes >= 120) return null;

  const routine = liveRows<Routine>('routines').find((r) => r.status === 'attiva');
  if (!routine) return null;
  const weekday = ((now.getDay() + 6) % 7) + 1;
  const days = liveRows<RoutineDay>('routine_days')
    .filter((d) => d.routine_id === routine.id && d.weekday === weekday)
    .sort((a, b) => a.position - b.position);
  if (!days.length) return null;
  const today = localDate(now);
  if (liveRows<Workout>('workouts').some((w) => w.date === today)) return null;
  return {
    title: `Oggi tocca a: ${days.map((d) => d.name).join(', ')}`,
    body: `${routine.name} ti aspetta. Carica il bilanciere.`,
    url: '/allena',
  };
}
