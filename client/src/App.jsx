import { useState, useEffect, useCallback, useRef } from 'react';
import ShowList from './components/ShowList';
import ShowForm from './components/ShowForm';
import CrewManager from './components/CrewManager';
import ConfirmModal from './components/ConfirmModal';
import DemoBanner from './components/DemoBanner';

function App({ demoMode = false }) {
  const [shows, setShows] = useState([]);
  const [crew, setCrew] = useState([]);
  const [templates, setTemplates] = useState({});
  const [fieldTemplates, setFieldTemplates] = useState({});
  const [eventTypes, setEventTypes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingShow, setEditingShow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState('shows');
  const [syncStatus, setSyncStatus] = useState(null);
  const [applyStatus, setApplyStatus] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('ph-theme') || 'light');
  const [confirmModal, setConfirmModal] = useState(null);
  const [userRole, setUserRole] = useState(null); // 'admin' | 'user' | null
  const [username, setUsername] = useState(null);

  // Sync theme attribute to <html> and persist
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ph-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  // ── Data fetchers (stable references via useCallback) ─────────────────────
  const fetchShows = useCallback(async () => {
    const res = await fetch('/api/shows');
    if (!res.ok) throw new Error('Failed to load shows');
    setShows(await res.json());
  }, []);

  const fetchCrew = useCallback(async () => {
    const res = await fetch('/api/crew');
    if (!res.ok) throw new Error('Failed to load crew');
    setCrew(await res.json());
  }, []);

  const fetchTemplates = useCallback(async () => {
    const res = await fetch('/api/templates');
    if (!res.ok) throw new Error('Failed to load templates');
    setTemplates(await res.json());
  }, []);

  const fetchFieldTemplates = useCallback(async () => {
    const res = await fetch('/api/field-templates');
    if (!res.ok) throw new Error('Failed to load field templates');
    setFieldTemplates(await res.json());
  }, []);

  const fetchEventTypes = useCallback(async () => {
    const res = await fetch('/api/event-types');
    if (!res.ok) throw new Error('Failed to load event types');
    setEventTypes(await res.json());
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    setError(null);

    if (demoMode) {
      // Demo: load everything from the single demo data endpoint
      fetch('/api/demo/data')
        .then((r) => r.json())
        .then((d) => {
          setShows(d.shows || []);
          setCrew(d.crew || []);
          setTemplates(d.templates || {});
          setFieldTemplates(d.fieldTemplates || {});
          setEventTypes(d.eventTypes || []);
        })
        .catch(() => setError('Could not load demo data'))
        .finally(() => setLoading(false));
      return;
    }

    // Normal mode: fetch user role + all data
    Promise.all([
      fetch('/api/me').then((r) => r.ok ? r.json() : null).then((d) => { if (d) { setUserRole(d.role); setUsername(d.username); } }),
      fetchShows(),
      fetchCrew(),
      fetchTemplates(),
      fetchFieldTemplates(),
      fetchEventTypes(),
    ])
      .catch((err) => setError(err.message || 'Could not connect to server'))
      .finally(() => setLoading(false));
  }, [demoMode, fetchShows, fetchCrew, fetchTemplates, fetchFieldTemplates, fetchEventTypes]);

  // ── Mutations — real (normal mode) ────────────────────────────────────────
  const saveFieldTemplate = useCallback(async (eventType, fields) => {
    if (demoMode) {
      setFieldTemplates((prev) => ({ ...prev, [eventType]: fields }));
      return;
    }
    await fetch(`/api/field-templates/${encodeURIComponent(eventType)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    setFieldTemplates((prev) => ({ ...prev, [eventType]: fields }));
  }, [demoMode]);

  const saveEventTypes = useCallback(async (types) => {
    if (demoMode) { setEventTypes(types); return; }
    await fetch('/api/event-types', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(types),
    });
    setEventTypes(types);
  }, [demoMode]);

  const createShow = useCallback(async (data) => {
    if (demoMode) {
      const fakeShow = { id: 'demo-' + Date.now(), ...data, tasks: data.tasks || [], createdAt: new Date().toISOString() };
      setShows((prev) => [...prev, fakeShow]);
      return fakeShow;
    }
    const res = await fetch('/api/shows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const created = await res.json();
    setShows((prev) => [...prev, created]);
    return created;
  }, [demoMode]);

  const updateShow = useCallback(async (id, data) => {
    if (demoMode) {
      setShows((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
      return;
    }
    const res = await fetch(`/api/shows/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const updated = await res.json();
    setShows((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }, [demoMode]);

  const deleteShow = useCallback((id) => {
    const show = shows.find((s) => s.id === id);
    setConfirmModal({
      title: 'Delete Show',
      message: show ? `Delete "${show.name}"? This cannot be undone.` : 'Delete this show? This cannot be undone.',
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        if (!demoMode) await fetch(`/api/shows/${id}`, { method: 'DELETE' });
        setShows((prev) => prev.filter((s) => s.id !== id));
      },
    });
  }, [shows, demoMode]);

  const handleSubmit = useCallback(
    async (data) => {
      if (editingShow) {
        await updateShow(editingShow.id, { ...editingShow, ...data });
      } else {
        await createShow(data);
      }
      setShowForm(false);
      setEditingShow(null);
    },
    [editingShow, updateShow, createShow]
  );

  const applyCrewTemplates = useCallback(async () => {
    if (demoMode) return; // no-op in demo
    setApplyStatus('loading');
    try {
      const res = await fetch('/api/shows/apply-crew-templates', { method: 'POST' });
      const data = await res.json();
      setApplyStatus(data);
      if (data.updated > 0) await fetchShows();
      setTimeout(() => setApplyStatus(null), 5000);
    } catch {
      setApplyStatus({ error: true });
      setTimeout(() => setApplyStatus(null), 4000);
    }
  }, [fetchShows, demoMode]);

  const syncShows = useCallback(async () => {
    if (demoMode) return;
    setSyncStatus('loading');
    try {
      const res = await fetch('/api/import/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      setSyncStatus(data);
      if (data.added > 0) await fetchShows();
      setTimeout(() => setSyncStatus(null), 5000);
    } catch {
      setSyncStatus({ error: true });
      setTimeout(() => setSyncStatus(null), 4000);
    }
  }, [fetchShows, demoMode]);

  const openEdit = useCallback((show) => {
    setEditingShow(show);
    setShowForm(true);
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingShow(null);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {demoMode && <DemoBanner />}

      <header className="app-header">
        {/* Brand (always left) */}
        <div className="header-brand">
          <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="header-logo-svg">
            <path d="M32 20 A 12 12 0 1 0 20 32 A 6 6 0 0 0 20 20" stroke="#5E7AC4" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
            <path d="M17.5 16 L 24 20 L 17.5 24 Z" fill="#F3BE7A" stroke="#F3BE7A" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
          <h1>Production Hub</h1>
        </div>

        {/* Nav tabs (centre on desktop, wraps to second row on mobile) */}
        <nav className="page-nav">
          <button
            className={`nav-btn ${page === 'shows' ? 'active' : ''}`}
            onClick={() => setPage('shows')}
          >
            Shows
          </button>
          <button
            className={`nav-btn ${page === 'crew' ? 'active' : ''}`}
            onClick={() => setPage('crew')}
          >
            Crew & Types
          </button>
        </nav>

        {/* Action buttons (right — admin tools hidden on mobile) */}
        <div className="header-right">
          {page === 'shows' && (
            <>
              {/* Sync — admin-only, hidden in demo mode and on mobile */}
              {!demoMode && userRole === 'admin' && (
                <button
                  className="btn-sync header-desktop-only"
                  onClick={syncShows}
                  disabled={syncStatus === 'loading'}
                  title="Sync new shows from Excel spreadsheet"
                >
                  {syncStatus === 'loading' ? 'Syncing…'
                    : syncStatus?.error ? 'Error'
                    : syncStatus?.added != null ? `+${syncStatus.added} added`
                    : 'Sync'}
                </button>
              )}
              {!demoMode && (
                <button
                  className="btn-sync header-desktop-only"
                  onClick={applyCrewTemplates}
                  disabled={applyStatus === 'loading'}
                  title="Auto-assign crew to active shows based on event type templates"
                >
                  {applyStatus === 'loading' ? 'Applying…'
                    : applyStatus?.error ? 'Error'
                    : applyStatus?.updated != null ? `${applyStatus.updated} updated`
                    : 'Apply Crew'}
                </button>
              )}
              <button className="btn-primary" onClick={() => setShowForm(true)}>
                + New
              </button>
            </>
          )}
          <button
            className="btn-theme-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? '☀' : '◑'}
          </button>
          {!demoMode && <UserMenu username={username} userRole={userRole} />}
        </div>
      </header>

      <main className="app-main">
        {loading ? (
          <div className="loading-screen">
            <div className="spinner" />
            <p>Loading productions…</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <div className="error-icon">!</div>
            <p className="error-title">Could not reach server</p>
            <p className="error-sub">{error}</p>
            <button className="btn-primary" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        ) : page === 'shows' ? (
          <ShowList
            shows={shows}
            crew={crew}
            fieldTemplates={fieldTemplates}
            onEdit={openEdit}
            onDelete={deleteShow}
            onUpdateShow={updateShow}
          />
        ) : (
          <CrewManager
            crew={crew}
            setCrew={demoMode
              ? (updater) => setCrew(updater)
              : setCrew}
            templates={templates}
            setTemplates={setTemplates}
            fieldTemplates={fieldTemplates}
            onSaveFieldTemplate={saveFieldTemplate}
            eventTypes={eventTypes}
            onSaveEventTypes={saveEventTypes}
            demoMode={demoMode}
          />
        )}
      </main>

      {showForm && (
        <ShowForm
          show={editingShow}
          crew={crew}
          templates={templates}
          fieldTemplates={fieldTemplates}
          eventTypes={eventTypes}
          onSubmit={handleSubmit}
          onClose={closeForm}
        />
      )}

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          danger={confirmModal.danger !== false}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  );
}

// ── User avatar + logout panel ────────────────────────────────────────────────
function UserMenu({ username, userRole }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const initials = (username || '?').slice(0, 2).toUpperCase();

  const logout = async () => {
    try { await fetch('/logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
    window.location.href = '/login';
  };

  return (
    <div className="user-menu" ref={ref}>
      <button
        className="user-avatar-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="User menu"
        title={username || 'Account'}
      >
        {initials}
      </button>

      {open && (
        <div className="user-menu-panel">
          <div className="user-menu-info">
            <span className="user-menu-name">{username || 'User'}</span>
            {userRole && (
              <span className={`user-menu-role user-menu-role--${userRole}`}>{userRole}</span>
            )}
          </div>
          <div className="user-menu-divider" />
          <button className="user-menu-logout" onClick={logout}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
