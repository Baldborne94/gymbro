// Avvia l'app compilata (dist/) su dati nuovi, con il finto servizio Anthropic per il coach.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { startFakeAnthropic } from '../support/fake-anthropic.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const dir = path.join(root, '.e2e');
if (!fs.existsSync(path.join(root, 'dist/server.js'))) {
  console.error('Manca dist/: esegui prima "npm run build" (lo fa già "npm run test:e2e").');
  process.exit(1);
}
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const anthropic = await startFakeAnthropic();
const server = spawn(process.execPath, ['dist/server.js'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: process.env.E2E_PORT ?? '4321',
    DATA_DIR: path.join(dir, 'data'),
    BACKUP_DIR: path.join(dir, 'backups'),
    BACKUP_KEEP: '3',
    BACKUP_TIME: '23:59',
    GYMBRO_PASSWORD: 'e2e-password',
    ANTHROPIC_API_KEY: 'sk-ant-e2e',
    ANTHROPIC_BASE_URL: anthropic.url,
    TZ: 'Europe/Rome',
    NODE_NO_WARNINGS: '1',
  },
});
const stop = () => { server.kill('SIGTERM'); anthropic.close(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
server.on('exit', (code) => process.exit(code ?? 0));
