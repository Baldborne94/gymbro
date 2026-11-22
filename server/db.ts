import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { TABLES, TABLE_NAMES, type Changes, type ColType, type TableName } from '../shared/schema';
import { seedExercises } from './seed';

export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');
export const PHOTOS_DIR = path.join(DATA_DIR, 'photos');
fs.mkdirSync(PHOTOS_DIR, { recursive: true });

// SQLite integrato in Node: nessun modulo nativo da compilare.
export const db = new DatabaseSync(path.join(DATA_DIR, 'gymbro.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');

function transaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

const SQL_TYPE: Record<ColType, string> = { text: 'TEXT', int: 'INTEGER', real: 'REAL', bool: 'INTEGER', json: 'TEXT' };

function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  // Iscrizioni alle notifiche: restano sul server, non si sincronizzano.
  db.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (endpoint TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL)`);
  for (const name of TABLE_NAMES) {
    db.exec(`CREATE TABLE IF NOT EXISTS ${name} (
      id TEXT PRIMARY KEY,
      updated_at INTEGER NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      rev INTEGER NOT NULL
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS ${name}_rev ON ${name}(rev)`);
    const existing = new Set((db.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[]).map((c) => c.name));
    for (const [col, type] of Object.entries(TABLES[name].cols)) {
      if (!existing.has(col)) db.exec(`ALTER TABLE ${name} ADD COLUMN ${col} ${SQL_TYPE[type]}`);
    }
  }
}

export function getMeta(key: string): string | undefined {
  return (db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined)?.value;
}
export function setMeta(key: string, value: string) {
  db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

function nextRev(): number {
  const rev = Number(getMeta('rev') ?? 0) + 1;
  setMeta('rev', String(rev));
  return rev;
}
export const currentRev = () => Number(getMeta('rev') ?? 0);

function encode(type: ColType, v: unknown): unknown {
  if (v === undefined || v === null) return null;
  switch (type) {
    case 'bool': return v ? 1 : 0;
    case 'json': return JSON.stringify(v);
    case 'int': return Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null;
    case 'real': return Number.isFinite(Number(v)) ? Number(v) : null;
    default: return String(v);
  }
}
function decode(type: ColType, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (type === 'bool') return v === 1;
  if (type === 'json') {
    try { return JSON.parse(v as string); } catch { return null; }
  }
  return v;
}

/** Scrive una riga se è più recente di quella presente. Idempotente. */
function upsert(table: TableName, row: Record<string, unknown>): boolean {
  if (typeof row.id !== 'string' || !row.id || row.id.length > 100) return false;
  const updatedAt = Number(row.updated_at);
  if (!Number.isFinite(updatedAt)) return false;
  const existing = db.prepare(`SELECT updated_at FROM ${table} WHERE id = ?`).get(row.id) as { updated_at: number } | undefined;
  if (existing && existing.updated_at >= updatedAt) return false;
  const cols = Object.entries(TABLES[table].cols) as [string, ColType][];
  const names = ['id', 'updated_at', 'deleted', 'rev', ...cols.map(([c]) => c)];
  const values: (string | number | null)[] = [row.id, updatedAt, row.deleted ? 1 : 0, nextRev(), ...cols.map(([c, t]) => encode(t, row[c]) as string | number | null)];
  db.prepare(
    `INSERT OR REPLACE INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
  ).run(...values);
  return true;
}

function rowsSince(table: TableName, since: number): Record<string, unknown>[] {
  const cols = Object.entries(TABLES[table].cols) as [string, ColType][];
  const rows = db.prepare(`SELECT * FROM ${table} WHERE rev > ?`).all(since) as Record<string, unknown>[];
  return rows.map((r) => {
    const out: Record<string, unknown> = { id: r.id, updated_at: r.updated_at, deleted: r.deleted === 1 };
    for (const [c, t] of cols) out[c] = decode(t, r[c]);
    return out;
  });
}

/** Applica le modifiche del dispositivo e restituisce tutto ciò che è cambiato dopo `since`. */
export const sync = (since: number, changes: Changes) => transaction(() => {
  for (const table of TABLE_NAMES) {
    const rows = changes[table];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) upsert(table, row as unknown as Record<string, unknown>);
  }
  const out: Record<string, unknown[]> = {};
  for (const table of TABLE_NAMES) {
    const rows = rowsSince(table, since);
    if (rows.length) out[table] = rows;
  }
  return { rev: currentRev(), epoch: getMeta('epoch') ?? '', changes: out as Changes };
});

// Per accorgersi di un ripristino: accanto al database si annota il numero di revisione più alto raggiunto.
const revFile = path.join(DATA_DIR, '.rev');
export function noteRev() {
  try { fs.writeFileSync(revFile, String(currentRev())); } catch { /* cartella non scrivibile: si riprova al prossimo giro */ }
}
function checkRestore() {
  const seen = fs.existsSync(revFile) ? Number(fs.readFileSync(revFile, 'utf8')) : 0;
  if (!getMeta('epoch') || seen > currentRev()) {
    // Database nuovo o tornato indietro: i dispositivi rimanderanno tutto ciò che hanno.
    if (seen > currentRev()) console.log('Database ripristinato da una copia: i dispositivi invieranno di nuovo i propri dati.');
    setMeta('epoch', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }
  noteRev();
}

/** Righe non eliminate di una tabella, già decodificate. */
export function liveRows<T = Record<string, unknown>>(table: TableName): T[] {
  return rowsSince(table, 0).filter((r) => !r.deleted) as T[];
}

/**
 * Importa righe da un'esportazione: ogni riga viene riscritta con data di modifica
 * attuale, così prevale su quella presente e raggiunge tutti i dispositivi.
 */
export const importRows = (tables: Record<string, unknown>) => transaction(() => {
  const now = Date.now();
  const counts: Record<string, number> = {};
  for (const table of TABLE_NAMES) {
    const rows = tables[table];
    if (!Array.isArray(rows)) continue;
    counts[table] = 0;
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      // Più recente di ciò che c'è, anche se un dispositivo aveva l'orologio avanti.
      const existing = typeof r.id === 'string'
        ? (db.prepare(`SELECT updated_at FROM ${table} WHERE id = ?`).get(r.id) as { updated_at: number } | undefined)
        : undefined;
      const updatedAt = Math.max(now, (existing?.updated_at ?? 0) + 1);
      if (upsert(table, { ...r, updated_at: updatedAt, deleted: false })) counts[table]++;
    }
  }
  return counts;
});

const seed = () => transaction(() => {
  for (const ex of seedExercises()) {
    const exists = db.prepare('SELECT 1 FROM exercises WHERE id = ?').get(ex.id);
    if (!exists) upsert('exercises', ex as unknown as Record<string, unknown>);
  }
});

migrate();
seed();
checkRestore();
