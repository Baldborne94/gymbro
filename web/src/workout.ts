import type { Exercise, RoutineExercise, WorkoutSet } from '../../shared/schema';
import { isoDate, num } from './dates';
import { db, patch, remove, save, uuid, type Local } from './db';

const alive = <T extends { deleted: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted);

export const currentWorkout = async () =>
  alive(await db.workouts.toArray()).find((w) => !w.finished_at) ?? null;

/** Serie completate (escluso il riscaldamento) dell'ultima sessione conclusa con questo esercizio. */
export async function lastSets(exerciseId: string, excludeWorkoutId?: string): Promise<Local<WorkoutSet>[]> {
  const sets = alive(await db.sets.where('exercise_id').equals(exerciseId).toArray())
    .filter((s) => s.done && s.kind !== 'riscaldamento' && s.workout_id !== excludeWorkoutId);
  if (!sets.length) return [];
  const workouts = await db.workouts.bulkGet([...new Set(sets.map((s) => s.workout_id))]);
  const latest = workouts
    .filter((w) => w && !w.deleted && w.finished_at)
    .sort((a, b) => b!.started_at - a!.started_at)[0];
  if (!latest) return [];
  return sets.filter((s) => s.workout_id === latest.id).sort((a, b) => a.position - b.position);
}

interface Plan { sets: number; reps_min: number | null; load: number | null }

/** Crea le serie previste per un esercizio, precompilate con i valori dell'ultima volta. */
async function planSets(workoutId: string, weId: string, ex: Exercise, plan: Plan, startAt = 0) {
  const previous = await lastSets(ex.id, workoutId);
  for (let i = 0; i < plan.sets; i++) {
    const prev = previous[i] ?? previous[previous.length - 1];
    const timed = ex.kind === 'tempo';
    await save('sets', {
      id: uuid(),
      workout_id: workoutId,
      workout_exercise_id: weId,
      exercise_id: ex.id,
      position: startAt + i,
      kind: 'normale',
      load: timed ? null : prev?.load ?? plan.load,
      reps: timed ? null : prev?.reps ?? plan.reps_min ?? 8,
      seconds: timed ? prev?.seconds ?? plan.reps_min ?? 30 : null,
      rpe: null,
      rir: null,
      done: false,
      done_at: null,
    });
  }
}

/** Avvia una sessione dal giorno di una scheda, oppure libera. Se ce n'è una in corso, riprende quella. */
export async function startWorkout(dayId: string | null): Promise<string> {
  const running = await currentWorkout();
  if (running) return running.id;

  const id = uuid();
  const day = dayId ? await db.routine_days.get(dayId) : undefined;
  await save('workouts', {
    id,
    routine_id: day?.routine_id ?? null,
    day_id: day?.id ?? null,
    name: day?.name ?? 'Sessione libera',
    date: isoDate(),
    started_at: Date.now(),
    finished_at: null,
    notes: '',
  });
  if (day) {
    const items: RoutineExercise[] = alive(await db.routine_exercises.where('day_id').equals(day.id).toArray())
      .sort((a, b) => a.position - b.position);
    for (const [position, item] of items.entries()) {
      const ex = await db.exercises.get(item.exercise_id);
      if (!ex) continue;
      const weId = uuid();
      await save('workout_exercises', {
        id: weId, workout_id: id, exercise_id: ex.id, original_exercise_id: null, position,
        reps_min: item.reps_min, reps_max: item.reps_max, rest_sec: item.rest_sec,
        superset_next: item.superset_next, skipped: false, notes: item.notes ?? '',
      });
      await planSets(id, weId, ex, item);
    }
  }
  return id;
}

/** Aggiunge al volo un esercizio in coda alla sessione. */
export async function addExercise(workoutId: string, ex: Exercise): Promise<string> {
  const existing = alive(await db.workout_exercises.where('workout_id').equals(workoutId).toArray());
  const weId = uuid();
  await save('workout_exercises', {
    id: weId, workout_id: workoutId, exercise_id: ex.id, original_exercise_id: null,
    position: existing.length ? Math.max(...existing.map((e) => e.position)) + 1 : 0,
    reps_min: null, reps_max: null, rest_sec: ex.kind === 'tempo' ? 60 : 90,
    superset_next: false, skipped: false, notes: '',
  });
  await planSets(workoutId, weId, ex, { sets: 3, reps_min: ex.kind === 'tempo' ? 30 : 8, load: null });
  return weId;
}

export async function addSet(weId: string) {
  const sets = alive(await db.sets.where('workout_exercise_id').equals(weId).toArray()).sort((a, b) => a.position - b.position);
  const we = await db.workout_exercises.get(weId);
  if (!we) return;
  const last = sets[sets.length - 1];
  await save('sets', {
    id: uuid(), workout_id: we.workout_id, workout_exercise_id: weId, exercise_id: we.exercise_id,
    position: last ? last.position + 1 : 0, kind: 'normale',
    load: last?.load ?? null, reps: last?.reps ?? null, seconds: last?.seconds ?? null,
    rpe: null, rir: null, done: false, done_at: null,
  });
}

