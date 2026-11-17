import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';

const TABS = [
  { to: '/', icon: 'home', label: 'Oggi' },
  { to: '/schede', icon: 'schede', label: 'Schede' },
  { to: '/allena', icon: 'allena', label: 'Allena', main: true },
  { to: '/andamento', icon: 'andamento', label: 'Andamento' },
  { to: '/altro', icon: 'altro', label: 'Altro' },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Sezioni">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => `tab${t.main ? ' tab-main' : ''}${isActive ? ' active' : ''}`}>
          <span className="tab-icon"><Icon name={t.icon} size={t.main ? 30 : 24} /></span>
          <span className="tab-label">{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/** Intestazione di pagina: titolo grande, freccia indietro e azione facoltative. */
export function Page({ title, back, action, children }: { title: ReactNode; back?: boolean | string; action?: ReactNode; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="page">
      <header className="page-head">
        {back && (
          <button className="icon-btn" aria-label="Indietro" onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}>
            <Icon name="back" />
          </button>
        )}
        <h1>{title}</h1>
        {action && <div className="page-action">{action}</div>}
      </header>
      {children}
    </div>
  );
}

/** Pannello dal basso per conferme e scelte rapide. */
export function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
