import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { MUSCLES, equipmentLabel, muscleLabel, type Exercise } from '../../../shared/schema';
import { db } from '../db';
import { Icon } from './Icon';
import { MuscleIcon } from './MuscleIcon';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Scelta di un esercizio a tutto schermo, con ricerca e filtro per gruppo muscolare. */
export function ExercisePicker({ title, muscle: initialMuscle = null, exclude = [], onPick, onClose }: {
  title: string;
  muscle?: string | null;
  exclude?: string[];
  onPick: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const all = useLiveQuery(() => db.exercises.filter((e) => !e.deleted).toArray(), []);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<string | null>(initialMuscle);

  const list = useMemo(() => {
    const q = norm(query.trim());
    return (all ?? [])
      .filter((e) => !exclude.includes(e.id) && (!muscle || e.muscle === muscle) && (!q || norm(e.name).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'it'));
  }, [all, query, muscle, exclude]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="overlay-inner page">
        <header className="page-head">
          <button className="icon-btn" aria-label="Chiudi" onClick={onClose}><Icon name="close" /></button>
          <h1>{title}</h1>
        </header>
        <label className="search">
          <Icon name="search" size={22} />
          <input type="search" placeholder="Cerca un esercizio" aria-label="Cerca un esercizio" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="chips" role="group" aria-label="Filtra per gruppo muscolare">
          <button className={`chip${!muscle ? ' on' : ''}`} onClick={() => setMuscle(null)}>Tutti</button>
          {MUSCLES.map((m) => (
            <button key={m.id} className={`chip chip-icon${muscle === m.id ? ' on' : ''}`} onClick={() => setMuscle(muscle === m.id ? null : m.id)}>
              <MuscleIcon muscle={m.id} size={24} /> {m.label}
            </button>
          ))}
        </div>
        <div className="list">
          {list.map((e) => (
            <button key={e.id} className="list-row" onClick={() => onPick(e)}>
              <div className="tile"><MuscleIcon muscle={e.muscle} size={36} /></div>
              <div className="grow">
                <div className="ex-name">{e.name}</div>
                <div className="muted">{muscleLabel(e.muscle)} · {equipmentLabel(e.equipment)}</div>
              </div>
              <Icon name="plus" />
            </button>
          ))}
        </div>
        {all && list.length === 0 && <div className="empty"><p>Nessun esercizio trovato.</p></div>}
      </div>
    </div>
  );
}
