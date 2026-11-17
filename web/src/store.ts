import { useSyncExternalStore } from 'react';

/** Piccolo contenitore di stato condiviso tra componenti e codice non React. */
export function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<T>) {
      state = { ...state, ...patch };
      listeners.forEach((l) => l());
    },
    use: () =>
      useSyncExternalStore(
        (l) => { listeners.add(l); return () => listeners.delete(l); },
        () => state,
      ),
  };
}
