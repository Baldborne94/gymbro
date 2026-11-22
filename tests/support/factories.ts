import type { Exercise, WorkoutSet } from '../../shared/schema';

/** Esercizio di prova; i campi non indicati hanno valori ragionevoli. */
export const exercise = (over: Partial<Exercise> = {}): Exercise => ({
  id: 'ex-panca',
  updated_at: 1,
  deleted: false,
  name: 'Panca piana',
  muscle: 'petto',
  secondary: ['tricipiti'],
  equipment: 'bilanciere',
  kind: 'pesi',
  unilateral: false,
  load_unit: 'kg',
  step: 2.5,
  notch_kg: null,
  notes: '',
  photo_id: null,
  custom: false,
  ...over,
});

let n = 0;
/** Serie completata di prova. */
export const set = (over: Partial<WorkoutSet> = {}): WorkoutSet => {
  n++;
  return {
    id: `set-${n}`,
    updated_at: 1,
    deleted: false,
    workout_id: 'w1',
    workout_exercise_id: 'we1',
    exercise_id: 'ex-panca',
    position: n,
    kind: 'normale',
    load: 80,
    reps: 8,
    seconds: null,
    rpe: null,
    rir: null,
    done: true,
    done_at: n * 1000,
    ...over,
  };
};
