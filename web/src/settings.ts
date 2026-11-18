import { useLiveQuery } from 'dexie-react-hooks';
import { db, save } from './db';

/** Impostazione sincronizzata tra i dispositivi, con valore predefinito. */
export function useSetting<T>(key: string, fallback: T): T {
  const row = useLiveQuery(() => db.settings.get(key), [key]);
  return row && !row.deleted && row.value !== null && row.value !== undefined ? (row.value as T) : fallback;
}

export const setSetting = (key: string, value: unknown) => save('settings', { id: key, value });

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row && !row.deleted && row.value !== null && row.value !== undefined ? (row.value as T) : fallback;
}
