import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { WEEKDAYS, addDays, formatDate, isoDate, weekStart } from '../dates';
import { useSetting } from '../settings';
import { RECORD_LABEL, activityDates, allRecords, loadOverview, recordValue, weekStreak } from '../stats';
import { unlockAudio } from '../timer';
import { startWorkout } from '../workout';
import { CardioRow } from './Cardio';
import { WorkoutRow } from './Andamento';
import { CycleBar } from './Routines';
import { trainData } from './Train';

export function Home() {
  const navigate = useNavigate();
  const train = useLiveQuery(trainData, []);
  const data = useLiveQuery(loadOverview, []);
  const goal = useSetting('weekly_goal', 3);
  const today = isoDate();

  const week = useMemo(() => {
    if (!data) return null;
    const start = weekStart(today);
    const lifts = new Set(data.workouts.map((w) => w.workout.date));
    const cardio = new Set(data.cardio.map((c) => c.date));
    const dates = activityDates(data);
    return {
      days: Array.from({ length: 7 }, (_, i) => {
        const d = addDays(start, i);
        return { d, kind: lifts.has(d) ? 'trained' : cardio.has(d) ? 'cardio' : '' };
      }),
      count: dates.filter((d) => d >= start && d < addDays(start, 7)).length,
      streak: weekStreak(dates, goal, today),
    };
  }, [data, goal, today]);

  const records = useMemo(() => (data ? allRecords(data).slice(0, 3) : []), [data]);
  const lastWorkout = data?.workouts[0];
  const lastCardio = data?.cardio[0];
  const cardioIsLast = lastCardio && (!lastWorkout || lastCardio.started_at > lastWorkout.workout.started_at);

  async function start(dayId: string) {
    unlockAudio();
    navigate(`/sessione/${await startWorkout(dayId)}`);
  }

  const next = train?.days.find((d) => d.id === train.nextId);

  return (
    <div className="page">
      <header className="home-head"><Logo size={40} /></header>

      {train?.running && (
        <Link to={`/sessione/${train.running.id}`} className="card card-active" onClick={unlockAudio}>
          <div className="row">
            <span className="badge badge-accent">Sessione in corso</span>
            <span className="grow" />
            <Icon name="chev" />
          </div>
          <div className="routine-name">{train.running.name}</div>
          <p className="muted">Tocca per riprendere.</p>
        </Link>
      )}

      {train && !train.running && train.routine && next && (
        <div className="card card-active">
          <div className="row">
            <span className="badge badge-accent">Prossimo allenamento</span>
            <span className="muted grow">{next.weekday ? WEEKDAYS[next.weekday - 1] : ''}</span>
          </div>
          <div className="routine-name">{next.name}</div>
          <p className="muted">{train.routine.name} · {next.count} {next.count === 1 ? 'esercizio' : 'esercizi'}</p>
          <button className="btn btn-primary" onClick={() => void start(next.id)} disabled={next.count === 0}>
            <Icon name="play" size={22} /> Inizia
          </button>
        </div>
      )}

      {train && !train.running && !train.routine && (
        <div className="card">
          <h2>Nessuna scheda attiva</h2>
          <p className="muted">Crea una scheda e iniziala per vedere qui il prossimo allenamento.</p>
          <div className="actions">
            <Link to="/schede" className="btn">Vai alle schede</Link>
            <Link to="/allena" className="btn">Sessione libera</Link>
          </div>
        </div>
      )}

      {week && (
        <Link to="/andamento?v=calendario" className="card">
          <div className="row">
            <h2 className="grow">Questa settimana</h2>
            <Icon name="chev" />
          </div>
          <div className="week-stats">
            <div><b className={week.count >= goal ? 'hit' : ''}>{week.count}</b><span>di {goal} sessioni</span></div>
            <div><b className={week.streak > 0 ? 'hit' : ''}>{week.streak}</b><span>{week.streak === 1 ? 'settimana di fila' : 'settimane di fila'}</span></div>
          </div>
          <div className="week-dots" role="img" aria-label={`${week.count} sessioni questa settimana`}>
            {week.days.map(({ d, kind }, i) => (
              <div key={d} className="week-dot">
                <i className={`cal-day ${kind}${d === today ? ' today' : ''}`} />
                <span>{WEEKDAYS[i]}</span>
              </div>
            ))}
          </div>
        </Link>
      )}

      {train?.routine && (
        <Link to={`/schede/${train.routine.id}`} className="card">
          <div className="row">
            <h2 className="grow">{train.routine.name}</h2>
            <Icon name="chev" />
          </div>
          <CycleBar routine={train.routine} />
        </Link>
      )}

      {(lastWorkout || lastCardio) && (
        <section className="stack-s">
          <h2 className="section">Ultima sessione</h2>
          <div className="list">
            {cardioIsLast ? <CardioRow c={lastCardio!} /> : <WorkoutRow w={lastWorkout!} />}
          </div>
        </section>
      )}

      {records.length > 0 && (
        <section className="stack-s">
          <h2 className="section">Ultimi record</h2>
          <div className="list">
            {records.map((r) => (
              <Link key={r.set.id} to={`/andamento/esercizio/${r.exercise.id}`} className="list-row">
                <div className="tile tile-record"><Icon name="trophy" size={28} /></div>
                <div className="grow">
                  <div className="ex-name">{r.exercise.name}</div>
                  <div className="summary">{recordValue(r.set, r.kind, r.exercise)}</div>
                  <div className="muted">{RECORD_LABEL[r.kind]} · {r.date ? formatDate(r.date) : ''}</div>
                </div>
                <Icon name="chev" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {data && !lastWorkout && !lastCardio && (
        <p className="muted">Dopo il primo allenamento vedrai qui l'ultima sessione, la settimana e i record.</p>
      )}
    </div>
  );
}
