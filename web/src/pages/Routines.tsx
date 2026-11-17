import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Routine } from '../../../shared/schema';
import { Icon } from '../components/Icon';
import { Page, Sheet } from '../components/Layout';
import { formatDate } from '../dates';
import { db } from '../db';
import { TEMPLATES, createRoutine, cycleInfo, cycleMessage } from '../routines';

export function CycleBar({ routine }: { routine: Routine }) {
  const c = cycleInfo(routine);
  if (!c) return <p className="muted">Nessuna durata impostata per questo ciclo.</p>;
  const msg = cycleMessage(c);
  return (
    <div className="cycle">
      <div className="cycle-head">
        <span className="cycle-week">Settimana <b>{c.week}</b> di {c.weeks}</span>
        <span className="muted">fino al {formatDate(c.end, { day: 'numeric', month: 'long' })}</span>
      </div>
      <div className="bar" role="img" aria-label={`Ciclo al ${Math.round(c.progress * 100)} per cento`}>
        <div style={{ width: `${Math.round(c.progress * 100)}%` }} />
      </div>
      {msg && <p className="alert"><Icon name="alert" size={20} /> {msg}</p>}
    </div>
  );
}

export function Routines() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const data = useLiveQuery(async () => {
    const routines = (await db.routines.toArray()).filter((r) => !r.deleted);
    const days = (await db.routine_days.toArray()).filter((d) => !d.deleted);
    const count = (id: string) => days.filter((d) => d.routine_id === id).length;
    return { routines, count };
  }, []);

  const routines = data?.routines ?? [];
  const active = routines.find((r) => r.status === 'attiva');
  const drafts = routines.filter((r) => r.status === 'bozza').sort((a, b) => b.updated_at - a.updated_at);
  const archived = routines.filter((r) => r.status === 'archiviata').sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? ''));
  const dayCount = (r: Routine) => {
    const n = data?.count(r.id) ?? 0;
    return `${n} ${n === 1 ? 'giorno' : 'giorni'}`;
  };

  async function create(name: string, days: string[]) {
    const id = await createRoutine(name, days);
    navigate(`/schede/${id}`);
  }

  return (
    <Page
      title="Schede"
      action={<button className="btn btn-primary btn-small" onClick={() => setCreating(true)}><Icon name="plus" size={20} /> Nuova</button>}
    >
      {active ? (
        <Link to={`/schede/${active.id}`} className="card card-active">
          <div className="row">
            <span className="badge badge-accent">Attiva</span>
            <span className="muted grow">{dayCount(active)}</span>
            <Icon name="chev" />
          </div>
          <div className="routine-name">{active.name}</div>
          <CycleBar routine={active} />
        </Link>
      ) : data && (
        <div className="empty">
          <div className="empty-icon"><Icon name="schede" size={44} /></div>
          <p>Nessuna scheda attiva. Creane una o inizia una bozza.</p>
        </div>
      )}

      {drafts.length > 0 && <h2 className="section">Bozze</h2>}
      <div className="list">
        {drafts.map((r) => (
          <Link key={r.id} to={`/schede/${r.id}`} className="list-row">
            <div className="tile"><Icon name="schede" size={26} /></div>
            <div className="grow">
              <div className="ex-name">{r.name}</div>
              <div className="muted">{dayCount(r)}{r.weeks ? ` · ${r.weeks} settimane` : ''}</div>
            </div>
            <Icon name="chev" />
          </Link>
        ))}
      </div>

      {archived.length > 0 && <h2 className="section">Archivio</h2>}
      <div className="list">
        {archived.map((r) => (
          <Link key={r.id} to={`/schede/${r.id}`} className="list-row">
            <div className="tile tile-muted"><Icon name="archive" size={26} /></div>
            <div className="grow">
              <div className="ex-name">{r.name}</div>
              <div className="muted">
                {r.start_date ? formatDate(r.start_date) : '—'} → {r.end_date ? formatDate(r.end_date) : '—'}
              </div>
            </div>
            <Icon name="chev" />
          </Link>
        ))}
      </div>

      {creating && (
        <Sheet title="Nuova scheda" onClose={() => setCreating(false)}>
          <p className="muted">Parti da una struttura: giorni ed esercizi li sistemi dopo.</p>
          {TEMPLATES.map((t) => (
            <button key={t.id} className="btn btn-left" onClick={() => void create(t.id === 'vuota' ? 'Nuova scheda' : t.label, t.days)}>
              <span className="grow">
                <span className="strong">{t.label}</span>
                <span className="muted">{t.days.join(' · ')}</span>
              </span>
              <Icon name="chev" />
            </button>
          ))}
        </Sheet>
      )}
    </Page>
  );
}
