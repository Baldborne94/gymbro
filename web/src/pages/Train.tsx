import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { WEEKDAYS } from '../dates';
import { db } from '../db';
import { unlockAudio } from '../timer';
import { startWorkout } from '../workout';

/** Dati per scegliere cosa allenare: sessione in corso, scheda attiva e giorno consigliato. */
export async function trainData() {
  const workouts = (await db.workouts.toArray()).filter((w) => !w.deleted);
  const running = workouts.find((w) => !w.finished_at) ?? null;
  const routine = (await db.routines.where('status').equals('attiva').toArray()).find((r) => !r.deleted) ?? null;
  if (!routine) return { running, routine, days: [], nextId: null as string | null };
  const days = (await db.routine_days.where('routine_id').equals(routine.id).toArray())
    .filter((d) => !d.deleted)
    .sort((a, b) => a.position - b.position);
  const items = (await db.routine_exercises.where('routine_id').equals(routine.id).toArray()).filter((x) => !x.deleted);
  // Il prossimo giorno è quello che segue l'ultimo allenato di questa scheda.
  const last = workouts
    .filter((w) => w.finished_at && w.routine_id === routine.id && days.some((d) => d.id === w.day_id))
    .sort((a, b) => b.started_at - a.started_at)[0];
  const lastIndex = last ? days.findIndex((d) => d.id === last.day_id) : -1;
  const next = days.length ? days[(lastIndex + 1) % days.length] : null;
  return {
    running,
    routine,
    days: days.map((d) => ({ ...d, count: items.filter((x) => x.day_id === d.id).length })),
    nextId: next?.id ?? null,
  };
}

export function Train() {
  const navigate = useNavigate();
  const data = useLiveQuery(trainData, []);

  async function start(dayId: string | null) {
    unlockAudio();
    navigate(`/sessione/${await startWorkout(dayId)}`);
  }

  if (!data) return <Page title="Allena">{null}</Page>;
  const { running, routine, days, nextId } = data;

  return (
    <Page title="Allena">
      {running && (
        <Link to={`/sessione/${running.id}`} className="card card-active" onClick={unlockAudio}>
          <div className="row">
            <span className="badge badge-accent">In corso</span>
            <span className="grow" />
            <Icon name="chev" />
          </div>
          <div className="routine-name">{running.name}</div>
          <p className="muted">Tocca per riprendere la sessione.</p>
        </Link>
      )}

      {!running && routine && (
        <>
          <h2 className="section">{routine.name}</h2>
          <div className="list">
            {days.map((d) => (
              <button key={d.id} className={`list-row${d.id === nextId ? ' row-next' : ''}`} onClick={() => void start(d.id)} disabled={d.count === 0}>
                <div className="tile"><Icon name="bilanciere" size={28} /></div>
                <div className="grow">
                  <div className="ex-name">{d.name}</div>
                  <div className="muted">
                    {d.count} {d.count === 1 ? 'esercizio' : 'esercizi'}{d.weekday ? ` · ${WEEKDAYS[d.weekday - 1]}` : ''}
                  </div>
                  {d.id === nextId && <div className="tags"><span className="badge badge-accent">Prossimo</span></div>}
                </div>
                <Icon name="play" />
              </button>
            ))}
          </div>
        </>
      )}

      {!running && !routine && (
        <div className="empty">
          <div className="empty-icon"><Icon name="schede" size={44} /></div>
          <p>Nessuna scheda attiva: iniziane una dalla sezione Schede, oppure allenati in libertà.</p>
          <Link to="/schede" className="btn">Vai alle schede</Link>
        </div>
      )}

      {!running && (
        <button className="btn" onClick={() => void start(null)}><Icon name="plus" size={20} /> Sessione libera</button>
      )}
      <Link to="/cardio/nuovo" className="btn"><Icon name="run" size={20} /> Registra cardio</Link>
    </Page>
  );
}
