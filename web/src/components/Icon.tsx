import type { ReactNode } from 'react';

const P: Record<string, ReactNode> = {
  home: <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />,
  schede: <path d="M9 4h6v3H9zM7 5H5v15h14V5h-2M9 11h6M9 15h6" />,
  allena: <path d="M2 12h20M5 8v8M8 6v12M19 8v8M16 6v12" />,
  andamento: <path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6" />,
  altro: <path d="M5 7h14M5 12h14M5 17h14" />,
  search: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="M15 5l-7 7 7 7" />,
  chev: <path d="M9 5l7 7-7 7" />,
  check: <path d="M5 12l5 5 9-10" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />,
  trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  sync: <path d="M4 12a8 8 0 0 1 14-5l2 2M20 5v4h-4M20 12a8 8 0 0 1-14 5l-2-2M4 19v-4h4" />,
  offline: <path d="M3 3l18 18M7 18a4 4 0 0 1-1-7.9M9.5 6.3A6 6 0 0 1 18 10a4 4 0 0 1 2.5 6.5M7 18h10" />,
  logout: <path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9" />,
  strumenti: <path d="M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01" />,
  coach: <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />,
  bell: <path d="M6 17v-6a6 6 0 0 1 12 0v6l2 2H4zM10 21h4" />,
  dati: <path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3v12c0 1.7-3.6 3-8 3s-8-1.3-8-3zM4 6c0 1.7 3.6 3 8 3s8-1.3 8-3M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />,
  // Attrezzi
  bilanciere: <path d="M2 12h20M5 8v8M8 6v12M19 8v8M16 6v12" />,
  manubri: <path d="M8 12h8M5 8.5v7M8 7v10M19 8.5v7M16 7v10" />,
  kettlebell: <><path d="M9 9.5a3.2 3.2 0 1 1 6 0" /><circle cx="12" cy="15" r="5.5" /></>,
  macchina: <path d="M7 5h10v15H7zM7 10h10M7 15h10M12 2v3" />,
  cavi: <><circle cx="12" cy="5" r="2.5" /><path d="M12 7.5V15M9 15h6l1 5H8z" /></>,
  multipower: <path d="M5 3v18M19 3v18M3 11h18M8 9v4M16 9v4" />,
  corpo_libero: <><circle cx="12" cy="5" r="2" /><path d="M6 9l6 2 6-2M12 11v5M12 16l-3.5 5M12 16l3.5 5" /></>,
  elastici: <path d="M4 12c0-6 16-6 16 0s-16 6-16 0z" />,
  disco: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2" /></>,
};

export function Icon({ name, size = 24, label }: { name: string; size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {P[name] ?? P.disco}
    </svg>
  );
}
