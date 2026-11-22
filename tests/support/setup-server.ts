import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Ogni file di test lavora su una cartella dati nuova e vuota.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gymbro-test-'));
process.env.DATA_DIR = path.join(dir, 'data');
process.env.BACKUP_DIR = path.join(dir, 'backups');
process.env.GYMBRO_PASSWORD = 'test';
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
