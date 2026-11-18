import type { CardioSession, Exercise, MuscleId, Workout, WorkoutExercise, WorkoutSet } from '../../shared/schema';
import { addDays, isoDate, num, weekStart } from './dates';
import { db } from './db';
import { loadKg, setVolume, unitOf } from './workout';

/** Massimale stimato con la formula di Epley. */
export const e1rm = (load: number, reps: number) => (reps <= 0 ? 0 : reps === 1 ? load : load * (1 + reps / 30));

/** Carico confrontabile di una serie: kg quando si conoscono, altrimenti le tacche. */
export const weight = (set: Pick<WorkoutSet, 'load'>, ex: Exercise | undefined) => loadKg(set, ex) ?? set.load ?? 0;
/** Unità del carico confrontabile. */
export const weightUnit = (ex: Exercise | undefined) => (ex?.load_unit === 'tacche' && !ex.notch_kg ? 'tacche' : 'kg');

export type RecordKind = 'carico' | 'massimale' | 'ripetizioni' | 'durata';
export const RECORD_LABEL: Record<RecordKind, string> = {
  carico: 'Carico massimo',
  massimale: 'Massimale stimato',
  ripetizioni: 'Più ripetizioni',
  durata: 'Durata più lunga',
};

const byTime = (a: WorkoutSet, b: WorkoutSet) => (a.done_at ?? 0) - (b.done_at ?? 0) || a.position - b.position;

/**
 * Trova le serie che al momento dell'esecuzione erano un record personale.
 * La prima sessione di un esercizio fa da riferimento e non produce record.
 */
export function findRecords(sets: WorkoutSet[], ex: Exercise | undefined): Map<string, RecordKind> {
  const out = new Map<string, RecordKind>();
  const ordered = sets.filter((s) => s.done && !s.deleted && s.kind !== 'riscaldamento').sort(byTime);
  if (!ordered.length || !ex) return out;
  const firstWorkout = ordered[0].workout_id;
  let maxLoad = 0;
  let maxE1 = 0;
  let maxSeconds = 0;
  const seen: { load: number; reps: number }[] = [];

  for (const s of ordered) {
    const baseline = s.workout_id === firstWorkout;
    if (ex.kind === 'tempo') {
      const sec = s.seconds ?? 0;
      if (!baseline && sec > maxSeconds) out.set(s.id, 'durata');
      maxSeconds = Math.max(maxSeconds, sec);
    } else if (ex.kind === 'corpo_libero') {
      const load = s.load ?? 0;
      const reps = s.reps ?? 0;
      const best = Math.max(0, ...seen.filter((p) => p.load >= load).map((p) => p.reps));
      if (!baseline && reps > best) out.set(s.id, 'ripetizioni');
      seen.push({ load, reps });
    } else {
      const w = weight(s, ex);
      const reps = s.reps ?? 0;
      if (w <= 0 || reps <= 0) continue;
      const est = e1rm(w, reps);
      if (!baseline && w > maxLoad) out.set(s.id, 'carico');
      else if (!baseline && est > maxE1 + 0.01) out.set(s.id, 'massimale');
      maxLoad = Math.max(maxLoad, w);
      maxE1 = Math.max(maxE1, est);
    }
  }
  return out;
}

/** Valore del record in forma leggibile. */
export function recordValue(set: WorkoutSet, kind: RecordKind, ex: Exercise | undefined): string {
  if (kind === 'durata') return `${set.seconds ?? 0} s`;
  if (kind === 'ripetizioni') return `${set.reps ?? 0} rip${set.load ? ` ${set.load > 0 ? '+' : '−'}${num(Math.abs(set.load))} ${unitOf(ex)}` : ''}`;
  if (kind === 'massimale') return `${num(Math.round(e1rm(weight(set, ex), set.reps ?? 0) * 10) / 10)} ${weightUnit(ex)}`;
  return `${num(set.load ?? 0)} ${unitOf(ex)} × ${set.reps ?? 0}`;
}

/**
 * Proposta di aumento del carico: se l'ultima volta tutte le serie hanno raggiunto
 * il massimo dell'intervallo di ripetizioni, si propone un passo in più.
 */
export function suggestIncrease(previous: WorkoutSet[], repsMax: number | null, planned: number, ex: Exercise | undefined): number | null {
  if (!ex || ex.kind !== 'pesi' || !repsMax) return null;
  const work = previous.filter((s) => s.kind === 'normale' || s.kind === 'cedimento');
  if (!work.length || work.length < planned) return null;
  if (!work.every((s) => s.load !== null && (s.reps ?? 0) >= repsMax)) return null;
  return Math.min(...work.map((s) => s.load as number)) + ex.step;
}

// --- Dati d'insieme per storico, calendario e bilanciamento ---

export interface WorkoutSummary {
  workout: Workout;
  sets: WorkoutSet[];
  volume: number;
  duration: number;
  exercises: number;
}

export interface Overview {
  workouts: WorkoutSummary[];
  exercises: Map<string, Exercise>;
  wes: WorkoutExercise[];
  cardio: CardioSession[];
}

/** Tutti i giorni con attività, pesi o cardio (una voce per sessione). */
export const activityDates = (o: Overview) => [...o.workouts.map((w) => w.workout.date), ...o.cardio.map((c) => c.date)];

