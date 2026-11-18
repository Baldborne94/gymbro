import fs from 'node:fs';
import path from 'node:path';
import { TABLE_NAMES, type CardioSession, type Exercise, type Workout, type WorkoutSet } from '../shared/schema';
import { PHOTOS_DIR, importRows, liveRows } from './db';

const PHOTO_ID = /^[0-9a-f-]{36}$/;

/** Esportazione completa: tutte le tabelle e, a richiesta, le foto in base64. */
export function exportAll(withPhotos: boolean) {
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLE_NAMES) tables[t] = liveRows(t);
  const photos: Record<string, string> = {};
  if (withPhotos) {
    for (const file of fs.readdirSync(PHOTOS_DIR)) {
      if (file.endsWith('.jpg')) photos[file.slice(0, -4)] = fs.readFileSync(path.join(PHOTOS_DIR, file)).toString('base64');
    }
  }
  return { app: 'gymbro', version: 1, exported_at: new Date().toISOString(), tables, photos };
}

export function importAll(data: unknown): { rows: Record<string, number>; photos: number } {
  const d = data as { app?: string; tables?: Record<string, unknown>; photos?: Record<string, string> };
  if (!d || d.app !== 'gymbro' || typeof d.tables !== 'object' || !d.tables) {
    throw new Error('Il file non è un’esportazione di GymBro.');
  }
  let photos = 0;
  for (const [id, b64] of Object.entries(d.photos ?? {})) {
    if (!PHOTO_ID.test(id) || typeof b64 !== 'string') continue;
    fs.writeFileSync(path.join(PHOTOS_DIR, `${id}.jpg`), Buffer.from(b64, 'base64'));
    photos++;
  }
  return { rows: importRows(d.tables), photos };
}

// CSV per fogli di calcolo italiani: punto e virgola come separatore, virgola decimale.
const cell = (v: unknown) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (header: string[], rows: unknown[][]) =>
  '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';

export function sessionsCsv(): string {
  const workouts = new Map(liveRows<Workout>('workouts').map((w) => [w.id, w]));
  const exercises = new Map(liveRows<Exercise>('exercises').map((e) => [e.id, e]));
  const sets = liveRows<WorkoutSet>('sets')
    .filter((s) => s.done && workouts.get(s.workout_id)?.finished_at)
    .sort((a, b) => {
      const wa = workouts.get(a.workout_id)!;
      const wb = workouts.get(b.workout_id)!;
      return wa.started_at - wb.started_at || (a.done_at ?? 0) - (b.done_at ?? 0);
    });
  const counter = new Map<string, number>();
  return csv(
    ['data', 'sessione', 'esercizio', 'gruppo_muscolare', 'serie', 'tipo', 'carico', 'unita', 'ripetizioni', 'secondi', 'rpe', 'rir'],
    sets.map((s) => {
      const w = workouts.get(s.workout_id)!;
      const ex = exercises.get(s.exercise_id);
      const n = (counter.get(s.workout_exercise_id) ?? 0) + 1;
      counter.set(s.workout_exercise_id, n);
      return [w.date, w.name, ex?.name ?? s.exercise_id, ex?.muscle ?? '', n, s.kind, s.load, ex?.load_unit ?? 'kg', s.reps, s.seconds, s.rpe, s.rir];
    }),
  );
}

export function cardioCsv(): string {
  const rows = liveRows<CardioSession>('cardio_sessions').sort((a, b) => a.started_at - b.started_at);
  return csv(
    ['data', 'attivita', 'durata_minuti', 'distanza_km', 'note'],
    rows.map((c) => [c.date, c.activity, Math.round((c.duration_sec / 60) * 10) / 10, c.distance_km, c.notes]),
  );
}
