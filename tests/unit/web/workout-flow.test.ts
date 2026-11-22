import { beforeEach, describe, expect, it } from 'vitest';
import type { Exercise, Routine, RoutineDay } from '../../../shared/schema';
import { db, patch, save } from '../../../web/src/db';
import { activateRoutine, createRoutine, duplicateRoutine } from '../../../web/src/routines';
import {
  addExercise, addSet, currentWorkout, discardWorkout, finishWorkout, lastSets, startWorkout, substitute,
} from '../../../web/src/workout';
import { exercise } from '../../support/factories';

const alive = <T extends { deleted: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted);
const panca = exercise({ id: 'panca', name: 'Panca piana' });
const croci = exercise({ id: 'croci', name: 'Croci ai cavi', equipment: 'cavi' });
const chest = exercise({ id: 'chest', name: 'Chest press', equipment: 'macchina', step: 5 });
const plank = exercise({ id: 'plank', name: 'Plank', muscle: 'addome', kind: 'tempo' });

async function putExercises(...list: Exercise[]) {
  for (const e of list) await db.exercises.put({ ...e, _dirty: 0 });
}

/** Scheda attiva con un giorno: Panca (superset con Croci), Croci, Plank. */
async function routineWithDay() {
  const routineId = await createRoutine('Test', ['Push']);
  await activateRoutine(routineId);
  const day = (await db.routine_days.where('routine_id').equals(routineId).first()) as RoutineDay;
  const items = [
    { exercise_id: 'panca', sets: 3, reps_min: 8, reps_max: 12, load: 80, rest_sec: 120, superset_next: true },
    { exercise_id: 'croci', sets: 2, reps_min: 10, reps_max: 15, load: null, rest_sec: 90, superset_next: false },
    { exercise_id: 'plank', sets: 2, reps_min: 30, reps_max: 60, load: null, rest_sec: 60, superset_next: false },
  ];
  for (const [i, it] of items.entries()) {
    await save('routine_exercises', { id: `item-${i}`, routine_id: routineId, day_id: day.id, position: i, notes: '', ...it });
  }
  return { routineId, dayId: day.id };
}

const exercisesOf = async (workoutId: string) =>
  alive(await db.workout_exercises.where('workout_id').equals(workoutId).toArray()).sort((a, b) => a.position - b.position);
const setsOf = async (weId: string) =>
  alive(await db.sets.where('workout_exercise_id').equals(weId).toArray()).sort((a, b) => a.position - b.position);

async function doAll(weId: string, values?: { load?: number | null; reps?: number }) {
  for (const s of await setsOf(weId)) await patch('sets', s.id, { done: true, done_at: Date.now(), ...values });
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await putExercises(panca, croci, chest, plank);
});

describe('avvio della sessione', () => {
  it('copia esercizi, superset e serie dal giorno della scheda', async () => {
    const { dayId, routineId } = await routineWithDay();
    const id = await startWorkout(dayId);
    const w = await db.workouts.get(id);
    expect(w).toMatchObject({ name: 'Push', routine_id: routineId, day_id: dayId, finished_at: null });

    const wes = await exercisesOf(id);
    expect(wes.map((x) => x.exercise_id)).toEqual(['panca', 'croci', 'plank']);
    expect(wes[0]).toMatchObject({ superset_next: true, rest_sec: 120, reps_min: 8, reps_max: 12 });

    const pancaSets = await setsOf(wes[0].id);
    expect(pancaSets).toHaveLength(3);
    // Prima volta: carico previsto dalla scheda e ripetizioni minime dell'intervallo.
    expect(pancaSets.map((s) => [s.load, s.reps, s.done])).toEqual([[80, 8, false], [80, 8, false], [80, 8, false]]);
    // Esercizio a tempo: si registra la durata, non carico e ripetizioni.
    expect((await setsOf(wes[2].id)).map((s) => [s.load, s.reps, s.seconds])).toEqual([[null, null, 30], [null, null, 30]]);
  });

  it('se c’è già una sessione in corso la riprende invece di crearne un’altra', async () => {
    const { dayId } = await routineWithDay();
    const first = await startWorkout(dayId);
    expect(await startWorkout(null)).toBe(first);
    expect((await currentWorkout())?.id).toBe(first);
    expect(alive(await db.workouts.toArray())).toHaveLength(1);
  });

  it('la volta successiva precompila i valori dell’ultima sessione conclusa', async () => {
    const { dayId } = await routineWithDay();
    const first = await startWorkout(dayId);
    const [pancaWe] = await exercisesOf(first);
    const sets = await setsOf(pancaWe.id);
    await patch('sets', sets[0].id, { done: true, done_at: 1, load: 85, reps: 10 });
    await patch('sets', sets[1].id, { done: true, done_at: 2, load: 85, reps: 9 });
    await patch('sets', sets[2].id, { done: true, done_at: 3, load: 82.5, reps: 8 });
    await finishWorkout(first);

    expect((await lastSets('panca')).map((s) => s.reps)).toEqual([10, 9, 8]);
    const second = await startWorkout(dayId);
    expect(second).not.toBe(first);
    const [again] = await exercisesOf(second);
    expect((await setsOf(again.id)).map((s) => [s.load, s.reps])).toEqual([[85, 10], [85, 9], [82.5, 8]]);
  });

  it('una sessione libera parte vuota', async () => {
    const id = await startWorkout(null);
    expect((await db.workouts.get(id))?.name).toBe('Sessione libera');
    expect(await exercisesOf(id)).toHaveLength(0);
  });
});

