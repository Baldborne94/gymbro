import { useEffect, useState } from 'react';
import { createStore } from './store';

interface RestState {
  /** Momento in cui finisce il recupero (ms), o null se non è in corso. */
  endsAt: number | null;
  total: number;
  /** Momento in cui è suonato l'avviso, per mostrare "Recupero finito". */
  rangAt: number | null;
}

const KEY = 'gb_rest';
function load(): RestState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as RestState | null;
    if (saved?.endsAt && saved.endsAt > Date.now()) return { ...saved, rangAt: null };
  } catch { /* stato non leggibile: si riparte da zero */ }
  return { endsAt: null, total: 0, rangAt: null };
}

export const rest = createStore<RestState>(load());

let alarm: ReturnType<typeof setTimeout> | undefined;
function schedule() {
  clearTimeout(alarm);
  const { endsAt } = rest.get();
  localStorage.setItem(KEY, JSON.stringify(rest.get()));
  if (endsAt) alarm = setTimeout(ring, Math.max(0, endsAt - Date.now()));
}

function ring() {
  if (!rest.get().endsAt) return;
  rest.set({ endsAt: null, rangAt: Date.now() });
  schedule();
  beep();
  navigator.vibrate?.([300, 120, 300, 120, 500]);
}

export function startRest(seconds: number) {
  if (seconds <= 0) return skipRest();
  rest.set({ endsAt: Date.now() + seconds * 1000, total: seconds, rangAt: null });
  schedule();
}
export function extendRest(seconds: number) {
  const { endsAt, total } = rest.get();
  if (!endsAt) { if (seconds > 0) startRest(seconds); return; }
  rest.set({ endsAt: endsAt + seconds * 1000, total: Math.max(1, total + seconds) });
  schedule();
}
export function skipRest() {
  rest.set({ endsAt: null, rangAt: null });
  schedule();
}

// Con la pagina in secondo piano i timer rallentano: al ritorno si controlla se il recupero è finito.
document.addEventListener('visibilitychange', () => {
  const { endsAt } = rest.get();
  if (document.visibilityState === 'visible' && endsAt && endsAt <= Date.now()) ring();
});
schedule();

// --- Suono ---
let audio: AudioContext | undefined;

/** Da chiamare dentro un tocco dell'utente: i browser non fanno suonare nulla prima. */
export function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch { /* audio non disponibile */ }
}

function beep() {
  if (!audio) return;
  const t0 = audio.currentTime;
  [0, 0.28, 0.56].forEach((offset, i) => {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    osc.type = 'square';
    osc.frequency.value = i === 2 ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, t0 + offset);
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + (i === 2 ? 0.45 : 0.2));
    osc.connect(gain).connect(audio!.destination);
    osc.start(t0 + offset);
    osc.stop(t0 + offset + 0.5);
  });
}

// --- Ganci React ---

/** Ora corrente, aggiornata a intervalli regolari. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Tiene lo schermo acceso finché il componente è montato (dove il browser lo consente). */
export function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const acquire = async () => {
      if (gone || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
      try { lock = await navigator.wakeLock.request('screen'); } catch { /* negato o non disponibile */ }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release();
    };
  }, []);
}
