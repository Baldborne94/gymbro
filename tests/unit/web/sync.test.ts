// @vitest-environment node
import fs from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Il server vero (SQLite) gira nello stesso processo, su una cartella temporanea.
// Questo file gira in Node (serve SQLite): localStorage del browser viene simulato.
vi.hoisted(async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gymbro-sync-'));
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
});

import { sync as serverSync, db as serverDb, setMeta, liveRows } from '../../../server/db';
import { auth } from '../../../web/src/auth';
import { db, remove, save, saveBlob } from '../../../web/src/db';
import { syncNow, syncState } from '../../../web/src/sync';
import { exercise } from '../../support/factories';

/** Rete finta: inoltra le richieste al server, oppure simula rete assente o errori. */
const net = {
  mode: 'online' as 'online' | 'offline' | 'error' | 'unauthorized',
  photos: new Map<string, number>(),
  /** Azione eseguita mentre la richiesta è "in viaggio", prima della risposta. */
  during: null as null | (() => Promise<void>),
};

beforeAll(() => {
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (net.mode === 'offline') throw new TypeError('Failed to fetch');
    if (net.mode === 'unauthorized') return new Response('{}', { status: 401 });
    if (net.mode === 'error') return new Response('{}', { status: 500 });
    if (url === '/api/sync') {
      const body = JSON.parse(String(init?.body));
      const result = JSON.stringify(serverSync(body.since, body.changes));
      if (net.during) { const fn = net.during; net.during = null; await fn(); }
      return new Response(result, { status: 200 });
    }
    const photo = url.match(/^\/api\/photos\/(.+)$/);
    if (photo && init?.method === 'PUT') {
      net.photos.set(photo[1], (init.body as Blob).size);
      return new Response('{}', { status: 200 });
    }
    return new Response('{}', { status: 404 });
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
  fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true });
});

beforeEach(async () => {
  net.mode = 'online';
  auth.set({ status: 'in' });
  await syncNow();
});

const serverRow = (table: 'exercises', id: string) =>
  (liveRows(table) as { id: string; name: string }[]).find((r) => r.id === id);

/** Modifica fatta da un altro dispositivo, direttamente sul server. */
const fromOtherDevice = (row: object) => serverSync(0, { exercises: [row] } as never);

