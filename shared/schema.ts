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
export const LOCAL_DB_VERSION = 2;

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

export interface RowTypes {
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
  changes: Changes;
}

export const muscleLabel = (id: string) => MUSCLES.find((m) => m.id === id)?.label ?? id;
export const equipmentLabel = (id: string) => EQUIPMENT.find((e) => e.id === id)?.label ?? id;
export const kindLabel = (id: string) => KINDS.find((k) => k.id === id)?.label ?? id;
