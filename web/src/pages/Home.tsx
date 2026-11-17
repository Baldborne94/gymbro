import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { db } from '../db';

export function Home() {
  const count = useLiveQuery(() => db.exercises.filter((e) => !e.deleted).count(), []);
  return (
    <div className="page">
      <header className="home-head"><Logo size={40} /></header>
      <Link to="/esercizi" className="card card-link">
        <div className="tile"><Icon name="bilanciere" size={30} /></div>
        <div className="grow">
          <div className="big-number">{count ?? '–'}</div>
          <div className="muted">esercizi in libreria</div>
        </div>
        <Icon name="chev" />
      </Link>
      <div className="card">
        <h2>Prossimamente qui</h2>
        <p className="muted">
          Prossimo allenamento, ultima sessione, andamento della settimana e ultimi record
          compariranno in questa schermata con le prossime tappe.
        </p>
      </div>
    </div>
  );
}
