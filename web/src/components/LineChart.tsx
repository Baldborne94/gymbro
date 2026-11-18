import { useRef, useState } from 'react';
import { formatDate, num } from '../dates';

export interface ChartPoint { date: string; value: number }

const W = 340;
const H = 200;
const PAD = { top: 16, right: 16, bottom: 26, left: 44 };

/** Tacche "tonde" per l'asse verticale. */
function ticks(min: number, max: number): number[] {
  if (min === max) return [min];
  const raw = (max - min) / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/** Grafico a linea di una sola serie nel tempo, con valore al tocco. */
export function LineChart({ points, unit, label }: { points: ChartPoint[]; unit: string; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  if (!points.length) return <p className="muted">Ancora nessun dato.</p>;

  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || Math.max(1, hi * 0.1);
  const min = Math.max(0, lo - span * 0.15);
  const max = hi + span * 0.15;
  const x = (i: number) => (points.length === 1 ? (PAD.left + W - PAD.right) / 2 : PAD.left + (i / (points.length - 1)) * (W - PAD.left - PAD.right));
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const shown = hover ?? points.length - 1;
  const active = points[shown];

  function onMove(clientX: number) {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const px = ((clientX - box.left) / box.width) * W;
    let best = 0;
    points.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
    setHover(best);
  }

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-value">{num(Math.round(active.value * 10) / 10)} <small>{unit}</small></span>
        <span className="muted">{formatDate(active.date)}{hover === null ? ' · ultimo' : ''}</span>
      </figcaption>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${label}: da ${num(points[0].value)} a ${num(points[points.length - 1].value)} ${unit} in ${points.length} rilevazioni`}
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerDown={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        {ticks(min, max).map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="chart-tick">{num(t)}</text>
          </g>
        ))}
        <text x={PAD.left} y={H - 6} className="chart-tick">{formatDate(points[0].date, { day: 'numeric', month: 'short' })}</text>
        {points.length > 1 && (
          <text x={W - PAD.right} y={H - 6} textAnchor="end" className="chart-tick">
            {formatDate(points[points.length - 1].date, { day: 'numeric', month: 'short' })}
          </text>
        )}
        {hover !== null && <line x1={x(shown)} x2={x(shown)} y1={PAD.top} y2={H - PAD.bottom} className="chart-cross" />}
        <path d={path} className="chart-line" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={i === shown ? 6 : points.length > 24 ? 0 : 4} className="chart-dot" />
        ))}
      </svg>
    </figure>
  );
}
