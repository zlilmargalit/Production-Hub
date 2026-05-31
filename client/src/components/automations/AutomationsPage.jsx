import { useState, useEffect, useCallback } from 'react';
import IntegrationsBar from './IntegrationsBar';
import RecipeCards     from './RecipeCards';
import AutomationBuilder from './AutomationBuilder';
import AutomationList  from './AutomationList';
import { subscribeToPush } from '../../utils/pushSubscribe';
import './automations.css';

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AutomationsPage() {
  const [integrations,  setIntegrations]  = useState({ gmail: false, gcal: false, gdrive: false });
  const [automations,   setAutomations]   = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [pushState,     setPushState]     = useState('idle'); // 'idle'|'subscribing'|'granted'|'error'
  const [pushError,     setPushError]     = useState(null);

  // Derived stats for the hero sub-line
  const activeCount = automations.filter((a) => a.active).length;
  const totalCount  = automations.length;

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch('/api/automations/integrations');
      if (res.ok) setIntegrations(await res.json());
    } catch { /* non-fatal */ }
  }, []);

  const fetchAutomations = useCallback(async () => {
    try {
      const res = await fetch('/api/automations');
      if (res.ok) setAutomations(await res.json());
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([fetchIntegrations(), fetchAutomations()]);
      setLoading(false);
    })();
    // Determine current push permission state.
    // If already granted, silently re-subscribe so this server has the endpoint saved.
    // subscribeToPush() is idempotent — pushManager.subscribe() returns the existing
    // subscription without prompting; we just make sure the server record is current.
    if ('Notification' in window && Notification.permission === 'granted') {
      setPushState('granted');
      subscribeToPush().catch(() => { /* non-fatal — user can tap Enable manually */ });
    }
  }, [fetchIntegrations, fetchAutomations]);

  const handleCreateAutomation = async (data) => {
    const res = await fetch('/api/automations', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || 'Failed to create automation');
    }
    const created = await res.json();
    setAutomations((prev) => [created, ...prev]);
    return created;
  };

  const handleToggle = async (id, active) => {
    const res = await fetch(`/api/automations/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ active }),
    });
    if (res.ok) {
      const updated = await res.json();
      setAutomations((prev) => prev.map((a) => (a.id === id ? updated : a)));
    }
  };

  const handleDelete = async (id) => {
    const res = await fetch(`/api/automations/${id}`, { method: 'DELETE' });
    if (res.ok) setAutomations((prev) => prev.filter((a) => a.id !== id));
  };

  const handleEnablePush = async () => {
    setPushState('subscribing');
    setPushError(null);
    try {
      await subscribeToPush();
      setPushState('granted');
    } catch (err) {
      setPushState('error');
      setPushError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="auto-page">
        <div className="loading-screen" style={{ minHeight: 200 }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  const pushGranted = pushState === 'granted';
  const swSupported = ('serviceWorker' in navigator) && ('PushManager' in window);

  return (
    <div className="auto-page">
      {/* ── Hero ── */}
      <div>
        <h2 className="auto-page-title">
          Automations<span className="auto-page-dot">.</span>
        </h2>
        <div className="auto-page-sub">
          <span className="auto-page-sub-num">{activeCount}</span>
          <span className="auto-page-sub-sep" />
          <span>active rule{activeCount !== 1 ? 's' : ''}</span>
          {totalCount > activeCount && (
            <>
              <span className="auto-page-sub-sep" />
              <span>{totalCount - activeCount} paused</span>
            </>
          )}
        </div>
      </div>

      {/* ── Push notification opt-in ── */}
      {swSupported && (
        <div className={`auto-push-bar${pushGranted ? ' auto-push-bar--granted' : ''}`}>
          <span className="auto-push-bar-text">
            {pushGranted
              ? 'Push notifications enabled — the Early Coordination Alert will reach you even when the tab is closed.'
              : 'Enable push notifications to receive show reminders in your browser.'}
          </span>
          {!pushGranted && (
            <button
              className="auto-push-bar-btn"
              onClick={handleEnablePush}
              disabled={pushState === 'subscribing'}
            >
              {pushState === 'subscribing' ? 'Enabling…' : 'Enable'}
            </button>
          )}
        </div>
      )}
      {pushState === 'error' && (
        <p style={{ color: 'var(--clay)', fontSize: '0.8125rem', marginTop: -40 }}>
          Push failed: {pushError}
        </p>
      )}

      {/* ── Integrations ── */}
      <div className="auto-section">
        <div className="auto-section-lbl">Connected apps</div>
        <IntegrationsBar statuses={integrations} onRefresh={fetchIntegrations} />
      </div>

      {/* ── Recipes ── */}
      <div className="auto-section">
        <div className="auto-section-header-row">
          <div>
            <div className="auto-section-lbl">Recipes</div>
            <p className="auto-section-sub">One-click automation templates — activate and go.</p>
          </div>
        </div>
        <RecipeCards automations={automations} onActivate={handleCreateAutomation} />
      </div>

      {/* ── Builder ── */}
      <div className="auto-section">
        <div className="auto-section-lbl">Build a custom rule</div>
        <p className="auto-section-sub">Define your own trigger → condition → action pipeline.</p>
        <AutomationBuilder onSave={handleCreateAutomation} />
      </div>

      {/* ── List ── */}
      <div className="auto-section">
        <div className="auto-section-lbl">Your rules</div>
        <AutomationList
          automations={automations}
          onToggle={handleToggle}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
