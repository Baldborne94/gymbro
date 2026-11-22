import { describe, expect, it } from 'vitest';
import { addDays, clock, daysBetween, isoDate, num, parseDate, weekStart } from '../../../web/src/dates';
import { estimateMax, loadForReps, platesPerSide } from '../../../web/src/tools';

describe('date', () => {
  it('formatta la data locale come AAAA-MM-GG', () => {
    expect(isoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(isoDate(parseDate('2026-11-18'))).toBe('2026-11-18');
  });

  it('somma i giorni attraversando mesi, anni e cambio dell’ora legale', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('conta i giorni tra due date anche a cavallo del cambio dell’ora', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-11-18', '2026-11-18')).toBe(0);
    expect(daysBetween('2026-11-18', '2026-11-11')).toBe(-7);
  });

  it('trova il lunedì della settimana', () => {
    expect(weekStart('2026-11-18')).toBe('2026-11-16'); // mercoledì
    expect(weekStart('2026-11-16')).toBe('2026-11-16'); // lunedì
    expect(weekStart('2026-11-22')).toBe('2026-11-16'); // domenica
  });

  it('formatta secondi e numeri all’italiana', () => {
    expect(clock(90)).toBe('1:30');
    expect(clock(5)).toBe('0:05');
    expect(num(82.5)).toBe('82,5');
    expect(num(100)).toBe('100');
  });
});

describe('calcolatore dei dischi', () => {
  const plates = [25, 20, 15, 10, 5, 2.5, 1.25];

  it('carica i dischi più pesanti per primi', () => {
    expect(platesPerSide(100, 20, plates)).toEqual({ side: [25, 15], total: 100 });
    expect(platesPerSide(142.5, 20, plates)).toEqual({ side: [25, 25, 10, 1.25], total: 142.5 });
  });

  it('con un peso non raggiungibile si ferma al massimo possibile per difetto', () => {
    expect(platesPerSide(101, 20, plates)).toEqual({ side: [25, 15], total: 100 });
  });

  it('usa solo i dischi disponibili, in qualunque ordine siano', () => {
    expect(platesPerSide(100, 20, [10, 20])).toEqual({ side: [20, 20], total: 100 });
  });

  it('sotto il peso del bilanciere non carica nulla', () => {
    expect(platesPerSide(15, 20, plates)).toEqual({ side: [], total: 20 });
    expect(platesPerSide(20, 20, plates)).toEqual({ side: [], total: 20 });
  });

  it('funziona con bilancieri diversi', () => {
    expect(platesPerSide(60, 15, plates).total).toBe(60);
  });
});

describe('calcolatore del massimale', () => {
  it('fa la media tra Epley e Brzycki', () => {
    const r = estimateMax(80, 8);
    expect(r.epley).toBeCloseTo(101.33, 2);
    expect(r.brzycki).toBeCloseTo(99.31, 2);
    expect(r.max).toBeCloseTo(100.32, 2);
  });

  it('con una sola ripetizione il massimale è il carico sollevato', () => {
    expect(estimateMax(120, 1).max).toBe(120);
  });

  it('oltre 36 ripetizioni usa solo Epley', () => {
    const r = estimateMax(20, 40);
    expect(r.brzycki).toBe(0);
    expect(r.max).toBe(r.epley);
  });

  it('ricava il carico per un numero di ripetizioni', () => {
    expect(loadForReps(100, 1)).toBe(100);
    expect(loadForReps(100, 10)).toBeCloseTo(75, 0);
  });
});
