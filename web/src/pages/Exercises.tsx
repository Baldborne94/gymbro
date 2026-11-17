import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { EQUIPMENT, MUSCLES, equipmentLabel, muscleLabel, type Exercise } from '../../../shared/schema';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { MuscleIcon } from '../components/MuscleIcon';
import { db } from '../db';
import { useSessionState } from '../hooks';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function ExerciseTags({ ex }: { ex: Exercise }) {
  return (
    <>
      {ex.custom && <span className="badge badge-accent">Mio</span>}
      {ex.kind === 'tempo' && <span className="badge">A tempo</span>}
      {ex.kind === 'corpo_libero' && <span className="badge">Corpo libero</span>}
      {ex.unilateral && <span className="badge">Unilaterale</span>}
      {ex.load_unit === 'tacche' && <span className="badge">A tacche</span>}
    </>
  );
}

export function Exercises() {
  const all = useLiveQuery(() => db.exercises.filter((e) => !e.deleted).toArray(), []);
  const [query, setQuery] = useSessionState('ex.query', '');
  const [muscle, setMuscle] = useSessionState<string | null>('ex.muscle', null);
  const [equipment, setEquipment] = useSessionState<string | null>('ex.equipment', null);
  const [mine, setMine] = useSessionState('ex.mine', false);

  const list = useMemo(() => {
    const q = norm(query.trim());
    return (all ?? [])
      .filter((e) => (!muscle || e.muscle === muscle) && (!equipment || e.equipment === equipment) && (!mine || e.custom))
      .filter((e) => !q || norm(e.name).includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'it'));
  }, [all, query, muscle, equipment, mine]);

  return (
    <Page
      title="Esercizi"
      back="/altro"
      action={<Link to="/esercizi/nuovo" className="btn btn-primary btn-small"><Icon name="plus" size={20} /> Nuovo</Link>}
    >
      <label className="search">
        <Icon name="search" size={22} />
        <input
          type="search"
          placeholder="Cerca un esercizio"
          aria-label="Cerca un esercizio"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <div className="chips" role="group" aria-label="Filtra per gruppo muscolare">
        <button className={`chip${!muscle ? ' on' : ''}`} onClick={() => setMuscle(null)}>Tutti</button>
        {MUSCLES.map((m) => (
          <button key={m.id} className={`chip chip-icon${muscle === m.id ? ' on' : ''}`} onClick={() => setMuscle(muscle === m.id ? null : m.id)}>
            <MuscleIcon muscle={m.id} size={24} /> {m.label}
          </button>
        ))}
      </div>
      <div className="chips" role="group" aria-label="Filtra per attrezzo">
        <button className={`chip${mine ? ' on' : ''}`} onClick={() => setMine(!mine)}>Solo miei</button>
        {EQUIPMENT.map((q) => (
          <button key={q.id} className={`chip chip-icon${equipment === q.id ? ' on' : ''}`} onClick={() => setEquipment(equipment === q.id ? null : q.id)}>
            <Icon name={q.id === 'altro' ? 'disco' : q.id} size={20} /> {q.label}
          </button>
        ))}
      </div>

      <p className="muted count">{all ? `${list.length} ${list.length === 1 ? 'esercizio' : 'esercizi'}` : 'Caricamento…'}</p>

      <div className="list">
        {list.map((e) => (
          <Link key={e.id} to={`/esercizi/${e.id}`} className="list-row">
            <div className="tile"><MuscleIcon muscle={e.muscle} size={36} /></div>
            <div className="grow">
              <div className="ex-name">{e.name}</div>
              <div className="muted">{muscleLabel(e.muscle)} · {equipmentLabel(e.equipment)}</div>
              <div className="tags"><ExerciseTags ex={e} /></div>
            </div>
            <Icon name="chev" />
          </Link>
        ))}
      </div>

      {all && list.length === 0 && (
        <div className="empty">
          <div className="empty-icon"><Icon name="disco" size={44} /></div>
          <p>Nessun esercizio trovato.</p>
          <Link to="/esercizi/nuovo" className="btn btn-primary">Crea un esercizio</Link>
        </div>
      )}
    </Page>
  );
}
