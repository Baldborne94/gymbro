// Schema condiviso tra server (SQLite) e client (IndexedDB).
// Ogni tabella sincronizzata ha sempre: id (UUID generato sul dispositivo),
// updated_at (ms, orologio del dispositivo) e deleted (eliminazione morbida).

export type ColType = 'text' | 'int' | 'real' | 'bool' | 'json';

export interface TableDef {
  cols: Record<string, ColType>;
  /** Colonne indicizzate sul client (IndexedDB). */
  indexes?: string[];
}

/** Da incrementare quando si aggiungono tabelle o indici (versione IndexedDB). */
export const LOCAL_DB_VERSION = 5;

export const TABLES = {
  exercises: {
    cols: {
      name: 'text',
      muscle: 'text',
      secondary: 'json',
      equipment: 'text',
      kind: 'text',
      unilateral: 'bool',
      load_unit: 'text',
      step: 'real',
      notch_kg: 'real',
      notes: 'text',
      photo_id: 'text',
      custom: 'bool',
    },
    indexes: ['muscle', 'equipment'],
  },
  routines: {
    cols: { name: 'text', notes: 'text', status: 'text', start_date: 'text', weeks: 'int', end_date: 'text' },
    indexes: ['status'],
  },
  routine_days: {
    cols: { routine_id: 'text', name: 'text', position: 'int', weekday: 'int' },
    indexes: ['routine_id'],
  },
  routine_exercises: {
    cols: {
      routine_id: 'text',
      day_id: 'text',
      exercise_id: 'text',
      position: 'int',
      sets: 'int',
      reps_min: 'int',
      reps_max: 'int',
      load: 'real',
      rest_sec: 'int',
      superset_next: 'bool',
      notes: 'text',
    },
    indexes: ['routine_id', 'day_id'],
  },
  workouts: {
    cols: { routine_id: 'text', day_id: 'text', name: 'text', date: 'text', started_at: 'int', finished_at: 'int', notes: 'text' },
    indexes: ['date'],
  },
  workout_exercises: {
    cols: {
      workout_id: 'text',
      exercise_id: 'text',
      original_exercise_id: 'text',
      position: 'int',
      reps_min: 'int',
      reps_max: 'int',
      rest_sec: 'int',
      superset_next: 'bool',
      skipped: 'bool',
      notes: 'text',
    },
    indexes: ['workout_id', 'exercise_id'],
  },
  sets: {
    cols: {
      workout_id: 'text',
      workout_exercise_id: 'text',
      exercise_id: 'text',
      position: 'int',
      kind: 'text',
      load: 'real',
      reps: 'int',
      seconds: 'int',
      rpe: 'real',
      rir: 'int',
      done: 'bool',
      done_at: 'int',
    },
    indexes: ['workout_id', 'workout_exercise_id', 'exercise_id'],
  },
  cardio_sessions: {
    cols: { date: 'text', started_at: 'int', activity: 'text', duration_sec: 'int', distance_km: 'real', notes: 'text' },
    indexes: ['date'],
  },
  body_measurements: {
    cols: {
      date: 'text', weight: 'real', body_fat: 'real', chest: 'real', shoulders: 'real', waist: 'real',
      hips: 'real', arm: 'real', thigh: 'real', calf: 'real', neck: 'real', notes: 'text',
    },
    indexes: ['date'],
  },
  progress_photos: {
    cols: { date: 'text', photo_id: 'text', pose: 'text', notes: 'text' },
    indexes: ['date'],
  },
  // Impostazioni: l'id è il nome dell'impostazione.
  settings: { cols: { value: 'json' } },
} satisfies Record<string, TableDef>;

export type TableName = keyof typeof TABLES;
export const TABLE_NAMES = Object.keys(TABLES) as TableName[];

export interface SyncRow {
  id: string;
  updated_at: number;
  deleted: boolean;
}

export type MuscleId =
  | 'petto' | 'schiena' | 'spalle' | 'trapezi' | 'bicipiti' | 'tricipiti'
  | 'avambracci' | 'addome' | 'quadricipiti' | 'femorali' | 'glutei' | 'polpacci';

export const MUSCLES: { id: MuscleId; label: string }[] = [
  { id: 'petto', label: 'Petto' },
  { id: 'schiena', label: 'Schiena' },
  { id: 'spalle', label: 'Spalle' },
  { id: 'trapezi', label: 'Trapezi' },
  { id: 'bicipiti', label: 'Bicipiti' },
  { id: 'tricipiti', label: 'Tricipiti' },
  { id: 'avambracci', label: 'Avambracci' },
  { id: 'addome', label: 'Addome' },
  { id: 'quadricipiti', label: 'Quadricipiti' },
  { id: 'femorali', label: 'Femorali' },
  { id: 'glutei', label: 'Glutei' },
  { id: 'polpacci', label: 'Polpacci' },
];

