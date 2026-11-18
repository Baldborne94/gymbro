import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CARDIO, type CardioActivity, type CardioSession } from '../../../shared/schema';
import { Icon } from '../components/Icon';
import { Page, Sheet } from '../components/Layout';
import { Stepper } from '../components/Stepper';
import { WEEKDAYS, isoDate, num, parseDate } from '../dates';
import { db, remove, save, uuid } from '../db';

export const cardioLabel = (id: string) => CARDIO.find((c) => c.id === id)?.label ?? 'Cardio';
export const cardioIcon = (id: string) => CARDIO.find((c) => c.id === id)?.icon ?? 'heart';

/** "32 min · 5,2 km · 6:09 /km" */
export function cardioSummary(c: Pick<CardioSession, 'duration_sec' | 'distance_km' | 'activity'>): string {
  const parts = [`${Math.round(c.duration_sec / 60)} min`];
  if (c.distance_km) {
    parts.push(`${num(c.distance_km)} km`);
    if (c.duration_sec > 0) {
      if (c.activity === 'corsa' || c.activity === 'tapis_roulant' || c.activity === 'camminata') {
        const pace = c.duration_sec / c.distance_km;
        parts.push(`${Math.floor(pace / 60)}:${String(Math.round(pace % 60)).padStart(2, '0')} /km`);
      } else {
        parts.push(`${num(Math.round((c.distance_km / (c.duration_sec / 3600)) * 10) / 10)} km/h`);
      }
    }
  }
  return parts.join(' · ');
}

export function CardioRow({ c }: { c: CardioSession }) {
  const d = parseDate(c.date);
  return (
    <Link to={`/cardio/${c.id}`} className="list-row">
      <div className="tile date-tile date-cardio">
        <b>{d.getDate()}</b>
        <span>{WEEKDAYS[(d.getDay() + 6) % 7]}</span>
      </div>
      <div className="grow">
        <div className="ex-name"><Icon name={cardioIcon(c.activity)} size={20} /> {cardioLabel(c.activity)}</div>
        <div className="muted">{cardioSummary(c)}</div>
      </div>
      <Icon name="chev" />
    </Link>
  );
}

export function CardioForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activity, setActivity] = useState<CardioActivity>('corsa');
  const [date, setDate] = useState(isoDate());
  const [minutes, setMinutes] = useState<number | null>(30);
  const [distance, setDistance] = useState('');
  const [notes, setNotes] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [ready, setReady] = useState(!id);

  useEffect(() => {
    if (!id) return;
    db.cardio_sessions.get(id).then((c) => {
      if (!c || c.deleted) return navigate('/andamento', { replace: true });
      setActivity(c.activity);
      setDate(c.date);
      setMinutes(Math.round(c.duration_sec / 60));
      setDistance(c.distance_km ? String(c.distance_km).replace('.', ',') : '');
      setNotes(c.notes ?? '');
      setStartedAt(c.started_at);
      setReady(true);
    });
  }, [id, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const km = distance.trim() ? Number(distance.replace(',', '.')) : null;
    if (!minutes || minutes <= 0) return setError('Indica la durata in minuti.');
    if (km !== null && !(km > 0)) return setError('La distanza deve essere un numero maggiore di zero.');
    // L'orario serve solo a ordinare: per le date passate si usa mezzogiorno.
    const when = date === isoDate() ? Date.now() : parseDate(date).getTime() + 12 * 3600_000;
    await save('cardio_sessions', {
      id: id ?? uuid(), date, started_at: startedAt && id ? startedAt : when, activity,
      duration_sec: Math.round(minutes * 60), distance_km: km, notes: notes.trim(),
    });
    if (id) navigate(-1);
    else navigate('/andamento', { replace: true });
  }

  if (!ready) return <Page title="Cardio" back>{null}</Page>;
  return (
    <Page title={id ? 'Modifica cardio' : 'Cardio'} back>
      <form className="stack" onSubmit={submit}>
        <fieldset className="field">
          <legend>Attività</legend>
          <div className="grid-3">
            {CARDIO.map((c) => (
              <button type="button" key={c.id} aria-pressed={activity === c.id} className={`pick${activity === c.id ? ' on' : ''}`} onClick={() => setActivity(c.id)}>
                <Icon name={c.icon} size={28} />
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="card">
          <label className="inline-field">
            <span>Data</span>
            <input type="date" value={date} max={isoDate()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
          <Stepper label="Durata" unit="minuti" value={minutes} min={1} max={600} step={5} onChange={setMinutes} />
        </div>
        <label className="field">
          <span>Distanza in km (facoltativa)</span>
          <input inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="Es. 5,2" />
        </label>
        <label className="field">
          <span>Note</span>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ritmo, pendenza, sensazioni…" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-sticky"><Icon name="check" size={24} /> Salva</button>
        {id && <button type="button" className="btn btn-ghost btn-danger" onClick={() => setConfirm(true)}><Icon name="trash" size={20} /> Elimina</button>}
      </form>
      {confirm && id && (
        <Sheet title="Eliminare l'attività?" onClose={() => setConfirm(false)}>
          <button className="btn btn-danger-fill" onClick={async () => { await remove('cardio_sessions', id); navigate('/andamento', { replace: true }); }}>Elimina</button>
          <button className="btn btn-ghost" onClick={() => setConfirm(false)}>Annulla</button>
        </Sheet>
      )}
    </Page>
  );
}
