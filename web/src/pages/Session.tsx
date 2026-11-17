import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  SET_KINDS, equipmentLabel, muscleLabel,
  type Exercise, type SetKind, type WorkoutExercise, type WorkoutSet,
} from '../../../shared/schema';
import { EditableText } from '../components/EditableText';
import { ExercisePicker } from '../components/ExercisePicker';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Layout';
import { MuscleIcon } from '../components/MuscleIcon';
import { RestBar } from '../components/RestBar';
import { Stepper } from '../components/Stepper';
import { num } from '../dates';
import { db, patch, remove, type Local } from '../db';
import { skipRest, startRest, unlockAudio, useNow, useWakeLock } from '../timer';
import {
  addExercise, addSet, discardWorkout, finishWorkout, formatDuration, formatEffort, formatSet,
  lastSets, removeExercise, substitute, unitOf,
} from '../workout';

type WE = Local<WorkoutExercise>;
type WSet = Local<WorkoutSet>;

const EFFORT_KEY = 'gb_effort';
const RPE = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const RIR = [0, 1, 2, 3, 4, 5];

/** Etichetta della serie: numero progressivo per le normali, lettera per le altre. */
function setTag(sets: WSet[], set: WSet): string {
  const tag = SET_KINDS.find((k) => k.id === set.kind)?.tag;
  if (tag) return tag;
  return String(sets.filter((s) => s.kind === 'normale' && s.position <= set.position).length);
}

function target(we: WE, ex: Exercise | undefined): string | null {
  if (!we.reps_min || !we.reps_max) return null;
  const range = we.reps_min === we.reps_max ? `${we.reps_min}` : `${we.reps_min}–${we.reps_max}`;
  return `Obiettivo ${range} ${ex?.kind === 'tempo' ? 's' : 'rip'}`;
}

function EffortSheet({ set, onClose }: { set: WSet; onClose: () => void }) {
  const [mode, setMode] = useState<'rpe' | 'rir'>(() => (localStorage.getItem(EFFORT_KEY) === 'rir' ? 'rir' : 'rpe'));
  const choose = (m: 'rpe' | 'rir') => { setMode(m); localStorage.setItem(EFFORT_KEY, m); };
  const pick = async (value: number | null) => {
    await patch('sets', set.id, mode === 'rpe' ? { rpe: value, rir: null } : { rir: value, rpe: null });
    onClose();
  };
  const current = mode === 'rpe' ? set.rpe : set.rir;
  return (
    <Sheet title="Sforzo percepito" onClose={onClose}>
      <div className="segmented">
        <button className={mode === 'rpe' ? 'on' : ''} aria-pressed={mode === 'rpe'} onClick={() => choose('rpe')}>RPE</button>
        <button className={mode === 'rir' ? 'on' : ''} aria-pressed={mode === 'rir'} onClick={() => choose('rir')}>Rip. di riserva</button>
      </div>
      <p className="muted">
        {mode === 'rpe' ? 'Da 6 (facile) a 10 (massimo sforzo).' : 'Quante ripetizioni avresti potuto fare ancora.'}
      </p>
      <div className="grid-3">
        {(mode === 'rpe' ? RPE : RIR).map((v) => (
          <button key={v} className={`pick pick-num${current === v ? ' on' : ''}`} onClick={() => void pick(v)}>
            {num(v)}{mode === 'rir' && v === 5 ? '+' : ''}
          </button>
        ))}
      </div>
      <button className="btn btn-ghost" onClick={() => void pick(null)}>Nessuna indicazione</button>
    </Sheet>
  );
}

/** Cronometro per gli esercizi a tempo: alla fine scrive la durata nella serie. */
function Stopwatch({ onStop }: { onStop: (seconds: number) => void }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const now = useNow(200);
  if (!startedAt) {
    return <button className="btn" onClick={() => { skipRest(); setStartedAt(Date.now()); }}><Icon name="timer" size={20} /> Avvia cronometro</button>;
  }
  const elapsed = Math.floor((now - startedAt) / 1000);
  return (
    <button className="btn btn-running" onClick={() => { onStop(Math.max(1, elapsed)); setStartedAt(null); }}>
      <Icon name="timer" size={20} /> {elapsed} s · Ferma
    </button>
  );
}

