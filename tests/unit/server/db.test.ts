import { describe, expect, it } from 'vitest';
import { currentRev, db, getMeta, importRows, liveRows, sync } from '../../../server/db';
import { seedExercises } from '../../../server/seed';
import { exercise } from '../../support/factories';

const row = (over: object = {}) => ({ ...exercise({ id: 'x1', name: 'Prova', custom: true }), updated_at: 1000, ...over });
const stored = (id: string) => (liveRows('exercises') as ReturnType<typeof row>[]).find((r) => r.id === id);

describe('database del server', () => {
  it('al primo avvio carica gli esercizi precaricati e un identificativo di epoca', () => {
    expect(liveRows('exercises').length).toBe(seedExercises().length);
    expect(getMeta('epoch')).toBeTruthy();
  });

  it('salva una riga nuova e conserva tipi booleani, numeri e liste', () => {
    sync(0, { exercises: [row({ unilateral: true, secondary: ['spalle', 'tricipiti'], notch_kg: 7.5 })] } as never);
    expect(stored('x1')).toMatchObject({ unilateral: true, secondary: ['spalle', 'tricipiti'], notch_kg: 7.5, deleted: false });
  });

  it('ignora un invio ripetuto o più vecchio e accetta solo quello più recente', () => {
    const rev = currentRev();
    sync(0, { exercises: [row()] } as never);
    expect(currentRev()).toBe(rev);
    sync(0, { exercises: [row({ name: 'Vecchia', updated_at: 500 })] } as never);
    expect(stored('x1')?.name).toBe('Prova');
    sync(0, { exercises: [row({ name: 'Nuova', updated_at: 2000 })] } as never);
    expect(stored('x1')?.name).toBe('Nuova');
    expect(currentRev()).toBe(rev + 1);
  });

  it('restituisce solo ciò che è cambiato dopo la revisione indicata', () => {
    const since = currentRev();
    expect(sync(since, {}).changes).toEqual({});
    sync(0, { exercises: [row({ id: 'x2', name: 'Seconda' })] } as never);
    const res = sync(since, {});
    expect(res.changes.exercises?.map((r) => r.id)).toEqual(['x2']);
    expect(res.rev).toBe(currentRev());
    expect(res.epoch).toBe(getMeta('epoch'));
  });

  it('scarta righe non valide senza bloccare le altre', () => {
    const before = liveRows('exercises').length;
    sync(0, {
      exercises: [
        { ...row(), id: '' },
        { ...row(), id: 'x'.repeat(101) },
        { ...row({ id: 'x3' }), updated_at: 'ieri' },
        row({ id: 'x4', name: 'Valida' }),
      ],
    } as never);
    expect(liveRows('exercises').length).toBe(before + 1);
    expect(stored('x4')?.name).toBe('Valida');
  });

  it('ignora tabelle sconosciute e non accetta SQL nei nomi', () => {
    expect(() => sync(0, { 'exercises; DROP TABLE exercises': [row()] } as never)).not.toThrow();
    expect(liveRows('exercises').length).toBeGreaterThan(100);
  });

  it('le eliminazioni sono morbide: la riga resta ma non è più "viva"', () => {
    sync(0, { exercises: [row({ id: 'x5', updated_at: 1 })] } as never);
    sync(0, { exercises: [row({ id: 'x5', updated_at: 2, deleted: true })] } as never);
    expect(stored('x5')).toBeUndefined();
    expect(db.prepare('SELECT deleted FROM exercises WHERE id = ?').get('x5')).toEqual({ deleted: 1 });
  });

  it('l’importazione prevale sui dati presenti e li riporta in vita', () => {
    sync(0, { exercises: [row({ id: 'x6', name: 'Eliminata', updated_at: 9e12, deleted: true })] } as never);
    const counts = importRows({ exercises: [row({ id: 'x6', name: 'Importata', updated_at: 1 })], sconosciuta: [{}] });
    expect(counts).toEqual({ exercises: 1 });
    expect(stored('x6')?.name).toBe('Importata');
  });
});
