import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../auth';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { Stepper } from '../components/Stepper';
import { clock } from '../dates';
import { db, save, uuid } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';

interface ProposedRoutine {
  name: string;
  weeks: number;
  notes: string;
  days: { name: string; exercises: { exercise_id: string; sets: number; reps_min: number; reps_max: number; rest_sec: number; load: number | null; superset_next: boolean; notes: string }[] }[];
}

type Mode = 'progressione' | 'stalli' | 'scheda';
const GOALS = ['Ipertrofia', 'Forza', 'Dimagrimento', 'Forma generale'];

/** Testo del coach: titoli "## ", elenchi "- " e **grassetto**. */
function CoachText({ text }: { text: string }) {
  const bold = (line: string) => line.split(/(\*\*[^*]+\*\*)/).map((part, i) => (part.startsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : part));
  return (
    <div className="coach-text">
      {text.split('\n').map((raw, i) => {
        const line = raw.trim();
        if (!line) return null;
        if (line.startsWith('#')) return <h2 key={i}>{line.replace(/^#+\s*/, '')}</h2>;
        if (/^[-•]\s/.test(line)) return <p key={i} className="coach-item">{bold(line.slice(2))}</p>;
        return <p key={i}>{bold(line)}</p>;
      })}
    </div>
  );
}

export function Coach() {
  const { features } = auth.use();
  const navigate = useNavigate();
  const names = useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e.name])), []);
  const [mode, setMode] = useState<Mode | null>(null);
  const [goal, setGoal] = useState(GOALS[0]);
  const [days, setDays] = useState<number | null>(3);
  const [minutes, setMinutes] = useState<number | null>(60);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [routine, setRoutine] = useState<ProposedRoutine | null>(null);

  if (!features.coach) {
    return (
      <Page title="Coach AI" back="/altro">
        <div className="empty"><p>Il coach è disattivato: per usarlo imposta <b>ANTHROPIC_API_KEY</b> nel file .env e riavvia il container.</p></div>
      </Page>
    );
  }

  async function ask(m: Mode) {
    setMode(m);
    setBusy(true);
    setError(null);
    setText(null);
    setRoutine(null);
    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: m, goal, days, minutes, notes }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Il coach non ha risposto.');
      else if (data.routine) setRoutine(data.routine);
      else setText(data.text ?? '');
    } catch {
      setError('Server non raggiungibile: il coach funziona solo online.');
    }
    setBusy(false);
  }

  async function saveRoutine() {
    if (!routine) return;
    const id = uuid();
    await save('routines', { id, name: routine.name, notes: routine.notes ?? '', status: 'bozza', start_date: null, weeks: routine.weeks || 8, end_date: null });
    for (const [i, day] of routine.days.entries()) {
      const dayId = uuid();
      await save('routine_days', { id: dayId, routine_id: id, name: day.name, position: i, weekday: null });
      for (const [j, ex] of day.exercises.entries()) {
        await save('routine_exercises', {
          id: uuid(), routine_id: id, day_id: dayId, exercise_id: ex.exercise_id, position: j,
          sets: Math.max(1, ex.sets), reps_min: Math.max(1, ex.reps_min), reps_max: Math.max(ex.reps_min, ex.reps_max),
          load: ex.load, rest_sec: Math.max(0, ex.rest_sec), superset_next: ex.superset_next, notes: ex.notes ?? '',
        });
      }
    }
    navigate(`/schede/${id}`);
  }

  return (
    <Page title="Coach AI" back="/altro">
      <p className="muted">Claude legge il tuo storico e ti risponde. I dati vengono inviati ad Anthropic solo quando premi uno di questi pulsanti.</p>

      <div className="list">
        <button className="list-row" onClick={() => void ask('progressione')} disabled={busy}>
          <div className="tile"><Icon name="up" size={26} /></div>
          <div className="grow"><div className="strong">Progressione dei carichi</div><div className="muted">Cosa puntare nella prossima sessione</div></div>
          <Icon name="chev" />
        </button>
        <button className="list-row" onClick={() => void ask('stalli')} disabled={busy}>
          <div className="tile"><Icon name="alert" size={26} /></div>
          <div className="grow"><div className="strong">Esercizi fermi</div><div className="muted">Dove non stai progredendo, e perché</div></div>
          <Icon name="chev" />
        </button>
      </div>

      <div className="card">
        <h2>Nuova scheda</h2>
        <div className="chips chips-wrap" role="group" aria-label="Obiettivo">
          {GOALS.map((g) => <button key={g} className={`chip${goal === g ? ' on' : ''}`} aria-pressed={goal === g} onClick={() => setGoal(g)}>{g}</button>)}
        </div>
        <Stepper label="Giorni a settimana" value={days} min={1} max={7} onChange={setDays} />
        <Stepper label="Durata" unit="minuti" value={minutes} min={20} max={180} step={5} onChange={setMinutes} />
        <textarea className="sheet-input" rows={2} aria-label="Indicazioni" placeholder="Attrezzi disponibili, esercizi da evitare, priorità…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button className="btn btn-primary" onClick={() => void ask('scheda')} disabled={busy}><Icon name="coach" size={22} /> Genera scheda</button>
      </div>

      {busy && (
        <div className="card center coach-wait" role="status">
          <div className="spinner" aria-hidden="true" />
          <div className="strong">Il coach sta {mode === 'scheda' ? 'preparando la scheda' : 'studiando il tuo storico'}…</div>
          <div className="muted">Può volerci fino a un minuto.</div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {text !== null && <div className="card"><CoachText text={text || 'Nessuna risposta.'} /></div>}

      {routine && (
        <div className="card">
          <h2>{routine.name}</h2>
          <p className="muted">{routine.weeks} settimane · {routine.days.length} giorni</p>
          {routine.notes && <p>{routine.notes}</p>}
          {routine.days.map((d, i) => (
            <div key={i} className="coach-day">
              <div className="strong">{d.name}</div>
              {d.exercises.map((e, j) => (
                <div key={j} className="coach-ex">
                  <span>{names?.get(e.exercise_id) ?? e.exercise_id}{e.superset_next ? ' (superset)' : ''}</span>
                  <span className="summary">{e.sets} × {e.reps_min === e.reps_max ? e.reps_min : `${e.reps_min}–${e.reps_max}`}{e.load ? ` · ${String(e.load).replace('.', ',')} kg` : ''} · rec. {clock(e.rest_sec)}</span>
                </div>
              ))}
            </div>
          ))}
          <button className="btn btn-primary" onClick={() => void saveRoutine()}><Icon name="check" size={22} /> Salva come bozza</button>
          <p className="muted">La trovi tra le bozze in Schede: puoi modificarla prima di iniziarla.</p>
        </div>
      )}
    </Page>
  );
}