export function Session() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  useWakeLock();
  const now = useNow(1000);

  const data = useLiveQuery(async () => {
    const workout = (await db.workouts.get(id)) ?? null;
    const wes = (await db.workout_exercises.where('workout_id').equals(id).toArray())
      .filter((x) => !x.deleted)
      .sort((a, b) => a.position - b.position);
    const sets = (await db.sets.where('workout_id').equals(id).toArray())
      .filter((x) => !x.deleted)
      .sort((a, b) => a.position - b.position);
    const ids = wes.flatMap((w) => (w.original_exercise_id ? [w.exercise_id, w.original_exercise_id] : [w.exercise_id]));
    const exercises = new Map((await db.exercises.bulkGet(ids)).filter(Boolean).map((e) => [e!.id, e!]));
    return { workout, wes, sets, exercises };
  }, [id]);

  const [currentId, setCurrentId] = useState<string | null>(null);
  const [selectedSet, setSelectedSet] = useState<string | null>(null);
  const [justDone, setJustDone] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'menu' | 'elenco' | 'sforzo' | 'fine' | 'note'>(null);
  const [picker, setPicker] = useState<null | 'aggiungi' | 'sostituisci'>(null);

  const wes = data?.wes ?? [];
  const setsOf = (weId: string) => (data?.sets ?? []).filter((s) => s.workout_exercise_id === weId);
  const pending = (weId: string) => setsOf(weId).some((s) => !s.done);

  // Si parte dal primo esercizio che ha ancora serie da fare.
  const fallback = wes.find((w) => !w.skipped && pending(w.id)) ?? wes[0];
  const we = wes.find((w) => w.id === currentId) ?? fallback;
  const ex = we ? data?.exercises.get(we.exercise_id) : undefined;

  const previous = useLiveQuery(async () => (we ? lastSets(we.exercise_id, id) : []), [we?.exercise_id, id]);

  useEffect(() => {
    if (data && data.workout?.finished_at) navigate(`/sessione/${id}/riepilogo`, { replace: true });
  }, [data, id, navigate]);

  if (!data) return <div className="session" />;
  const { workout } = data;
  if (!workout || workout.deleted) {
    return (
      <div className="session">
        <div className="empty"><p>Sessione non trovata.</p><button className="btn" onClick={() => navigate('/allena')}>Torna ad Allena</button></div>
      </div>
    );
  }

  const index = we ? wes.findIndex((w) => w.id === we.id) : -1;
  const sets = we ? setsOf(we.id) : [];
  const active = sets.find((s) => s.id === selectedSet) ?? sets.find((s) => !s.done);
  const editingDone = Boolean(active?.done);
  const allDone = wes.length > 0 && wes.every((w) => w.skipped || !pending(w.id));
  const doneCount = data.sets.filter((s) => s.done).length;
  const todoCount = data.sets.length - doneCount;
  const timed = ex?.kind === 'tempo';
  const bodyweight = ex?.kind === 'corpo_libero';

  const go = (weId: string) => { setCurrentId(weId); setSelectedSet(null); setSheet(null); };

  /** Esercizi legati in superset a quello indicato (indici consecutivi). */
  function groupOf(i: number): number[] {
    let start = i;
    while (start > 0 && wes[start - 1].superset_next) start--;
    let end = i;
    while (end < wes.length - 1 && wes[end].superset_next) end++;
    return Array.from({ length: end - start + 1 }, (_, k) => start + k);
  }

  async function setLoad(set: WSet, load: number | null) {
    // Le serie successive ancora da fare seguono il nuovo carico.
    const followers = sets.filter((s) => !s.done && s.position > set.position && s.kind !== 'riscaldamento' && s.load === set.load);
    await patch('sets', set.id, { load });
    for (const f of followers) await patch('sets', f.id, { load });
  }

  async function confirm(set: WSet) {
    unlockAudio();
    navigator.vibrate?.(40);
    if (editingDone) return setSelectedSet(null);
    await patch('sets', set.id, { done: true, done_at: Date.now() });
    setJustDone(set.id);
    setSelectedSet(null);
    setTimeout(() => setJustDone((cur) => (cur === set.id ? null : cur)), 900);

    const group = groupOf(index);
    const stillPending = (i: number) => (i === index ? sets.some((s) => !s.done && s.id !== set.id) : !wes[i].skipped && pending(wes[i].id));
    const nextInGroup = group.find((i) => i > index && stillPending(i));
    if (nextInGroup !== undefined) return go(wes[nextInGroup].id); // superset: niente recupero in mezzo
    startRest(we!.rest_sec);
    const first = group.find(stillPending);
    if (first !== undefined) {
      if (first !== index) go(wes[first].id);
      return;
    }
    // Esercizio (o superset) finito: si passa al prossimo con serie da fare.
    const after = wes.findIndex((w, i) => i > index && !group.includes(i) && !w.skipped && pending(w.id));
    const any = wes.findIndex((w, i) => !group.includes(i) && !w.skipped && pending(w.id));
    const next = after >= 0 ? after : any;
    if (next >= 0) go(wes[next].id);
    else setCurrentId(we!.id);
  }

  async function pick(chosen: Exercise) {
    const mode = picker;
    setPicker(null);
    if (mode === 'sostituisci' && we) go(await substitute(we.id, chosen));
    else go(await addExercise(id, chosen));
  }

  async function finish() {
    skipRest();
    if (doneCount === 0) {
      await discardWorkout(id);
      return navigate('/allena', { replace: true });
    }
    await finishWorkout(id);
    navigate(`/sessione/${id}/riepilogo`, { replace: true });
  }

  const nextWe = wes.slice(index + 1).find((w) => !w.skipped && pending(w.id)) ?? wes.find((w) => !w.skipped && pending(w.id) && w.id !== we?.id);
  const original = we?.original_exercise_id ? data.exercises.get(we.original_exercise_id) : undefined;

  return (
    <div className="session">
      <header className="session-top">
        <button className="icon-btn" aria-label="Esci dalla sessione (resta in corso)" onClick={() => navigate('/allena')}><Icon name="back" /></button>
        <button className="session-title" onClick={() => setSheet('elenco')}>
          <span>{workout.name}</span>
          <span className="muted">{index >= 0 ? `Esercizio ${index + 1} di ${wes.length}` : 'Nessun esercizio'} · elenco</span>
        </button>
        <div className="session-clock" aria-label="Durata">{formatDuration(now - workout.started_at)}</div>
      </header>

      <div className="segments" role="group" aria-label="Esercizi della sessione">
        {wes.map((w, i) => (
          <button
            key={w.id}
            aria-label={`Esercizio ${i + 1}`}
            aria-current={w.id === we?.id}
            className={`segment${w.id === we?.id ? ' current' : ''}${w.skipped ? ' skipped' : !pending(w.id) ? ' done' : ''}`}
            onClick={() => go(w.id)}
          />
        ))}
      </div>

      {!we && (
        <div className="empty">
          <div className="empty-icon"><Icon name="bilanciere" size={44} /></div>
          <p>Sessione vuota: aggiungi il primo esercizio.</p>
          <button className="btn btn-primary" onClick={() => setPicker('aggiungi')}><Icon name="plus" size={22} /> Aggiungi esercizio</button>
        </div>
      )}

      {we && (
        <>
          <div className="row">
            <div className="tile">{ex ? <MuscleIcon muscle={ex.muscle} size={40} /> : <Icon name="disco" />}</div>
            <div className="grow">
              <h1 className="session-ex">{ex?.name ?? 'Esercizio'}</h1>
              <div className="muted">
                {ex ? `${muscleLabel(ex.muscle)} · ${equipmentLabel(ex.equipment)}` : ''}{ex?.unilateral ? ' · per lato' : ''}
              </div>
            </div>
            <button className="icon-btn" aria-label="Azioni sull'esercizio" onClick={() => setSheet('menu')}><Icon name="altro" /></button>
          </div>

          {(we.skipped || original || we.superset_next || (index > 0 && wes[index - 1].superset_next) || we.notes) && (
            <div className="tags">
              {we.skipped && <span className="badge">Saltato</span>}
              {original && <span className="badge">Al posto di {original.name}</span>}
              {(we.superset_next || (index > 0 && wes[index - 1].superset_next)) && <span className="badge badge-accent">Superset</span>}
              {we.notes && <span className="muted">{we.notes}</span>}
            </div>
          )}

          <div className="set-list">
            {sets.map((s) => (
              <button
                key={s.id}
                className={`set-row${s.done ? ' done' : ''}${s.id === active?.id ? ' active' : ''}${s.id === justDone ? ' pop' : ''}`}
                onClick={() => setSelectedSet(s.id === selectedSet ? null : s.id)}
              >
                <span className="set-tag">{setTag(sets, s)}</span>
                <span className="set-value">{formatSet(s, ex)}</span>
                {formatEffort(s) && <span className="muted">{formatEffort(s)}</span>}
                {s.done
                  ? <span className="set-check"><Icon name="check" size={20} label="Completata" /></span>
                  : <span className="set-check todo" />}
              </button>
            ))}
          </div>

          {active && (
            <div className={`set-card${editingDone ? ' editing' : ''}`}>
              <div className="set-card-head">
                <span className="set-card-title">
                  {editingDone ? 'Modifica serie' : 'Serie'} {setTag(sets, active)}{active.kind === 'normale' ? ` di ${sets.filter((s) => s.kind === 'normale').length}` : ''}
                </span>
                <span className="muted">{target(we, ex)}</span>
              </div>
              {!timed && (
                <Stepper
                  big
                  label={bodyweight ? 'Zavorra o assistenza' : 'Carico'}
                  unit={bodyweight ? `${unitOf(ex)} · zavorra + / assistenza −` : unitOf(ex)}
                  value={active.load}
                  step={ex?.step ?? 2.5}
                  min={bodyweight ? -300 : 0}
                  nullable
                  onChange={(load) => void setLoad(active, load)}
                />
              )}
              {timed ? (
                <>
                  <Stepper big label="Durata" unit="secondi" value={active.seconds} step={5} min={1} onChange={(seconds) => void patch('sets', active.id, { seconds: seconds ?? 1 })} />
                  {!editingDone && <Stopwatch onStop={(seconds) => void patch('sets', active.id, { seconds })} />}
                </>
              ) : (
                <Stepper big label="Ripetizioni" unit={ex?.unilateral ? 'rip per lato' : 'rip'} value={active.reps} min={0} max={200} onChange={(reps) => void patch('sets', active.id, { reps: reps ?? 0 })} />
              )}
              <div className="set-options">
                <button
                  className={`chip${active.kind !== 'normale' ? ' on' : ''}`}
                  aria-label={`Tipo di serie: ${SET_KINDS.find((k) => k.id === active.kind)?.label}. Tocca per cambiare`}
                  onClick={() => {
                    const order = SET_KINDS.map((k) => k.id);
                    const next = order[(order.indexOf(active.kind) + 1) % order.length] as SetKind;
                    void patch('sets', active.id, { kind: next });
                  }}
                >
                  {SET_KINDS.find((k) => k.id === active.kind)?.label}
                </button>
                <button className={`chip${formatEffort(active) ? ' on' : ''}`} onClick={() => setSheet('sforzo')}>
                  {formatEffort(active) ?? 'Sforzo'}
                </button>
                {previous && previous.length > 0 && (
                  <span className="muted last-time">Ultima volta: {previous.map((p) => formatSet(p, ex).replace(` ${unitOf(ex)}`, '')).join(' · ')}</span>
                )}
              </div>
              <button className="btn btn-primary btn-confirm" onClick={() => void confirm(active)}>
                <Icon name="check" size={28} /> {editingDone ? 'Fatto' : 'Conferma serie'}
              </button>
              {editingDone && (
                <div className="actions">
                  <button className="btn" onClick={() => { void patch('sets', active.id, { done: false, done_at: null }); setSelectedSet(null); }}>Segna da fare</button>
                  <button className="btn btn-ghost btn-danger" onClick={() => { void remove('sets', active.id); setSelectedSet(null); }}><Icon name="trash" size={20} /> Elimina</button>
                </div>
              )}
            </div>
          )}

          {!active && (
            <div className="set-card done-card">
              <div className="set-card-title">{we.skipped ? 'Esercizio saltato' : 'Esercizio completato'}</div>
              {allDone ? (
                <button className="btn btn-primary btn-confirm" onClick={() => setSheet('fine')}><Icon name="flag" size={26} /> Termina allenamento</button>
              ) : nextWe && (
                <button className="btn btn-primary btn-confirm" onClick={() => go(nextWe.id)}>
                  Prossimo: {data.exercises.get(nextWe.exercise_id)?.name ?? 'esercizio'} <Icon name="chev" size={26} />
                </button>
              )}
              <button className="btn" onClick={() => void addSet(we.id)}><Icon name="plus" size={20} /> Aggiungi una serie</button>
            </div>
          )}
        </>
      )}

      <div className="session-bottom">
        <RestBar />
        <div className="session-actions">
          <button className="btn" onClick={() => setPicker('aggiungi')}><Icon name="plus" size={20} /> Esercizio</button>
          <button className="btn" onClick={() => setSheet('note')}><Icon name="note" size={20} /> Note</button>
          <button className="btn btn-finish" onClick={() => setSheet('fine')}><Icon name="flag" size={20} /> Fine</button>
        </div>
      </div>

      {sheet === 'sforzo' && active && <EffortSheet set={active} onClose={() => setSheet(null)} />}

      {sheet === 'menu' && we && (
        <Sheet title={ex?.name ?? 'Esercizio'} onClose={() => setSheet(null)}>
          <button className="btn btn-left" onClick={() => { setSheet(null); setPicker('sostituisci'); }}>
            <Icon name="swap" /> <span className="grow"><span className="strong">Sostituisci</span><span className="muted">Attrezzo occupato? Solo per questa sessione</span></span>
          </button>
          <button className="btn btn-left" onClick={() => { void addSet(we.id); setSheet(null); }}>
            <Icon name="plus" /> <span className="grow strong">Aggiungi una serie</span>
          </button>
          <button className="btn btn-left" onClick={() => {
            void patch('workout_exercises', we.id, { skipped: !we.skipped });
            if (!we.skipped && nextWe) go(nextWe.id); else setSheet(null);
          }}>
            <Icon name="skip" /> <span className="grow strong">{we.skipped ? 'Riprendi esercizio' : 'Salta esercizio'}</span>
          </button>
          <EditableText className="sheet-input" multiline label="Note sull'esercizio" placeholder="Note su questo esercizio" value={we.notes ?? ''} onSave={(notes) => void patch('workout_exercises', we.id, { notes })} />
          <button className="btn btn-ghost btn-danger" onClick={async () => { await removeExercise(we.id); setCurrentId(null); setSheet(null); }}>
            <Icon name="trash" size={20} /> Togli dalla sessione
          </button>
        </Sheet>
      )}

      {sheet === 'elenco' && (
        <Sheet title="Esercizi" onClose={() => setSheet(null)}>
          {wes.map((w, i) => {
            const e = data.exercises.get(w.exercise_id);
            const ws = setsOf(w.id);
            return (
              <button key={w.id} className={`btn btn-left${w.id === we?.id ? ' row-next' : ''}`} onClick={() => go(w.id)}>
                <span className="set-tag">{i + 1}</span>
                <span className="grow">
                  <span className="strong">{e?.name ?? 'Esercizio'}</span>
                  <span className="muted">
                    {w.skipped ? 'Saltato' : `${ws.filter((s) => s.done).length} di ${ws.length} serie`}{w.superset_next ? ' · superset con il successivo' : ''}
                  </span>
                </span>
                {!w.skipped && !pending(w.id) && <Icon name="check" label="Completato" />}
              </button>
            );
          })}
          <button className="btn" onClick={() => { setSheet(null); setPicker('aggiungi'); }}><Icon name="plus" size={20} /> Aggiungi esercizio</button>
        </Sheet>
      )}

      {sheet === 'note' && (
        <Sheet title="Note della sessione" onClose={() => setSheet(null)}>
          <EditableText className="sheet-input" multiline label="Note della sessione" placeholder="Come è andata, sensazioni, dolori…" value={workout.notes ?? ''} onSave={(notes) => void patch('workouts', id, { notes })} />
          <button className="btn btn-primary" onClick={() => setSheet(null)}>Fatto</button>
        </Sheet>
      )}

      {sheet === 'fine' && (
        <Sheet title={doneCount === 0 ? 'Annullare la sessione?' : 'Terminare l’allenamento?'} onClose={() => setSheet(null)}>
          <p className="muted">
            {doneCount === 0
              ? 'Non hai confermato nessuna serie: la sessione verrà scartata.'
              : todoCount > 0
                ? `Hai completato ${doneCount} serie. Le ${todoCount} non confermate non verranno salvate.`
                : `Hai completato tutte le ${doneCount} serie.`}
          </p>
          <button className={`btn ${doneCount === 0 ? 'btn-danger-fill' : 'btn-primary'}`} onClick={() => void finish()}>
            {doneCount === 0 ? 'Scarta sessione' : 'Termina'}
          </button>
          <button className="btn btn-ghost" onClick={() => setSheet(null)}>Continua ad allenarti</button>
          {doneCount > 0 && (
            <button className="btn btn-ghost btn-danger" onClick={async () => { skipRest(); await discardWorkout(id); navigate('/allena', { replace: true }); }}>
              <Icon name="trash" size={20} /> Scarta tutta la sessione
            </button>
          )}
        </Sheet>
      )}

      {picker && (
        <ExercisePicker
          title={picker === 'sostituisci' ? 'Sostituisci' : 'Aggiungi'}
          muscle={picker === 'sostituisci' ? ex?.muscle : null}
          exclude={picker === 'sostituisci' && we ? [we.exercise_id] : []}
          onPick={(chosen) => void pick(chosen)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
