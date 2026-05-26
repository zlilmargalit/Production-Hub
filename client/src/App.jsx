import { useState, useEffect, useCallback } from 'react';
import ShowList from './components/ShowList';
import ShowForm from './components/ShowForm';
import CrewManager from './components/CrewManager';
import ConfirmModal from './components/ConfirmModal';

function App() {
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
  const [confirmModal, setConfirmModal] = useState(null); // { title, message, onConfirm, danger? }

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
    Promise.all([
      fetchShows(),
      fetchCrew(),
      fetchTemplates(),
      fetchFieldTemplates(),
      fetchEventTypes(),
    ])
      .catch((err) => setError(err.message || 'Could not connect to server'))
      .finally(() => setLoading(false));
  }, [fetchShows, fetchCrew, fetchTemplates, fetchFieldTemplates, fetchEventTypes]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const saveFieldTemplate = useCallback(async (eventType, fields) => {
    await fetch(`/api/field-templates/${encodeURIComponent(eventType)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    setFieldTemplates((prev) => ({ ...prev, [eventType]: fields }));
  }, []);

  const saveEventTypes = useCallback(async (types) => {
    await fetch('/api/event-types', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(types),
    });
    setEventTypes(types);
  }, []);

  const createShow = useCallback(async (data) => {
    const res = await fetch('/api/shows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const created = await res.json();
    setShows((prev) => [...prev, created]);
  }, []);

  const updateShow = useCallback(async (id, data) => {
    const res = await fetch(`/api/shows/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const updated = await res.json();
    setShows((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }, []);

  const deleteShow = useCallback((id) => {
    const show = shows.find((s) => s.id === id);
    setConfirmModal({
      title: 'Delete Show',
      message: show ? `Delete "${show.name}"? This cannot be undone.` : 'Delete this show? This cannot be undone.',
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        await fetch(`/api/shows/${id}`, { method: 'DELETE' });
        setShows((prev) => prev.filter((s) => s.id !== id));
      },
    });
  }, [shows]);

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
  }, [fetchShows]);

  const syncShows = useCallback(async () => {
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
  }, [fetchShows]);

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
      <header className="app-header">
        {/* Row 1: logo + title (left)  •  theme toggle (right) */}
        <div className="header-brand">
          <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="header-logo-svg">
            <path d="M32 20 A 12 12 0 1 0 20 32 A 6 6 0 0 0 20 20" stroke="#5E7AC4" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
            <path d="M17.5 16 L 24 20 L 17.5 24 Z" fill="#F3BE7A" stroke="#F3BE7A" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
          <h1>Production Hub</h1>
          {/* Theme toggle lives here so it stays in row 1 on mobile */}
          <button
            className="btn-theme-toggle header-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? '☀' : '◑'}
          </button>
        </div>

        {/* Row 2: nav tabs + action buttons together */}
        <div className="header-row2">
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

          <div className="header-right">
            {page === 'shows' && (
              <>
                <button
                  className="btn-sync"
                  onClick={syncShows}
                  disabled={syncStatus === 'loading'}
                  title="Sync new shows from Excel spreadsheet"
                >
                  {syncStatus === 'loading'
                    ? 'Syncing…'
                    : syncStatus?.error
                    ? 'Error'
                    : syncStatus?.added != null
                    ? `+${syncStatus.added} added`
                    : '↓ Sync'}
                </button>
                <button
                  className="btn-sync"
                  onClick={applyCrewTemplates}
                  disabled={applyStatus === 'loading'}
                  title="Auto-assign crew to active shows based on event type templates"
                >
                  {applyStatus === 'loading'
                    ? 'Applying…'
                    : applyStatus?.error
                    ? 'Error'
                    : applyStatus?.updated != null
                    ? `✓ ${applyStatus.updated} updated`
                    : '⚙ Crew'}
                </button>
                <button className="btn-primary" onClick={() => setShowForm(true)}>
                  + New
                </button>
              </>
            )}
            {/* Desktop-only toggle */}
            <button
              className="btn-theme-toggle header-toggle-desktop"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? '☀' : '◑'}
            </button>
          </div>
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
            <div className="error-icon">⚠</div>
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
            setCrew={setCrew}
            templates={templates}
            setTemplates={setTemplates}
            fieldTemplates={fieldTemplates}
            onSaveFieldTemplate={saveFieldTemplate}
            eventTypes={eventTypes}
            onSaveEventTypes={saveEventTypes}
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

export default App;
