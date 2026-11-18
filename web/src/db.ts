import Dexie, { type Table } from 'dexie';
import { LOCAL_DB_VERSION, TABLES, TABLE_NAMES, type RowTypes, type TableName } from '../../shared/schema';
import { requestSync } from './sync';

/** Riga locale: `_dirty` vale 1 finché la modifica non è arrivata al server. */
export type Local<T> = T & { _dirty: 0 | 1 };

export interface LocalBlob {
  id: string;
  blob: Blob;
  uploaded: 0 | 1;
}

type SyncTables = { [T in TableName]: Table<Local<RowTypes[T]>, string> };

class GymDB extends Dexie {
  blobs!: Table<LocalBlob, string>;
  kv!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('gymbro');
    const stores: Record<string, string> = { blobs: 'id, uploaded', kv: 'key' };
    for (const name of TABLE_NAMES) {
      const indexes: string[] = (TABLES[name] as { indexes?: string[] }).indexes ?? [];
      stores[name] = ['id', '_dirty', ...indexes].join(', ');
    }
    this.version(LOCAL_DB_VERSION).stores(stores);
  }
}

export const db = new GymDB() as GymDB & SyncTables;

/** UUID anche senza HTTPS, dove crypto.randomUUID non esiste. */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

type Draft<T extends TableName> = Omit<RowTypes[T], 'updated_at' | 'deleted'> & { deleted?: boolean };

/** Salva in locale e mette in coda per la sincronizzazione. */
export async function save<T extends TableName>(table: T, row: Draft<T>): Promise<void> {
  const full = { ...row, deleted: row.deleted ?? false, updated_at: Date.now(), _dirty: 1 };
  await (db[table] as Table<unknown, string>).put(full);
  requestSync();
}

/** Modifica alcuni campi di una riga esistente. */
export async function patch<T extends TableName>(table: T, id: string, changes: Partial<RowTypes[T]>): Promise<void> {
  await (db[table] as Table<object, string>).update(id, { ...changes, updated_at: Date.now(), _dirty: 1 } as never);
  requestSync();
}

/** Eliminazione morbida: la riga resta, marcata come eliminata, così si propaga. */
export async function remove<T extends TableName>(table: T, id: string): Promise<void> {
  await (db[table] as Table<{ deleted: boolean; updated_at: number; _dirty: number }, string>).update(id, {
    deleted: true,
    updated_at: Date.now(),
    _dirty: 1,
  });
  requestSync();
}

export async function saveBlob(blob: Blob): Promise<string> {
  const id = uuid();
  await db.blobs.put({ id, blob, uploaded: 0 });
  requestSync();
  return id;
}
