import { useState, type FormEvent } from 'react';
import { login } from '../auth';
import { Logo } from '../components/Logo';
import { syncNow } from '../sync';

export function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const err = await login(password);
    setBusy(false);
    setError(err);
    if (!err) void syncNow();
  }

  return (
    <div className="login">
      <Logo size={56} />
      <p className="login-tag">Carica il bilanciere. Al resto penso io.</p>
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy || !password}>
          {busy ? 'Accesso…' : 'Entra'}
        </button>
      </form>
    </div>
  );
}
