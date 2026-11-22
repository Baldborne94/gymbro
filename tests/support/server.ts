import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export interface TestServer {
  url: string;
  dataDir: string;
  backupDir: string;
  stop: () => Promise<void>;
  /** Client con cookie di sessione, come un browser. */
  client: () => Client;
}

const freePort = () =>
  new Promise<number>((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });

/** Avvia il server vero (sorgenti TypeScript) su una porta libera e una cartella dati vuota. */
export async function startServer(env: Record<string, string> = {}): Promise<TestServer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gymbro-api-'));
  const dataDir = path.join(dir, 'data');
  const backupDir = path.join(dir, 'backups');
  const port = await freePort();
  const child: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      BACKUP_DIR: backupDir,
      BACKUP_KEEP: '0',
      GYMBRO_PASSWORD: 'segreta',
      ANTHROPIC_API_KEY: '',
      NODE_NO_WARNINGS: '1',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', (d) => { output += d; });
  child.stderr?.on('data', (d) => { output += d; });

  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) break;
    } catch { /* non ancora pronto */ }
    if (child.exitCode !== null || i > 150) throw new Error(`Il server non è partito:\n${output}`);
    await new Promise((r) => setTimeout(r, 100));
  }

  return {
    url,
    dataDir,
    backupDir,
    stop: () =>
      new Promise<void>((resolve) => {
        child.once('exit', () => { fs.rmSync(dir, { recursive: true, force: true }); resolve(); });
        child.kill('SIGTERM');
      }),
    client: () => new Client(url),
  };
}

export class Client {
  cookie = '';
  constructor(readonly url: string) {}

  async request(method: string, pathname: string, body?: unknown, headers: Record<string, string> = {}) {
    const isBuffer = body instanceof Uint8Array;
    const res = await fetch(this.url + pathname, {
      method,
      headers: {
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(body !== undefined && !isBuffer ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isBuffer ? (body as BodyInit) : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    return res;
  }
  get = (p: string) => this.request('GET', p);
  post = (p: string, body?: unknown, headers?: Record<string, string>) => this.request('POST', p, body ?? {}, headers);
  async json<T = any>(method: string, p: string, body?: unknown): Promise<T> {
    return (await this.request(method, p, body)).json() as Promise<T>;
  }
  async login(password = 'segreta') {
    const res = await this.post('/api/login', { password });
    if (!res.ok) throw new Error(`Accesso non riuscito: ${res.status}`);
    return this;
  }
}
