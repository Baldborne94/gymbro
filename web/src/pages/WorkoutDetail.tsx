import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SET_KINDS, type Exercise, type SetKind, type WorkoutSet } from '../../../shared/schema';
import { EditableText } from '../components/EditableText';
import { Icon } from '../components/Icon';
import { Page, Sheet } from '../components/Layout';
import { MuscleIcon } from '../components/MuscleIcon';
import { Stepper } from '../components/Stepper';
import { isoDate, num, parseDate } from '../dates';
import { db, patch, remove, save, uuid, type Local } from '../db';
import { RECORD_LABEL } from '../stats';
import { discardWorkout, formatDuration, formatEffort, formatSet, unitOf } from '../workout';
import { workoutDetail } from './SessionSummary';

function SetSheet({ set, ex, onClose }: { set: Local<WorkoutSet>; ex: Exercise | undefined; onClose: () => void }) {
  const change = (changes: Partial<WorkoutSet>) => void patch('sets', set.id, changes);
  const bodyweight = ex?.kind === 'corpo_libero';
  return (
    <Sheet title="Modifica serie" onClose={onClose}>
      {ex?.kind === 'tempo' ? (
        <Stepper label="Durata" unit="secondi" value={set.seconds} step={5} min={1} onChange={(seconds) => change({ seconds: seconds ?? 1 })} />
      ) : (
        <>
          <Stepper
            label={bodyweight ? 'Zavorra (+) o assistenza (−)' : 'Carico'}
            unit={unitOf(ex)}
            value={set.load}
            step={ex?.step ?? 2.5}
            min={bodyweight ? -300 : 0}
            nullable
            onChange={(load) => change({ load })}
          />
          <Stepper label="Ripetizioni" value={set.reps} min={0} max={200} onChange={(reps) => change({ reps: reps ?? 0 })} />
        </>
      )}
      <div className="segmented">
        {SET_KINDS.map((k) => (
          <button key={k.id} className={set.kind === k.id ? 'on' : ''} aria-pressed={set.kind === k.id} onClick={() => change({ kind: k.id as SetKind })}>
            {k.label}
          </button>
        ))}
      </div>
      <Stepper label="RPE" value={set.rpe} step={0.5} min={5} max={10} nullable onChange={(rpe) => change({ rpe, rir: rpe === null ? set.rir : null })} />
      <button className="btn btn-primary" onClick={onClose}><Icon name="check" size={22} /> Fatto</button>
      <button className="btn btn-ghost btn-danger" onClick={() => { void remove('sets', set.id); onClose(); }}><Icon name="trash" size={20} /> Elimina serie</button>
    </Sheet>
  );
}

export function WorkoutDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const data = useLiveQuery(() => workoutDetail(id), [id]);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  if (!data) return <Page title="" back>{null}</Page>;
  const { workout, wes, sets, exercises, volume, records } = data;
  if (!workout || workout.deleted) return <Page title="Sessione" back><div className="empty"><p>Sessione non trovata.</p></div></Page>;
  const current = sets.find((s) => s.id === editing);

  function changeDate(date: string) {
    if (!date || !workout) return;
    // Si sposta il giorno mantenendo orario e durata.
    const shift = parseDate(date).getTime() - parseDate(workout.date).getTime();
    void patch('workouts', id, {
      date,
      started_at: workout.started_at + shift,
      finished_at: workout.finished_at ? workout.finished_at + shift : null,
    });
  }

  async function addSet(weId: string, exerciseId: string) {
    const own = sets.filter((s) => s.workout_exercise_id === weId);
    const last = own[own.length - 1];
    const setId = uuid();
    await save('sets', {
      id: setId, workout_id: id, workout_exercise_id: weId, exercise_id: exerciseId,
      position: last ? last.position + 1 : 0, kind: 'normale',
      load: last?.load ?? null, reps: last?.reps ?? null, seconds: last?.seconds ?? null,
      rpe: null, rir: null, done: true, done_at: last?.done_at ? last.done_at + 1 : workout!.started_at,
    });
    setEditing(setId);
  }

  return (
    <Page title={<EditableText className="title-input" label="Nome della sessione" value={workout.name} onSave={(name) => void patch('workouts', id, { name })} />} back>
      <div className="card">
        <label className="inline-field">
          <span>Data</span>
          <input type="date" value={workout.date} max={isoDate()} onChange={(e) => changeDate(e.target.value)} />
        </label>
      </div>
      <dl className="facts">
        <div><dt>Durata</dt><dd>{formatDuration((workout.finished_at ?? workout.started_at) - workout.started_at)}</dd></div>
        <div><dt>Volume</dt><dd>{num(Math.round(volume))} kg</dd></div>
        <div><dt>Serie</dt><dd>{sets.length}</dd></div>
        <div><dt>Record</dt><dd>{records.size}</dd></div>
      </dl>

      {wes.map((w) => {
        const ex = exercises.get(w.exercise_id);
        const own = sets.filter((s) => s.workout_exercise_id === w.id);
        return (
          <div key={w.id} className="card">
            <div className="row">
              <div className="tile">{ex ? <MuscleIcon muscle={ex.muscle} size={36} /> : <Icon name="disco" />}</div>
              <div className="grow">
                <Link to={`/andamento/esercizio/${w.exercise_id}`} className="ex-name">{ex?.name ?? 'Esercizio'}</Link>
                {own.length === 0 && <span className="muted">Saltato</span>}
                {w.notes && <span className="muted">{w.notes}</span>}
              </div>
            </div>
            <div className="set-list">
              {own.map((s, i) => (
                <button key={s.id} className="set-row done" onClick={() => setEditing(s.id)}>
                  <span className="set-tag">{SET_KINDS.find((k) => k.id === s.kind)?.tag || i + 1}</span>
                  <span className="set-value">{formatSet(s, ex)}</span>
                  {records.has(s.id) && <span className="badge badge-accent" title={RECORD_LABEL[records.get(s.id)!]}>Record</span>}
                  {formatEffort(s) && <span className="muted">{formatEffort(s)}</span>}
                  <Icon name="edit" size={18} />
                </button>
              ))}
            </div>
            <button className="btn btn-small" onClick={() => void addSet(w.id, w.exercise_id)}><Icon name="plus" size={18} /> Aggiungi serie</button>
          </div>
        );
      })}

      <label className="field">
        <span>Note</span>
        <EditableText multiline label="Note della sessione" placeholder="Nessuna nota" value={workout.notes ?? ''} onSave={(notes) => void patch('workouts', id, { notes })} />
      </label>
      <button className="btn btn-ghost btn-danger" onClick={() => setConfirm(true)}><Icon name="trash" size={20} /> Elimina sessione</button>

      {current && <SetSheet set={current as Local<WorkoutSet>} ex={exercises.get(current.exercise_id)} onClose={() => setEditing(null)} />}
      {confirm && (
        <Sheet title="Eliminare la sessione?" onClose={() => setConfirm(false)}>
          <p className="muted">La sessione sparirà da storico, grafici e record.</p>
          <button className="btn btn-danger-fill" onClick={async () => { await discardWorkout(id); navigate('/andamento', { replace: true }); }}>Elimina</button>
          <button className="btn btn-ghost" onClick={() => setConfirm(false)}>Annulla</button>
        </Sheet>
      )}
    </Page>
  );
}