export async function loadOverview(): Promise<Overview> {
  const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e as Exercise]));
  const wes = (await db.workout_exercises.toArray()).filter((w) => !w.deleted);
  const sets = (await db.sets.toArray()).filter((s) => !s.deleted && s.done);
  const byWorkout = new Map<string, WorkoutSet[]>();
  for (const s of sets) {
    const list = byWorkout.get(s.workout_id);
    if (list) list.push(s); else byWorkout.set(s.workout_id, [s]);
  }
  const workouts = (await db.workouts.toArray())
    .filter((w) => !w.deleted && w.finished_at)
    .sort((a, b) => b.started_at - a.started_at)
    .map((workout) => {
      const ws = byWorkout.get(workout.id) ?? [];
      return {
        workout,
        sets: ws,
        volume: ws.reduce((sum, s) => sum + setVolume(s, exercises.get(s.exercise_id)), 0),
        duration: (workout.finished_at ?? workout.started_at) - workout.started_at,
        exercises: new Set(ws.map((s) => s.workout_exercise_id)).size,
      };
    });
  const cardio = (await db.cardio_sessions.toArray()).filter((c) => !c.deleted).sort((a, b) => b.started_at - a.started_at);
  return { workouts, exercises, wes, cardio };
}

/** Numero di sessioni per settimana (chiave: lunedì della settimana). */
export function sessionsByWeek(dates: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of dates) out.set(weekStart(d), (out.get(weekStart(d)) ?? 0) + 1);
  return out;
}

/** Settimane consecutive in cui l'obiettivo è stato raggiunto; quella in corso conta solo se già centrata. */
export function weekStreak(dates: string[], goal: number, today = isoDate()): number {
  if (goal <= 0) return 0;
  const weeks = sessionsByWeek(dates);
  let week = weekStart(today);
  let streak = 0;
  if ((weeks.get(week) ?? 0) >= goal) streak++;
  week = addDays(week, -7);
  while ((weeks.get(week) ?? 0) >= goal) {
    streak++;
    week = addDays(week, -7);
  }
  return streak;
}

/** Serie per gruppo muscolare in una settimana: 1 per il gruppo principale, mezza per i secondari. */
export function muscleSets(overview: Overview, week: string): Map<MuscleId, number> {
  const out = new Map<MuscleId, number>();
  const end = addDays(week, 7);
  for (const w of overview.workouts) {
    if (w.workout.date < week || w.workout.date >= end) continue;
    for (const s of w.sets) {
      if (s.kind === 'riscaldamento') continue;
      const ex = overview.exercises.get(s.exercise_id);
      if (!ex) continue;
      out.set(ex.muscle, (out.get(ex.muscle) ?? 0) + 1);
      for (const m of ex.secondary ?? []) out.set(m, (out.get(m) ?? 0) + 0.5);
    }
  }
  return out;
}

export interface ProgressPoint {
  workoutId: string;
  date: string;
  maxLoad: number;
  volume: number;
  e1rm: number;
  best: WorkoutSet;
  sets: WorkoutSet[];
}

/** Andamento di un esercizio: un punto per ogni sessione conclusa. */
export function exerciseProgress(overview: Overview, exerciseId: string): ProgressPoint[] {
  const ex = overview.exercises.get(exerciseId);
  const points: ProgressPoint[] = [];
  for (const w of overview.workouts) {
    const sets = w.sets.filter((s) => s.exercise_id === exerciseId && s.kind !== 'riscaldamento').sort(byTime);
    if (!sets.length) continue;
    const metric = (s: WorkoutSet) => (ex?.kind === 'tempo' ? s.seconds ?? 0 : ex?.kind === 'corpo_libero' ? s.reps ?? 0 : e1rm(weight(s, ex), s.reps ?? 0));
    const best = sets.reduce((a, b) => (metric(b) > metric(a) ? b : a));
    points.push({
      workoutId: w.workout.id,
      date: w.workout.date,
      maxLoad: ex?.kind === 'tempo' ? Math.max(...sets.map((s) => s.seconds ?? 0)) : ex?.kind === 'corpo_libero' ? Math.max(...sets.map((s) => s.reps ?? 0)) : Math.max(...sets.map((s) => weight(s, ex))),
      volume: ex?.kind === 'pesi' ? sets.reduce((sum, s) => sum + setVolume(s, ex), 0) : sets.reduce((sum, s) => sum + (s.reps ?? s.seconds ?? 0), 0),
      e1rm: ex?.kind === 'pesi' ? Math.max(...sets.map((s) => e1rm(weight(s, ex), s.reps ?? 0))) : 0,
      best,
      sets,
    });
  }
  return points.reverse();
}

export interface RecordEntry {
  set: WorkoutSet;
  kind: RecordKind;
  exercise: Exercise;
  date: string;
}

/** Tutti i record personali, dal più recente. */
export function allRecords(overview: Overview): RecordEntry[] {
  const dates = new Map(overview.workouts.map((w) => [w.workout.id, w.workout.date]));
  const byExercise = new Map<string, WorkoutSet[]>();
  for (const w of overview.workouts) for (const s of w.sets) {
    const list = byExercise.get(s.exercise_id);
    if (list) list.push(s); else byExercise.set(s.exercise_id, [s]);
  }
  const out: RecordEntry[] = [];
  for (const [exerciseId, sets] of byExercise) {
    const exercise = overview.exercises.get(exerciseId);
    if (!exercise) continue;
    const found = findRecords(sets, exercise);
    for (const s of sets) {
      const kind = found.get(s.id);
      if (kind) out.push({ set: s, kind, exercise, date: dates.get(s.workout_id) ?? '' });
    }
  }
  return out.sort((a, b) => (b.set.done_at ?? 0) - (a.set.done_at ?? 0));
}
