import { useEffect, useState } from 'react';

/** Stato che sopravvive al cambio di pagina (per ricerca e filtri). */
export function useSessionState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* spazio non disponibile */ }
  }, [key, value]);
  return [value, setValue] as const;
}