export type EquipmentId =
  | 'bilanciere' | 'manubri' | 'macchina' | 'cavi' | 'multipower'
  | 'kettlebell' | 'corpo_libero' | 'elastici' | 'altro';

export const EQUIPMENT: { id: EquipmentId; label: string }[] = [
  { id: 'bilanciere', label: 'Bilanciere' },
  { id: 'manubri', label: 'Manubri' },
  { id: 'macchina', label: 'Macchina' },
  { id: 'cavi', label: 'Cavi' },
  { id: 'multipower', label: 'Multipower' },
  { id: 'kettlebell', label: 'Kettlebell' },
  { id: 'corpo_libero', label: 'Corpo libero' },
  { id: 'elastici', label: 'Elastici' },
  { id: 'altro', label: 'Altro' },
];

/**
 * Tipo di esercizio:
 * - pesi: carico × ripetizioni
 * - corpo_libero: ripetizioni a corpo libero, carico opzionale con segno
 *   (positivo = zavorra, negativo = assistenza)
 * - tempo: durata in secondi (es. plank), carico opzionale
 */
export type ExerciseKind = 'pesi' | 'corpo_libero' | 'tempo';

export const KINDS: { id: ExerciseKind; label: string; hint: string }[] = [
  { id: 'pesi', label: 'Peso × rip', hint: 'Carico e ripetizioni, come panca o squat.' },
  { id: 'corpo_libero', label: 'Corpo libero', hint: 'Solo ripetizioni, con zavorra (+) o assistenza (−) facoltative.' },
  { id: 'tempo', label: 'A tempo', hint: 'Si registra la durata, come nel plank.' },
];

/** kg: carico in chili. tacche: macchine in cui si conta la tacca del pacco pesi. */
export type LoadUnit = 'kg' | 'tacche';

export interface Exercise extends SyncRow {
  name: string;
  muscle: MuscleId;
  secondary: MuscleId[];
  equipment: EquipmentId;
  kind: ExerciseKind;
  unilateral: boolean;
  load_unit: LoadUnit;
  /** Incremento dei pulsanti +/- (kg o tacche). */
  step: number;
  /** Chili per tacca, se noti: serve a calcolare il volume in kg. */
  notch_kg: number | null;
  notes: string;
  photo_id: string | null;
  custom: boolean;
}

/** bozza: mai iniziata. attiva: quella in uso (una sola). archiviata: ciclo concluso. */
export type RoutineStatus = 'bozza' | 'attiva' | 'archiviata';

export interface Routine extends SyncRow {
  name: string;
  notes: string;
  status: RoutineStatus;
  /** Inizio del ciclo, AAAA-MM-GG. */
  start_date: string | null;
  /** Durata prevista del ciclo in settimane. */
  weeks: number | null;
  /** Data di archiviazione, AAAA-MM-GG. */
  end_date: string | null;
}

export interface RoutineDay extends SyncRow {
  routine_id: string;
  name: string;
  position: number;
  /** Giorno della settimana previsto: 1 = lunedì … 7 = domenica. */
  weekday: number | null;
}

export interface RoutineExercise extends SyncRow {
  routine_id: string;
  day_id: string;
  exercise_id: string;
  position: number;
  sets: number;
  /** Intervallo di ripetizioni; per gli esercizi a tempo sono secondi. */
  reps_min: number;
  reps_max: number;
  /** Carico previsto (kg o tacche); per il corpo libero zavorra (+) o assistenza (−). */
  load: number | null;
  rest_sec: number;
  /** In superset con l'esercizio che segue nel giorno. */
  superset_next: boolean;
  notes: string;
}

export interface Workout extends SyncRow {
  routine_id: string | null;
  day_id: string | null;
  name: string;
  /** Giorno della sessione, AAAA-MM-GG. */
  date: string;
  started_at: number;
  /** Vuoto finché la sessione è in corso. */
  finished_at: number | null;
  notes: string;
}

export interface WorkoutExercise extends SyncRow {
  workout_id: string;
  exercise_id: string;
  /** Esercizio previsto dalla scheda, se è stato sostituito per questa sessione. */
  original_exercise_id: string | null;
  position: number;
  reps_min: number | null;
  reps_max: number | null;
  rest_sec: number;
  superset_next: boolean;
  skipped: boolean;
  notes: string;
}

