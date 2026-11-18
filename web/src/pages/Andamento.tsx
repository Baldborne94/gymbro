import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MUSCLES, muscleLabel } from '../../../shared/schema';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { MuscleIcon } from '../components/MuscleIcon';
import { Stepper } from '../components/Stepper';
import { MONTHS, WEEKDAYS, addDays, formatDate, isoDate, num, parseDate, weekStart } from '../dates';
import { setSetting, useSetting } from '../settings';
import {
  RECORD_LABEL, activityDates, allRecords, exerciseProgress, loadOverview, muscleSets, recordValue, sessionsByWeek, weekStreak,
  type Overview, type WorkoutSummary,
} from '../stats';
import { formatDuration, formatSet } from '../workout';
import { BodyView } from './Body';
import { CardioRow } from './Cardio';

const VIEWS = [
  { id: 'storico', label: 'Storico' },
  { id: 'progressi', label: 'Progressi' },
  { id: 'calendario', label: 'Calendario' },
  { id: 'bilanciamento', label: 'Muscoli' },
  { id: 'corpo', label: 'Corpo' },
];

export function WorkoutRow({ w }: { w: WorkoutSummary }) {
  const d = parseDate(w.workout.date);
  return (
    <Link to={`/andamento/sessione/${w.workout.id}`} className="list-row">
      <div className="tile date-tile">
        <b>{d.getDate()}</b>
        <span>{WEEKDAYS[(d.getDay() + 6) % 7]}</span>
      </div>
      <div className="grow">
        <div className="ex-name">{w.workout.name}</div>
        <div className="muted">
          {formatDuration(w.duration)} · {num(Math.round(w.volume))} kg · {w.sets.length} serie
        </div>
      </div>
      <Icon name="chev" />
    </Link>
  );
}

