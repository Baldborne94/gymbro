import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { KINDS, equipmentLabel, muscleLabel } from '../../../shared/schema';
import { Icon } from '../components/Icon';
import { Page, Sheet } from '../components/Layout';
import { MuscleIcon } from '../components/MuscleIcon';
import { Photo } from '../components/Photo';
import { db, remove } from '../db';
import { ExerciseTags } from './Exercises';

const num = (n: number) => n.toLocaleString('it-IT');

export function ExerciseDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const ex = useLiveQuery(() => db.exercises.get(id).then((e) => e ?? null), [id]);
  const [confirm, setConfirm] = useState(false);

  if (ex === undefined) return <Page title="" back>{null}</Page>;
  if (ex === null || ex.deleted) {
    return <Page title="Esercizio" back="/esercizi"><div className="empty"><p>Esercizio non trovato.</p></div></Page>;
  }

  const kind = KINDS.find((k) => k.id === ex.kind);
  const unit = ex.load_unit === 'tacche' ? (ex.step === 1 ? 'tacca' : 'tacche') : 'kg';

  return (
    <Page
      title={ex.name}
      back="/esercizi"
      action={<Link to={`/esercizi/${ex.id}/modifica`} className="icon-btn" aria-label="Modifica"><Icon name="edit" /></Link>}
    >
      <div className="card row">
        <div className="tile tile-big"><MuscleIcon muscle={ex.muscle} size={56} /></div>
        <div className="grow">
          <div className="strong">{muscleLabel(ex.muscle)}</div>
          {ex.secondary?.length > 0 && <div className="muted">Anche: {ex.secondary.map(muscleLabel).join(', ')}</div>}
          <div className="tags"><ExerciseTags ex={ex} /></div>
        </div>
      </div>

      <dl className="facts">
        <div><dt>Attrezzo</dt><dd><Icon name={ex.equipment === 'altro' ? 'disco' : ex.equipment} size={20} /> {equipmentLabel(ex.equipment)}</dd></div>
        <div><dt>Tipo</dt><dd>{kind?.label}</dd></div>
        <div><dt>Esecuzione</dt><dd>{ex.unilateral ? 'Un lato alla volta' : 'Bilaterale'}</dd></div>
        <div><dt>Passo +/−</dt><dd>{num(ex.step)} {unit}</dd></div>
        {ex.load_unit === 'tacche' && ex.notch_kg ? <div><dt>Una tacca</dt><dd>{num(ex.notch_kg)} kg</dd></div> : null}
      </dl>
      {kind && <p className="muted">{kind.hint}</p>}

      {ex.notes && (
        <div className="card">
          <h2>Note</h2>
          <p className="notes">{ex.notes}</p>
        </div>
      )}

      {ex.photo_id && <Photo id={ex.photo_id} alt={`Foto di ${ex.name}`} className="photo" />}

      <button className="btn btn-ghost btn-danger" onClick={() => setConfirm(true)}>
        <Icon name="trash" size={20} /> Elimina esercizio
      </button>

      {confirm && (
        <Sheet title="Eliminare l'esercizio?" onClose={() => setConfirm(false)}>
          <p className="muted">«{ex.name}» sparirà dalla libreria. Le sessioni già registrate non cambiano.</p>
          <button className="btn btn-danger-fill" onClick={async () => { await remove('exercises', ex.id); navigate('/esercizi'); }}>
            Elimina
          </button>
          <button className="btn btn-ghost" onClick={() => setConfirm(false)}>Annulla</button>
        </Sheet>
      )}
    </Page>
  );
}
