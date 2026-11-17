import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EditableText } from '../components/EditableText';
import { Icon } from '../components/Icon';
import { Page, Sheet } from '../components/Layout';
import { SortableList } from '../components/Sortable';
import { Stepper } from '../components/Stepper';
import { WEEKDAYS, formatDate, isoDate } from '../dates';
import { db, patch, save, uuid } from '../db';
import { activateRoutine, activeRoutine, archiveRoutine, deleteRoutine, duplicateRoutine } from '../routines';
import { CycleBar } from './Routines';

export function RoutineDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<null | 'attiva' | 'elimina'>(null);
  const [replaced, setReplaced] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    const routine = (await db.routines.get(id)) ?? null;
    const days = (await db.routine_days.where('routine_id').equals(id).toArray())
      .filter((d) => !d.deleted)
      .sort((a, b) => a.position - b.position);
    const items = (await db.routine_exercises.where('routine_id').equals(id).toArray()).filter((x) => !x.deleted);
    return { routine, days, items };
  }, [id]);

  if (!data) return <Page title="" back="/schede">{null}</Page>;
  const { routine, days, items } = data;
  if (!routine || routine.deleted) {
    return <Page title="Scheda" back="/schede"><div className="empty"><p>Scheda non trovata.</p></div></Page>;
  }

  async function askActivate() {
    const current = await activeRoutine();
    setReplaced(current && current.id !== id ? current.name : null);
    setSheet('attiva');
  }
  async function addDay() {
    const dayId = uuid();
    await save('routine_days', { id: dayId, routine_id: id, name: `Giorno ${days.length + 1}`, position: days.length, weekday: null });
    navigate(`/schede/${id}/giorni/${dayId}`);
  }

  const status = routine.status;

  return (
    <Page title={<EditableText className="title-input" label="Nome della scheda" value={routine.name} onSave={(name) => void patch('routines', id, { name })} />} back="/schede">
      <div className="card">
        <div className="row">
          <span className={`badge${status === 'attiva' ? ' badge-accent' : ''}`}>
            {status === 'attiva' ? 'Attiva' : status === 'bozza' ? 'Bozza' : 'Archiviata'}
          </span>
          {status === 'archiviata' && (
            <span className="muted">
              {routine.start_date ? formatDate(routine.start_date) : '—'} → {routine.end_date ? formatDate(routine.end_date) : '—'}
            </span>
          )}
        </div>
        {status === 'attiva' && <CycleBar routine={routine} />}
        {status !== 'archiviata' && (
          <>
            <Stepper
              label="Durata del ciclo"
              unit="settimane"
              value={routine.weeks}
              min={1}
              max={52}
              nullable
              onChange={(weeks) => void patch('routines', id, { weeks })}
            />
            {status === 'attiva' && (
              <label className="inline-field">
                <span>Inizio del ciclo</span>
                <input
                  type="date"
                  value={routine.start_date ?? ''}
                  max={isoDate()}
                  onChange={(e) => e.target.value && void patch('routines', id, { start_date: e.target.value })}
                />
              </label>
            )}
          </>
        )}
        {status !== 'attiva' && (
          <button className="btn btn-primary" onClick={() => void askActivate()}>
            <Icon name="play" size={22} /> {status === 'bozza' ? 'Inizia questa scheda' : 'Riattiva'}
          </button>
        )}
      </div>

      <h2 className="section">Giorni</h2>
      <SortableList
        items={days}
        onReorder={(next) => next.forEach((d, i) => { if (d.position !== i) void patch('routine_days', d.id, { position: i }); })}
      >
        {(day, handle) => {
          const n = items.filter((x) => x.day_id === day.id).length;
          return (
            <div className="list-row list-row-drag">
              {handle}
              <Link to={`/schede/${id}/giorni/${day.id}`} className="row-main">
                <div className="grow">
                  <div className="ex-name">{day.name}</div>
                  <div className="muted">
                    {n} {n === 1 ? 'esercizio' : 'esercizi'}{day.weekday ? ` · ${WEEKDAYS[day.weekday - 1]}` : ''}
                  </div>
                </div>
                <Icon name="chev" />
              </Link>
            </div>
          );
        }}
      </SortableList>
      <button className="btn" onClick={() => void addDay()}><Icon name="plus" size={20} /> Aggiungi giorno</button>

      <label className="field">
        <span>Note</span>
        <EditableText multiline label="Note della scheda" placeholder="Obiettivo del ciclo, indicazioni…" value={routine.notes ?? ''} onSave={(notes) => void patch('routines', id, { notes })} />
      </label>

      <div className="actions">
        <button className="btn" onClick={async () => { const copy = await duplicateRoutine(id); if (copy) navigate(`/schede/${copy}`); }}>
          <Icon name="copy" size={20} /> Duplica
        </button>
        {status === 'attiva' && (
          <button className="btn" onClick={() => void archiveRoutine(id)}><Icon name="archive" size={20} /> Archivia</button>
        )}
        <button className="btn btn-ghost btn-danger" onClick={() => setSheet('elimina')}><Icon name="trash" size={20} /> Elimina</button>
      </div>

      {sheet === 'attiva' && (
        <Sheet title="Iniziare questa scheda?" onClose={() => setSheet(null)}>
          <p className="muted">
            Il ciclo parte oggi{routine.weeks ? ` e dura ${routine.weeks} settimane` : ''}.
            {replaced && ` La scheda attiva «${replaced}» finisce in archivio.`}
          </p>
          <button className="btn btn-primary" onClick={async () => { await activateRoutine(id); setSheet(null); }}>Inizia</button>
          <button className="btn btn-ghost" onClick={() => setSheet(null)}>Annulla</button>
        </Sheet>
      )}
      {sheet === 'elimina' && (
        <Sheet title="Eliminare la scheda?" onClose={() => setSheet(null)}>
          <p className="muted">«{routine.name}» verrà eliminata con tutti i suoi giorni. Le sessioni già registrate non cambiano.</p>
          <button className="btn btn-danger-fill" onClick={async () => { await deleteRoutine(id); navigate('/schede'); }}>Elimina</button>
          <button className="btn btn-ghost" onClick={() => setSheet(null)}>Annulla</button>
        </Sheet>
      )}
    </Page>
  );
}
