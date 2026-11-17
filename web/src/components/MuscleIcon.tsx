import type { MuscleId } from '../../../shared/schema';

// Figura stilizzata vista di fronte o di spalle, con il gruppo muscolare acceso.
type Part =
  | 'spalle' | 'torace' | 'addome' | 'braccia' | 'avambracci' | 'cosce' | 'polpacci'
  | 'trapezi' | 'dorso' | 'glutei';

const MAP: Record<MuscleId, { back: boolean; part: Part }> = {
  petto: { back: false, part: 'torace' },
  addome: { back: false, part: 'addome' },
  spalle: { back: false, part: 'spalle' },
  bicipiti: { back: false, part: 'braccia' },
  avambracci: { back: false, part: 'avambracci' },
  quadricipiti: { back: false, part: 'cosce' },
  schiena: { back: true, part: 'dorso' },
  trapezi: { back: true, part: 'trapezi' },
  tricipiti: { back: true, part: 'braccia' },
  glutei: { back: true, part: 'glutei' },
  femorali: { back: true, part: 'cosce' },
  polpacci: { back: true, part: 'polpacci' },
};

export function MuscleIcon({ muscle, size = 32 }: { muscle: MuscleId; size?: number }) {
  const { back, part } = MAP[muscle] ?? MAP.petto;
  const c = (p: Part) => (p === part ? 'var(--accent)' : 'var(--figure)');
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="3.8" r="2.8" fill="var(--figure)" />
      {/* spalle */}
      <rect x="7.4" y="7.6" width="4.2" height="4.2" rx="2.1" fill={c('spalle')} />
      <rect x="20.4" y="7.6" width="4.2" height="4.2" rx="2.1" fill={c('spalle')} />
      {back ? (
        <>
          <path d="M12.4 7.4h7.2l-1.2 2.6h-4.8z" fill={c('trapezi')} />
          <path d="M12.2 10.6h7.6l-1 6.6h-5.6z" fill={c('dorso')} />
          <rect x="12.4" y="17.8" width="7.2" height="3.8" rx="1.6" fill={c('glutei')} />
        </>
      ) : (
        <>
          <rect x="12.2" y="7.6" width="3.5" height="5" rx="1.3" fill={c('torace')} />
          <rect x="16.3" y="7.6" width="3.5" height="5" rx="1.3" fill={c('torace')} />
          <rect x="13" y="13.4" width="6" height="6.6" rx="1.4" fill={c('addome')} />
        </>
      )}
      {/* braccia */}
      <rect x="7.7" y="12.4" width="3.2" height="5.6" rx="1.6" fill={c('braccia')} />
      <rect x="21.1" y="12.4" width="3.2" height="5.6" rx="1.6" fill={c('braccia')} />
      <rect x="6.9" y="18.6" width="2.9" height="5.6" rx="1.45" fill={c('avambracci')} />
      <rect x="22.2" y="18.6" width="2.9" height="5.6" rx="1.45" fill={c('avambracci')} />
      {/* gambe */}
      <rect x="11.9" y={back ? 22.2 : 20.8} width="3.8" height={back ? 5 : 6.4} rx="1.8" fill={c('cosce')} />
      <rect x="16.3" y={back ? 22.2 : 20.8} width="3.8" height={back ? 5 : 6.4} rx="1.8" fill={c('cosce')} />
      <rect x="12.3" y="27.8" width="3" height="4" rx="1.5" fill={c('polpacci')} />
      <rect x="16.7" y="27.8" width="3" height="4" rx="1.5" fill={c('polpacci')} />
    </svg>
  );
}
