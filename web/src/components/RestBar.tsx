import { clock } from '../dates';
import { extendRest, rest, skipRest, useNow } from '../timer';

/** Barra del recupero in fondo alla sessione. */
export function RestBar() {
  const state = rest.use();
  const now = useNow(250);
  const justRang = state.rangAt !== null && now - state.rangAt < 8000;
  if (!state.endsAt && !justRang) return null;

  if (!state.endsAt) {
    return (
      <div className="rest-bar rest-done" role="status">
        <div className="rest-time">VIA!</div>
        <div className="grow strong">Recupero finito</div>
        <button className="btn btn-small" onClick={skipRest}>OK</button>
      </div>
    );
  }
  const left = Math.max(0, Math.ceil((state.endsAt - now) / 1000));
  const progress = Math.min(1, Math.max(0, 1 - left / state.total));
  return (
    <div className="rest-bar" role="timer" aria-label="Recupero">
      <div>
        <div className="rest-label">Recupero</div>
        <div className="rest-time">{clock(left)}</div>
      </div>
      <div className="bar grow-bar"><div style={{ width: `${progress * 100}%` }} /></div>
      <button className="btn btn-small" onClick={() => extendRest(-15)} aria-label="Togli 15 secondi">−15</button>
      <button className="btn btn-small" onClick={() => extendRest(30)} aria-label="Aggiungi 30 secondi">+30</button>
      <button className="btn btn-small" onClick={skipRest}>Salta</button>
    </div>
  );
}
