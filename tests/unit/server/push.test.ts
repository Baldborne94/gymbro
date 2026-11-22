import { describe, expect, it, vi } from 'vitest';

// Il servizio di notifiche dei browser è simulato: un indirizzo è scaduto (410), uno non risponde.
const sent: string[] = [];
vi.mock('web-push', () => ({
  generateVAPIDKeys: () => ({ publicKey: 'chiave-pubblica', privateKey: 'chiave-privata' }),
  setVapidDetails: () => undefined,
  sendNotification: async (sub: { endpoint: string }) => {
    if (sub.endpoint.includes('scaduto')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
    if (sub.endpoint.includes('giu')) throw Object.assign(new Error('Down'), { statusCode: 503 });
    sent.push(sub.endpoint);
    return {};
  },
}));

import { sync } from '../../../server/db';
import { PUBLIC_KEY, dueReminder, sendToAll, subscribe, subscriptionCount, unsubscribe } from '../../../server/push';

let clock = 1;
const base = () => ({ updated_at: clock++, deleted: false });
const setting = (id: string, value: unknown) => sync(0, { settings: [{ ...base(), id, value }] } as never);
const wed = (h: number, m = 0) => new Date(2026, 10, 18, h, m); // mercoledì 18 novembre

describe('iscrizioni alle notifiche', () => {
  it('usa le chiavi generate al primo avvio', () => {
    expect(PUBLIC_KEY).toBe('chiave-pubblica');
  });

  it('accetta solo indirizzi https', () => {
    expect(() => subscribe({ endpoint: 'http://insicuro' })).toThrow();
    expect(() => subscribe({})).toThrow();
    subscribe({ endpoint: 'https://push.example/ok' });
    subscribe({ endpoint: 'https://push.example/ok' }); // ripetuta: nessun doppione
    expect(subscriptionCount()).toBe(1);
  });

  it('rimuove gli indirizzi scaduti e tiene quelli temporaneamente irraggiungibili', async () => {
    subscribe({ endpoint: 'https://push.example/scaduto' });
    subscribe({ endpoint: 'https://push.example/giu' });
    const res = await sendToAll({ title: 't', body: 'b' });
    expect(res).toEqual({ sent: 1, failed: 2 });
    expect(sent).toEqual(['https://push.example/ok']);
    expect(subscriptionCount()).toBe(2);
    unsubscribe('https://push.example/giu');
    expect(subscriptionCount()).toBe(1);
  });
});

describe('promemoria', () => {
  sync(0, {
    routines: [{ ...base(), id: 'r1', name: 'PPL', notes: '', status: 'attiva', start_date: '2026-11-01', weeks: 8, end_date: null }],
    routine_days: [
      { ...base(), id: 'd1', routine_id: 'r1', name: 'Push', position: 0, weekday: 3 },
      { ...base(), id: 'd2', routine_id: 'r1', name: 'Pull', position: 1, weekday: 5 },
    ],
  } as never);

  it('è spento finché non lo attivi', () => {
    expect(dueReminder(wed(18, 30))).toBeNull();
  });

  it('nei giorni previsti parte dall’orario scelto e per due ore', () => {
    setting('reminders_enabled', true);
    expect(dueReminder(wed(17, 59))).toBeNull();
    expect(dueReminder(wed(18, 0))).toMatchObject({ title: 'Oggi tocca a: Push', url: '/allena' });
    expect(dueReminder(wed(19, 59))).not.toBeNull();
    expect(dueReminder(wed(20, 0))).toBeNull();
  });

  it('non suona nei giorni senza allenamento previsto', () => {
    expect(dueReminder(new Date(2026, 10, 19, 18, 30))).toBeNull(); // giovedì
  });

  it('rispetta l’orario impostato', () => {
    setting('reminder_time', '07:15');
    expect(dueReminder(wed(7, 20))?.body).toBe('PPL ti aspetta. Carica il bilanciere.');
  });

  it('tace se oggi ti sei già allenato', () => {
    sync(0, { workouts: [{ ...base(), id: 'w1', routine_id: 'r1', day_id: 'd1', name: 'Push', date: '2026-11-18', started_at: 1, finished_at: 2, notes: '' }] } as never);
    expect(dueReminder(wed(7, 20))).toBeNull();
  });
});