export type SetKind = 'normale' | 'riscaldamento' | 'drop' | 'cedimento';

export const SET_KINDS: { id: SetKind; label: string; tag: string }[] = [
  { id: 'normale', label: 'Normale', tag: '' },
  { id: 'riscaldamento', label: 'Riscaldamento', tag: 'R' },
  { id: 'drop', label: 'Drop set', tag: 'D' },
  { id: 'cedimento', label: 'A cedimento', tag: 'C' },
];

export interface WorkoutSet extends SyncRow {
  workout_id: string;
  workout_exercise_id: string;
  exercise_id: string;
  position: number;
  kind: SetKind;
  /** kg o tacche; per il corpo libero zavorra (+) o assistenza (−). */
  load: number | null;
  reps: number | null;
  /** Durata, per gli esercizi a tempo. */
  seconds: number | null;
  /** Sforzo percepito (6–10). */
  rpe: number | null;
  /** Ripetizioni di riserva. */
  rir: number | null;
  done: boolean;
  done_at: number | null;
}

export type CardioActivity = 'corsa' | 'tapis_roulant' | 'cyclette' | 'vogatore' | 'camminata' | 'ellittica' | 'nuoto' | 'altro';

export const CARDIO: { id: CardioActivity; label: string; icon: string }[] = [
  { id: 'corsa', label: 'Corsa', icon: 'run' },
  { id: 'tapis_roulant', label: 'Tapis roulant', icon: 'run' },
  { id: 'cyclette', label: 'Cyclette', icon: 'bike' },
  { id: 'vogatore', label: 'Vogatore', icon: 'row' },
  { id: 'camminata', label: 'Camminata', icon: 'walk' },
  { id: 'ellittica', label: 'Ellittica', icon: 'heart' },
  { id: 'nuoto', label: 'Nuoto', icon: 'wave' },
  { id: 'altro', label: 'Altro', icon: 'heart' },
];

export interface CardioSession extends SyncRow {
  date: string;
  started_at: number;
  activity: CardioActivity;
  duration_sec: number;
  distance_km: number | null;
  notes: string;
}

export const BODY_FIELDS = [
  { id: 'weight', label: 'Peso', unit: 'kg' },
  { id: 'body_fat', label: 'Massa grassa', unit: '%' },
  { id: 'chest', label: 'Petto', unit: 'cm' },
  { id: 'shoulders', label: 'Spalle', unit: 'cm' },
  { id: 'waist', label: 'Vita', unit: 'cm' },
  { id: 'hips', label: 'Fianchi', unit: 'cm' },
  { id: 'arm', label: 'Braccio', unit: 'cm' },
  { id: 'thigh', label: 'Coscia', unit: 'cm' },
  { id: 'calf', label: 'Polpaccio', unit: 'cm' },
  { id: 'neck', label: 'Collo', unit: 'cm' },
] as const;

export type BodyField = (typeof BODY_FIELDS)[number]['id'];

export type BodyMeasurement = SyncRow & { date: string; notes: string } & { [K in BodyField]: number | null };

export type Pose = 'fronte' | 'lato' | 'retro';
export const POSES: { id: Pose; label: string }[] = [
  { id: 'fronte', label: 'Fronte' },
  { id: 'lato', label: 'Lato' },
  { id: 'retro', label: 'Retro' },
];

export interface ProgressPhoto extends SyncRow {
  date: string;
  photo_id: string;
  pose: Pose;
  notes: string;
}

export interface Setting extends SyncRow {
  value: unknown;
}

export interface RowTypes {
  cardio_sessions: CardioSession;
  body_measurements: BodyMeasurement;
  progress_photos: ProgressPhoto;
  settings: Setting;
  workouts: Workout;
  workout_exercises: WorkoutExercise;
  sets: WorkoutSet;
  exercises: Exercise;
  routines: Routine;
  routine_days: RoutineDay;
  routine_exercises: RoutineExercise;
}

export type Changes = { [T in TableName]?: RowTypes[T][] };

export interface SyncRequest {
  since: number;
  changes: Changes;
}

export interface SyncResponse {
  rev: number;
  /** Cambia quando il database del server viene ripristinato da una copia più vecchia. */
  epoch: string;
  changes: Changes;
}

export const muscleLabel = (id: string) => MUSCLES.find((m) => m.id === id)?.label ?? id;
export const equipmentLabel = (id: string) => EQUIPMENT.find((e) => e.id === id)?.label ?? id;
export const kindLabel = (id: string) => KINDS.find((k) => k.id === id)?.label ?? id;
