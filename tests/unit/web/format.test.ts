import { describe, expect, it } from 'vitest';
import type { RoutineExercise } from '../../../shared/schema';
import { cycleInfo, cycleMessage, newItemDefaults, summary } from '../../../web/src/routines';
import { formatDuration, formatEffort, formatSet, loadKg, setVolume } from '../../../web/src/workout';
import { exercise, set } from '../../support/factories';

describe('formato delle serie', () => {
  it('peso × ripetizioni', () => {
    expect(formatSet({ load: 82.5, reps: 8, seconds: null }, exercise())).toBe('82,5 kg × 8');
    expect(formatSet({ load: null, reps: 8, seconds: null }, exercise())).toBe('— kg × 8');
  });
  it('macchine a tacche', () => {
    expect(formatSet({ load: 7, reps: 10, seconds: null }, exercise({ load_unit: 'tacche' }))).toBe('7 tacche × 10');
  });
  it('corpo libero con zavorra o assistenza', () => {
    const ex = exercise({ kind: 'corpo_libero' });
    expect(formatSet({ load: 0, reps: 10, seconds: null }, ex)).toBe('10 rip');
    expect(formatSet({ load: 10, reps: 6, seconds: null }, ex)).toBe('6 rip +10 kg');
    expect(formatSet({ load: -20, reps: 8, seconds: null }, ex)).toBe('8 rip −20 kg');
  });
  it('esercizi a tempo', () => {
    expect(formatSet({ load: null, reps: null, seconds: 45 }, exercise({ kind: 'tempo' }))).toBe('45 s');
  });
  it('sforzo percepito', () => {
    expect(formatEffort({ rpe: 8.5, rir: null })).toBe('RPE 8,5');
    expect(formatEffort({ rpe: null, rir: 2 })).toBe('RIR 2');
    expect(formatEffort({ rpe: null, rir: null })).toBeNull();
  });
  it('durata', () => {
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(-5)).toBe('0:00');
  });
});

describe('volume e carico in kg', () => {
  it('somma carico × ripetizioni delle serie fatte', () => {
    expect(setVolume(set({ load: 80, reps: 8 }), exercise())).toBe(640);
  });
  it('esclude riscaldamento, serie non fatte, tempo e corpo libero', () => {
    expect(setVolume(set({ kind: 'riscaldamento' }), exercise())).toBe(0);
    expect(setVolume(set({ done: false }), exercise())).toBe(0);
    expect(setVolume(set(), exercise({ kind: 'tempo' }))).toBe(0);
    expect(setVolume(set(), exercise({ kind: 'corpo_libero' }))).toBe(0);
  });
  it('converte le tacche solo se si conoscono i kg per tacca', () => {
    expect(loadKg({ load: 10 }, exercise({ load_unit: 'tacche', notch_kg: 5 }))).toBe(50);
    expect(loadKg({ load: 10 }, exercise({ load_unit: 'tacche', notch_kg: null }))).toBeNull();
    expect(setVolume(set({ load: 10, reps: 10 }), exercise({ load_unit: 'tacche' }))).toBe(0);
  });
});

describe('cicli delle schede', () => {
  const today = '2026-11-18';
  const active = (start: string, weeks = 8) => ({ status: 'attiva' as const, start_date: start, weeks });

  it('solo una scheda attiva con data e durata ha un ciclo', () => {
    expect(cycleInfo({ status: 'bozza', start_date: today, weeks: 8 }, today)).toBeNull();
    expect(cycleInfo({ status: 'attiva', start_date: null, weeks: 8 }, today)).toBeNull();
    expect(cycleInfo({ status: 'attiva', start_date: today, weeks: null }, today)).toBeNull();
  });

  it('il primo giorno è la settimana 1', () => {
    const c = cycleInfo(active(today), today)!;
    expect(c).toMatchObject({ week: 1, weeks: 8, daysLeft: 56, state: 'in_corso', end: '2027-01-12' });
    expect(cycleMessage(c)).toBeNull();
  });

  it('avvisa nell’ultima settimana', () => {
    const c = cycleInfo(active('2026-09-27'), today)!; // 52 giorni fa
    expect(c.week).toBe(8);
    expect(c.state).toBe('ultima_settimana');
    expect(cycleMessage(c)).toMatch(/Ultima settimana/);
  });

  it('l’ultimo giorno del ciclo è oggi, non ieri', () => {
    const c = cycleInfo(active('2026-09-24'), today)!; // fine prevista: oggi
    expect(c.end).toBe(today);
    expect(cycleMessage(c)).toBe('Il ciclo finisce oggi: prepara la prossima scheda.');
  });

  it('a ciclo finito dice da quanti giorni', () => {
    expect(cycleInfo(active('2026-09-23'), today)!.end).toBe('2026-11-17');
    expect(cycleMessage(cycleInfo(active('2026-09-23'), today)!)).toBe('Ciclo concluso da 1 giorno: è ora di cambiare scheda.');
    expect(cycleMessage(cycleInfo(active('2026-09-14'), today)!)).toBe('Ciclo concluso da 10 giorni: è ora di cambiare scheda.');
  });
});

describe('riassunto delle righe di scheda', () => {
  const item = (over: Partial<RoutineExercise> = {}): RoutineExercise => ({
    id: 'i', updated_at: 1, deleted: false, routine_id: 'r', day_id: 'd', exercise_id: 'e', position: 0,
    sets: 4, reps_min: 8, reps_max: 12, load: 80, rest_sec: 120, superset_next: false, notes: '', ...over,
  });
  it('serie, intervallo, carico e recupero', () => {
    expect(summary(item(), exercise())).toBe('4 × 8–12 · 80 kg · rec. 2:00');
    expect(summary(item({ reps_min: 5, reps_max: 5, load: null, rest_sec: 90 }), exercise())).toBe('4 × 5 · rec. 1:30');
  });
  it('tempo, zavorra e tacche', () => {
    expect(summary(item({ reps_min: 30, reps_max: 60, load: null, rest_sec: 60, sets: 3 }), exercise({ kind: 'tempo' }))).toBe('3 × 30–60 s · rec. 1:00');
    expect(summary(item({ load: 10 }), exercise({ kind: 'corpo_libero' }))).toBe('4 × 8–12 · +10 kg · rec. 2:00');
    expect(summary(item({ load: 7 }), exercise({ load_unit: 'tacche' }))).toBe('4 × 8–12 · 7 tacche · rec. 2:00');
  });
  it('valori iniziali di un nuovo esercizio', () => {
    expect(newItemDefaults(exercise())).toEqual({ sets: 3, reps_min: 8, reps_max: 12, rest_sec: 90 });
    expect(newItemDefaults(exercise({ kind: 'tempo' }))).toEqual({ sets: 3, reps_min: 30, reps_max: 60, rest_sec: 60 });
  });
});
