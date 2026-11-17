import { Link } from 'react-router-dom';
import { auth, logout } from '../auth';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { syncNow, syncState } from '../sync';

const time = (ms: number) => new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

function SyncCard() {
  const s = syncState.use();
  const text =
    s.status === 'syncing' ? 'Sincronizzazione in corso…'
    : s.status === 'offline' ? 'Server non raggiungibile'
    : s.status === 'error' ? 'Errore di sincronizzazione'
    : s.lastSync ? `Sincronizzato alle ${time(s.lastSync)}` : 'In attesa di sincronizzazione';
  return (
    <div className="card row">
      <div className={`tile${s.status === 'offline' || s.status === 'error' ? ' tile-warn' : ''}`}>
        <Icon name={s.status === 'offline' ? 'offline' : 'sync'} size={26} />
      </div>
      <div className="grow">
        <div className="strong">{text}</div>
        <div className="muted">
          {s.pending > 0
            ? `${s.pending} ${s.pending === 1 ? 'modifica salvata' : 'modifiche salvate'} sul dispositivo, in attesa di invio`
            : 'Tutti i dati sono al sicuro sul server'}
        </div>
      </div>
      <button className="btn btn-small" onClick={() => void syncNow()} disabled={s.status === 'syncing'}>Riprova</button>
    </div>
  );
}

export function More() {
  const { features } = auth.use();
  const soon = [
    { icon: 'strumenti', label: 'Strumenti', note: 'Calcolatore dischi e massimale · tappa 5' },
    ...(features.coach ? [{ icon: 'coach', label: 'Coach AI', note: 'Tappa 6' }] : []),
    { icon: 'bell', label: 'Promemoria', note: 'Tappa 6' },
    { icon: 'dati', label: 'Dati e backup', note: 'Tappa 6' },
  ];
  return (
    <Page title="Altro">
      <div className="list">
        <Link to="/esercizi" className="list-row">
          <div className="tile"><Icon name="bilanciere" size={26} /></div>
          <div className="grow strong">Libreria esercizi</div>
          <Icon name="chev" />
        </Link>
        {soon.map((x) => (
          <div key={x.label} className="list-row disabled">
            <div className="tile"><Icon name={x.icon} size={26} /></div>
            <div className="grow">
              <div className="strong">{x.label}</div>
              <div className="muted">{x.note}</div>
            </div>
          </div>
        ))}
      </div>
      <h2 className="section">Sincronizzazione</h2>
      <SyncCard />
      <button className="btn btn-ghost" onClick={() => void logout()}>
        <Icon name="logout" size={20} /> Esci
      </button>
    </Page>
  );
}
