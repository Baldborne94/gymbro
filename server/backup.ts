import fs from 'node:fs';
import path from 'node:path';
import { backup as sqliteBackup } from 'node:sqlite';
import { DATA_DIR, PHOTOS_DIR, db } from './db';

// Configurazione da variabili d'ambiente.
export const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR ?? path.join(DATA_DIR, 'backups'));
export const BACKUP_TIME = /^\d{2}:\d{2}$/.test(process.env.BACKUP_TIME ?? '') ? (process.env.BACKUP_TIME as string) : '03:00';
const keepRaw = Number(process.env.BACKUP_KEEP ?? 7);
/** Numero di copie del database conservate; 0 disattiva il backup automatico. */
export const BACKUP_KEEP = Number.isFinite(keepRaw) && keepRaw >= 0 ? Math.floor(keepRaw) : 7;

const DB_DIR = path.join(BACKUP_DIR, 'db');
const PHOTO_COPY = path.join(BACKUP_DIR, 'photos');
let lastError: string | null = null;

const stamp = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

export function listBackups() {
  if (!fs.existsSync(DB_DIR)) return [];
  return fs.readdirSync(DB_DIR)
    .filter((f) => /^gymbro-.*\.db$/.test(f))
    .map((name) => {
      const st = fs.statSync(path.join(DB_DIR, name));
      return { name, size: st.size, created_at: st.mtimeMs };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

/**
 * Copia coerente del database (anche con l'app in uso) più le foto.
 * Le foto non cambiano mai una volta salvate, quindi si copiano solo quelle nuove.
 */
export async function runBackup(): Promise<{ name: string; photos: number }> {
  try {
    fs.mkdirSync(DB_DIR, { recursive: true });
    fs.mkdirSync(PHOTO_COPY, { recursive: true });
    const name = `gymbro-${stamp()}.db`;
    await sqliteBackup(db, path.join(DB_DIR, name));
    let photos = 0;
    for (const file of fs.readdirSync(PHOTOS_DIR)) {
      const target = path.join(PHOTO_COPY, file);
      if (!fs.existsSync(target)) {
        fs.copyFileSync(path.join(PHOTOS_DIR, file), target);
        photos++;
      }
    }
    const keep = Math.max(1, BACKUP_KEEP);
    for (const old of listBackups().slice(keep)) fs.rmSync(path.join(DB_DIR, old.name));
    lastError = null;
    return { name, photos };
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    throw err;
  }
}

export const backupStatus = () => ({
  enabled: BACKUP_KEEP > 0,
  dir: BACKUP_DIR,
  time: BACKUP_TIME,
  keep: BACKUP_KEEP,
  last_error: lastError,
  list: listBackups(),
});
