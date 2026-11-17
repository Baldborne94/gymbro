import type { Exercise, Routine, RoutineExercise } from '../../shared/schema';
import { addDays, clock, daysBetween, isoDate, num } from './dates';
import { db, patch, remove, save, uuid } from './db';

export const TEMPLATES: { id: string; label: string; days: string[] }[] = [
  { id: 'vuota', label: 'Scheda vuota', days: ['Giorno 1'] },
  { id: 'ppl', label: 'Push / Pull / Legs', days: ['Push', 'Pull', 'Legs'] },
  { id: 'ul', label: 'Upper / Lower', days: ['Upper A', 'Lower A', 'Upper B', 'Lower B'] },
  { id: 'fb', label: 'Full body', days: ['Full body A', 'Full body B', 'Full body C'] },
];

export async function createRoutine(name: string, days: string[]): Promise<string> {
  const id = uuid();
  await save('routines', { id, name, notes: '', status: 'bozza', start_date: null, weeks: 8, end_date: null });
  for (const [i, day] of days.entries()) {
    await save('routine_days', { id: uuid(), routine_id: id, name: day, position: i, weekday: null });
  }
  return id;
}

/** Copia completa di una scheda, come bozza senza date. */
export async function duplicateRoutine(sourceId: string): Promise<string | null> {
  const source = await db.routines.get(sourceId);
  if (!source) return null;
  const id = uuid();
  await save('routines', {
    id, name: `${source.name} (copia)`, notes: source.notes, status: 'bozza', start_date: null, weeks: source.weeks, end_date: null,
  });
  const days = (await db.routine_days.where('routine_id').equals(sourceId).toArray()).filter((d) => !d.deleted);
  const items = (await db.routine_exercises.where('routine_id').equals(sourceId).toArray()).filter((x) => !x.deleted);
  for (const day of days) {
    const dayId = uuid();
    await save('routine_days', { id: dayId, routine_id: id, name: day.name, position: day.position, weekday: day.weekday });
    for (const { _dirty, updated_at, deleted, ...item } of items.filter((x) => x.day_id === day.id)) {
      await save('routine_exercises', { ...item, id: uuid(), routine_id: id, day_id: dayId });
    }
  }
  return id;
}

export async function deleteDay(dayId: string) {
  const items = await db.routine_exercises.where('day_id').equals(dayId).toArray();
  for (const item of items) if (!item.deleted) await remove('routine_exercises', item.id);
  await remove('routine_days', dayId);
}

export async function deleteRoutine(id: string) {
  const days = await db.routine_days.where('routine_id').equals(id).toArray();
  for (const day of days) if (!day.deleted) await deleteDay(day.id);
  await remove('routines', id);
}

export const activeRoutine = async () =>
  (await db.routines.where('status').equals('attiva').toArray()).find((r) => !r.deleted) ?? null;

/** Rende attiva una scheda; quella attiva in precedenza finisce in archivio. */
export async function activateRoutine(id: string) {
  const today = isoDate();
  const current = (await db.routines.where('status').equals('attiva').toArray()).filter((r) => !r.deleted && r.id !== id);
  for (const r of current) await patch('routines', r.id, { status: 'archiviata', end_date: today });
  await patch('routines', id, { status: 'attiva', start_date: today, end_date: null });
}

export const archiveRoutine = (id: string) => patch('routines', id, { status: 'archiviata', end_date: isoDate() });

export interface Cycle {
  week: number;
  weeks: number;
  end: string;
  daysLeft: number;
  state: 'in_corso' | 'ultima_settimana' | 'conclusa';
  progress: number;
}

/** A che punto è il ciclo di una scheda attiva. */
export function cycleInfo(r: Pick<Routine, 'start_date' | 'weeks' | 'status'>, today = isoDate()): Cycle | null {
  if (r.status !== 'attiva' || !r.start_date || !r.weeks) return null;
  const total = r.weeks * 7;
  const elapsed = Math.max(0, daysBetween(r.start_date, today));
  const daysLeft = total - elapsed;
  return {
    week: Math.min(r.weeks, Math.floor(elapsed / 7) + 1),
    weeks: r.weeks,
    end: addDays(r.start_date, total - 1),
    daysLeft,
    state: daysLeft <= 0 ? 'conclusa' : daysLeft <= 7 ? 'ultima_settimana' : 'in_corso',
    progress: Math.min(1, elapsed / total),
  };
}

export function cycleMessage(c: Cycle): string | null {
  if (c.state === 'conclusa') {
    const over = -c.daysLeft;
    return over === 0
      ? 'Il ciclo finisce oggi: è ora di cambiare scheda.'
      : `Ciclo concluso da ${over} ${over === 1 ? 'giorno' : 'giorni'}: è ora di cambiare scheda.`;
  }
  if (c.state === 'ultima_settimana') return 'Ultima settimana del ciclo: prepara la prossima scheda.';
  return null;
}

export const loadUnit = (ex: Pick<Exercise, 'load_unit'>) => (ex.load_unit === 'tacche' ? 'tacche' : 'kg');

/** Riassunto di una riga di scheda: "4 × 6–8 · 80 kg · rec. 2:00". */
export function summary(item: RoutineExercise, ex: Exercise | undefined): string {
  const timed = ex?.kind === 'tempo';
  const range = item.reps_min === item.reps_max ? `${item.reps_min}` : `${item.reps_min}–${item.reps_max}`;
  const parts = [`${item.sets} × ${range}${timed ? ' s' : ''}`];
  if (item.load !== null && item.load !== 0 && ex) {
    const sign = ex.kind === 'corpo_libero' && item.load > 0 ? '+' : '';
    parts.push(`${sign}${num(item.load)} ${loadUnit(ex)}`);
  }
  parts.push(`rec. ${clock(item.rest_sec)}`);
  return parts.join(' · ');
}

export function newItemDefaults(ex: Exercise) {
  return ex.kind === 'tempo'
    ? { sets: 3, reps_min: 30, reps_max: 60, rest_sec: 60 }
    : { sets: 3, reps_min: 8, reps_max: 12, rest_sec: 90 };
}
