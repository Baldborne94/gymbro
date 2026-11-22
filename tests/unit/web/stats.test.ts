import { describe, expect, it } from 'vitest';
import type { CardioSession, Workout } from '../../../shared/schema';
import {
  allRecords, e1rm, exerciseProgress, findRecords, muscleSets, recordValue, sessionsByWeek,
  suggestIncrease, weekStreak, type Overview,
} from '../../../web/src/stats';
import { exercise, set } from '../../support/factories';

const panca = exercise();

describe('massimale stimato (Epley)', () => {
  it('vale il carico per una ripetizione e zero senza ripetizioni', () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 0)).toBe(0);
    expect(e1rm(90, 10)).toBe(120);
  });
});

describe('record personali', () => {
  it('la prima sessione fa da riferimento e non produce record', () => {
    const sets = [set({ workout_id: 'a', load: 80, reps: 8 }), set({ workout_id: 'a', load: 85, reps: 5 })];
    expect(findRecords(sets, panca).size).toBe(0);
  });

  it('riconosce un nuovo carico massimo', () => {
    const base = set({ workout_id: 'a', load: 80, reps: 8 });
    const nuovo = set({ workout_id: 'b', load: 82.5, reps: 6 });
    expect(findRecords([base, nuovo], panca).get(nuovo.id)).toBe('carico');
  });

  it('a parità di carico, più ripetizioni danno un record di massimale stimato', () => {
    const base = set({ workout_id: 'a', load: 80, reps: 8 });
    const nuovo = set({ workout_id: 'b', load: 80, reps: 10 });
    expect(findRecords([base, nuovo], panca).get(nuovo.id)).toBe('massimale');
  });

  it('una serie uguale alla migliore non è un record', () => {
    const base = set({ workout_id: 'a', load: 80, reps: 8 });
    const uguale = set({ workout_id: 'b', load: 80, reps: 8 });
    expect(findRecords([base, uguale], panca).has(uguale.id)).toBe(false);
  });

  it('ignora riscaldamento, serie non fatte ed eliminate', () => {
    const base = set({ workout_id: 'a', load: 80, reps: 8 });
    const sets = [
      base,
      set({ workout_id: 'b', load: 100, reps: 5, kind: 'riscaldamento' }),
      set({ workout_id: 'b', load: 100, reps: 5, done: false }),
      set({ workout_id: 'b', load: 100, reps: 5, deleted: true }),
    ];
    expect(findRecords(sets, panca).size).toBe(0);
  });

  it('segue l’ordine di esecuzione, non quello dell’array', () => {
    const dopo = set({ workout_id: 'b', load: 90, reps: 5, done_at: 2_000_000 });
    const prima = set({ workout_id: 'a', load: 80, reps: 5, done_at: 1_000_000 });
    expect(findRecords([dopo, prima], panca).get(dopo.id)).toBe('carico');
  });

  it('per gli esercizi a tempo il record è la durata', () => {
    const plank = exercise({ id: 'plank', kind: 'tempo' });
    const base = set({ workout_id: 'a', exercise_id: 'plank', load: null, reps: null, seconds: 45 });
    const nuovo = set({ workout_id: 'b', exercise_id: 'plank', load: null, reps: null, seconds: 60 });
    const found = findRecords([base, nuovo], plank);
    expect(found.get(nuovo.id)).toBe('durata');
    expect(recordValue(nuovo, 'durata', plank)).toBe('60 s');
  });

  it('a corpo libero conta più ripetizioni a parità o con più zavorra', () => {
    const trazioni = exercise({ id: 'traz', kind: 'corpo_libero' });
    const base = set({ workout_id: 'a', exercise_id: 'traz', load: 0, reps: 8 });
    const assistito = set({ workout_id: 'b', exercise_id: 'traz', load: -20, reps: 12 });
    const zavorrato = set({ workout_id: 'c', exercise_id: 'traz', load: 10, reps: 9 });
    const found = findRecords([base, assistito, zavorrato], trazioni);
    expect(found.has(assistito.id)).toBe(true); // nuovo livello di carico, mai fatto prima
    expect(found.get(zavorrato.id)).toBe('ripetizioni');
    expect(recordValue(zavorrato, 'ripetizioni', trazioni)).toBe('9 rip +10 kg');
  });

  it('sulle macchine a tacche usa i kg quando sono noti', () => {
    const pressa = exercise({ id: 'pressa', load_unit: 'tacche', notch_kg: 5 });
    const base = set({ workout_id: 'a', exercise_id: 'pressa', load: 10, reps: 10 });
    const nuovo = set({ workout_id: 'b', exercise_id: 'pressa', load: 11, reps: 10 });
    expect(findRecords([base, nuovo], pressa).get(nuovo.id)).toBe('carico');
    expect(recordValue(nuovo, 'carico', pressa)).toBe('11 tacche × 10');
    expect(recordValue(nuovo, 'massimale', pressa)).toBe('73,3 kg');
  });
});

