import { useState, useEffect, useCallback, useRef } from 'react';
import { subscribeToPush } from './utils/pushSubscribe';
import ShowList from './components/ShowList';
import ShowForm from './components/ShowForm';
import CrewManager from './components/CrewManager';
import ConfirmModal from './components/ConfirmModal';
import DemoBanner from './components/DemoBanner';
import GlobalTaskPanel from './components/GlobalTaskPanel';
import TeamPanel       from './components/TeamPanel';
import TeamsPage        from './components/TeamsPage';
import SetlistCalculator from './components/SetlistCalculator';
import TechSpecParser    from './components/TechSpecParser';
import AutomationsPage  from './components/automations/AutomationsPage';
import BacklinerDashboard from './components/backliner/BacklinerDashboard';
import Dashboard from './components/Dashboard';

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
  const [page, setPage] = useState('home');
  const [syncStatus, setSyncStatus] = useState(null);
  const [applyStatus, setApplyStatus] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('ph-theme') || 'light');
  const [confirmModal, setConfirmModal] = useState(null);
  const [userRole, setUserRole] = useState(null); // 'admin' | 'user' | null
  const [username, setUsername] = useState(null);
  const [workspaceRole, setWorkspaceRole] = useState(null); // 'producer' | 'backliner' | null
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [tasks,       setTasks]       = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [wsToast, setWsToast] = useState(null);

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
            .then((d) => {
              if (d) {
                meData = d;
                setUserRole(d.role);
                setUsername(d.username);
                if (d.avatarUrl) setAvatarUrl(d.avatarUrl);
                const wr = d.workspaceRole || 'producer';
                setWorkspaceRole(wr);
                if (wr === 'backliner') setPage('backliner');
              }
            }),
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

        // Non-admin users: poll for pending join requests
        if (meData?.role !== 'admin') {
          fetch('/api/me/join-requests').then((r) => r.ok ? r.json() : []).then(setJoinRequests).catch(() => {});
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
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[updateShow] PUT failed', res.status, err);
      return; // don't corrupt local state with error response
    }
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
    // Optimistically update so the UI feels instant
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, completed } : t));
    // Find task metadata to decide which endpoint to call
    const task = tasks.find((t) => t.id === id);
    let res;
    if (task?.assignedToMe && task?.fromArtistId) {
      res = await fetch(`/api/tasks/assigned/${task.fromArtistId}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
    } else {
      res = await fetch(`/api/tasks/${id}${artistQS()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
    }
    if (res.ok) {
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === id
        ? { ...updated, assignedToMe: task?.assignedToMe, fromArtistId: task?.fromArtistId }
        : t
      )));
    } else {
      // Revert optimistic update on failure
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, completed: !completed } : t));
    }
  }, [tasks]);

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
    const task = tasks.find((t) => t.id === id);
    if (task?.assignedToMe) return; // cannot delete tasks assigned from team
    await fetch(`/api/tasks/${id}${artistQS()}`, { method: 'DELETE' });
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, [tasks]);

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

  // ── Open a show from the Dashboard (switches artist context first) ──────────
  const openShowFromDashboard = useCallback(async (show) => {
    const artist = artists.find((a) => a.id === show.artistId);
    if (artist && artist.id !== currentArtistRef.current) {
      await switchToArtist(artist);
    }
    setPage('shows');
  }, [artists, switchToArtist]);

  // ── Workspace selector: switch to an artist workspace ─────────────────────
  const handleWorkspaceSwitch = useCallback(async (artist) => {
    setWsToast(`Entering ${artist.name}'s workspace…`);
    await switchToArtist(artist);
    setPage('shows');
    setTimeout(() => setWsToast(null), 2200);
  }, [switchToArtist]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {demoMode && <DemoBanner />}

      <header className="app-header">
        {/* Brand — always left; clicking goes to Home */}
        <div
          className="header-brand"
          onClick={() => setPage('home')}
          style={{ cursor: 'pointer' }}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setPage('home')}
          aria-label="Go to home"
        >
          <svg width="36" height="28" viewBox="0 0 100 70" fill="none" xmlns="http://www.w3.org/2000/svg" className="header-logo-svg" aria-hidden="true">
            <path d="M 6 62 A 44 44 0 0 1 94 62" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.4"/>
            <path d="M 21 62 A 29 29 0 0 1 79 62" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none" opacity="0.65"/>
            <path d="M 35 62 A 15 15 0 0 1 65 62" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.9"/>
            <line x1="2" y1="62" x2="98" y2="62" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.35"/>
            <circle cx="50" cy="62" r="5" fill="#F08D39"/>
          </svg>
          <h1>Production Hub</h1>
        </div>

        {/* Nav: home mode shows nothing; artist mode shows all tabs */}
        <nav className="page-nav">{page === 'home' ? null : (<>
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
            <button
              className={`nav-btn ${page === 'automations' ? 'active' : ''}`}
              onClick={() => setPage('automations')}
            >
              Automations
            </button>
          )}
          {!demoMode && userRole !== 'admin' && workspaceRole === 'backliner' && (
            <button
              className={`nav-btn ${page === 'backliner' ? 'active' : ''}`}
              onClick={() => setPage('backliner')}
            >
              Backliner
            </button>
          )}
          {!demoMode && userRole !== 'admin' && (
            <button
              className={`nav-btn ${page === 'teams' ? 'active' : ''}`}
              onClick={() => setPage('teams')}
            >
              Teams
            </button>
          )}
          {!demoMode && userRole === 'admin' && (
            <button
              className={`nav-btn ${page === 'team' ? 'active' : ''}`}
              onClick={() => setPage('team')}
            >
              Teams
            </button>
          )}
          {!demoMode && (
            <ToolsDropdown
              activeTool={page}
              onSelectTool={(tool) => setPage(tool)}
            />
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
        </>)}</nav>

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
          {/* Notification bell — join requests + assigned tasks */}
          {!demoMode && userRole !== 'admin' && (
            <NotificationBell
              joinRequests={joinRequests}
              tasks={tasks}
              onNavigate={setPage}
            />
          )}
          {!demoMode && (
            <WorkspaceSelector
              page={page}
              artists={artists}
              currentArtist={currentArtist}
              onSwitch={handleWorkspaceSwitch}
              onGoHome={() => setPage('home')}
            />
          )}
          {!demoMode && <UserMenu username={username} userRole={userRole} onOpenSettings={() => setShowSettings(true)} avatarUrl={avatarUrl} />}
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
        ) : page === 'home' ? (
          <Dashboard
            artists={artists}
            tasks={tasks}
            crew={crew}
            onOpenShow={openShowFromDashboard}
            onToggleTask={toggleTask}
          />
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
            workspaceRole={workspaceRole}
          />
        ) : page === 'automations' ? (
          <AutomationsPage />
        ) : page === 'backliner' ? (
          <BacklinerDashboard
            shows={shows}
            tasks={tasks}
            crew={crew}
            userRole={userRole}
            onUpdateShow={updateShow}
            onAddTask={createTask}
            onToggleTask={toggleTask}
            onDeleteTask={deleteTask}
          />
        ) : page === 'calculator' ? (
          <SetlistCalculator
            defaultArtistName={currentArtist?.name || ''}
            artistName={currentArtist?.name || ''}
          />
        ) : page === 'tech-spec' ? (
          <TechSpecParser
            shows={shows}
            onUpdateShow={updateShow}
            artistId={currentArtist?.id || null}
          />
        ) : page === 'teams' ? (
          <TeamsPage />
        ) : page === 'team' && userRole === 'admin' ? (
          <TeamPanel artists={artists} shows={shows} onUpdateShow={updateShow} />
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

      {showSettings && (
        <UserSettingsModal
          onClose={() => setShowSettings(false)}
          currentWorkspaceRole={workspaceRole}
          userRole={userRole}
          onChangeWorkspaceRole={(r) => setWorkspaceRole(r)}
          onAvatarChange={(url) => setAvatarUrl(url)}
        />
      )}

      {wsToast && (
        <div className="ws-toast" role="status" aria-live="polite">{wsToast}</div>
      )}
    </div>
  );
}

