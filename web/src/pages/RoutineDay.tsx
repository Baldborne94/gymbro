import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Exercise, RoutineExercise } from '../../../shared/schema';
import { EditableText } from '../components/EditableText';
import { ExercisePicker } from '../components/ExercisePicker';
import { Icon } from '../components/Icon';
import { Page, Sheet } from '../components/Layout';
import { MuscleIcon } from '../components/MuscleIcon';
import { SortableList } from '../components/Sortable';
import { Stepper } from '../components/Stepper';
import { WEEKDAYS, clock } from '../dates';
import { db, patch, remove, save, uuid, type Local } from '../db';
import { deleteDay, loadUnit, newItemDefaults, summary } from '../routines';

function ItemSheet({ item, ex, isLast, onClose }: { item: Local<RoutineExercise>; ex: Exercise | undefined; isLast: boolean; onClose: () => void }) {
  const set = (changes: Partial<RoutineExercise>) => void patch('routine_exercises', item.id, changes);
  const timed = ex?.kind === 'tempo';
  const bodyweight = ex?.kind === 'corpo_libero';
  const repStep = timed ? 5 : 1;
  return (
    <Sheet title={ex?.name ?? 'Esercizio'} onClose={onClose}>
      <Stepper label="Serie" value={item.sets} min={1} max={20} onChange={(v) => set({ sets: v ?? 1 })} />
      <Stepper
        label={timed ? 'Durata minima' : 'Ripetizioni minime'}
        unit={timed ? 'secondi' : undefined}
        value={item.reps_min}
        min={1}
        step={repStep}
        onChange={(v) => { const n = v ?? 1; set({ reps_min: n, reps_max: Math.max(n, item.reps_max) }); }}
      />
      <Stepper
        label={timed ? 'Durata massima' : 'Ripetizioni massime'}
        unit={timed ? 'secondi' : undefined}
        value={item.reps_max}
        min={1}
        step={repStep}
        onChange={(v) => { const n = v ?? 1; set({ reps_max: n, reps_min: Math.min(n, item.reps_min) }); }}
      />
      <Stepper
        label={bodyweight ? 'Zavorra (+) o assistenza (−)' : 'Carico previsto'}
        unit={ex ? loadUnit(ex) : 'kg'}
        value={item.load}
        step={ex?.step ?? 2.5}
        min={bodyweight ? -300 : 0}
        nullable
        onChange={(load) => set({ load })}
      />
      <Stepper label="Recupero" value={item.rest_sec} step={15} min={0} max={900} format={clock} onChange={(v) => set({ rest_sec: v ?? 0 })} />
      {!isLast && (
        <label className="switch">
          <input type="checkbox" checked={item.superset_next} onChange={(e) => set({ superset_next: e.target.checked })} />
          <span className="grow">
            <span className="strong">Superset con il successivo</span>
            <span className="muted">Si alternano senza recupero in mezzo</span>
          </span>
        </label>
      )}
      <EditableText className="sheet-input" label="Note" placeholder="Note per questo esercizio" value={item.notes ?? ''} multiline onSave={(notes) => set({ notes })} />
      <button className="btn btn-primary" onClick={onClose}><Icon name="check" size={22} /> Fatto</button>
      <button className="btn btn-ghost btn-danger" onClick={async () => { await remove('routine_exercises', item.id); onClose(); }}>
        <Icon name="trash" size={20} /> Togli dal giorno
      </button>
    </Sheet>
  );
}

