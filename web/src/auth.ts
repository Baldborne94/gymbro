import { createStore } from './store';

interface AuthState {
  status: 'checking' | 'in' | 'out';
  features: { coach: boolean };
}

const FLAG = 'gb_auth';
const remembered = localStorage.getItem(FLAG) === '1';

export const auth = createStore<AuthState>({
  // Se l'accesso era già stato fatto l'app si apre subito, anche senza rete.
  status: remembered ? 'in' : 'checking',
  features: { coach: false },
});

function setStatus(status: 'in' | 'out') {
  if (status === 'in') localStorage.setItem(FLAG, '1');
  else localStorage.removeItem(FLAG);
  auth.set({ status });
}

export const markLoggedOut = () => setStatus('out');

export async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    const me = await res.json();
    auth.set({ features: me.features });
    setStatus(me.authenticated ? 'in' : 'out');
  } catch {
    // Server non raggiungibile: si resta nello stato ricordato.
    if (auth.get().status === 'checking') setStatus('out');
  }
}

export async function login(password: string): Promise<string | null> {
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) return (await res.json()).error ?? 'Accesso non riuscito';
    await checkAuth();
    return null;
  } catch {
    return 'Server non raggiungibile. Controlla la connessione.';
  }
}

export async function logout() {
  try { await fetch('/api/logout', { method: 'POST' }); } catch { /* offline: si esce comunque */ }
  setStatus('out');
}
