import { useState } from 'react';
import { Page } from '../components/Layout';
import { Stepper } from '../components/Stepper';
import { num } from '../dates';
import { setSetting, useSetting } from '../settings';

const ALL_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];
const BARS = [20, 15, 10, 7.5];

/** Dischi per lato, dal più pesante, per avvicinarsi il più possibile al peso richiesto. */
export function platesPerSide(target: number, bar: number, plates: number[]): { side: number[]; total: number } {
  let rest = Math.max(0, (target - bar) / 2);
  const side: number[] = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    while (rest >= p - 1e-9) {
      side.push(p);
      rest = Math.round((rest - p) * 1000) / 1000;
    }
  }
  return { side, total: bar + 2 * side.reduce((a, b) => a + b, 0) };
}

function PlateCalculator() {
  const [target, setTarget] = useState<number | null>(100);
  const bar = useSetting('plate_bar', 20);
  const plates = useSetting<number[]>('plate_set', [25, 20, 15, 10, 5, 2.5, 1.25]);
  const goal = target ?? 0;
  const { side, total } = platesPerSide(goal, bar, plates);
  const counts = side.reduce<[number, number][]>((acc, p) => {
    const last = acc[acc.length - 1];
    if (last && last[0] === p) last[1]++; else acc.push([p, 1]);
    return acc;
  }, []);
  const toggle = (p: number) => void setSetting('plate_set', plates.includes(p) ? plates.filter((x) => x !== p) : [...plates, p]);

  return (
    <div className="card">
      <h2>Dischi da caricare</h2>
      <Stepper big label="Peso totale" unit="kg sul bilanciere" value={target} step={2.5} min={0} max={500} onChange={setTarget} />

      <div className="barbell" role="img" aria-label={side.length ? `Per lato: ${side.map((p) => num(p)).join(', ')} kg` : 'Solo il bilanciere'}>
        <span className="bb-sleeve" />
        {[...side].reverse().map((p, i) => <span key={`l${i}`} className="bb-plate" style={{ height: `${34 + Math.sqrt(p) * 14}px`, width: `${p >= 10 ? 16 : p >= 5 ? 12 : 8}px` }} />)}
        <span className="bb-collar" />
        <span className="bb-bar" />
        <span className="bb-collar" />
        {side.map((p, i) => <span key={`r${i}`} className="bb-plate" style={{ height: `${34 + Math.sqrt(p) * 14}px`, width: `${p >= 10 ? 16 : p >= 5 ? 12 : 8}px` }} />)}
        <span className="bb-sleeve" />
      </div>

      {goal < bar ? (
        <p className="muted">Il peso è inferiore a quello del bilanciere ({num(bar)} kg).</p>
      ) : (
        <>
          <div className="plate-list">
            <span className="muted">Per lato</span>
            {counts.length === 0 && <span className="strong">nessun disco</span>}
            {counts.map(([p, n]) => <span key={p} className="plate-chip">{n > 1 && <small>{n} ×</small>} {num(p)}</span>)}
          </div>
          {Math.abs(total - goal) > 0.001 && (
            <p className="alert alert-soft">Con i dischi disponibili arrivi a {num(total)} kg, cioè {num(Math.round((goal - total) * 100) / 100)} kg in meno.</p>
          )}
        </>
      )}

      <div className="field">
        <span>Bilanciere</span>
        <div className="segmented">
          {BARS.map((b) => <button key={b} className={bar === b ? 'on' : ''} aria-pressed={bar === b} onClick={() => void setSetting('plate_bar', b)}>{num(b)} kg</button>)}
        </div>
      </div>
      <div className="field">
        <span>Dischi disponibili</span>
        <div className="chips chips-wrap">
          {ALL_PLATES.map((p) => <button key={p} className={`chip${plates.includes(p) ? ' on' : ''}`} aria-pressed={plates.includes(p)} onClick={() => toggle(p)}>{num(p)}</button>)}
        </div>
      </div>
    </div>
  );
}

function MaxCalculator() {
  const [load, setLoad] = useState<number | null>(80);
  const [reps, setReps] = useState<number | null>(8);
  const w = load ?? 0;
  const r = reps ?? 0;
  const epley = r <= 1 ? w : w * (1 + r / 30);
  const brzycki = r <= 1 ? w : r < 37 ? (w * 36) / (37 - r) : 0;
  const max = brzycki ? (epley + brzycki) / 2 : epley;
  const round = (v: number) => Math.round(v / 2.5) * 2.5;
  const table = [1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => ({ n, kg: n === 1 ? max : max / (1 + n / 30) }));

  return (
    <div className="card">
      <h2>Massimale</h2>
      <Stepper label="Carico sollevato" unit="kg" value={load} step={2.5} min={0} max={500} onChange={setLoad} />
      <Stepper label="Ripetizioni fatte" value={reps} min={1} max={30} onChange={setReps} />
      {w > 0 && r > 0 && (
        <>
          <div className="max-result">
            <span className="muted">Massimale stimato</span>
            <b>{num(Math.round(max * 10) / 10)} <small>kg</small></b>
            <span className="muted">Epley {num(Math.round(epley * 10) / 10)} · Brzycki {num(Math.round(brzycki * 10) / 10)}</span>
          </div>
          <table className="table">
            <thead><tr><th>Ripetizioni</th><th>Carico</th><th>% del massimale</th></tr></thead>
            <tbody>
              {table.map((t) => (
                <tr key={t.n}><td>{t.n}</td><td>{num(round(t.kg))} kg</td><td>{Math.round((t.kg / max) * 100)}%</td></tr>
              ))}
            </tbody>
          </table>
          {r > 12 && <p className="muted">Con più di 12 ripetizioni la stima è poco affidabile.</p>}
        </>
      )}
    </div>
  );
}

export function Tools() {
  return (
    <Page title="Strumenti" back="/altro">
      <PlateCalculator />
      <MaxCalculator />
    </Page>
  );
}
