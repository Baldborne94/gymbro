import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

describe('riconoscimento del ripristino', () => {
  it('un normale riavvio non cambia l’epoca, un database tornato indietro sì', async () => {
    const first = await import('../../../server/db');
    const epoch = first.getMeta('epoch');
    first.noteRev();

    vi.resetModules();
    const restarted = await import('../../../server/db');
    expect(restarted.getMeta('epoch')).toBe(epoch);

    // Simula il ripristino: accanto ai dati risulta una revisione più alta di quella del database.
    fs.writeFileSync(path.join(process.env.DATA_DIR!, '.rev'), String(restarted.currentRev() + 500));
    vi.resetModules();
    const restored = await import('../../../server/db');
    expect(restored.getMeta('epoch')).not.toBe(epoch);
  });
});
