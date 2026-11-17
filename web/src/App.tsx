import { Route, Routes } from 'react-router-dom';
import { auth } from './auth';
import { BottomNav } from './components/Layout';
import { LogoMark } from './components/Logo';
import { Exercises } from './pages/Exercises';
import { ExerciseDetail } from './pages/ExerciseDetail';
import { ExerciseForm } from './pages/ExerciseForm';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { More } from './pages/More';
import { Soon } from './pages/Soon';

export function App() {
  const { status } = auth.use();

  if (status === 'checking') {
    return <div className="splash"><LogoMark size={96} /></div>;
  }
  if (status === 'out') return <Login />;

  return (
    <div className="app">
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/schede" element={<Soon title="Schede" icon="schede" stage={2} text="Routine, giorni, superset e cicli di allenamento." />} />
          <Route path="/allena" element={<Soon title="Allena" icon="allena" stage={3} text="Sessione di allenamento, timer di recupero e uso offline." />} />
          <Route path="/andamento" element={<Soon title="Andamento" icon="andamento" stage={4} text="Storico, progressi, record, calendario e bilanciamento." />} />
          <Route path="/altro" element={<More />} />
          <Route path="/esercizi" element={<Exercises />} />
          <Route path="/esercizi/nuovo" element={<ExerciseForm />} />
          <Route path="/esercizi/:id" element={<ExerciseDetail />} />
          <Route path="/esercizi/:id/modifica" element={<ExerciseForm />} />
          <Route path="*" element={<Soon title="Pagina non trovata" icon="disco" text="Questa pagina non esiste." />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}
