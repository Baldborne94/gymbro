import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => { process.env.BACKUP_KEEP = '2'; });

import { BACKUP_DIR, backupStatus, listBackups, runBackup } from '../../../server/backup';
import { PHOTOS_DIR, sync } from '../../../server/db';
import { exercise } from '../../support/factories';

describe('backup', () => {
  it('crea una copia del database leggibile e completa', async () => {
    sync(0, { exercises: [{ ...exercise({ id: 'nel-backup', name: 'Nel backup' }), updated_at: 1 }] } as never);
    const { name } = await runBackup();
    expect(name).toMatch(/^gymbro-\d{4}-\d{2}-\d{2}_\d{6}\.db$/);
    const copy = new DatabaseSync(path.join(BACKUP_DIR, 'db', name), { readOnly: true });
    expect(copy.prepare('SELECT name FROM exercises WHERE id = ?').get('nel-backup')).toEqual({ name: 'Nel backup' });
    copy.close();
  });

  it('copia solo le foto nuove', async () => {
    fs.writeFileSync(path.join(PHOTOS_DIR, 'a.jpg'), 'a');
    expect((await runBackup()).photos).toBe(1);
    expect((await runBackup()).photos).toBe(0);
    fs.writeFileSync(path.join(PHOTOS_DIR, 'b.jpg'), 'b');
    expect((await runBackup()).photos).toBe(1);
    expect(fs.readdirSync(path.join(BACKUP_DIR, 'photos')).sort()).toEqual(['a.jpg', 'b.jpg']);
  });

  it('conserva solo il numero di copie configurato, tenendo le più recenti', async () => {
    const last = (await runBackup()).name;
    const list = listBackups();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe(last);
    expect(backupStatus()).toMatchObject({ enabled: true, keep: 2, last_error: null });
  });

  it('due backup nello stesso secondo non si sovrascrivono', async () => {
    const a = await runBackup();
    const b = await runBackup();
    expect(a.name).not.toBe(b.name);
    expect(listBackups()[0].name).toBe(b.name);
  });
});
