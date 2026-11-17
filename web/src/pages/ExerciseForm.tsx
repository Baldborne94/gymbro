import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  EQUIPMENT, KINDS, MUSCLES,
  type EquipmentId, type Exercise, type ExerciseKind, type LoadUnit, type MuscleId,
} from '../../../shared/schema';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { MuscleIcon } from '../components/MuscleIcon';
import { Photo, shrinkImage } from '../components/Photo';
import { db, save, saveBlob, uuid } from '../db';

type Form = Omit<Exercise, 'updated_at' | 'deleted'>;

const blank = (): Form => ({
  id: uuid(),
  name: '',
  muscle: 'petto',
  secondary: [],
  equipment: 'bilanciere',
  kind: 'pesi',
  unilateral: false,
  load_unit: 'kg',
  step: 2.5,
  notch_kg: null,
  notes: '',
  photo_id: null,
  custom: true,
});

const parse = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

export function ExerciseForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<Form | null>(id ? null : blank);
  const [step, setStep] = useState('2,5');
  const [notch, setNotch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    db.exercises.get(id).then((e) => {
      if (!e) return navigate('/esercizi', { replace: true });
      const { updated_at, deleted, _dirty, ...rest } = e;
      setForm({ ...rest, secondary: rest.secondary ?? [] });
      setStep(String(rest.step).replace('.', ','));
      setNotch(rest.notch_kg ? String(rest.notch_kg).replace('.', ',') : '');
    });
  }, [id, navigate]);

  if (!form) return <Page title="Modifica" back>{null}</Page>;
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const photoId = await saveBlob(await shrinkImage(file));
      set({ photo_id: photoId });
    } catch {
      setError('Non riesco a leggere questa immagine.');
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = form!.name.trim();
    const stepValue = parse(step);
    const notchValue = notch.trim() ? parse(notch) : null;
    if (!name) return setError('Dai un nome all’esercizio.');
    if (!(stepValue > 0)) return setError('Il passo deve essere un numero maggiore di zero.');
    if (notchValue !== null && !(notchValue > 0)) return setError('I kg per tacca devono essere un numero maggiore di zero.');
    await save('exercises', {
      ...form!,
      name,
      step: stepValue,
      notch_kg: form!.load_unit === 'tacche' ? notchValue : null,
    });
    navigate(`/esercizi/${form!.id}`, { replace: true });
  }

  const tacche = form.load_unit === 'tacche';

  return (
    <Page title={id ? 'Modifica' : 'Nuovo esercizio'} back>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>Nome</span>
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Es. Panca piana" required />
        </label>

        <fieldset className="field">
          <legend>Gruppo muscolare</legend>
          <div className="grid-3">
            {MUSCLES.map((m) => (
              <button type="button" key={m.id} aria-pressed={form.muscle === m.id} className={`pick${form.muscle === m.id ? ' on' : ''}`} onClick={() => set({ muscle: m.id as MuscleId })}>
                <MuscleIcon muscle={m.id} size={34} />
                {m.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>Attrezzo</legend>
          <div className="grid-3">
            {EQUIPMENT.map((q) => (
              <button type="button" key={q.id} aria-pressed={form.equipment === q.id} className={`pick${form.equipment === q.id ? ' on' : ''}`} onClick={() => set({ equipment: q.id as EquipmentId })}>
                <Icon name={q.id === 'altro' ? 'disco' : q.id} size={26} />
                {q.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>Tipo di esercizio</legend>
          <div className="segmented">
            {KINDS.map((k) => (
              <button type="button" key={k.id} aria-pressed={form.kind === k.id} className={form.kind === k.id ? 'on' : ''} onClick={() => set({ kind: k.id as ExerciseKind })}>
                {k.label}
              </button>
            ))}
          </div>
          <p className="muted">{KINDS.find((k) => k.id === form.kind)?.hint}</p>
        </fieldset>

        <label className="switch">
          <input type="checkbox" checked={form.unilateral} onChange={(e) => set({ unilateral: e.target.checked })} />
          <span className="grow">
            <span className="strong">Unilaterale</span>
            <span className="muted">Si esegue un lato alla volta</span>
          </span>
        </label>

        <fieldset className="field">
          <legend>Carico</legend>
          <div className="segmented">
            {(['kg', 'tacche'] as LoadUnit[]).map((u) => (
              <button
                type="button"
                key={u}
                aria-pressed={form.load_unit === u}
                className={form.load_unit === u ? 'on' : ''}
                onClick={() => { set({ load_unit: u }); if (u === 'tacche') setStep('1'); }}
              >
                {u === 'kg' ? 'Chili' : 'Tacche della macchina'}
              </button>
            ))}
          </div>
          <div className="grid-2">
            <label className="field">
              <span>Passo dei pulsanti +/− ({tacche ? 'tacche' : 'kg'})</span>
              <input inputMode="decimal" value={step} onChange={(e) => setStep(e.target.value)} />
            </label>
            {tacche && (
              <label className="field">
                <span>Kg per tacca (facoltativo)</span>
                <input inputMode="decimal" value={notch} onChange={(e) => setNotch(e.target.value)} placeholder="Es. 5" />
              </label>
            )}
          </div>
          {tacche && <p className="muted">Se indichi i kg per tacca, il volume viene calcolato in chili.</p>}
        </fieldset>

        <label className="field">
          <span>Note</span>
          <textarea rows={3} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Regolazioni della macchina, presa, consigli…" />
        </label>

        <div className="field">
          <span>Foto</span>
          {form.photo_id && <Photo id={form.photo_id} alt="Foto dell'esercizio" className="photo" />}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pickPhoto(e.target.files?.[0])} />
          <div className="row">
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              <Icon name="camera" size={20} /> {form.photo_id ? 'Cambia foto' : 'Aggiungi foto'}
            </button>
            {form.photo_id && <button type="button" className="btn btn-ghost" onClick={() => set({ photo_id: null })}>Rimuovi</button>}
          </div>
        </div>

        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-sticky"><Icon name="check" size={24} /> Salva</button>
      </form>
    </Page>
  );
}
