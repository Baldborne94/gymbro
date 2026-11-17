import { useEffect, useState } from 'react';
import { num } from '../dates';

interface Props {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  /** Se vero il valore può restare vuoto ("nessun carico previsto"). */
  nullable?: boolean;
  /** Formato di sola lettura (es. m:ss): disattiva la scrittura diretta. */
  format?: (value: number) => string;
}

/** Riga con pulsanti −/+ grandi e valore modificabile anche da tastiera. */
export function Stepper({ label, value, onChange, step = 1, min = 0, max = 9999, unit, nullable, format }: Props) {
  const show = (v: number | null) => (v === null ? '' : format ? format(v) : num(v));
  const [text, setText] = useState(show(value));
  useEffect(() => setText(show(value)), [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  const bump = (dir: 1 | -1) => {
    if (value === null) return onChange(clamp(dir === 1 ? Math.max(step, min) : min));
    const next = clamp(value + dir * step);
    onChange(nullable && dir === -1 && value === min ? null : next);
  };
  const commit = () => {
    if (text.trim() === '') return nullable ? onChange(null) : setText(show(value));
    const n = Number(text.replace(',', '.'));
    if (Number.isFinite(n)) onChange(clamp(n));
    else setText(show(value));
  };

  return (
    <div className="stepper">
      <div className="stepper-label">
        {label}
        {unit && <span className="muted"> · {unit}</span>}
      </div>
      <button type="button" className="step-btn" aria-label={`Diminuisci ${label}`} onClick={() => bump(-1)}>−</button>
      <input
        className="step-value"
        aria-label={label}
        inputMode={min < 0 ? 'text' : 'decimal'}
        readOnly={Boolean(format)}
        placeholder="—"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onFocus={(e) => !format && e.target.select()}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      <button type="button" className="step-btn" aria-label={`Aumenta ${label}`} onClick={() => bump(1)}>+</button>
    </div>
  );
}