describe('sincronizzazione tra telefono e server', () => {
  it('scarica al primo avvio gli esercizi precaricati', async () => {
    expect(await db.exercises.count()).toBeGreaterThanOrEqual(100);
    expect((await db.exercises.get('base-panca-piana'))?.name).toBe('Panca piana');
  });

  it('invia al server una modifica fatta sul telefono', async () => {
    await save('exercises', { ...exercise({ id: 'mio-1', name: 'Mio esercizio', custom: true }) });
    await syncNow();
    expect(serverRow('exercises', 'mio-1')?.name).toBe('Mio esercizio');
    expect((await db.exercises.get('mio-1'))?._dirty).toBe(0);
    expect(syncState.get()).toMatchObject({ status: 'idle', pending: 0 });
  });

  it('ripetere la sincronizzazione non duplica e non riscrive nulla', async () => {
    await save('exercises', { ...exercise({ id: 'mio-2', name: 'Doppione?' }) });
    await syncNow();
    const rev = Number((serverDb.prepare("SELECT value FROM meta WHERE key = 'rev'").get() as { value: string }).value);
    const count = (serverDb.prepare('SELECT COUNT(*) AS n FROM exercises').get() as { n: number }).n;
    // Lo stesso invio ripetuto, come dopo una risposta persa per strada.
    const row = await db.exercises.get('mio-2');
    const { _dirty, ...payload } = row!;
    serverSync(0, { exercises: [payload] } as never);
    await syncNow();
    await syncNow();
    expect((serverDb.prepare('SELECT COUNT(*) AS n FROM exercises').get() as { n: number }).n).toBe(count);
    expect(Number((serverDb.prepare("SELECT value FROM meta WHERE key = 'rev'").get() as { value: string }).value)).toBe(rev);
  });

  it('riceve le modifiche fatte da un altro dispositivo', async () => {
    fromOtherDevice({ ...exercise({ id: 'altro-1', name: 'Dal tablet' }), updated_at: Date.now() });
    await syncNow();
    expect((await db.exercises.get('altro-1'))?.name).toBe('Dal tablet');
  });

  it('in caso di conflitto vince la modifica più recente', async () => {
    await save('exercises', { ...exercise({ id: 'conflitto', name: 'Versione A' }) });
    await syncNow();

    // Il tablet modifica prima, il telefono dopo: vince il telefono.
    fromOtherDevice({ ...exercise({ id: 'conflitto', name: 'Tablet' }), updated_at: Date.now() - 1000 });
    await save('exercises', { ...exercise({ id: 'conflitto', name: 'Telefono' }) });
    await syncNow();
    expect(serverRow('exercises', 'conflitto')?.name).toBe('Telefono');
    expect((await db.exercises.get('conflitto'))?.name).toBe('Telefono');

    // Ora il tablet modifica dopo: il telefono riceve la versione del tablet.
    fromOtherDevice({ ...exercise({ id: 'conflitto', name: 'Tablet dopo' }), updated_at: Date.now() + 1000 });
    await syncNow();
    expect((await db.exercises.get('conflitto'))?.name).toBe('Tablet dopo');
  });

  it('una modifica fatta mentre la sincronizzazione è in corso non va persa', async () => {
    await save('exercises', { ...exercise({ id: 'in-volo', name: 'Prima' }) });
    await new Promise((r) => setTimeout(r, 2));
    // Mentre la richiesta con "Prima" viaggia, l'utente cambia di nuovo il nome.
    net.during = async () => {
      await save('exercises', { ...exercise({ id: 'in-volo', name: 'Durante l’invio' }) });
    };
    await syncNow();
    expect((await db.exercises.get('in-volo'))?.name).toBe('Durante l’invio');
    await syncNow();
    expect(serverRow('exercises', 'in-volo')?.name).toBe('Durante l’invio');
    expect((await db.exercises.get('in-volo'))?._dirty).toBe(0);
  });

  it('senza rete le modifiche restano in coda e partono al ritorno', async () => {
    net.mode = 'offline';
    await save('exercises', { ...exercise({ id: 'offline-1', name: 'Fatto in palestra' }) });
    await syncNow();
    expect(syncState.get().status).toBe('offline');
    expect(syncState.get().pending).toBeGreaterThan(0);
    expect(serverRow('exercises', 'offline-1')).toBeUndefined();
    expect((await db.exercises.get('offline-1'))?._dirty).toBe(1);

    net.mode = 'online';
    await syncNow();
    expect(serverRow('exercises', 'offline-1')?.name).toBe('Fatto in palestra');
    expect(syncState.get()).toMatchObject({ status: 'idle', pending: 0 });
  });

  it('un errore del server non perde le modifiche', async () => {
    net.mode = 'error';
    await save('exercises', { ...exercise({ id: 'errore-1', name: 'Resiste' }) });
    await syncNow();
    expect(syncState.get().status).toBe('error');
    expect((await db.exercises.get('errore-1'))?._dirty).toBe(1);
    net.mode = 'online';
    await syncNow();
    expect(serverRow('exercises', 'errore-1')?.name).toBe('Resiste');
  });

  it('con la sessione scaduta torna alla schermata di accesso', async () => {
    net.mode = 'unauthorized';
    await syncNow();
    expect(auth.get().status).toBe('out');
  });

  it('le eliminazioni arrivano al server', async () => {
    await save('exercises', { ...exercise({ id: 'da-eliminare', name: 'Via' }) });
    await syncNow();
    await remove('exercises', 'da-eliminare');
    await syncNow();
    expect(serverRow('exercises', 'da-eliminare')).toBeUndefined();
  });

  it('carica le foto salvate sul telefono', async () => {
    const id = await saveBlob(new Blob([new Uint8Array(1234)], { type: 'image/jpeg' }));
    await syncNow();
    expect(net.photos.get(id)).toBe(1234);
    expect((await db.blobs.get(id))?.uploaded).toBe(1);
  });

  it('dopo un ripristino del server da una copia, il telefono rimanda ciò che ha', async () => {
    await save('exercises', { ...exercise({ id: 'dopo-backup', name: 'Creato dopo il backup' }) });
    await syncNow();
    expect(serverRow('exercises', 'dopo-backup')).toBeDefined();

    // Il server torna a una copia precedente: la riga sparisce e l'epoca cambia.
    serverDb.prepare('DELETE FROM exercises WHERE id = ?').run('dopo-backup');
    setMeta('epoch', 'ripristino-di-prova');
    await syncNow();
    expect(serverRow('exercises', 'dopo-backup')?.name).toBe('Creato dopo il backup');
  });
});
