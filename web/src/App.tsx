import { Route, Routes, useLocation } from 'react-router-dom';
import { auth } from './auth';
import { BottomNav } from './components/Layout';
import { LogoMark } from './components/Logo';
import { Exercises } from './pages/Exercises';
import { ExerciseDetail } from './pages/ExerciseDetail';
import { ExerciseForm } from './pages/ExerciseForm';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { More } from './pages/More';
import { RoutineDay } from './pages/RoutineDay';
import { RoutineDetail } from './pages/RoutineDetail';
import { Routines } from './pages/Routines';
import { Session } from './pages/Session';
import { SessionSummary } from './pages/SessionSummary';
import { Soon } from './pages/Soon';
import { Train } from './pages/Train';

export function App() {
  const { status } = auth.use();
  const inSession = useLocation().pathname.startsWith('/sessione/');

  if (status === 'checking') {
    return <div className="splash"><LogoMark size={96} /></div>;
  }
  if (status === 'out') return <Login />;

  return (
    <div className="app">
      <main className={inSession ? 'main-session' : undefined}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/schede" element={<Routines />} />
          <Route path="/schede/:id" element={<RoutineDetail />} />
          <Route path="/schede/:id/giorni/:dayId" element={<RoutineDay />} />
          <Route path="/allena" element={<Train />} />
          <Route path="/sessione/:id" element={<Session />} />
          <Route path="/sessione/:id/riepilogo" element={<SessionSummary />} />
          <Route path="/andamento" element={<Soon title="Andamento" icon="andamento" stage={4} text="Storico, progressi, record, calendario e bilanciamento." />} />
          <Route path="/altro" element={<More />} />
          <Route path="/esercizi" element={<Exercises />} />
          <Route path="/esercizi/nuovo" element={<ExerciseForm />} />
          <Route path="/esercizi/:id" element={<ExerciseDetail />} />
          <Route path="/esercizi/:id/modifica" element={<ExerciseForm />} />
          <Route path="*" element={<Soon title="Pagina non trovata" icon="disco" text="Questa pagina non esiste." />} />
        </Routes>
      </main>
      {!inSession && <BottomNav />}
    </div>
  );
}