describe('modifiche durante la sessione', () => {
  it('aggiunge un esercizio in coda e una serie che copia l’ultima', async () => {
    const id = await startWorkout(null);
    const weId = await addExercise(id, chest);
    expect(await setsOf(weId)).toHaveLength(3);
    const [s1] = await setsOf(weId);
    await patch('sets', s1.id, { load: 50, reps: 12 });
    const before = await setsOf(weId);
    await patch('sets', before[2].id, { load: 55, reps: 10 });
    await addSet(weId);
    const after = await setsOf(weId);
    expect(after).toHaveLength(4);
    expect([after[3].load, after[3].reps]).toEqual([55, 10]);
  });

  it('sostituisce un esercizio non ancora iniziato solo per questa sessione', async () => {
    const { dayId } = await routineWithDay();
    const id = await startWorkout(dayId);
    const [pancaWe] = await exercisesOf(id);
    const kept = await substitute(pancaWe.id, chest);
    expect(kept).toBe(pancaWe.id);
    const swapped = await db.workout_exercises.get(kept);
    expect(swapped).toMatchObject({ exercise_id: 'chest', original_exercise_id: 'panca' });
    const sets = await setsOf(kept);
    expect(sets).toHaveLength(3);
    expect(sets.every((s) => s.exercise_id === 'chest')).toBe(true);
    // La scheda resta com'era.
    expect((await db.routine_exercises.get('item-0'))?.exercise_id).toBe('panca');
  });

  it('a esercizio iniziato, le serie rimaste passano al sostituto inserito subito dopo', async () => {
    const { dayId } = await routineWithDay();
    const id = await startWorkout(dayId);
    const [pancaWe] = await exercisesOf(id);
    const [first] = await setsOf(pancaWe.id);
    await patch('sets', first.id, { done: true, done_at: 1 });

    const newId = await substitute(pancaWe.id, chest);
    expect(newId).not.toBe(pancaWe.id);
    expect(await setsOf(pancaWe.id)).toHaveLength(1);
    expect(await setsOf(newId)).toHaveLength(2);
    expect((await exercisesOf(id)).map((x) => x.exercise_id)).toEqual(['panca', 'chest', 'croci', 'plank']);
    // Il superset con le croci passa al sostituto.
    expect((await db.workout_exercises.get(pancaWe.id))?.superset_next).toBe(false);
    expect((await db.workout_exercises.get(newId))?.superset_next).toBe(true);
  });
});

describe('fine della sessione', () => {
  it('scarta le serie non confermate e segna come saltati gli esercizi senza serie', async () => {
    const { dayId } = await routineWithDay();
    const id = await startWorkout(dayId);
    const [pancaWe, crociWe] = await exercisesOf(id);
    const [s1] = await setsOf(pancaWe.id);
    await patch('sets', s1.id, { done: true, done_at: 1 });
    await finishWorkout(id);

    expect((await db.workouts.get(id))?.finished_at).toBeGreaterThan(0);
    expect(await setsOf(pancaWe.id)).toHaveLength(1);
    expect(await setsOf(crociWe.id)).toHaveLength(0);
    expect((await db.workout_exercises.get(crociWe.id))?.skipped).toBe(true);
    expect((await db.workout_exercises.get(pancaWe.id))?.skipped).toBe(false);
    expect(await currentWorkout()).toBeNull();
  });

  it('scartare la sessione elimina tutto, anche ai fini della sincronizzazione', async () => {
    const { dayId } = await routineWithDay();
    const id = await startWorkout(dayId);
    await doAll((await exercisesOf(id))[0].id);
    await discardWorkout(id);
    const w = await db.workouts.get(id);
    expect(w).toMatchObject({ deleted: true, _dirty: 1 });
    expect(alive(await db.sets.where('workout_id').equals(id).toArray())).toHaveLength(0);
  });
});

describe('schede', () => {
  it('duplica una scheda con nuovi identificativi, come bozza', async () => {
    const { routineId } = await routineWithDay();
    const copy = await duplicateRoutine(routineId);
    const r = (await db.routines.get(copy!)) as Routine;
    expect(r).toMatchObject({ name: 'Test (copia)', status: 'bozza', start_date: null });
    const items = alive(await db.routine_exercises.where('routine_id').equals(copy!).toArray());
    expect(items).toHaveLength(3);
    expect(items.some((i) => i.id.startsWith('item-'))).toBe(false);
    expect(items.find((i) => i.exercise_id === 'panca')?.superset_next).toBe(true);
  });

  it('una sola scheda attiva: iniziarne un’altra archivia la precedente', async () => {
    const { routineId } = await routineWithDay();
    const other = await createRoutine('Altra', ['A']);
    await activateRoutine(other);
    expect((await db.routines.get(routineId))?.status).toBe('archiviata');
    expect((await db.routines.get(routineId))?.end_date).toBeTruthy();
    expect((await db.routines.get(other))?.status).toBe('attiva');
  });
});
