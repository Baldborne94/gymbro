import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Campo numerico dei pulsanti −/+ (le etichette dei pulsanti contengono lo stesso nome). */
export const box = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });
import { randomUUID } from 'node:crypto';

export const PASSWORD = 'e2e-password';
export const uid = () => randomUUID();
/** Suffisso breve per nomi unici tra un test e l'altro. */
export const tag = () => randomUUID().slice(0, 6);

const pad = (n: number) => String(n).padStart(2, '0');
/** Data locale AAAA-MM-GG, spostata di `offset` giorni da oggi. */
export const day = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Accesso dalla schermata di login, come farebbe l'utente. */
export async function loginUi(page: Page) {
  await page.goto('/');
  await page.getByLabel('Password').fill(PASSWORD);
  const synced = page.waitForResponse((r) => r.url().endsWith('/api/sync') && r.ok());
  await page.getByRole('button', { name: 'Entra' }).click();
  await expect(page.locator('.bottom-nav')).toBeVisible();
  await synced;
}

/** Accesso diretto via API (più rapido), poi apertura dell'app con i dati già scaricati. */
export async function openApp(page: Page, path = '/') {
  const res = await page.request.post('/api/login', { data: { password: PASSWORD } });
  expect(res.ok()).toBe(true);
  const synced = page.waitForResponse((r) => r.url().endsWith('/api/sync') && r.ok());
  await page.goto(path);
  await synced;
  // Lascia a IndexedDB il tempo di salvare quanto scaricato.
  await page.waitForTimeout(300);
}

type Changes = Record<string, Record<string, unknown>[]>;

const authed = new WeakSet<APIRequestContext>();
/** Le chiamate dirette alle API condividono i cookie della pagina: basta entrare una volta. */
async function ensureLogin(request: APIRequestContext) {
  if (authed.has(request)) return;
  const res = await request.post('/api/login', { data: { password: PASSWORD } });
  expect(res.ok()).toBe(true);
  authed.add(request);
}

/** Scrive dati sul server come farebbe un altro dispositivo. */
export async function seed(request: APIRequestContext, changes: Changes) {
  await ensureLogin(request);
  const now = Date.now();
  const stamped = Object.fromEntries(
    // Data di modifica sempre attuale, così la modifica prevale su quella già sul server.
    Object.entries(changes).map(([t, rows]) => [t, rows.map((r) => ({ deleted: false, ...r, updated_at: now }))]),
  );
  const res = await request.post('/api/sync', { data: { since: 0, changes: stamped } });
  expect(res.ok()).toBe(true);
}

/** Tutte le righe "vive" di una tabella sul server. */
export async function serverRows<T = Record<string, any>>(request: APIRequestContext, table: string): Promise<T[]> {
  await ensureLogin(request);
  const res = await request.post('/api/sync', { data: { since: 0, changes: {} } });
  const body = await res.json();
  return ((body.changes[table] ?? []) as (T & { deleted: boolean })[]).filter((r) => !r.deleted);
}

export interface PlanItem {
  exercise_id: string;
  sets?: number;
  reps_min?: number;
  reps_max?: number;
  load?: number | null;
  rest_sec?: number;
  superset_next?: boolean;
}

/** Crea sul server una scheda attiva (archiviando le altre) con i giorni indicati. */
export async function activeRoutine(request: APIRequestContext, name: string, days: { name: string; weekday?: number; items: PlanItem[] }[]) {
  const others = (await serverRows(request, 'routines')).filter((r) => r.status === 'attiva');
  // Una sessione rimasta aperta da un test precedente bloccherebbe l'avvio di quella nuova.
  const running = (await serverRows(request, 'workouts')).filter((w) => !w.finished_at);
  if (running.length) await seed(request, { workouts: running.map((w) => ({ ...w, deleted: true })) });
  const routineId = uid();
  const dayRows: Record<string, unknown>[] = [];
  const itemRows: Record<string, unknown>[] = [];
  const dayIds: string[] = [];
  days.forEach((d, i) => {
    const dayId = uid();
    dayIds.push(dayId);
    dayRows.push({ id: dayId, routine_id: routineId, name: d.name, position: i, weekday: d.weekday ?? null });
    d.items.forEach((it, j) => itemRows.push({
      id: uid(), routine_id: routineId, day_id: dayId, position: j, sets: 3, reps_min: 8, reps_max: 12, load: null,
      rest_sec: 90, superset_next: false, notes: '', ...it,
    }));
  });
  await seed(request, {
    routines: [
      ...others.map((r) => ({ ...r, status: 'archiviata', end_date: day() })),
      { id: routineId, name, notes: '', status: 'attiva', start_date: day(), weeks: 8, end_date: null },
    ],
    routine_days: dayRows,
    routine_exercises: itemRows,
  });
  return { routineId, dayIds };
}

/** Sessione conclusa con le serie indicate, `daysAgo` giorni fa. */
export function workoutRows(opts: { name: string; daysAgo: number; routineId?: string | null; dayId?: string | null; exercises: [string, ([number | null, number] | number)[]][] }) {
  const start = Date.now() - opts.daysAgo * 86_400_000;
  const workoutId = uid();
  const wes: Record<string, unknown>[] = [];
  const sets: Record<string, unknown>[] = [];
  opts.exercises.forEach(([exerciseId, list], i) => {
    const weId = uid();
    wes.push({ id: weId, workout_id: workoutId, exercise_id: exerciseId, original_exercise_id: null, position: i, reps_min: 8, reps_max: 12, rest_sec: 90, superset_next: false, skipped: false, notes: '' });
    list.forEach((v, j) => {
      const timed = typeof v === 'number';
      sets.push({
        id: uid(), workout_id: workoutId, workout_exercise_id: weId, exercise_id: exerciseId, position: j, kind: 'normale',
        load: timed ? null : v[0], reps: timed ? null : v[1], seconds: timed ? v : null, rpe: null, rir: null, done: true,
        done_at: start + (i * 10 + j) * 60_000,
      });
    });
  });
  return {
    workouts: [{ id: workoutId, routine_id: opts.routineId ?? null, day_id: opts.dayId ?? null, name: opts.name, date: day(-opts.daysAgo), started_at: start, finished_at: start + 3_000_000, notes: '' }],
    workout_exercises: wes,
    sets,
  };
}

/** Esercizio personale di prova, con nome unico. */
export function customExercise(name: string, over: Record<string, unknown> = {}) {
  return {
    id: uid(), name, muscle: 'petto', secondary: [], equipment: 'bilanciere', kind: 'pesi', unilateral: false,
    load_unit: 'kg', step: 2.5, notch_kg: null, notes: '', photo_id: null, custom: true, ...over,
  };
}
