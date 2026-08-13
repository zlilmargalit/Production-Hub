import { useState, useEffect } from 'react';
import { useT } from '../../i18n';

const PROVIDERS = [
  {
    id:    'gmail',
    nameKey: 'integration.gmail',
    color: '#EA4335',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M22 6C22 4.9 21.1 4 20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6ZM20 6L12 13L4 6H20ZM20 18H4V8L12 15L20 8V18Z" fill="currentColor"/>
      </svg>
    ),
  },
  {
    id:    'gcal',
    nameKey: 'integration.calendar',
    color: '#4285F4',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 3H18V1H16V3H8V1H6V3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM19 19H5V8H19V19ZM7 10H12V15H7V10Z" fill="currentColor"/>
      </svg>
    ),
  },
  {
    id:    'gdrive',
    nameKey: 'integration.drive',
    color: '#34A853',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7.71 3.5L1.15 15L4.58 21L11.13 9.5H7.71ZM9.73 13L6.3 19H19.42L22.85 13H9.73ZM14.28 3.5H7.71L14.28 15H20.85L14.28 3.5Z" fill="currentColor"/>
      </svg>
    ),
  },
];

export default function IntegrationsBar({ statuses, onRefresh }) {
  const { t, tx } = useT();
  const [open, setOpen]         = useState(false);
  const [busy, setBusy]         = useState(null); // provider id being disconnected
  const [toast, setToast]       = useState(null);

  // Show intg=ok/error toast from OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const intg   = params.get('intg');
    if (!intg) return;
    if (intg === 'ok')     { setToast(t('integration.connectedToast')); onRefresh(); }
    if (intg === 'error')  { setToast(t('integration.connectionFailed')); }
    if (intg === 'cancelled') { setToast(t('integration.cancelled')); }
    // Remove the query param from the URL without navigation
    const url = new URL(window.location);
    url.searchParams.delete('intg');
    window.history.replaceState({}, '', url.toString());
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [onRefresh]);

  const handleConnect = (provider) => {
    // Navigate to the OAuth connect endpoint
    window.location.href = `/api/automations/integrations/${provider}/connect`;
  };

  const handleDisconnect = async (provider) => {
    setBusy(provider);
    try {
      const res = await fetch(`/api/automations/integrations/${provider}`, { method: 'DELETE' });
      if (res.ok) {
        setToast(tx('integration.disconnected', { provider }));
        onRefresh();
      }
    } catch { setToast(t('integration.disconnectError')); }
    finally { setBusy(null); }
  };

  const connectedCount = PROVIDERS.filter((p) => statuses[p.id]).length;

  return (
    <>
      {toast && <div className="auto-toast">{toast}</div>}

      <div className="intg-bar">
        <div className="intg-bar-left">
          <span className="intg-bar-label">{t('integration.connected')}</span>
          <div className="intg-bar-icons">
            {PROVIDERS.map((p) => {
              const on = !!statuses[p.id];
              return (
                <button
                  key={p.id}
                  className={`intg-pip${on ? ' intg-pip--on' : ''}`}
                  style={on ? { color: p.color, borderColor: p.color + '44', background: p.color + '11' } : {}}
                  onClick={() => setOpen(true)}
                  title={on ? t('integration.connected') : t('integration.notConnected')}
                >
                  {on && <span className="intg-pip-dot" />}
                  <span style={{ width: 14, height: 14, display: 'flex' }}>{p.icon}</span>
                  <span className="intg-pip-name">{t(p.nameKey)}</span>
                </button>
              );
            })}
          </div>
        </div>
        <button className="intg-manage-btn" onClick={() => setOpen((o) => !o)}>
          {t('integration.manage')}
        </button>
      </div>

      {open && (
        <div className="intg-manage-panel">
          <div className="intg-manage-head">
            <span>{t('integration.title')}</span>
            <button className="intg-manage-close" onClick={() => setOpen(false)}>✕</button>
          </div>
          <div className="intg-manage-list">
            {PROVIDERS.map((p) => {
              const on = !!statuses[p.id];
              return (
                <div key={p.id} className="intg-manage-row">
                  <div
                    className="intg-icon--sm"
                    style={{ background: p.color + '18', color: p.color }}
                  >
                    {p.icon}
                  </div>
                  <span className="intg-manage-name">{t(p.nameKey)}</span>
                  {on ? (
                    <button
                      className="intg-btn intg-btn--on"
                      onClick={() => handleDisconnect(p.id)}
                      disabled={busy === p.id}
                    >
                      {busy === p.id ? t('integration.disconnecting') : t('integration.connectedAction')}
                    </button>
                  ) : (
                    <button className="intg-btn" onClick={() => handleConnect(p.id)}>
                      {t('integration.connect')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