// ── Tools dropdown nav item ───────────────────────────────────────────────────
const TOOLS = [
  { key: 'calculator',  label: 'Setlist Calculator' },
  { key: 'tech-spec',   label: 'Tech Spec Parser' },
];

function ToolsDropdown({ activeTool, onSelectTool }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const isActive = TOOLS.some((t) => t.key === activeTool);

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
        className={`nav-btn tools-nav-dropdown-trigger${isActive ? ' active' : ''}`}
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
              className={`tools-nav-dropdown-item${t.key === activeTool ? ' active' : ''}`}
              onClick={() => { onSelectTool(t.key); setOpen(false); }}
            >
              {t.label}
            </button>
          ))}
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

// ── Workspace Selector ────────────────────────────────────────────────────────
const WS_PALETTE = ['#3852B4', '#F08D39', '#C79A3F', '#4E7265'];

function WorkspaceSelector({ page, artists, currentArtist, onSwitch, onGoHome }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const isHome = page === 'home';
  const activeColor = !isHome && currentArtist
    ? WS_PALETTE[artists.findIndex((a) => a.id === currentArtist.id) % WS_PALETTE.length] || '#3852B4'
    : null;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="ws-selector" ref={ref}>
      <button
        className="ws-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Switch workspace"
      >
        {activeColor ? (
          <span className="ws-artist-dot-trigger" style={{ background: activeColor }} />
        ) : (
          <span className="ws-globe-dot" />
        )}
        <span className="ws-trigger-text">
          <span className="ws-trigger-eyebrow">WORKSPACE</span>
          <span className="ws-trigger-label">
            {isHome ? 'Global Home' : (currentArtist?.name || 'Global Home')}
          </span>
        </span>
        <span className="ws-trigger-caret">▾</span>
      </button>

      {open && (
        <div className="ws-dropdown">
          <div className="ws-dropdown-head">Switch workspace</div>

          {/* Global Home row */}
          <button
            className={`ws-dropdown-item${isHome ? ' ws-dropdown-item--active' : ''}`}
            onClick={() => { onGoHome(); setOpen(false); }}
          >
            <span className="ws-dropdown-item-globe" />
            <span className="ws-dropdown-item-text">
              <span className="ws-dropdown-item-name">Global Home</span>
              <span className="ws-dropdown-item-sub">All artists</span>
            </span>
            {isHome && <span className="ws-dropdown-check">✓</span>}
          </button>

          {/* Artist rows */}
          {artists.length > 0 && (
            <>
              <div className="ws-dropdown-divider">Artists</div>
              {artists.map((a, i) => {
                const color = WS_PALETTE[i % WS_PALETTE.length];
                const isActive = !isHome && currentArtist?.id === a.id;
                return (
                  <button
                    key={a.id}
                    className={`ws-dropdown-item${isActive ? ' ws-dropdown-item--active' : ''}`}
                    onClick={() => { onSwitch(a); setOpen(false); }}
                  >
                    <span className="ws-dropdown-item-swatch" style={{ background: color }} />
                    <span className="ws-dropdown-item-text">
                      <span className="ws-dropdown-item-name">{a.name}</span>
                    </span>
                    {isActive
                      ? <span className="ws-dropdown-check">✓</span>
                      : <span className="ws-dropdown-arrow">→</span>
                    }
                  </button>
                );
              })}
            </>
          )}

          <div className="ws-dropdown-footer">
            Opening an artist enters its isolated workspace — Shows · Crew · Tools appear in the nav. Return here anytime via Global Home.
          </div>
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
function UserMenu({ username, userRole, onOpenSettings, avatarUrl }) {
  const [open, setOpen] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Reset broken flag when avatarUrl changes
  useEffect(() => { setImgBroken(false); }, [avatarUrl]);

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
        {avatarUrl && !imgBroken
          ? <img src={avatarUrl} alt={username || 'avatar'} className="user-avatar-img" onError={() => setImgBroken(true)} />
          : initials}
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
          <button className="user-menu-item" onClick={() => { setOpen(false); onOpenSettings?.(); }}>
            Settings
          </button>
          <div className="user-menu-divider" />
          <button className="user-menu-logout" onClick={logout}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// ── Notification Bell ─────────────────────────────────────────────────────────
function NotificationBell({ joinRequests, tasks, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('ph-seen-notifs') || '[]')); }
    catch { return new Set(); }
  });
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const inviteNotifs = (joinRequests || []).map((r) => ({
    id:   `invite:${r.id}`,
    type: 'invite',
    text: `${r.fromUsername || 'Admin'} invited you to join their team`,
    nav:  'teams',
  }));

  const taskNotifs = (tasks || [])
    .filter((t) => t.assignedToMe && !t.completed)
    .map((t) => ({
      id:   `task:${t.id}`,
      type: 'task',
      text: t.text ? `Task assigned: ${t.text}` : 'New task assigned',
      nav:  'tasks',
    }));

  const all    = [...inviteNotifs, ...taskNotifs];
  const unread = all.filter((n) => !seenIds.has(n.id));

  const saveSeen = (s) => {
    setSeenIds(s);
    localStorage.setItem('ph-seen-notifs', JSON.stringify([...s]));
  };
  const dismiss    = (id) => saveSeen(new Set([...seenIds, id]));
  const dismissAll = ()   => saveSeen(new Set(all.map((n) => n.id)));

  if (all.length === 0) return null;

  return (
    <div className="notif-bell" ref={ref}>
      <button
        className="notif-bell-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={`${unread.length} notification${unread.length !== 1 ? 's' : ''}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread.length > 0 && (
          <span className="notif-badge">{unread.length}</span>
        )}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <span className="notif-panel-title">Notifications</span>
            {unread.length > 0 && (
              <button className="notif-dismiss-all" onClick={dismissAll}>
                Dismiss all
              </button>
            )}
          </div>
          {all.length === 0 ? (
            <p className="notif-empty">No notifications</p>
          ) : (
            <div className="notif-list">
              {all.map((n) => (
                <div key={n.id} className={`notif-item${seenIds.has(n.id) ? ' seen' : ' unseen'}`}>
                  <button
                    className="notif-item-text"
                    onClick={() => { onNavigate(n.nav); setOpen(false); }}
                  >
                    {n.text}
                  </button>
                  <button
                    className="notif-item-dismiss"
                    onClick={() => dismiss(n.id)}
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Timezone list ─────────────────────────────────────────────────────────────
const TIMEZONES = [
  { value: 'Africa/Cairo',         label: 'Cairo (UTC+2)' },
  { value: 'Africa/Johannesburg',  label: 'Johannesburg (UTC+2)' },
  { value: 'America/New_York',     label: 'New York (EST/EDT)' },
  { value: 'America/Chicago',      label: 'Chicago (CST/CDT)' },
  { value: 'America/Denver',       label: 'Denver (MST/MDT)' },
  { value: 'America/Los_Angeles',  label: 'Los Angeles (PST/PDT)' },
  { value: 'America/Sao_Paulo',    label: 'São Paulo (BRT)' },
  { value: 'Asia/Jerusalem',       label: 'Jerusalem / Tel Aviv (IST)' },
  { value: 'Asia/Dubai',           label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata',         label: 'Mumbai / Delhi (IST)' },
  { value: 'Asia/Bangkok',         label: 'Bangkok (ICT)' },
  { value: 'Asia/Singapore',       label: 'Singapore (SGT)' },
  { value: 'Asia/Tokyo',           label: 'Tokyo (JST)' },
  { value: 'Europe/London',        label: 'London (GMT/BST)' },
  { value: 'Europe/Lisbon',        label: 'Lisbon (WET/WEST)' },
  { value: 'Europe/Paris',         label: 'Paris / Berlin (CET/CEST)' },
  { value: 'Europe/Helsinki',      label: 'Helsinki (EET/EEST)' },
  { value: 'Europe/Moscow',        label: 'Moscow (MSK)' },
  { value: 'Pacific/Sydney',       label: 'Sydney (AEST/AEDT)' },
  { value: 'Pacific/Auckland',     label: 'Auckland (NZST/NZDT)' },
];

// ── User Settings Modal ───────────────────────────────────────────────────────
function UserSettingsModal({ onClose, currentWorkspaceRole, userRole, onChangeWorkspaceRole, onAvatarChange }) {
  // ── Push notifications ────────────────────────────────────────────────────
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushMsg,     setPushMsg]     = useState('');
  const [pushBusy,    setPushBusy]    = useState(false);

  // ── Workspace role ────────────────────────────────────────────────────────
  const [roleValue,  setRoleValue]  = useState(currentWorkspaceRole || 'producer');
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleMsg,    setRoleMsg]    = useState('');

  // ── Profile ───────────────────────────────────────────────────────────────
  const [displayName,     setDisplayName]     = useState('');
  const [avatarPreview,   setAvatarPreview]   = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [profileSaving,   setProfileSaving]   = useState(false);
  const [profileMsg,      setProfileMsg]      = useState('');
  const avatarInputRef = useRef(null);

  // ── Change Password ───────────────────────────────────────────────────────
  const [pwCurrent,     setPwCurrent]     = useState('');
  const [pwNew,         setPwNew]         = useState('');
  const [pwConfirm,     setPwConfirm]     = useState('');
  const [pwSaving,      setPwSaving]      = useState(false);
  const [pwMsg,         setPwMsg]         = useState('');


  // ── Preferences ───────────────────────────────────────────────────────────
  const [timezone, setTimezone] = useState('');
  const [tzSaving, setTzSaving] = useState(false);
  const [tzMsg,    setTzMsg]    = useState('');

  // ── Integrations ──────────────────────────────────────────────────────────
  const [integrations,    setIntegrations]    = useState({ gmail: false, gcal: false, gdrive: false });
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [intgLoading,     setIntgLoading]     = useState(true);
  const [intgMsg,         setIntgMsg]         = useState('');

  // ── Load data on mount ───────────────────────────────────────────────────
  useEffect(() => {
    // Profile fields
    fetch('/api/me')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setDisplayName(d.displayName || '');
        setTimezone(d.timezone || '');
        if (d.avatarUrl) setAvatarPreview(d.avatarUrl);
      })
      .catch(() => {});

    // Integrations status
    Promise.all([
      fetch('/api/automations/integrations').then((r) => r.ok ? r.json() : null),
      fetch('/api/spotify/status').then((r) => r.ok ? r.json() : null),
    ]).then(([intg, spot]) => {
      if (intg) setIntegrations(intg);
      if (spot) setSpotifyConnected(spot.connected);
      setIntgLoading(false);
    }).catch(() => setIntgLoading(false));

    // Push subscription state
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => { if (sub) setPushEnabled(true); })
        .catch(() => {});
    }
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleAvatarPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setProfileMsg('Please select an image file'); return; }
    if (file.size > 2 * 1024 * 1024) { setProfileMsg('Image must be under 2 MB'); return; }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setAvatarPreview(dataUrl);
      setAvatarUploading(true);
      setProfileMsg('');
      try {
        const r = await fetch('/api/me/avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl }),
        });
        if (r.ok) {
          const d = await r.json();
          onAvatarChange?.(d.avatarUrl);
          setProfileMsg('Avatar updated');
          setTimeout(() => setProfileMsg(''), 2500);
        } else {
          setProfileMsg('Could not upload avatar');
        }
      } catch {
        setProfileMsg('Could not upload avatar');
      } finally {
        setAvatarUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setProfileMsg('');
    try {
      const r = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      });
      if (r.ok) {
        setProfileMsg('Saved');
        setTimeout(() => setProfileMsg(''), 2500);
      } else {
        setProfileMsg('Error saving');
      }
    } catch {
      setProfileMsg('Error saving');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveTz = async () => {
    setTzSaving(true);
    setTzMsg('');
    try {
      const r = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone }),
      });
      if (r.ok) {
        setTzMsg('Saved');
        setTimeout(() => setTzMsg(''), 2500);
      } else {
        setTzMsg('Error saving');
      }
    } catch {
      setTzMsg('Error saving');
    } finally {
      setTzSaving(false);
    }
  };

  // ── Change password ─────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    setPwMsg('');
    if (!pwCurrent || !pwNew) { setPwMsg('All fields are required'); return; }
    if (pwNew !== pwConfirm)  { setPwMsg('Passwords do not match');  return; }
    if (pwNew.length < 8)     { setPwMsg('New password must be at least 8 characters'); return; }
    setPwSaving(true);
    try {
      const r = await fetch('/api/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      const d = await r.json();
      if (r.ok) {
        setPwMsg('Password changed');
        setPwOpen(false);
        setPwCurrent(''); setPwNew(''); setPwConfirm('');
      } else {
        setPwMsg(d.error || 'Error changing password');
      }
    } catch {
      setPwMsg('Could not reach server');
    } finally {
      setPwSaving(false);
    }
  };

  const handleConnect = (provider) => {
    window.location.href = `/api/automations/integrations/${provider}/connect`;
  };

  const handleDisconnect = async (provider) => {
    try {
      const r = await fetch(`/api/automations/integrations/${provider}`, { method: 'DELETE' });
      if (r.ok) {
        setIntegrations((prev) => ({ ...prev, [provider]: false }));
        setIntgMsg(`Disconnected`);
        setTimeout(() => setIntgMsg(''), 2500);
      }
    } catch {}
  };

  // Admin-only: copies current integrations token data to clipboard so it can be
  // pasted into the INTEGRATIONS_DATA Railway env var for persistence across deploys.
  const handleBackupIntegrations = async () => {
    try {
      const r = await fetch('/api/automations/integrations/export');
      if (!r.ok) throw new Error('Export failed');
      const { data } = await r.json();
      await navigator.clipboard.writeText(data);
      setIntgMsg('Copied — paste as INTEGRATIONS_DATA in Railway Variables');
      setTimeout(() => setIntgMsg(''), 6000);
    } catch (e) {
      setIntgMsg(e.message || 'Could not copy integration data');
      setTimeout(() => setIntgMsg(''), 4000);
    }
  };

  const handlePushToggle = async () => {
    setPushBusy(true);
    setPushMsg('');
    try {
      if (!pushEnabled) {
        await subscribeToPush();
        setPushEnabled(true);
        setPushMsg('Push notifications enabled');
      } else {
        if (!('serviceWorker' in navigator)) throw new Error('Not supported');
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
        setPushEnabled(false);
        setPushMsg('Push notifications disabled');
      }
    } catch (e) {
      setPushMsg(e.message || 'Could not update notification settings');
    } finally {
      setPushBusy(false);
    }
  };

  const handleRoleChange = async (newRole) => {
    setRoleValue(newRole);
    setRoleSaving(true);
    setRoleMsg('');
    try {
      const r = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceRole: newRole }),
      });
      if (r.ok) {
        onChangeWorkspaceRole?.(newRole);
        setRoleMsg('Saved');
        setTimeout(() => setRoleMsg(''), 2500);
      } else {
        setRoleMsg('Error saving');
      }
    } catch {
      setRoleMsg('Error saving');
    } finally {
      setRoleSaving(false);
    }
  };

  const initials = displayName
    ? displayName.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const GOOGLE_SERVICES = [
    { id: 'gcal',   label: 'Google Calendar' },
    { id: 'gdrive', label: 'Google Drive' },
    { id: 'gmail',  label: 'Gmail' },
  ];

  const INTG_ICONS = {
    /* Google Calendar — official brand icon */
    gcal: (
      <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 3h-1V1h-2v2H8V1H6v2H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V9h14v10z" fill="#1A73E8"/>
        <path d="M5 5h14v4H5z" fill="#1A73E8"/>
        <rect x="5" y="9" width="14" height="10" fill="white"/>
        <path d="M7 11h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zM7 15h2v2H7zm4 0h2v2h-2z" fill="#5F6368"/>
        <path d="M15 15h2v2h-2z" fill="#EA4335"/>
        <path d="M6 3h2v2H6zm10 0h2v2h-2z" fill="#5F6368"/>
      </svg>
    ),
    /* Google Drive — official 6-path source SVG */
    gdrive: (
      <svg width="28" height="28" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
        <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
        <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
        <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
        <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
        <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
        <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
      </svg>
    ),
    /* Gmail — Simple Icons M-envelope path */
    gmail: (
      <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/>
      </svg>
    ),
    /* Spotify — Simple Icons circle-waves path */
    spotify: (
      <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" fill="#1DB954"/>
      </svg>
    ),
  };

  return (
    <div className="modal-overlay confirm-overlay" onClick={onClose}>
      <div className="modal user-settings-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="user-settings-header">
          <h3 className="user-settings-title">Settings</h3>
          <button className="user-settings-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* ── Account ── */}
        <div className="user-settings-section">
          <h4 className="user-settings-section-title">Account</h4>

          {/* Avatar + Display Name */}
          <div className="ust-profile-row">
            <div
              className={`ust-avatar-wrap${avatarUploading ? ' uploading' : ''}`}
              onClick={() => avatarInputRef.current?.click()}
              title="Click to change photo"
            >
              {avatarPreview
                ? <img src={avatarPreview} alt="avatar" className="ust-avatar-img" />
                : <span className="ust-avatar-initials">{initials}</span>}
              <span className="ust-avatar-overlay">{avatarUploading ? '…' : 'Edit'}</span>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleAvatarPick}
            />
            <div className="ust-profile-fields">
              <label className="ust-field-label">Display Name</label>
              <input
                className="ust-field-input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                maxLength={100}
              />
            </div>
          </div>

          <div className="ust-save-row">
            <button className="btn-primary ust-save-btn" onClick={handleSaveProfile} disabled={profileSaving}>
              {profileSaving ? 'Saving…' : 'Save'}
            </button>
            {profileMsg && (
              <span className={`user-settings-msg${profileMsg === 'Saved' || profileMsg === 'Avatar updated' ? ' ok' : ' err'}`}>
                {profileMsg}
              </span>
            )}
          </div>

          {/* ── Change Password ── */}
          <div className="ust-security-block">
            <span className="ust-security-label">Security</span>

            {userRole === 'admin' ? (
              <p className="ust-security-note">
                Admin password is set via the <code>AUTH_PASSWORD</code> environment variable.
              </p>
            ) : (
              <div className="ust-pw-form">
                <input
                  className="ust-field-input"
                  type="password"
                  placeholder="Current password"
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value)}
                  autoComplete="current-password"
                />
                <input
                  className="ust-field-input"
                  type="password"
                  placeholder="New password (min 8 chars)"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  autoComplete="new-password"
                />
                <input
                  className="ust-field-input"
                  type="password"
                  placeholder="Confirm new password"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  autoComplete="new-password"
                  onKeyDown={(e) => e.key === 'Enter' && handleChangePassword()}
                />
                <div className="ust-save-row" style={{ marginTop: 6 }}>
                  <button className="btn-primary ust-save-btn" onClick={handleChangePassword} disabled={pwSaving}>
                    {pwSaving ? 'Saving…' : 'Update Password'}
                  </button>
                  {pwMsg && (
                    <span className={`user-settings-msg${pwMsg === 'Password changed' ? ' ok' : ' err'}`}>
                      {pwMsg}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Preferences ── */}
        <div className="user-settings-section">
          <h4 className="user-settings-section-title">Preferences</h4>
          <div className="user-settings-row ust-tz-row">
            <div className="user-settings-row-info">
              <span className="user-settings-row-label">Timezone</span>
              <span className="user-settings-row-desc">Used for scheduling alerts and task reminders.</span>
            </div>
            <select
              className="ust-select"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              <option value="">System default</option>
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>
          <div className="ust-save-row">
            <button className="btn-primary ust-save-btn" onClick={handleSaveTz} disabled={tzSaving}>
              {tzSaving ? 'Saving…' : 'Save'}
            </button>
            {tzMsg && (
              <span className={`user-settings-msg${tzMsg === 'Saved' ? ' ok' : ' err'}`}>{tzMsg}</span>
            )}
          </div>
        </div>

        {/* ── Integrations ── */}
        <div className="user-settings-section">
          <h4 className="user-settings-section-title">Integrations</h4>
          {intgLoading ? (
            <p className="user-settings-section-desc">Loading…</p>
          ) : (
            <div className="ust-intg-list">
              {GOOGLE_SERVICES.map(({ id, label }) => (
                <div key={id} className="ust-intg-row">
                  <span className="ust-intg-icon">{INTG_ICONS[id]}</span>
                  <span className="ust-intg-name">{label}</span>
                  <span className={`ust-intg-status${integrations[id] ? ' connected' : ''}`}>
                    {integrations[id] ? 'Connected' : 'Disconnected'}
                  </span>
                  {integrations[id] ? (
                    <button className="ust-btn-disconnect" onClick={() => handleDisconnect(id)}>
                      Disconnect
                    </button>
                  ) : (
                    <button className="ust-btn-connect" onClick={() => handleConnect(id)}>
                      Connect
                    </button>
                  )}
                </div>
              ))}
              {/* Spotify — server credentials only */}
              <div className="ust-intg-row">
                <span className="ust-intg-icon">{INTG_ICONS.spotify}</span>
                <span className="ust-intg-name">Spotify</span>
                <span className={`ust-intg-status${spotifyConnected ? ' connected' : ''}`}>
                  {spotifyConnected ? 'Connected' : 'Not configured'}
                </span>
                <span className="ust-intg-hint">
                  {spotifyConnected ? 'Server credentials' : 'Add SPOTIFY_CLIENT_ID env var'}
                </span>
              </div>
            </div>
          )}
          {userRole === 'admin' && (
            <div className="ust-intg-backup-row">
              <button className="ust-btn-backup" onClick={handleBackupIntegrations}>
                Backup connections
              </button>
              <span className="ust-intg-backup-hint">
                Copy token data → paste as <code>INTEGRATIONS_DATA</code> in Railway Variables to keep integrations connected after deploys.
              </span>
            </div>
          )}
          {intgMsg && <p className="user-settings-msg">{intgMsg}</p>}
        </div>

        {/* ── Notifications ── */}
        <div className="user-settings-section">
          <h4 className="user-settings-section-title">Notifications</h4>
          <div className="user-settings-row">
            <div className="user-settings-row-info">
              <span className="user-settings-row-label">Push Notifications</span>
              <span className="user-settings-row-desc">Receive task reminders and show alerts on this device.</span>
            </div>
            <button
              role="switch"
              aria-checked={pushEnabled}
              className={`settings-toggle-switch${pushEnabled ? ' on' : ''}`}
              onClick={handlePushToggle}
              disabled={pushBusy}
              aria-label="Toggle push notifications"
            >
              <span className="settings-toggle-thumb" />
            </button>
          </div>
          {pushMsg && (
            <p className={`user-settings-msg${pushMsg.includes('enabled') ? ' ok' : pushMsg.includes('disabled') ? '' : ' err'}`}>
              {pushMsg}
            </p>
          )}
        </div>

        {/* ── My View (non-admin only) ── */}
        {userRole !== 'admin' && (
          <div className="user-settings-section">
            <h4 className="user-settings-section-title">My View</h4>
            <p className="user-settings-section-desc">Choose your default focus. You can switch at any time.</p>
            <div className="user-settings-role-grid">
              {[
                { value: 'producer',  label: 'Producer',  desc: 'Manage shows, crew, tasks and automations.' },
                { value: 'backliner', label: 'Backliner', desc: 'Focus on backline setup, checklists and setlists.' },
              ].map(({ value, label, desc }) => (
                <button
                  key={value}
                  className={`user-settings-role-card${roleValue === value ? ' active' : ''}`}
                  onClick={() => handleRoleChange(value)}
                  disabled={roleSaving}
                >
                  <span className="user-settings-role-label">{label}</span>
                  <span className="user-settings-role-desc">{desc}</span>
                </button>
              ))}
            </div>
            {roleMsg && <p className={`user-settings-msg${roleMsg === 'Saved' ? ' ok' : ' err'}`}>{roleMsg}</p>}
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
