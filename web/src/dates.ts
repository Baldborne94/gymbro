const pad = (n: number) => String(n).padStart(2, '0');

/** Data locale in formato AAAA-MM-GG. */
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (iso: string, days: number) => {
  const d = parseDate(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
};
export const daysBetween = (from: string, to: string) =>
  Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);

export const formatDate = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  parseDate(iso).toLocaleDateString('it-IT', opts);

export const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const WEEKDAYS_LONG = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

/** Secondi in formato m:ss. */
export const clock = (sec: number) => `${Math.floor(sec / 60)}:${pad(Math.round(sec) % 60)}`;
/** Numero con la virgola decimale. */
export const num = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 2 });

/** Lunedì della settimana che contiene la data. */
export const weekStart = (iso: string) => {
  const d = parseDate(iso);
  return addDays(iso, -((d.getDay() + 6) % 7));
};
export const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