function History({ data }: { data: Overview }) {
  type Entry = { key: string; date: string; at: number; node: React.ReactNode };
  const entries: Entry[] = [
    ...data.workouts.map((w) => ({ key: w.workout.id, date: w.workout.date, at: w.workout.started_at, node: <WorkoutRow w={w} /> })),
    ...data.cardio.map((c) => ({ key: c.id, date: c.date, at: c.started_at, node: <CardioRow c={c} /> })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
  if (!entries.length) {
    return (
      <div className="empty">
        <div className="empty-icon"><Icon name="andamento" size={44} /></div>
        <p>Qui compariranno le sessioni concluse, pesi e cardio.</p>
      </div>
    );
  }
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = e.date.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return (
    <>
      {[...groups].map(([month, list]) => (
        <section key={month} className="stack-s">
          <h2 className="section">
            {MONTHS[Number(month.slice(5)) - 1]} {month.slice(0, 4)} · {list.length} {list.length === 1 ? 'sessione' : 'sessioni'}
          </h2>
          <div className="list">{list.map((e) => <div key={e.key} className="contents">{e.node}</div>)}</div>
        </section>
      ))}
    </>
  );
}

function Progress({ data }: { data: Overview }) {
  const records = useMemo(() => allRecords(data), [data]);
  const rows = useMemo(() => {
    const ids = new Set(data.workouts.flatMap((w) => w.sets.map((s) => s.exercise_id)));
    return [...ids]
      .map((id) => ({ ex: data.exercises.get(id), points: exerciseProgress(data, id) }))
      .filter((r) => r.ex && r.points.length)
      .sort((a, b) => b.points[b.points.length - 1].date.localeCompare(a.points[a.points.length - 1].date));
  }, [data]);

  if (!rows.length) {
    return (
      <div className="empty">
        <div className="empty-icon"><Icon name="andamento" size={44} /></div>
        <p>Dopo la prima sessione vedrai qui grafici e record di ogni esercizio.</p>
      </div>
    );
  }
  return (
    <>
      {records.length > 0 && (
        <section className="stack-s">
          <h2 className="section">Ultimi record</h2>
          <div className="list">
            {records.slice(0, 3).map((r) => (
              <Link key={r.set.id} to={`/andamento/esercizio/${r.exercise.id}`} className="list-row">
                <div className="tile tile-record"><Icon name="trophy" size={28} /></div>
                <div className="grow">
                  <div className="ex-name">{r.exercise.name}</div>
                  <div className="summary">{recordValue(r.set, r.kind, r.exercise)}</div>
                  <div className="muted">{RECORD_LABEL[r.kind]} · {r.date ? formatDate(r.date) : ''}</div>
                </div>
                <Icon name="chev" />
              </Link>
            ))}
          </div>
        </section>
      )}
      <h2 className="section">Esercizi</h2>
      <div className="list">
        {rows.map(({ ex, points }) => {
          const last = points[points.length - 1];
          return (
            <Link key={ex!.id} to={`/andamento/esercizio/${ex!.id}`} className="list-row">
              <div className="tile"><MuscleIcon muscle={ex!.muscle} size={36} /></div>
              <div className="grow">
                <div className="ex-name">{ex!.name}</div>
                <div className="muted">
                  Migliore ultima volta: {formatSet(last.best, ex)} · {points.length} {points.length === 1 ? 'sessione' : 'sessioni'}
                </div>
              </div>
              <Icon name="chev" />
            </Link>
          );
        })}
      </div>
    </>
  );
}

function Calendar({ data }: { data: Overview }) {
  const today = isoDate();
  const goal = useSetting('weekly_goal', 3);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const dates = useMemo(() => activityDates(data), [data]);
  const perDay = useMemo(() => {
    const m = new Map<string, WorkoutSummary[]>();
    for (const w of data.workouts) m.set(w.workout.date, [...(m.get(w.workout.date) ?? []), w]);
    return m;
  }, [data]);
  const cardioDay = useMemo(() => {
    const m = new Map<string, typeof data.cardio>();
    for (const c of data.cardio) m.set(c.date, [...(m.get(c.date) ?? []), c]);
    return m;
  }, [data]);
  const weeks = sessionsByWeek(dates);
  const thisWeek = weeks.get(weekStart(today)) ?? 0;
  const streak = weekStreak(dates, goal, today);

  const first = `${month}-01`;
  const rows: string[][] = [];
  for (let start = weekStart(first); start.slice(0, 7) <= month; start = addDays(start, 7)) {
    rows.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  const shift = (delta: number) => {
    const d = parseDate(first);
    d.setMonth(d.getMonth() + delta);
    setMonth(isoDate(d).slice(0, 7));
    setSelected(null);
  };
  const monthCount = dates.filter((d) => d.startsWith(month)).length;

  return (
    <>
      <dl className="facts">
        <div><dt>Questa settimana</dt><dd className={thisWeek >= goal ? 'hit' : ''}>{thisWeek} <small>di {goal}</small></dd></div>
        <div><dt>Settimane di fila</dt><dd className={streak > 0 ? 'hit' : ''}>{streak}</dd></div>
      </dl>
      <div className="card">
        <Stepper label="Obiettivo" unit="sessioni a settimana" value={goal} min={1} max={14} onChange={(v) => void setSetting('weekly_goal', v ?? 3)} />
      </div>

      <div className="card">
        <div className="row">
          <button className="icon-btn" aria-label="Mese precedente" onClick={() => shift(-1)}><Icon name="back" /></button>
          <div className="grow center">
            <div className="cal-month">{MONTHS[Number(month.slice(5)) - 1]} {month.slice(0, 4)}</div>
            <div className="muted">{monthCount} {monthCount === 1 ? 'sessione' : 'sessioni'}</div>
          </div>
          <button className="icon-btn" aria-label="Mese successivo" onClick={() => shift(1)} disabled={month >= today.slice(0, 7)}><Icon name="chev" /></button>
        </div>
        <div className="cal" role="grid" aria-label="Giorni di allenamento">
          {WEEKDAYS.map((w) => <div key={w} className="cal-head">{w}</div>)}
          <div className="cal-head" title="Sessioni nella settimana">Σ</div>
          {rows.map((week) => {
            const n = weeks.get(week[0]) ?? 0;
            return [
              ...week.map((d) => {
                const lifts = perDay.get(d)?.length ?? 0;
                const cardio = cardioDay.get(d)?.length ?? 0;
                const count = lifts + cardio;
                const cls = `cal-day${d.slice(0, 7) !== month ? ' out' : ''}${lifts ? ' trained' : cardio ? ' cardio' : ''}${d === today ? ' today' : ''}${d === selected ? ' selected' : ''}`;
                return (
                  <button key={d} className={cls} disabled={!count} onClick={() => setSelected(d === selected ? null : d)}
                    aria-label={`${formatDate(d)}${count ? `, ${count} ${count === 1 ? 'sessione' : 'sessioni'}` : ''}`}>
                    {Number(d.slice(8))}
                  </button>
                );
              }),
              <div key={`n${week[0]}`} className={`cal-week${n >= goal ? ' hit' : ''}`} aria-label={`${n} sessioni nella settimana`}>{n || '·'}</div>,
            ];
          })}
        </div>
        <div className="legend">
          <span><i className="cal-day trained" /> Pesi</span>
          <span><i className="cal-day cardio" /> Solo cardio</span>
          <span><b>Σ</b> sessioni nella settimana</span>
        </div>
      </div>
      {selected && (
        <div className="list">
          {(perDay.get(selected) ?? []).map((w) => <WorkoutRow key={w.workout.id} w={w} />)}
          {(cardioDay.get(selected) ?? []).map((c) => <CardioRow key={c.id} c={c} />)}
        </div>
      )}
    </>
  );
}

function Balance({ data }: { data: Overview }) {
  const [week, setWeek] = useState(weekStart(isoDate()));
  const sets = useMemo(() => muscleSets(data, week), [data, week]);
  const max = Math.max(1, ...sets.values());
  const current = week === weekStart(isoDate());
  const total = [...sets.values()].reduce((a, b) => a + b, 0);
  const neglected = MUSCLES.filter((m) => !sets.get(m.id));
  return (
    <>
      <div className="card">
        <div className="row">
          <button className="icon-btn" aria-label="Settimana precedente" onClick={() => setWeek(addDays(week, -7))}><Icon name="back" /></button>
          <div className="grow center">
            <div className="cal-month">{current ? 'Questa settimana' : `Dal ${formatDate(week, { day: 'numeric', month: 'short' })}`}</div>
            <div className="muted">{formatDate(week, { day: 'numeric', month: 'short' })} – {formatDate(addDays(week, 6), { day: 'numeric', month: 'short' })}</div>
          </div>
          <button className="icon-btn" aria-label="Settimana successiva" onClick={() => setWeek(addDays(week, 7))} disabled={current}><Icon name="chev" /></button>
        </div>
        <div className="bars">
          {MUSCLES.map((m) => {
            const n = sets.get(m.id) ?? 0;
            return (
              <div key={m.id} className={`bar-row${n ? '' : ' zero'}`}>
                <MuscleIcon muscle={m.id} size={28} />
                <span className="bar-label">{m.label}</span>
                <span className="bar-track"><span className="bar-fill" style={{ width: `${(n / max) * 100}%` }} /></span>
                <span className="bar-value">{num(n)}</span>
              </div>
            );
          })}
        </div>
        <p className="muted">Serie allenanti per gruppo muscolare: una per il muscolo principale, mezza per quelli secondari. Riscaldamento escluso.</p>
      </div>
      {total > 0 && neglected.length > 0 && (
        <p className="alert alert-soft"><Icon name="alert" size={20} /> Non allenati questa settimana: {neglected.map((m) => muscleLabel(m.id).toLowerCase()).join(', ')}.</p>
      )}
    </>
  );
}

export function Andamento() {
  const [params, setParams] = useSearchParams();
  const view = VIEWS.some((v) => v.id === params.get('v')) ? params.get('v')! : 'storico';
  const data = useLiveQuery(loadOverview, []);
  return (
    <Page title="Andamento">
      <div className="chips" role="tablist">
        {VIEWS.map((v) => (
          <button key={v.id} role="tab" aria-selected={view === v.id} className={`chip chip-tab${view === v.id ? ' on' : ''}`} onClick={() => setParams({ v: v.id }, { replace: true })}>
            {v.label}
          </button>
        ))}
      </div>
      {data && view === 'storico' && <History data={data} />}
      {data && view === 'progressi' && <Progress data={data} />}
      {data && view === 'calendario' && <Calendar data={data} />}
      {data && view === 'bilanciamento' && <Balance data={data} />}
      {view === 'corpo' && <BodyView />}
    </Page>
  );
}
