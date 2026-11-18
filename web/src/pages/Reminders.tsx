import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { WEEKDAYS_LONG } from '../dates';
import { db } from '../db';
import { setSetting, useSetting } from '../settings';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(base64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64.length / 4) * 4, '='));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const post = (url: string, body?: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });

export function Reminders() {
  const enabled = useSetting('reminders_enabled', false);
  const time = useSetting('reminder_time', '18:00');
  const [device, setDevice] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const days = useLiveQuery(async () => {
    const routine = (await db.routines.where('status').equals('attiva').toArray()).find((r) => !r.deleted);
    if (!routine) return [];
    return (await db.routine_days.where('routine_id').equals(routine.id).toArray())
      .filter((d) => !d.deleted && d.weekday)
      .sort((a, b) => (a.weekday ?? 0) - (b.weekday ?? 0));
  }, []);

  useEffect(() => {
    if (!supported()) return setDevice(false);
    navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((s) => setDevice(Boolean(s))).catch(() => setDevice(false));
  }, []);

  async function subscribeDevice() {
    setBusy(true);
    setMessage(null);
    try {
      if ((await Notification.requestPermission()) !== 'granted') throw new Error('Hai negato il permesso per le notifiche: riattivalo dalle impostazioni del browser.');
      const { key } = await (await fetch('/api/push')).json();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
      const res = await post('/api/push/subscribe', sub.toJSON());
      if (!res.ok) throw new Error('Il server non ha accettato l’iscrizione.');
      setDevice(true);
      await setSetting('reminders_enabled', true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Attivazione non riuscita.');
    }
    setBusy(false);
  }

  async function unsubscribeDevice() {
    setBusy(true);
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (sub) {
        await post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setDevice(false);
    } catch {
      setMessage('Disattivazione non riuscita.');
    }
    setBusy(false);
  }

  async function test() {
    setMessage(null);
    try {
      const r = await (await post('/api/push/test')).json();
      setMessage(r.sent ? `Notifica inviata a ${r.sent} ${r.sent === 1 ? 'dispositivo' : 'dispositivi'}.` : 'Nessun dispositivo ha ricevuto la notifica.');
    } catch {
      setMessage('Server non raggiungibile.');
    }
  }

  return (
    <Page title="Promemoria" back="/altro">
      <label className="switch">
        <input type="checkbox" checked={enabled} onChange={(e) => void setSetting('reminders_enabled', e.target.checked)} />
        <span className="grow">
          <span className="strong">Promemoria nei giorni di allenamento</span>
          <span className="muted">Una notifica all'ora scelta, solo se non ti sei ancora allenato</span>
        </span>
      </label>

      <div className="card">
        <label className="inline-field">
          <span>Orario</span>
          <input type="time" value={time} onChange={(e) => e.target.value && void setSetting('reminder_time', e.target.value)} />
        </label>
        <div>
          <div className="strong">Giorni previsti</div>
          {days && days.length > 0 ? (
            <p className="muted">{days.map((d) => `${WEEKDAYS_LONG[(d.weekday ?? 1) - 1]} (${d.name})`).join(', ')}</p>
          ) : (
            <p className="muted">Nessun giorno impostato: apri un giorno della <Link to="/schede" className="link">scheda attiva</Link> e scegli il giorno della settimana.</p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="row">
          <div className={`tile${device ? '' : ' tile-muted'}`}><Icon name="bell" size={26} /></div>
          <div className="grow">
            <div className="strong">{device ? 'Questo dispositivo riceve le notifiche' : 'Questo dispositivo non riceve le notifiche'}</div>
            <div className="muted">Ogni telefono o computer va attivato una volta.</div>
          </div>
        </div>
        {!supported() ? (
          <p className="alert alert-soft"><Icon name="alert" size={20} /> Le notifiche richiedono HTTPS e, su iPhone, l'app installata nella schermata Home.</p>
        ) : device ? (
          <div className="actions">
            <button className="btn" onClick={() => void test()}>Invia una prova</button>
            <button className="btn btn-ghost" onClick={() => void unsubscribeDevice()} disabled={busy}>Disattiva qui</button>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={() => void subscribeDevice()} disabled={busy || device === null}>Attiva su questo dispositivo</button>
        )}
        {message && <p className="muted" role="status">{message}</p>}
      </div>
    </Page>
  );
}
