import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { LineChart } from '../components/LineChart';
import { formatDate, num } from '../dates';
import { RECORD_LABEL, exerciseProgress, findRecords, loadOverview, recordValue, weightUnit } from '../stats';
import { formatSet } from '../workout';

type Metric = 'maxLoad' | 'volume' | 'e1rm';

export function ExerciseProgress() {
  const { id = '' } = useParams();
  const data = useLiveQuery(loadOverview, []);
  const [metric, setMetric] = useState<Metric>('maxLoad');
  const ex = data?.exercises.get(id);
  const points = useMemo(() => (data ? exerciseProgress(data, id) : []), [data, id]);
  const records = useMemo(() => findRecords(points.flatMap((p) => p.sets), ex), [points, ex]);

  if (!data) return <Page title="" back>{null}</Page>;
  if (!ex) return <Page title="Progressi" back><div className="empty"><p>Esercizio non trovato.</p></div></Page>;

  const unit = weightUnit(ex);
  const metrics: { id: Metric; label: string; unit: string }[] =
    ex.kind === 'tempo' ? [{ id: 'maxLoad', label: 'Durata massima', unit: 's' }, { id: 'volume', label: 'Tempo totale', unit: 's' }]
    : ex.kind === 'corpo_libero' ? [{ id: 'maxLoad', label: 'Ripetizioni massime', unit: 'rip' }, { id: 'volume', label: 'Ripetizioni totali', unit: 'rip' }]
    : [{ id: 'maxLoad', label: 'Carico massimo', unit }, { id: 'volume', label: 'Volume', unit: 'kg' }, { id: 'e1rm', label: 'Massimale stimato', unit }];
  const current = metrics.find((m) => m.id === metric) ?? metrics[0];
  const recordList = points.flatMap((p) => p.sets.filter((s) => records.has(s.id)).map((s) => ({ s, date: p.date }))).reverse();

  return (
    <Page title={ex.name} back>
      {points.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><Icon name="andamento" size={44} /></div>
          <p>Nessuna sessione registrata con questo esercizio.</p>
        </div>
      ) : (
        <>
          <div className="segmented">
            {metrics.map((m) => (
              <button key={m.id} className={current.id === m.id ? 'on' : ''} aria-pressed={current.id === m.id} onClick={() => setMetric(m.id)}>{m.label}</button>
            ))}
          </div>
          <div className="card">
            <LineChart points={points.map((p) => ({ date: p.date, value: p[current.id] }))} unit={current.unit} label={current.label} />
            {current.id === 'e1rm' && <p className="muted">Stima con la formula di Epley dalla serie migliore di ogni sessione.</p>}
          </div>

          {recordList.length > 0 && (
            <section className="stack-s">
              <h2 className="section">Record personali</h2>
              <div className="list">
                {recordList.slice(0, 5).map(({ s, date }) => (
                  <div key={s.id} className="list-row">
                    <div className="tile tile-record"><Icon name="trophy" size={28} /></div>
                    <div className="grow">
                      <div className="summary">{recordValue(s, records.get(s.id)!, ex)}</div>
                      <div className="muted">{RECORD_LABEL[records.get(s.id)!]} · {formatDate(date)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <h2 className="section">Sessioni</h2>
          <div className="list">
            {[...points].reverse().map((p) => (
              <Link key={p.workoutId} to={`/andamento/sessione/${p.workoutId}`} className="list-row">
                <div className="grow">
                  <div className="strong">{formatDate(p.date)}</div>
                  <div className="summary-sets">{p.sets.map((s) => formatSet(s, ex)).join(' · ')}</div>
                  {ex.kind === 'pesi' && <div className="muted">Volume {num(Math.round(p.volume))} kg</div>}
                </div>
                <Icon name="chev" />
              </Link>
            ))}
          </div>
        </>
      )}
    </Page>
  );
}
