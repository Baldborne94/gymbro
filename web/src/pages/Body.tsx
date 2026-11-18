import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BODY_FIELDS, POSES, type BodyField, type BodyMeasurement, type Pose } from '../../../shared/schema';
import { Icon } from '../components/Icon';
import { Page, Sheet } from '../components/Layout';
import { LineChart } from '../components/LineChart';
import { Photo, shrinkImage } from '../components/Photo';
import { formatDate, isoDate, num } from '../dates';
import { db, remove, save, saveBlob, uuid } from '../db';

const alive = <T extends { deleted: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted);

function PhotoSection() {
  const photos = useLiveQuery(async () => alive(await db.progress_photos.toArray()).sort((a, b) => a.date.localeCompare(b.date)), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pose, setPose] = useState<Pose>('fronte');
  const [date, setDate] = useState(isoDate());
  const [adding, setAdding] = useState(false);
  const [before, setBefore] = useState<string | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = (photos ?? []).filter((p) => p.pose === pose);
  const first = list.find((p) => p.id === before) ?? list[0];
  const last = list.find((p) => p.id === after) ?? list[list.length - 1];
  const shown = (photos ?? []).find((p) => p.id === viewing);

  async function add(file: File | undefined) {
    if (!file) return;
    try {
      const photoId = await saveBlob(await shrinkImage(file));
      await save('progress_photos', { id: uuid(), date, photo_id: photoId, pose, notes: '' });
      setAdding(false);
      setError(null);
    } catch {
      setError('Non riesco a leggere questa immagine.');
    }
  }

  return (
    <section className="stack-s">
      <h2 className="section">Foto di avanzamento</h2>
      <div className="segmented">
        {POSES.map((p) => <button key={p.id} className={pose === p.id ? 'on' : ''} aria-pressed={pose === p.id} onClick={() => { setPose(p.id); setBefore(null); setAfter(null); }}>{p.label}</button>)}
      </div>

      {list.length >= 2 && first && last && (
        <div className="card">
          <h2>Prima e dopo</h2>
          <div className="compare">
            {[{ p: first, set: setBefore, label: 'Prima' }, { p: last, set: setAfter, label: 'Dopo' }].map(({ p, set, label }) => (
              <div key={label} className="compare-side">
                <Photo id={p.photo_id} alt={`${label}: ${formatDate(p.date)}`} className="compare-img" />
                <label className="compare-pick">
                  <span>{label}</span>
                  <select value={p.id} onChange={(e) => set(e.target.value)} aria-label={`Foto per "${label}"`}>
                    {list.map((x) => <option key={x.id} value={x.id}>{formatDate(x.date)}</option>)}
                  </select>
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {list.length > 0 ? (
        <div className="photo-grid">
          {[...list].reverse().map((p) => (
            <button key={p.id} className="photo-thumb" onClick={() => setViewing(p.id)} aria-label={`Foto del ${formatDate(p.date)}`}>
              <Photo id={p.photo_id} alt="" />
              <span>{formatDate(p.date, { day: 'numeric', month: 'short', year: '2-digit' })}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">Nessuna foto in questa posa. Con almeno due foto compare il confronto prima e dopo.</p>
      )}
      <button className="btn" onClick={() => { setDate(isoDate()); setAdding(true); }}><Icon name="camera" size={20} /> Aggiungi foto</button>
      <p className="muted">Le foto restano sul tuo server, nella cartella dei dati.</p>

      {adding && (
        <Sheet title="Nuova foto" onClose={() => setAdding(false)}>
          <div className="segmented">
            {POSES.map((p) => <button key={p.id} className={pose === p.id ? 'on' : ''} aria-pressed={pose === p.id} onClick={() => setPose(p.id)}>{p.label}</button>)}
          </div>
          <label className="inline-field">
            <span>Data</span>
            <input type="date" value={date} max={isoDate()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void add(e.target.files?.[0])} />
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()}><Icon name="camera" size={22} /> Scegli o scatta</button>
          <button className="btn btn-ghost" onClick={() => setAdding(false)}>Annulla</button>
        </Sheet>
      )}
      {shown && (
        <Sheet title={`${POSES.find((p) => p.id === shown.pose)?.label} · ${formatDate(shown.date)}`} onClose={() => setViewing(null)}>
          <Photo id={shown.photo_id} alt={`Foto del ${formatDate(shown.date)}`} className="photo photo-full" />
          <button className="btn btn-ghost btn-danger" onClick={() => { void remove('progress_photos', shown.id); setViewing(null); }}><Icon name="trash" size={20} /> Elimina foto</button>
          <button className="btn" onClick={() => setViewing(null)}>Chiudi</button>
        </Sheet>
      )}
    </section>
  );
}

/** Vista "Corpo" dentro Andamento: peso, misure, grafici e foto. */
export function BodyView() {
  const rows = useLiveQuery(async () => alive(await db.body_measurements.toArray()).sort((a, b) => a.date.localeCompare(b.date)), []);
  const [field, setField] = useState<BodyField>('weight');
  if (!rows) return null;

  const def = BODY_FIELDS.find((f) => f.id === field)!;
  const points = rows.filter((r) => r[field] !== null && r[field] !== undefined).map((r) => ({ date: r.date, value: r[field] as number }));
  const weights = rows.filter((r) => r.weight !== null);
  const latest = weights[weights.length - 1];
  const prev = weights[weights.length - 2];
  const delta = latest && prev ? Math.round(((latest.weight as number) - (prev.weight as number)) * 10) / 10 : null;
  const available = BODY_FIELDS.filter((f) => rows.some((r) => r[f.id] !== null && r[f.id] !== undefined));

  return (
    <>
      <div className="card card-link body-head">
        <div className="tile"><Icon name="scale" size={28} /></div>
        <div className="grow">
          <div className="big-number">{latest ? num(latest.weight as number) : '—'} <small>kg</small></div>
          <div className="muted">
            {latest ? `Peso del ${formatDate(latest.date)}` : 'Nessun peso registrato'}
            {delta !== null && ` · ${delta > 0 ? '+' : delta < 0 ? '−' : ''}${num(Math.abs(delta))} kg dalla volta prima`}
          </div>
        </div>
        <Link to="/corpo/misura/nuova" className="btn btn-primary btn-small"><Icon name="plus" size={20} /> Misura</Link>
      </div>

      {rows.length > 0 && (
        <>
          <div className="chips" role="group" aria-label="Misura da mostrare">
            {available.map((f) => <button key={f.id} className={`chip${field === f.id ? ' on' : ''}`} aria-pressed={field === f.id} onClick={() => setField(f.id)}>{f.label}</button>)}
          </div>
          <div className="card"><LineChart points={points} unit={def.unit} label={def.label} /></div>

          <h2 className="section">Misurazioni</h2>
          <div className="list">
            {[...rows].reverse().slice(0, 30).map((r) => (
              <Link key={r.id} to={`/corpo/misura/${r.id}`} className="list-row">
                <div className="grow">
                  <div className="strong">{formatDate(r.date)}</div>
                  <div className="summary-sets">
                    {BODY_FIELDS.filter((f) => r[f.id] !== null && r[f.id] !== undefined).map((f) => `${f.label} ${num(r[f.id] as number)} ${f.unit}`).join(' · ') || 'Nessun valore'}
                  </div>
                </div>
                <Icon name="chev" />
              </Link>
            ))}
          </div>
        </>
      )}
      <PhotoSection />
    </>
  );
}

const toText = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v).replace('.', ','));

export function MeasurementForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [date, setDate] = useState(isoDate());
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      if (id) {
        const row = await db.body_measurements.get(id);
        if (!row || row.deleted) return navigate('/andamento?v=corpo', { replace: true });
        setDate(row.date);
        setNotes(row.notes ?? '');
        setValues(Object.fromEntries(BODY_FIELDS.map((f) => [f.id, toText(row[f.id])])));
      }
      setReady(true);
    })();
  }, [id, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed: Record<string, number | null> = {};
    for (const f of BODY_FIELDS) {
      const raw = (values[f.id] ?? '').trim();
      const n = raw ? Number(raw.replace(',', '.')) : null;
      if (n !== null && !(n > 0)) return setError(`${f.label}: inserisci un numero maggiore di zero.`);
      parsed[f.id] = n;
    }
    if (Object.values(parsed).every((v) => v === null)) return setError('Inserisci almeno un valore.');
    await save('body_measurements', { id: id ?? uuid(), date, notes: notes.trim(), ...parsed } as Omit<BodyMeasurement, 'updated_at' | 'deleted'>);
    navigate('/andamento?v=corpo', { replace: true });
  }

  if (!ready) return <Page title="Misure" back>{null}</Page>;
  return (
    <Page title={id ? 'Modifica misure' : 'Nuova misura'} back="/andamento?v=corpo">
      <form className="stack" onSubmit={submit}>
        <div className="card">
          <label className="inline-field">
            <span>Data</span>
            <input type="date" value={date} max={isoDate()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
        </div>
        <div className="grid-2">
          {BODY_FIELDS.map((f) => (
            <label key={f.id} className="field">
              <span>{f.label} ({f.unit})</span>
              <input inputMode="decimal" value={values[f.id] ?? ''} onChange={(e) => setValues({ ...values, [f.id]: e.target.value })} placeholder="—" />
            </label>
          ))}
        </div>
        <p className="muted">Compila solo quello che hai misurato: il resto può restare vuoto.</p>
        <label className="field">
          <span>Note</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="A digiuno, dopo l'allenamento…" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-sticky"><Icon name="check" size={24} /> Salva</button>
        {id && (
          <button type="button" className="btn btn-ghost btn-danger" onClick={async () => { await remove('body_measurements', id); navigate('/andamento?v=corpo', { replace: true }); }}>
            <Icon name="trash" size={20} /> Elimina misurazione
          </button>
        )}
      </form>
    </Page>
  );
}