export function RoutineDay() {
  const { id = '', dayId = '' } = useParams();
  const navigate = useNavigate();
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const data = useLiveQuery(async () => {
    const day = (await db.routine_days.get(dayId)) ?? null;
    const items = (await db.routine_exercises.where('day_id').equals(dayId).toArray())
      .filter((x) => !x.deleted)
      .sort((a, b) => a.position - b.position);
    const exercises = new Map((await db.exercises.bulkGet(items.map((i) => i.exercise_id))).filter(Boolean).map((e) => [e!.id, e!]));
    return { day, items, exercises };
  }, [dayId]);

  const back = `/schede/${id}`;
  if (!data) return <Page title="" back={back}>{null}</Page>;
  const { day, items, exercises } = data;
  if (!day || day.deleted) return <Page title="Giorno" back={back}><div className="empty"><p>Giorno non trovato.</p></div></Page>;

  async function add(ex: Exercise) {
    setPicking(false);
    const itemId = uuid();
    await save('routine_exercises', {
      id: itemId, routine_id: id, day_id: dayId, exercise_id: ex.id, position: items.length,
      ...newItemDefaults(ex), load: null, superset_next: false, notes: '',
    });
    setEditing(itemId);
  }

  const current = items.find((i) => i.id === editing);

  return (
    <Page title={<EditableText className="title-input" label="Nome del giorno" value={day.name} onSave={(name) => void patch('routine_days', dayId, { name })} />} back={back}>
      <div className="chips" role="group" aria-label="Giorno della settimana previsto">
        {WEEKDAYS.map((w, i) => (
          <button key={w} className={`chip${day.weekday === i + 1 ? ' on' : ''}`} aria-pressed={day.weekday === i + 1}
            onClick={() => void patch('routine_days', dayId, { weekday: day.weekday === i + 1 ? null : i + 1 })}>
            {w}
          </button>
        ))}
      </div>

      {items.length === 0 && (
        <div className="empty">
          <div className="empty-icon"><Icon name="bilanciere" size={44} /></div>
          <p>Questo giorno è vuoto. Aggiungi il primo esercizio.</p>
        </div>
      )}

      <SortableList
        items={items}
        onReorder={(next) => next.forEach((x, i) => { if (x.position !== i) void patch('routine_exercises', x.id, { position: i }); })}
      >
        {(item, handle, index) => {
          const ex = exercises.get(item.exercise_id);
          const linked = item.superset_next && index < items.length - 1;
          return (
            <>
              <div className="list-row list-row-drag">
                {handle}
                <button className="row-main" onClick={() => setEditing(item.id)}>
                  <div className="tile">{ex ? <MuscleIcon muscle={ex.muscle} size={36} /> : <Icon name="disco" />}</div>
                  <div className="grow">
                    <div className="ex-name">{ex?.name ?? 'Esercizio eliminato'}</div>
                    <div className="summary">{summary(item, ex)}</div>
                    {item.notes && <div className="muted">{item.notes}</div>}
                  </div>
                  <Icon name="edit" size={20} />
                </button>
              </div>
              {linked && <div className="ss-link"><Icon name="link" size={18} /> Superset</div>}
            </>
          );
        }}
      </SortableList>

      <button className="btn btn-primary" onClick={() => setPicking(true)}><Icon name="plus" size={22} /> Aggiungi esercizio</button>
      <button className="btn btn-ghost btn-danger" onClick={() => setConfirm(true)}><Icon name="trash" size={20} /> Elimina giorno</button>

      {picking && <ExercisePicker title="Aggiungi" onPick={(ex) => void add(ex)} onClose={() => setPicking(false)} />}
      {current && (
        <ItemSheet item={current} ex={exercises.get(current.exercise_id)} isLast={items[items.length - 1].id === current.id} onClose={() => setEditing(null)} />
      )}
      {confirm && (
        <Sheet title="Eliminare il giorno?" onClose={() => setConfirm(false)}>
          <p className="muted">«{day.name}» verrà tolto dalla scheda con i suoi esercizi.</p>
          <button className="btn btn-danger-fill" onClick={async () => { await deleteDay(dayId); navigate(back); }}>Elimina</button>
          <button className="btn btn-ghost" onClick={() => setConfirm(false)}>Annulla</button>
        </Sheet>
      )}
    </Page>
  );
}