/**
 * Sostituzione rapida, valida solo per questa sessione.
 * Se nessuna serie è stata fatta l'esercizio viene scambiato; altrimenti le serie
 * rimaste passano a un nuovo esercizio inserito subito dopo.
 * Restituisce l'id della riga su cui proseguire.
 */
export async function substitute(weId: string, ex: Exercise): Promise<string> {
  const we = await db.workout_exercises.get(weId);
  if (!we) return weId;
  const sets = alive(await db.sets.where('workout_exercise_id').equals(weId).toArray());
  const todo = sets.filter((s) => !s.done);
  const original = we.original_exercise_id ?? we.exercise_id;
  for (const s of todo) await remove('sets', s.id);

  if (todo.length === sets.length) {
    await patch('workout_exercises', weId, { exercise_id: ex.id, original_exercise_id: original === ex.id ? null : original });
    await planSets(we.workout_id, weId, ex, { sets: Math.max(1, todo.length), reps_min: we.reps_min, load: null });
    return weId;
  }
  const others = alive(await db.workout_exercises.where('workout_id').equals(we.workout_id).toArray());
  for (const o of others) if (o.position > we.position) await patch('workout_exercises', o.id, { position: o.position + 1 });
  const newId = uuid();
  await save('workout_exercises', {
    id: newId, workout_id: we.workout_id, exercise_id: ex.id, original_exercise_id: original, position: we.position + 1,
    reps_min: we.reps_min, reps_max: we.reps_max, rest_sec: we.rest_sec, superset_next: we.superset_next, skipped: false, notes: '',
  });
  await patch('workout_exercises', weId, { superset_next: false });
  await planSets(we.workout_id, newId, ex, { sets: Math.max(1, todo.length), reps_min: we.reps_min, load: null });
  return newId;
}

export async function removeExercise(weId: string) {
  for (const s of await db.sets.where('workout_exercise_id').equals(weId).toArray()) if (!s.deleted) await remove('sets', s.id);
  await remove('workout_exercises', weId);
}

/** Chiude la sessione: le serie non fatte spariscono, gli esercizi senza serie risultano saltati. */
export async function finishWorkout(id: string) {
  const sets = alive(await db.sets.where('workout_id').equals(id).toArray());
  for (const s of sets) if (!s.done) await remove('sets', s.id);
  const done = new Set(sets.filter((s) => s.done).map((s) => s.workout_exercise_id));
  for (const we of alive(await db.workout_exercises.where('workout_id').equals(id).toArray())) {
    if (!done.has(we.id) && !we.skipped) await patch('workout_exercises', we.id, { skipped: true });
  }
  await patch('workouts', id, { finished_at: Date.now() });
}

export async function discardWorkout(id: string) {
  for (const we of await db.workout_exercises.where('workout_id').equals(id).toArray()) if (!we.deleted) await removeExercise(we.id);
  await remove('workouts', id);
}

// --- Calcoli e formati ---

export const unitOf = (ex: Pick<Exercise, 'load_unit'> | undefined) => (ex?.load_unit === 'tacche' ? 'tacche' : 'kg');

/** Carico in kg di una serie, convertendo le tacche quando si conoscono i kg per tacca. */
export function loadKg(set: Pick<WorkoutSet, 'load'>, ex: Exercise | undefined): number | null {
  if (set.load === null || !ex) return null;
  if (ex.load_unit === 'tacche') return ex.notch_kg ? set.load * ex.notch_kg : null;
  return set.load;
}

/** Volume in kg di una serie (carico × ripetizioni), riscaldamento escluso. */
export function setVolume(set: WorkoutSet, ex: Exercise | undefined): number {
  if (!set.done || set.kind === 'riscaldamento' || ex?.kind !== 'pesi' || !set.reps) return 0;
  const kg = loadKg(set, ex);
  return kg && kg > 0 ? kg * set.reps : 0;
}

export function formatSet(set: Pick<WorkoutSet, 'load' | 'reps' | 'seconds'>, ex: Exercise | undefined): string {
  if (ex?.kind === 'tempo') return `${set.seconds ?? 0} s`;
  const unit = unitOf(ex);
  if (ex?.kind === 'corpo_libero') {
    const extra = set.load ? ` ${set.load > 0 ? '+' : '−'}${num(Math.abs(set.load))} ${unit}` : '';
    return `${set.reps ?? 0} rip${extra}`;
  }
  return `${set.load === null ? '—' : num(set.load)} ${unit} × ${set.reps ?? 0}`;
}

export function formatEffort(set: Pick<WorkoutSet, 'rpe' | 'rir'>): string | null {
  if (set.rpe !== null && set.rpe !== undefined) return `RPE ${num(set.rpe)}`;
  if (set.rir !== null && set.rir !== undefined) return `RIR ${set.rir}`;
  return null;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
