import { useState, useEffect, useCallback } from 'react';
import IntegrationsBar from './IntegrationsBar';
import RecipeCards     from './RecipeCards';
import AutomationBuilder from './AutomationBuilder';
import AutomationList  from './AutomationList';
import PageBar from '../ui/PageBar';
import './automations.css';

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AutomationsPage() {
  const [integrations,  setIntegrations]  = useState({ gmail: false, gcal: false, gdrive: false });
  const [automations,   setAutomations]   = useState([]);
  const [loading,       setLoading]       = useState(true);

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

  const handleUpdateAutomation = async (id, patch) => {
    const res = await fetch(`/api/automations/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || 'Failed to update automation');
    }
    const updated = await res.json();
    setAutomations((prev) => prev.map((a) => (a.id === id ? updated : a)));
    return updated;
  };

  const handleDelete = async (id) => {
    const res = await fetch(`/api/automations/${id}`, { method: 'DELETE' });
    if (res.ok) setAutomations((prev) => prev.filter((a) => a.id !== id));
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

  const connectedCount = Object.values(integrations).filter(Boolean).length;

  return (
    <div className="auto-page">
      <PageBar
        title="Automations"
        count={activeCount}
        countLabel="active rules"
        metrics={[
          { value: String(activeCount).padStart(2, '0'), label: 'Active' },
          { value: String(connectedCount).padStart(2, '0'), label: 'Connected' },
          { value: String(automations.length).padStart(2, '0'), label: 'Recipes' },
        ]}
      />

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
        <RecipeCards
          automations={automations}
          onActivate={handleCreateAutomation}
          onUpdate={handleUpdateAutomation}
        />
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
