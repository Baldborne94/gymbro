import type { Table } from 'dexie';
import { TABLE_NAMES, type SyncResponse } from '../../shared/schema';
import { auth, markLoggedOut } from './auth';
import { db } from './db';
import { createStore } from './store';

interface SyncState {
  status: 'idle' | 'syncing' | 'offline' | 'error';
  lastSync: number | null;
  pending: number;
}

export const syncState = createStore<SyncState>({ status: 'idle', lastSync: null, pending: 0 });

type AnyRow = { id: string; updated_at: number; _dirty: 0 | 1 };
const table = (name: string) => db.table(name) as Table<AnyRow, string>;

async function countPending(): Promise<number> {
  let n = await db.blobs.where('uploaded').equals(0).count();
  for (const name of TABLE_NAMES) n += await table(name).where('_dirty').equals(1).count();
  return n;
}

async function uploadBlobs() {
  const pending = await db.blobs.where('uploaded').equals(0).toArray();
  for (const b of pending) {
    const res = await fetch(`/api/photos/${b.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: b.blob,
    });
    if (res.status === 401) throw new Unauthorized();
    if (!res.ok) throw new Error(`Caricamento foto: ${res.status}`);
    await db.blobs.update(b.id, { uploaded: 1 });
  }
}

class Unauthorized extends Error {}

async function runSync() {
  await uploadBlobs();

  const sent: Record<string, AnyRow[]> = {};
  const changes: Record<string, unknown[]> = {};
  for (const name of TABLE_NAMES) {
    const dirty = await table(name).where('_dirty').equals(1).toArray();
    if (!dirty.length) continue;
    sent[name] = dirty;
    changes[name] = dirty.map(({ _dirty, ...row }) => row);
  }
  const since = ((await db.kv.get('rev'))?.value as number | undefined) ?? 0;

  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ since, changes }),
  });
  if (res.status === 401) throw new Unauthorized();
  if (!res.ok) throw new Error(`Sincronizzazione: ${res.status}`);
  const data = (await res.json()) as SyncResponse;

  // Server ripristinato da una copia più vecchia: si rimanda tutto ciò che c'è sul dispositivo.
  const knownEpoch = (await db.kv.get('epoch'))?.value as string | undefined;
  if ((knownEpoch && data.epoch && knownEpoch !== data.epoch) || data.rev < since) {
    for (const name of TABLE_NAMES) await table(name).toCollection().modify({ _dirty: 1 });
    await db.blobs.toCollection().modify({ uploaded: 0 });
    await db.kv.bulkPut([{ key: 'rev', value: 0 }, { key: 'epoch', value: data.epoch }]);
    again = true;
    return;
  }
  if (data.epoch && knownEpoch !== data.epoch) await db.kv.put({ key: 'epoch', value: data.epoch });

  await db.transaction('rw', [...TABLE_NAMES.map((n) => db.table(n)), db.kv], async () => {
    for (const name of TABLE_NAMES) {
      const t = table(name);
      // Le righe inviate non sono più in sospeso, a meno che siano cambiate nel frattempo.
      for (const row of sent[name] ?? []) {
        const local = await t.get(row.id);
        if (local && local.updated_at === row.updated_at) await t.update(row.id, { _dirty: 0 });
      }
      // Dal server: vince la modifica più recente.
      for (const remote of (data.changes[name] ?? []) as unknown as AnyRow[]) {
        const local = await t.get(remote.id);
        if (local && local._dirty === 1 && local.updated_at > remote.updated_at) continue;
        if (local && local.updated_at > remote.updated_at) continue;
        await t.put({ ...remote, _dirty: 0 });
      }
    }
    await db.kv.put({ key: 'rev', value: data.rev });
  });
}

let running = false;
let again = false;

export async function syncNow(): Promise<void> {
  if (auth.get().status !== 'in') return;
  if (running) { again = true; return; }
  running = true;
  syncState.set({ status: 'syncing' });
  try {
    do {
      again = false;
      await runSync();
    } while (again);
    syncState.set({ status: 'idle', lastSync: Date.now(), pending: await countPending() });
  } catch (err) {
    if (err instanceof Unauthorized) {
      markLoggedOut();
      syncState.set({ status: 'idle' });
    } else {
      // TypeError = rete o server non raggiungibili: si riprova più tardi.
      syncState.set({ status: err instanceof TypeError ? 'offline' : 'error', pending: await countPending() });
    }
  } finally {
    running = false;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
/** Sincronizza a breve, raggruppando le modifiche ravvicinate. */
export function requestSync() {
  clearTimeout(timer);
  timer = setTimeout(() => { void syncNow(); }, 800);
  void countPending().then((pending) => syncState.set({ pending }));
}

export function startSync() {
  void syncNow();
  window.addEventListener('online', () => { void syncNow(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  setInterval(() => { void syncNow(); }, 60_000);
}
