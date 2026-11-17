import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';

export function Soon({ title, icon, text, stage }: { title: string; icon: string; text: string; stage?: number }) {
  return (
    <Page title={title}>
      <div className="empty">
        <div className="empty-icon"><Icon name={icon} size={44} /></div>
        <p>{text}</p>
        {stage && <span className="badge">In arrivo con la tappa {stage}</span>}
      </div>
    </Page>
  );
}
