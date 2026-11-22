import { afterEach, describe, expect, it, vi } from 'vitest';
import { EQUIPMENT, KINDS, MUSCLES } from '../../../shared/schema';
import { checkPassword, createToken, loginBlocked, recordFailure, resetFailures, verifyToken } from '../../../server/auth';
import { seedExercises } from '../../../server/seed';

afterEach(() => vi.useRealTimers());

describe('accesso', () => {
  it('verifica la password', () => {
    expect(checkPassword('test')).toBe(true);
    expect(checkPassword('Test')).toBe(false);
    expect(checkPassword('')).toBe(false);
  });

  it('accetta solo gettoni firmati e non scaduti', () => {
    const token = createToken();
    expect(verifyToken(token)).toBe(true);
    expect(verifyToken(undefined)).toBe(false);
    expect(verifyToken('')).toBe(false);
    const [exp, sig] = token.split('.');
    expect(verifyToken(`${Number(exp) + 1}.${sig}`)).toBe(false);
    expect(verifyToken(`${exp}.${sig.slice(0, -2)}xx`)).toBe(false);
  });

  it('la sessione dura un anno', () => {
    vi.useFakeTimers();
    const token = createToken();
    vi.setSystemTime(Date.now() + 364 * 86_400_000);
    expect(verifyToken(token)).toBe(true);
    vi.setSystemTime(Date.now() + 2 * 86_400_000);
    expect(verifyToken(token)).toBe(false);
  });

  it('blocca l’accesso dopo cinque errori per un quarto d’ora', () => {
    vi.useFakeTimers();
    resetFailures();
    for (let i = 0; i < 4; i++) recordFailure();
    expect(loginBlocked()).toBe(false);
    recordFailure();
    expect(loginBlocked()).toBe(true);
    vi.setSystemTime(Date.now() + 15 * 60_000 + 1);
    expect(loginBlocked()).toBe(false);
  });
});

describe('esercizi precaricati', () => {
  const list = seedExercises();

  it('sono più di cento, con identificativi e nomi unici', () => {
    expect(list.length).toBeGreaterThanOrEqual(100);
    expect(new Set(list.map((e) => e.id)).size).toBe(list.length);
    expect(new Set(list.map((e) => e.name.toLowerCase())).size).toBe(list.length);
  });

  it('usano solo valori ammessi e un passo positivo', () => {
    const muscles = new Set(MUSCLES.map((m) => m.id));
    for (const e of list) {
      expect(muscles.has(e.muscle), e.name).toBe(true);
      expect(e.secondary.every((m) => muscles.has(m)), e.name).toBe(true);
      expect(EQUIPMENT.some((q) => q.id === e.equipment), e.name).toBe(true);
      expect(KINDS.some((k) => k.id === e.kind), e.name).toBe(true);
      expect(e.step, e.name).toBeGreaterThan(0);
    }
  });

  it('coprono ogni gruppo muscolare e ogni tipo di esercizio', () => {
    for (const m of MUSCLES) expect(list.some((e) => e.muscle === m.id), m.label).toBe(true);
    for (const k of KINDS) expect(list.some((e) => e.kind === k.id), k.label).toBe(true);
    expect(list.some((e) => e.unilateral)).toBe(true);
  });
});
