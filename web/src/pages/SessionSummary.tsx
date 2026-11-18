import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { EditableText } from '../components/EditableText';
import { Icon } from '../components/Icon';
import { MuscleIcon } from '../components/MuscleIcon';
import { formatDate, num } from '../dates';
import { db, patch } from '../db';
import { RECORD_LABEL, findRecords, recordValue, type RecordKind } from '../stats';
import { formatDuration, formatSet, setVolume } from '../workout';

/** Dati completi di una sessione conclusa, con i totali. */
export async function workoutDetail(id: string) {
  const workout = (await db.workouts.get(id)) ?? null;
  const wes = (await db.workout_exercises.where('workout_id').equals(id).toArray())
    .filter((x) => !x.deleted)
    .sort((a, b) => a.position - b.position);
  const sets = (await db.sets.where('workout_id').equals(id).toArray())
    .filter((x) => !x.deleted && x.done)
    .sort((a, b) => a.position - b.position);
  const exercises = new Map((await db.exercises.bulkGet(wes.map((w) => w.exercise_id))).filter(Boolean).map((e) => [e!.id, e!]));
  const volume = sets.reduce((sum, s) => sum + setVolume(s, exercises.get(s.exercise_id)), 0);
  // Record personali ottenuti in questa sessione.
  const records = new Map<string, RecordKind>();
  for (const exerciseId of new Set(sets.map((s) => s.exercise_id))) {
    const history = (await db.sets.where('exercise_id').equals(exerciseId).toArray()).filter((s) => !s.deleted && s.done);
    for (const [setId, kind] of findRecords(history, exercises.get(exerciseId))) {
      if (sets.some((s) => s.id === setId)) records.set(setId, kind);
    }
  }
  return { workout, wes, sets, exercises, volume, records };
}

export function SessionSummary() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const data = useLiveQuery(() => workoutDetail(id), [id]);
  if (!data) return <div className="session" />;
  const { workout, wes, sets, exercises, volume, records } = data;
  if (!workout || workout.deleted) {
    return <div className="session"><div className="empty"><p>Sessione non trovata.</p><button className="btn" onClick={() => navigate('/')}>Torna a Oggi</button></div></div>;
  }
  const done = wes.filter((w) => sets.some((s) => s.workout_exercise_id === w.id));

  return (
    <div className="session summary">
      <div className="summary-hero">
        <div className="summary-disc" aria-hidden="true">
          <span /><span /><span />
          <Icon name="check" size={56} />
        </div>
        <h1>Allenamento completato</h1>
        <p className="muted">{workout.name} · {formatDate(workout.date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      <dl className="facts">
        <div><dt>Durata</dt><dd>{formatDuration((workout.finished_at ?? Date.now()) - workout.started_at)}</dd></div>
        <div><dt>Volume</dt><dd>{num(Math.round(volume))} kg</dd></div>
        <div><dt>Serie</dt><dd>{sets.length}</dd></div>
        <div><dt>Esercizi</dt><dd>{done.length}</dd></div>
      </dl>

      {records.size > 0 && (
        <div className="record-box">
          <h2><Icon name="trophy" size={22} /> {records.size === 1 ? 'Nuovo record' : `${records.size} nuovi record`}</h2>
          {sets.filter((s) => records.has(s.id)).map((s) => (
            <div key={s.id} className="record-line">
              <span className="strong">{exercises.get(s.exercise_id)?.name}</span>
              <span>{recordValue(s, records.get(s.id)!, exercises.get(s.exercise_id))} · {RECORD_LABEL[records.get(s.id)!].toLowerCase()}</span>
            </div>
          ))}
        </div>
      )}

      <div className="list">
        {done.map((w) => {
          const ex = exercises.get(w.exercise_id);
          return (
            <div key={w.id} className="list-row">
              <div className="tile">{ex ? <MuscleIcon muscle={ex.muscle} size={36} /> : <Icon name="disco" />}</div>
              <div className="grow">
                <div className="ex-name">{ex?.name ?? 'Esercizio'}</div>
                <div className="summary-sets">
                  {sets.filter((s) => s.workout_exercise_id === w.id).map((s) => formatSet(s, ex)).join(' · ')}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <label className="field">
        <span>Note</span>
        <EditableText multiline label="Note della sessione" placeholder="Come è andata?" value={workout.notes ?? ''} onSave={(notes) => void patch('workouts', id, { notes })} />
      </label>

      <button className="btn btn-primary btn-confirm" onClick={() => navigate('/', { replace: true })}>Chiudi</button>
    </div>
  );
}
