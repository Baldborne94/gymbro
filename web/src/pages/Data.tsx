import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Page, Sheet } from '../components/Layout';
import { syncNow } from '../sync';

interface BackupStatus {
  enabled: boolean;
  dir: string;
  time: string;
  keep: number;
  last_error: string | null;
  list: { name: string; size: number; created_at: number }[];
}

const size = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`);
const when = (ms: number) => new Date(ms).toLocaleString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function Data() {
  const [photos, setPhotos] = useState(true);
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => fetch('/api/backups').then((r) => r.json()).then(setStatus).catch(() => setError('Server non raggiungibile: questa pagina funziona solo online.'));
  useEffect(() => { void load(); }, []);

  async function backupNow() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/backups', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) setError(data.error);
      else setMessage(`Backup creato: ${data.name}${data.photos ? ` (${data.photos} foto nuove)` : ''}.`);
      await load();
    } catch {
      setError('Server non raggiungibile.');
    }
    setBusy(false);
  }

  async function runImport() {
    if (!pending) return;
    const file = pending;
    setPending(null);
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      // Prima si inviano le modifiche locali, così l'importazione non viene sovrascritta.
      await syncNow();
      const res = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: await file.text() });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Importazione non riuscita.');
      else {
        const rows = Object.values(data.rows as Record<string, number>).reduce((a, b) => a + b, 0);
        setMessage(`Importazione completata: ${rows} righe e ${data.photos} foto.`);
        await syncNow();
      }
    } catch {
      setError('Importazione non riuscita: il file non è leggibile o il server non risponde.');
    }
    setBusy(false);
  }

  return (
    <Page title="Dati e backup" back="/altro">
      <div className="card">
        <h2>Esporta</h2>
        <label className="switch switch-flat">
          <input type="checkbox" checked={photos} onChange={(e) => setPhotos(e.target.checked)} />
          <span className="grow"><span className="strong">Includi le foto</span><span className="muted">Il file diventa più grande</span></span>
        </label>
        <a className="btn btn-primary" href={`/api/export/gymbro.json${photos ? '?photos=1' : ''}`} download><Icon name="dati" size={22} /> Tutto in JSON</a>
        <div className="actions">
          <a className="btn" href="/api/export/sessioni.csv" download>Sessioni in CSV</a>
          <a className="btn" href="/api/export/cardio.csv" download>Cardio in CSV</a>
        </div>
        <p className="muted">Il JSON contiene tutto e si può reimportare. I CSV si aprono con un foglio di calcolo: una riga per ogni serie.</p>
      </div>

      <div className="card">
        <h2>Importa</h2>
        <p className="muted">Carica un JSON esportato da GymBro. I dati del file si aggiungono a quelli presenti; a parità di elemento vale quello del file.</p>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { setPending(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>Scegli il file JSON</button>
      </div>

      <div className="card">
        <h2>Backup automatico</h2>
        {status ? (
          <>
            <p className="muted">
              {status.enabled
                ? `Ogni giorno alle ${status.time}, conservando le ultime ${status.keep} copie del database.`
                : 'Disattivato (BACKUP_KEEP=0): puoi comunque farne uno a mano.'}
              {' '}Cartella sul server: <b>{status.dir}</b>
            </p>
            {status.last_error && <p className="error">Ultimo errore: {status.last_error}</p>}
            <button className="btn" onClick={() => void backupNow()} disabled={busy}><Icon name="archive" size={20} /> Esegui ora</button>
            {status.list.length > 0 ? (
              <table className="table table-small">
                <thead><tr><th>Copia</th><th>Dimensione</th></tr></thead>
                <tbody>{status.list.map((b) => <tr key={b.name}><td>{when(b.created_at)}</td><td>{size(b.size)}</td></tr>)}</tbody>
              </table>
            ) : <p className="muted">Ancora nessuna copia.</p>}
          </>
        ) : !error && <p className="muted">Caricamento…</p>}
        <p className="muted">Orario, numero di copie e cartella si cambiano dalle variabili d'ambiente (vedi README).</p>
      </div>

      {message && <p className="alert" role="status"><Icon name="check" size={20} /> {message}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {pending && (
        <Sheet title="Importare questo file?" onClose={() => setPending(null)}>
          <p className="muted">«{pending.name}» ({size(pending.size)}). L'operazione non si può annullare: se hai dubbi, fai prima un backup.</p>
          <button className="btn btn-primary" onClick={() => void runImport()}>Importa</button>
          <button className="btn btn-ghost" onClick={() => setPending(null)}>Annulla</button>
        </Sheet>
      )}
    </Page>
  );
}
