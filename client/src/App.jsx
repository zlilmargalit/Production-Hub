import { useState, useEffect } from 'react';
import ShowList from './components/ShowList';
import ShowForm from './components/ShowForm';
import CrewManager from './components/CrewManager';

function App() {
  const [shows, setShows] = useState([]);
  const [crew, setCrew] = useState([]);
  const [templates, setTemplates] = useState({});
  const [fieldTemplates, setFieldTemplates] = useState({});
  const [eventTypes, setEventTypes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingShow, setEditingShow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState('shows');
  const [syncStatus, setSyncStatus] = useState(null); // null | 'loading' | {added: n}

  useEffect(() => {
    Promise.all([fetchShows(), fetchCrew(), fetchTemplates(), fetchFieldTemplates(), fetchEventTypes()]).finally(() =>
      setLoading(false)
    );
  }, []);

  const fetchShows = async () => {
    const res = await fetch('/api/shows');
    setShows(await res.json());
  };

  const fetchCrew = async () => {
    const res = await fetch('/api/crew');
    setCrew(await res.json());
  };

  const fetchTemplates = async () => {
    const res = await fetch('/api/templates');
    setTemplates(await res.json());
  };

  const fetchFieldTemplates = async () => {
    const res = await fetch('/api/field-templates');
    setFieldTemplates(await res.json());
  };

  const saveFieldTemplate = async (eventType, fields) => {
    await fetch(`/api/field-templates/${encodeURIComponent(eventType)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    setFieldTemplates((prev) => ({ ...prev, [eventType]: fields }));
  };

  const fetchEventTypes = async () => {
    const res = await fetch('/api/event-types');
    setEventTypes(await res.json());
  };

  const saveEventTypes = async (types) => {
    await fetch('/api/event-types', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(types),
    });
    setEventTypes(types);
  };

  const createShow = async (data) => {
    const res = await fetch('/api/shows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const created = await res.json();
    setShows((prev) => [...prev, created]);
  };

  const updateShow = async (id, data) => {
    const res = await fetch(`/api/shows/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const updated = await res.json();
    setShows((prev) => prev.map((s) => (s.id === id ? updated : s)));
  };

  const deleteShow = async (id) => {
    if (!confirm('Delete this show?')) return;
    await fetch(`/api/shows/${id}`, { method: 'DELETE' });
    setShows((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSubmit = async (data) => {
    if (editingShow) {
      await updateShow(editingShow.id, { ...editingShow, ...data });
    } else {
      await createShow(data);
    }
    setShowForm(false);
    setEditingShow(null);
  };

  const [applyStatus, setApplyStatus] = useState(null);

  const applyCrewTemplates = async () => {
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
  };

  const syncShows = async () => {
    setSyncStatus('loading');
    try {
      const res = await fetch('/api/import/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      setSyncStatus(data);
      if (data.added > 0) await fetchShows();
      setTimeout(() => setSyncStatus(null), 5000);
    } catch {
      setSyncStatus({ error: true });
      setTimeout(() => setSyncStatus(null), 4000);
    }
  };

  const openEdit = (show) => {
    setEditingShow(show);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingShow(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>Production Hub</h1>
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
              Crew & Event Types
            </button>
          </nav>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {page === 'shows' && (
            <>
              <button
                className="btn-sync"
                onClick={syncShows}
                disabled={syncStatus === 'loading'}
                title="Sync new shows from Excel spreadsheet"
              >
                {syncStatus === 'loading' ? 'Syncing...' :
                 syncStatus?.error ? 'Error' :
                 syncStatus?.added != null ? `+${syncStatus.added} added` :
                 '↓ Sync'}
              </button>
              <button
                className="btn-sync"
                onClick={applyCrewTemplates}
                disabled={applyStatus === 'loading'}
                title="Auto-assign crew to active shows based on event type templates"
              >
                {applyStatus === 'loading' ? 'Applying...' :
                 applyStatus?.error ? 'Error' :
                 applyStatus?.updated != null ? `✓ ${applyStatus.updated} updated` :
                 '⚙ Crew'}
              </button>
            </>
          )}
          {page === 'shows' && (
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + New Show
            </button>
          )}
        </div>
      </header>

      <main className="app-main">
        {loading ? (
          <div className="loading">Loading...</div>
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
    </div>
  );
}

export default App;