describe('progressione automatica', () => {
  const work = (reps: number[], load = 80) => reps.map((r) => set({ load, reps: r }));

  it('propone un passo in più se tutte le serie hanno raggiunto il massimo', () => {
    expect(suggestIncrease(work([12, 12, 12]), 12, 3, panca)).toBe(82.5);
  });

  it('parte dal carico più basso usato', () => {
    const sets = [set({ load: 80, reps: 12 }), set({ load: 77.5, reps: 12 })];
    expect(suggestIncrease(sets, 12, 2, panca)).toBe(80);
  });

  it('non propone nulla se una serie è rimasta sotto', () => {
    expect(suggestIncrease(work([12, 12, 11]), 12, 3, panca)).toBeNull();
  });

  it('non propone nulla se le serie fatte sono meno di quelle previste', () => {
    expect(suggestIncrease(work([12, 12]), 12, 3, panca)).toBeNull();
  });

  it('il riscaldamento non conta', () => {
    const sets = [set({ kind: 'riscaldamento', load: 40, reps: 5 }), ...work([12, 12])];
    expect(suggestIncrease(sets, 12, 2, panca)).toBe(82.5);
  });

  it('non vale per esercizi a tempo, a corpo libero o senza intervallo', () => {
    expect(suggestIncrease(work([12, 12]), 12, 2, exercise({ kind: 'tempo' }))).toBeNull();
    expect(suggestIncrease(work([12, 12]), 12, 2, exercise({ kind: 'corpo_libero' }))).toBeNull();
    expect(suggestIncrease(work([12, 12]), null, 2, panca)).toBeNull();
    expect(suggestIncrease([], 12, 0, panca)).toBeNull();
  });

  it('usa il passo dell’esercizio', () => {
    expect(suggestIncrease(work([10, 10], 20), 10, 2, exercise({ step: 1 }))).toBe(21);
  });
});

describe('settimane consecutive', () => {
  const today = '2026-11-18'; // mercoledì

  it('conta le sessioni per settimana', () => {
    const weeks = sessionsByWeek(['2026-11-16', '2026-11-18', '2026-11-10']);
    expect(weeks.get('2026-11-16')).toBe(2);
    expect(weeks.get('2026-11-09')).toBe(1);
  });

  it('la settimana in corso non interrompe la serie finché non è finita', () => {
    const dates = ['2026-11-10', '2026-11-12', '2026-11-03', '2026-11-05', '2026-11-16'];
    expect(weekStreak(dates, 2, today)).toBe(2);
  });

  it('la settimana in corso conta quando l’obiettivo è già raggiunto', () => {
    const dates = ['2026-11-16', '2026-11-17', '2026-11-10', '2026-11-12'];
    expect(weekStreak(dates, 2, today)).toBe(2);
  });

  it('una settimana sotto obiettivo azzera la serie', () => {
    const dates = ['2026-11-10', '2026-11-12', '2026-10-27', '2026-10-29'];
    expect(weekStreak(dates, 2, today)).toBe(1);
  });

  it('senza obiettivo o senza sessioni la serie è zero', () => {
    expect(weekStreak([], 3, today)).toBe(0);
    expect(weekStreak(['2026-11-10'], 0, today)).toBe(0);
  });
});

describe('andamento, bilanciamento e record d’insieme', () => {
  const workout = (id: string, date: string): Workout => ({
    id, updated_at: 1, deleted: false, routine_id: null, day_id: null, name: id, date,
    started_at: Date.parse(`${date}T18:00:00`), finished_at: Date.parse(`${date}T19:00:00`), notes: '',
  });
  const squat = exercise({ id: 'squat', name: 'Squat', muscle: 'quadricipiti', secondary: ['glutei', 'femorali'] });
  const w1 = { workout: workout('w1', '2026-11-03'), sets: [set({ workout_id: 'w1', load: 80, reps: 8 }), set({ workout_id: 'w1', exercise_id: 'squat', load: 100, reps: 5 })], volume: 0, duration: 0, exercises: 2 };
  const w2 = { workout: workout('w2', '2026-11-17'), sets: [set({ workout_id: 'w2', load: 85, reps: 6 }), set({ workout_id: 'w2', load: 40, reps: 10, kind: 'riscaldamento' }), set({ workout_id: 'w2', exercise_id: 'squat', load: 100, reps: 5 })], volume: 0, duration: 0, exercises: 2 };
  const overview: Overview = {
    workouts: [w2, w1], // dal più recente
    exercises: new Map([[panca.id, panca], [squat.id, squat]]),
    wes: [],
    cardio: [] as CardioSession[],
  };

  it('calcola un punto per sessione in ordine cronologico', () => {
    const points = exerciseProgress(overview, panca.id);
    expect(points.map((p) => p.date)).toEqual(['2026-11-03', '2026-11-17']);
    expect(points.map((p) => p.maxLoad)).toEqual([80, 85]);
    expect(points[1].volume).toBe(85 * 6); // il riscaldamento non entra nel volume
    expect(points[1].e1rm).toBeCloseTo(102, 0);
  });

  it('conta le serie per gruppo muscolare, mezze per i secondari', () => {
    const week = muscleSets(overview, '2026-11-16');
    expect(week.get('petto')).toBe(1);
    expect(week.get('tricipiti')).toBe(0.5);
    expect(week.get('quadricipiti')).toBe(1);
    expect(week.get('glutei')).toBe(0.5);
    expect(muscleSets(overview, '2026-11-09').size).toBe(0);
  });

  it('elenca i record dal più recente con la data della sessione', () => {
    const records = allRecords(overview);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: 'carico', date: '2026-11-17' });
    expect(records[0].exercise.name).toBe('Panca piana');
  });
});
