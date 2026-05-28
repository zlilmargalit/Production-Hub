import { useState, useEffect, useCallback, useRef } from 'react';
import ShowList from './components/ShowList';
import ShowForm from './components/ShowForm';
import CrewManager from './components/CrewManager';
import ConfirmModal from './components/ConfirmModal';
import DemoBanner from './components/DemoBanner';
import GlobalTaskPanel from './components/GlobalTaskPanel';
import TeamPanel       from './components/TeamPanel';
import SetlistCalculator from './components/SetlistCalculator';
import AutomationsPage  from './components/automations/AutomationsPage';

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
  const [tasks,    setTasks]    = useState([]);

  // ── Multi-artist state ────────────────────────────────────────────────────
  const [artists, setArtists] = useState([]);
  const [currentArtist, setCurrentArtist] = useState(null);
  const [newArtistModal, setNewArtistModal] = useState(false);
  // Ref holds the CURRENT artist ID so stable useCallback fetchers can read it
  // without being re-created whenever the artist changes.
  const currentArtistRef = useRef(null);

  // Sync theme attribute to <html> and persist
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ph-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  // ── Data fetchers (stable references via useCallback) ─────────────────────
  // Each fetcher reads currentArtistRef to append ?artistId when an artist is
  // active. The ref is updated synchronously before any fetch is triggered, so
  // there is no race between artist selection and the data request.
  const artistQS = () => {
    const id = currentArtistRef.current;
    return id ? `?artistId=${encodeURIComponent(id)}` : '';
  };

  const fetchShows = useCallback(async () => {
    const res = await fetch(`/api/shows${artistQS()}`);
    if (!res.ok) throw new Error('Failed to load shows');
    setShows(await res.json());
  }, []);

  const fetchCrew = useCallback(async () => {
    const res = await fetch(`/api/crew${artistQS()}`);
    if (!res.ok) throw new Error('Failed to load crew');
    setCrew(await res.json());
  }, []);

  const fetchTemplates = useCallback(async () => {
    const res = await fetch(`/api/templates${artistQS()}`);
    if (!res.ok) throw new Error('Failed to load templates');
    setTemplates(await res.json());
  }, []);

  const fetchFieldTemplates = useCallback(async () => {
    const res = await fetch(`/api/field-templates${artistQS()}`);
    if (!res.ok) throw new Error('Failed to load field templates');
    setFieldTemplates(await res.json());
  }, []);

  const fetchEventTypes = useCallback(async () => {
    const res = await fetch(`/api/event-types${artistQS()}`);
    if (!res.ok) throw new Error('Failed to load event types');
    setEventTypes(await res.json());
  }, []);

  const fetchTasks = useCallback(async () => {
    if (demoMode) return;
    const res = await fetch(`/api/tasks${artistQS()}`);
    if (res.ok) setTasks(await res.json());
  }, [demoMode]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    setError(null);

    if (demoMode) {
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

    // Normal mode — three-step init:
    // 1. Fetch /api/me + /api/artists in parallel
    // 2. Set currentArtist (ref first, then state)
    // 3. Fetch all scoped data with the correct artistId already in the ref
    const init = async () => {
      try {
        let meData = null;
        const [, artistData] = await Promise.all([
          fetch('/api/me').then((r) => r.ok ? r.json() : null)
            .then((d) => { if (d) { meData = d; setUserRole(d.role); setUsername(d.username); } }),
          Promise.resolve(), // placeholder; artists fetched below after meData is set
        ]);

        // Admin → own artists list; guest → permitted artists from admin's workspace
        const artistsEndpoint = meData?.role === 'admin' ? '/api/artists' : '/api/team/artists';
        const artistDataResult = await fetch(artistsEndpoint)
          .then((r) => r.ok ? r.json() : [])
          .catch(() => []);

        setArtists(artistDataResult);
        const first = artistDataResult[0] || null;
        if (first) {
          currentArtistRef.current = first.id;   // sync — must precede fetches below
          setCurrentArtist(first);
        }

        await Promise.all([
          fetchShows(), fetchCrew(), fetchTemplates(), fetchFieldTemplates(), fetchEventTypes(),
          fetchTasks(),
        ]);
      } catch (err) {
        setError(err.message || 'Could not connect to server');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [demoMode, fetchShows, fetchCrew, fetchTemplates, fetchFieldTemplates, fetchEventTypes, fetchTasks]);

  // ── Mutations — real (normal mode) ────────────────────────────────────────
  const saveFieldTemplate = useCallback(async (eventType, fields) => {
    if (demoMode) {
      setFieldTemplates((prev) => ({ ...prev, [eventType]: fields }));
      return;
    }
    await fetch(`/api/field-templates/${encodeURIComponent(eventType)}${artistQS()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    setFieldTemplates((prev) => ({ ...prev, [eventType]: fields }));
  }, [demoMode]);

  const saveEventTypes = useCallback(async (types) => {
    if (demoMode) { setEventTypes(types); return; }
    await fetch(`/api/event-types${artistQS()}`, {
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
    const res = await fetch(`/api/shows${artistQS()}`, {
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
    const res = await fetch(`/api/shows/${id}${artistQS()}`, {
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
        if (!demoMode) await fetch(`/api/shows/${id}${artistQS()}`, { method: 'DELETE' });
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
      const res = await fetch(`/api/shows/apply-crew-templates${artistQS()}`, { method: 'POST' });
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

  // ── Artist switching ──────────────────────────────────────────────────────
  const switchToArtist = useCallback(async (artist) => {
    currentArtistRef.current = artist?.id || null;
    setCurrentArtist(artist);
    // Clear stale data so the UI doesn't briefly show the previous artist's content
    setShows([]); setCrew([]); setTasks([]);
    try {
      await Promise.all([
        fetchShows(), fetchCrew(), fetchTemplates(), fetchFieldTemplates(), fetchEventTypes(),
        fetchTasks(),
      ]);
    } catch (err) {
      console.error('[artist-switch]', err.message);
    }
  }, [fetchShows, fetchCrew, fetchTemplates, fetchFieldTemplates, fetchEventTypes, fetchTasks]);

  const createArtist = useCallback(async (name) => {
    const res = await fetch('/api/artists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error('Failed to create artist');
    const artist = await res.json();
    setArtists((prev) => [...prev, artist]);
    await switchToArtist(artist);
    return artist;
  }, [switchToArtist]);

  const deleteArtist = useCallback((artist) => {
    setConfirmModal({
      title: 'Delete Artist',
      message: `Remove "${artist.name}"? Their shows and data stay on the server but the artist will be removed from the list.`,
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        await fetch(`/api/artists/${artist.id}`, { method: 'DELETE' });
        setArtists((prev) => {
          const remaining = prev.filter((a) => a.id !== artist.id);
          // If the deleted artist was current, switch to the first remaining one
          if (currentArtistRef.current === artist.id) {
            if (remaining.length > 0) {
              // switchToArtist updates ref + state + data
              switchToArtist(remaining[0]);
            } else {
              currentArtistRef.current = null;
              setCurrentArtist(null);
              setShows([]); setCrew([]);
              setTemplates({}); setFieldTemplates({}); setEventTypes([]);
            }
          }
          return remaining;
        });
      },
    });
  }, [switchToArtist]);

  // ── Task CRUD ─────────────────────────────────────────────────────────────
  const createTask = useCallback(async (data) => {
    const res = await fetch(`/api/tasks${artistQS()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const task = await res.json();
      setTasks((prev) => [...prev, task]);
    }
  }, []);

  const toggleTask = useCallback(async (id, completed) => {
    const res = await fetch(`/api/tasks/${id}${artistQS()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    }
  }, []);

  const updateTask = useCallback(async (id, data) => {
    const res = await fetch(`/api/tasks/${id}${artistQS()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    }
  }, []);

  const deleteTask = useCallback(async (id) => {
    await fetch(`/api/tasks/${id}${artistQS()}`, { method: 'DELETE' });
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const openEdit = useCallback(async (show) => {
    const qs = currentArtistRef.current
      ? `?artistId=${encodeURIComponent(currentArtistRef.current)}` : '';
    try {
      const res = await fetch(`/api/shows/${show.id}${qs}`);
      setEditingShow(res.ok ? await res.json() : show);
    } catch {
      setEditingShow(show); // fallback to slim show
    }
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
          {/* Spot Pool mark — three semicircular arcs + floor line + orange subject dot */}
          {/* Spot Pool mark — sweep=1 arcs upward from the floor line */}
          <svg width="36" height="28" viewBox="0 0 100 70" fill="none" xmlns="http://www.w3.org/2000/svg" className="header-logo-svg" aria-hidden="true">
            {/* Outer arc — radius 44, ends at x=6 and x=94 */}
            <path d="M 6 62 A 44 44 0 0 1 94 62" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.4"/>
            {/* Middle arc — radius 29 */}
            <path d="M 21 62 A 29 29 0 0 1 79 62" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none" opacity="0.65"/>
            {/* Inner arc — radius 15 */}
            <path d="M 35 62 A 15 15 0 0 1 65 62" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.9"/>
            {/* Floor line */}
            <line x1="2" y1="62" x2="98" y2="62" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.35"/>
            {/* Subject dot */}
            <circle cx="50" cy="62" r="5" fill="#F08D39"/>
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
          {!demoMode && (
            <button
              className={`nav-btn ${page === 'tasks' ? 'active' : ''}`}
              onClick={() => setPage('tasks')}
            >
              Tasks
              {tasks.filter((t) => !t.completed).length > 0 && (
                <span className="nav-tasks-badge">
                  {tasks.filter((t) => !t.completed).length}
                </span>
              )}
            </button>
          )}
          {!demoMode && (
            <ToolsDropdown
              active={page === 'calculator'}
              onSelectTool={(tool) => setPage(tool)}
            />
          )}
          {!demoMode && (
            <button
              className={`nav-btn ${page === 'automations' ? 'active' : ''}`}
              onClick={() => setPage('automations')}
            >
              Automations
            </button>
          )}
          {!demoMode && userRole === 'admin' && (
            <button
              className={`nav-btn ${page === 'team' ? 'active' : ''}`}
              onClick={() => setPage('team')}
            >
              Team
            </button>
          )}
          {!demoMode && (
            <span className="nav-artist-desktop">
              <span className="artist-nav-sep" aria-hidden="true" />
              <ArtistSwitcher
                artists={artists}
                currentArtist={currentArtist}
                onSwitch={switchToArtist}
                onAddNew={() => setNewArtistModal(true)}
                onDelete={deleteArtist}
              />
            </span>
          )}
        </nav>

        {/* Action buttons (right — admin tools hidden on mobile) */}
        <div className="header-right">
          {/* Mobile-only: artist switcher moves here from the nav row */}
          {!demoMode && (
            <div className="header-artist-mobile">
              <ArtistSwitcher
                artists={artists}
                currentArtist={currentArtist}
                onSwitch={switchToArtist}
                onAddNew={() => setNewArtistModal(true)}
                onDelete={deleteArtist}
              />
            </div>
          )}
          {page === 'shows' && !demoMode && (
            <>
              {/* Sync — admin-only, hidden in demo mode and on mobile */}
              {userRole === 'admin' && (
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
              {userRole === 'admin' && (
                <button className="btn-primary btn-new-desktop" onClick={() => setShowForm(true)}>
                  + New
                </button>
              )}
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
            onEdit={userRole === 'admin' ? openEdit : null}
            onDelete={userRole === 'admin' ? deleteShow : null}
            onUpdateShow={updateShow}
            artistId={currentArtist?.id || null}
            readOnly={userRole !== 'admin'}
            onNew={userRole === 'admin' ? () => setShowForm(true) : null}
          />
        ) : page === 'automations' ? (
          <AutomationsPage />
        ) : page === 'calculator' ? (
          <SetlistCalculator
            defaultArtistName={currentArtist?.name || ''}
            artistName={currentArtist?.name || ''}
          />
        ) : page === 'team' && userRole === 'admin' ? (
          <TeamPanel artists={artists} />
        ) : page === 'tasks' ? (
          <GlobalTaskPanel
            tasks={tasks}
            crew={crew}
            shows={shows}
            onAdd={createTask}
            onToggle={toggleTask}
            onDelete={deleteTask}
            onUpdate={updateTask}
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
            tasks={tasks}
            demoMode={demoMode}
            artistId={currentArtist?.id || null}
          />
        )}
      </main>

      {showForm && userRole === 'admin' && (
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

      {newArtistModal && (
        <NewArtistModal
          onClose={() => setNewArtistModal(false)}
          onCreate={createArtist}
        />
      )}
    </div>
  );
}

// ── Tools dropdown nav item ───────────────────────────────────────────────────
const TOOLS = [
  { key: 'calculator', label: 'Setlist Calculator' },
];

function ToolsDropdown({ active, onSelectTool }) {
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

  return (
    <div className="tools-nav-dropdown" ref={ref}>
      <button
        className={`nav-btn tools-nav-dropdown-trigger${active ? ' active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        Tools
        <span className="tools-nav-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="tools-nav-dropdown-panel">
          {TOOLS.map((t) => (
            <button
              key={t.key}
              className={`tools-nav-dropdown-item${active && t.key === 'calculator' ? ' active' : ''}`}
              onClick={() => { onSelectTool(t.key); setOpen(false); }}
            >
              {t.label}
            </button>
          ))}
          <div className="tools-nav-dropdown-footer">More tools coming soon</div>
        </div>
      )}
    </div>
  );
}

// ── Artist switcher dropdown ──────────────────────────────────────────────────
function ArtistSwitcher({ artists, currentArtist, onSwitch, onAddNew, onDelete }) {
  const [open, setOpen] = useState(false);
  const [dotsOpenFor, setDotsOpenFor] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setDotsOpenFor(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const label = currentArtist?.name || (artists.length === 0 ? 'No artists' : 'Select');

  return (
    <div className="artist-switcher" ref={ref}>
      <button
        className="artist-switcher-btn"
        onClick={() => { setOpen((o) => !o); setDotsOpenFor(null); }}
        aria-expanded={open}
        title="Switch artist"
      >
        <span className="artist-switcher-label">{label}</span>
        <span className="artist-switcher-caret">▾</span>
      </button>

      {open && (
        <div className="artist-switcher-panel">
          {artists.map((a) => (
            <div key={a.id} className="artist-option-row">
              <button
                className={`artist-option${a.id === currentArtist?.id ? ' active' : ''}`}
                onClick={() => { onSwitch(a); setOpen(false); setDotsOpenFor(null); }}
              >
                {a.name}
              </button>
              <button
                className={`artist-dots-btn${dotsOpenFor === a.id ? ' active' : ''}`}
                title="Artist options"
                onClick={(e) => {
                  e.stopPropagation();
                  setDotsOpenFor((prev) => (prev === a.id ? null : a.id));
                }}
              >
                ···
              </button>
              {dotsOpenFor === a.id && (
                <div className="artist-dots-menu">
                  <button
                    className="artist-dots-item artist-dots-item--danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDotsOpenFor(null);
                      setOpen(false);
                      onDelete(a);
                    }}
                  >
                    Delete artist
                  </button>
                </div>
              )}
            </div>
          ))}
          {artists.length > 0 && <div className="artist-option-divider" />}
          <button
            className="artist-option artist-option--new"
            onClick={() => { setOpen(false); setDotsOpenFor(null); onAddNew(); }}
          >
            + New Artist
          </button>
        </div>
      )}
    </div>
  );
}

// ── New Artist modal ───────────────────────────────────────────────────────────
function NewArtistModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setErr('Please enter a name'); return; }
    setBusy(true);
    try {
      await onCreate(trimmed);
      onClose();
    } catch {
      setErr('Could not create artist — please try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay confirm-overlay" onClick={onClose}>
      <div className="modal artist-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="artist-modal-title">New Artist</h3>
        <input
          className="artist-modal-input"
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setErr(''); }}
          placeholder="Artist name"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate();
            if (e.key === 'Escape') onClose();
          }}
        />
        {err && <p className="artist-modal-error">{err}</p>}
        <div className="artist-modal-actions">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate} disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
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
