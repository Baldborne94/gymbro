import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PHOTOS_DIR, sync } from '../../../server/db';
import { cardioCsv, exportAll, importAll, sessionsCsv } from '../../../server/transfer';
import { set } from '../../support/factories';

const t = 1000;
const workout = (id: string, date: string, finished = true) => ({
  id, updated_at: t, deleted: false, routine_id: null, day_id: null, name: `Sessione; "${id}"`, date,
  started_at: Date.parse(`${date}T18:00:00`), finished_at: finished ? Date.parse(`${date}T19:00:00`) : null, notes: '',
});

sync(0, {
  workouts: [workout('w1', '2026-11-10'), workout('w2', '2026-11-12'), workout('w3', '2026-11-14', false)],
  sets: [
    set({ id: 's1', workout_id: 'w1', workout_exercise_id: 'we1', exercise_id: 'base-panca-piana', load: 82.5, reps: 8, rpe: 8.5, done_at: 1 }),
    set({ id: 's2', workout_id: 'w1', workout_exercise_id: 'we1', exercise_id: 'base-panca-piana', load: 82.5, reps: 7, done_at: 2 }),
    set({ id: 's3', workout_id: 'w2', workout_exercise_id: 'we2', exercise_id: 'base-plank', load: null, reps: null, seconds: 45, done_at: 3 }),
    set({ id: 's4', workout_id: 'w2', workout_exercise_id: 'we2', exercise_id: 'base-plank', done: false }),
    set({ id: 's5', workout_id: 'w3', workout_exercise_id: 'we3', exercise_id: 'base-squat', done_at: 4 }),
  ].map((s) => ({ ...s, updated_at: t })),
  cardio_sessions: [{ id: 'c1', updated_at: t, deleted: false, date: '2026-11-11', started_at: 5, activity: 'corsa', duration_sec: 1830, distance_km: 5.25, notes: 'Parco; giro "lungo"' }],
} as never);

describe('esportazione CSV', () => {
  const lines = sessionsCsv().split('\r\n');

  it('è leggibile da Excel in italiano: BOM, punto e virgola, virgola decimale', () => {
    expect(lines[0].charCodeAt(0)).toBe(0xfeff);
    expect(lines[0].slice(1)).toBe('data;sessione;esercizio;gruppo_muscolare;serie;tipo;carico;unita;ripetizioni;secondi;rpe;rir');
    expect(lines[1]).toBe('2026-11-10;"Sessione; ""w1""";Panca piana;petto;1;normale;82,5;kg;8;;8,5;');
    expect(lines[2]).toBe('2026-11-10;"Sessione; ""w1""";Panca piana;petto;2;normale;82,5;kg;7;;;');
  });

  it('contiene solo le serie fatte di sessioni concluse, in ordine', () => {
    expect(lines.filter(Boolean)).toHaveLength(4);
    expect(lines[3]).toContain(';Plank;addome;1;normale;;kg;;45;;');
  });

  it('esporta il cardio con la durata in minuti', () => {
    const [header, first] = cardioCsv().split('\r\n');
    expect(header.slice(1)).toBe('data;attivita;durata_minuti;distanza_km;note');
    expect(first).toBe('2026-11-11;corsa;30,5;5,25;"Parco; giro ""lungo"""');
  });
});

describe('esportazione e importazione JSON', () => {
  it('esporta tutte le tabelle e, a richiesta, le foto', () => {
    const photoId = '11111111-2222-4333-8444-555555555555';
    fs.writeFileSync(path.join(PHOTOS_DIR, `${photoId}.jpg`), Buffer.from([1, 2, 3]));
    const without = exportAll(false);
    expect(without.app).toBe('gymbro');
    expect(without.tables.workouts).toHaveLength(3);
    expect(without.photos).toEqual({});
    expect(exportAll(true).photos[photoId]).toBe(Buffer.from([1, 2, 3]).toString('base64'));
  });

  it('rifiuta file che non vengono da GymBro', () => {
    expect(() => importAll({ tables: {} })).toThrow(/non è un’esportazione/);
    expect(() => importAll(null)).toThrow();
    expect(() => importAll({ app: 'gymbro' })).toThrow();
  });

  it('reimporta un’esportazione, comprese le foto', () => {
    const data = exportAll(true);
    const photoId = Object.keys(data.photos)[0];
    fs.rmSync(path.join(PHOTOS_DIR, `${photoId}.jpg`));
    const res = importAll(JSON.parse(JSON.stringify(data)));
    expect(res.photos).toBe(1);
    expect(res.rows.workouts).toBe(3);
    expect(fs.existsSync(path.join(PHOTOS_DIR, `${photoId}.jpg`))).toBe(true);
  });

  it('non scrive file fuori dalla cartella delle foto', () => {
    const res = importAll({ app: 'gymbro', tables: {}, photos: { '../../evil': 'AAAA', 'non-un-uuid': 'AAAA' } });
    expect(res.photos).toBe(0);
    expect(fs.existsSync(path.join(PHOTOS_DIR, '..', '..', 'evil.jpg'))).toBe(false);
  });
});
