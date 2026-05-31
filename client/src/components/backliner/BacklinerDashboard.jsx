import { useState, useMemo, useCallback } from 'react';
import './backliner.css';

const uuidv4 = () => crypto.randomUUID();

const fmtDate = (d) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

const fmtMs = (ms) => {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

// Derive checklist progress (0–100) for a show
function checklistProgress(show) {
  const items = [
    ...(show.checklist?.loadIn  || []),
    ...(show.checklist?.loadOut || []),
  ];
  if (!items.length) return null;
  const done = items.filter((i) => i.checked).length;
  return Math.round((done / items.length) * 100);
}

// ── Show row in sidebar ───────────────────────────────────────────────────────
function ShowRow({ show, selected, onClick, maintenanceCount }) {
  const pct = checklistProgress(show);
  return (
    <button className={`bk-show-row${selected ? ' active' : ''}`} onClick={onClick}>
      <span className="bk-show-name">{show.name}</span>
      <span className="bk-show-meta">
        {fmtDate(show.date)}
        {show.venue ? ` · ${show.venue}` : ''}
      </span>
      <span className="bk-show-badges">
        {pct !== null && (
          <span className="bk-show-badge bk-show-badge--checklist">
            Checklist {pct}%
          </span>
        )}
        {maintenanceCount > 0 && (
          <span className="bk-show-badge bk-show-badge--maintenance">
            {maintenanceCount} fix{maintenanceCount !== 1 ? 'es' : ''}
          </span>
        )}
      </span>
    </button>
  );
}

// ── Feature 1: Backline Checklist ─────────────────────────────────────────────
function BacklineChecklist({ show, onUpdateShow }) {
  const [newText,  setNewText]  = useState({ loadIn: '', loadOut: '' });
  const [isRental, setIsRental] = useState({ loadIn: false, loadOut: false });

  const checklist = show.checklist || { loadIn: [], loadOut: [] };

  const patchChecklist = useCallback(async (next) => {
    await onUpdateShow(show.id, { ...show, checklist: next });
  }, [show, onUpdateShow]);

  const toggleItem = (phase, id) => {
    const next = {
      ...checklist,
      [phase]: checklist[phase].map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item
      ),
    };
    patchChecklist(next);
  };

  const removeItem = (phase, id) => {
    const next = { ...checklist, [phase]: checklist[phase].filter((i) => i.id !== id) };
    patchChecklist(next);
  };

  const addItem = (phase) => {
    const text = newText[phase].trim();
    if (!text) return;
    const item = { id: uuidv4(), text, checked: false, rental: isRental[phase], rentalFrom: '' };
    const next = { ...checklist, [phase]: [...checklist[phase], item] };
    patchChecklist(next);
    setNewText((prev) => ({ ...prev, [phase]: '' }));
    setIsRental((prev) => ({ ...prev, [phase]: false }));
  };

  const total  = (checklist.loadIn.length + checklist.loadOut.length);
  const done   = [...checklist.loadIn, ...checklist.loadOut].filter((i) => i.checked).length;
  const pct    = total ? Math.round((done / total) * 100) : 0;

  const Col = ({ phase, label }) => (
    <div>
      <p className="bk-checklist-col-title">{label}</p>
      {checklist[phase].length > 0 && (
        <div>
          {checklist[phase].map((item) => (
            <div key={item.id} className="bk-checklist-item">
              <input
                type="checkbox"
                className="bk-checklist-check"
                checked={item.checked}
                onChange={() => toggleItem(phase, item.id)}
              />
              <span className={`bk-checklist-text${item.checked ? ' bk-checklist-text--done' : ''}`}>
                {item.text}
              </span>
              {item.rental && <span className="bk-rental-tag">Rental</span>}
              <span className="bk-item-actions">
                <button
                  className="bk-icon-btn bk-icon-btn--danger"
                  title="Remove item"
                  onClick={() => removeItem(phase, item.id)}
                >
                  ✕
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="bk-add-row">
        <input
          className="bk-add-input"
          placeholder="Add item…"
          dir="auto"
          value={newText[phase]}
          onChange={(e) => setNewText((prev) => ({ ...prev, [phase]: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') addItem(phase); }}
        />
        <button
          className={`bk-rental-toggle${isRental[phase] ? ' on' : ''}`}
          onClick={() => setIsRental((prev) => ({ ...prev, [phase]: !prev[phase] }))}
          title="Mark as rental"
        >
          Rental
        </button>
        <button className="btn-ghost" onClick={() => addItem(phase)} disabled={!newText[phase].trim()}>
          Add
        </button>
      </div>
    </div>
  );

  return (
    <div>
      {total > 0 && (
        <div className="bk-checklist-progress">
          <span>{done}/{total} items</span>
          <div className="bk-progress-bar">
            <div className="bk-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span>{pct}%</span>
        </div>
      )}
      <div className="bk-checklist-cols">
        <Col phase="loadIn"  label="Load In"  />
        <Col phase="loadOut" label="Load Out" />
      </div>
    </div>
  );
}

// ── Feature 2: Technical Setlist ──────────────────────────────────────────────
function TechnicalSetlist({ show, onUpdateShow }) {
  const [editingId,  setEditingId]  = useState(null);
  const [editNote,   setEditNote]   = useState('');
  const [newSong,    setNewSong]    = useState('');

  const setlist = show.setlist || [];

  const patchSetlist = (next) => onUpdateShow(show.id, { ...show, setlist: next });

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditNote(item.techNote || '');
  };

  const saveNote = (id) => {
    patchSetlist(setlist.map((s) => s.id === id ? { ...s, techNote: editNote.trim() } : s));
    setEditingId(null);
  };

  const addSong = () => {
    const name = newSong.trim();
    if (!name) return;
    patchSetlist([...setlist, { id: uuidv4(), name, durationMs: null, techNote: '' }]);
    setNewSong('');
  };

  const removeSong = (id) => patchSetlist(setlist.filter((s) => s.id !== id));

  if (!setlist.length) {
    return (
      <div>
        <p className="bk-setlist-import-hint">
          No setlist added yet. Add songs manually below, or use the Setlist Calculator to build one first.
        </p>
        <div className="bk-add-form">
          <input
            className="bk-add-input"
            placeholder="Song name…"
            dir="auto"
            value={newSong}
            onChange={(e) => setNewSong(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addSong(); }}
          />
          <button className="btn-ghost" onClick={addSong} disabled={!newSong.trim()}>Add</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="bk-setlist-list">
        {setlist.map((song, idx) => (
          <div key={song.id} className="bk-setlist-row">
            <span className="bk-setlist-num">{idx + 1}.</span>
            <div className="bk-setlist-song">
              <span className="bk-setlist-name">{song.name}</span>
              {editingId === song.id ? (
                <input
                  className="bk-add-input"
                  style={{ marginTop: 4 }}
                  autoFocus
                  placeholder="Tech note (e.g. Drop D tuning)…"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  onBlur={() => saveNote(song.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveNote(song.id); if (e.key === 'Escape') setEditingId(null); }}
                />
              ) : (
                song.techNote && <span className="bk-setlist-note">{song.techNote}</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {song.durationMs && <span className="bk-setlist-duration">{fmtMs(song.durationMs)}</span>}
              <button className="bk-icon-btn" title="Add/edit tech note" onClick={() => startEdit(song)}>
                ✎
              </button>
              <button className="bk-icon-btn bk-icon-btn--danger" title="Remove song" onClick={() => removeSong(song.id)}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="bk-add-form">
        <input
          className="bk-add-input"
          placeholder="Add song…"
          dir="auto"
          value={newSong}
          onChange={(e) => setNewSong(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addSong(); }}
        />
        <button className="btn-ghost" onClick={addSong} disabled={!newSong.trim()}>Add</button>
      </div>
    </div>
  );
}

// ── Feature 3: Stage Plots & Input Lists ──────────────────────────────────────
const FILE_TYPES = [
  { key: 'stagePlot',  label: 'Stage Plot' },
  { key: 'inputList',  label: 'Input List' },
  { key: 'rider',      label: 'Rider' },
  { key: 'other',      label: 'Other' },
];

function TechFiles({ show, onUpdateShow }) {
  const [url,   setUrl]   = useState('');
  const [label, setLabel] = useState('');
  const [type,  setType]  = useState('stagePlot');

  const files = show.techFiles || [];

  const patchFiles = (next) => onUpdateShow(show.id, { ...show, techFiles: next });

  const addFile = () => {
    const u = url.trim();
    const l = label.trim();
    if (!u || !l) return;
    patchFiles([...files, { id: uuidv4(), type, label: l, url: u, addedAt: new Date().toISOString() }]);
    setUrl(''); setLabel('');
  };

  const removeFile = (id) => patchFiles(files.filter((f) => f.id !== id));

  const typeLabel = (key) => FILE_TYPES.find((t) => t.key === key)?.label || key;

  return (
    <div>
      {files.length > 0 ? (
        <div className="bk-files-grid">
          {files.map((f) => (
            <div key={f.id} className="bk-file-card">
              <span className="bk-file-type-tag">{typeLabel(f.type)}</span>
              <span className="bk-file-label">{f.label}</span>
              <div className="bk-file-actions">
                <a className="bk-file-link" href={f.url} target="_blank" rel="noopener noreferrer">Open</a>
                <button className="bk-icon-btn bk-icon-btn--danger" onClick={() => removeFile(f.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: 'var(--text-3)', fontSize: '0.875rem', marginBottom: 16 }}>
          No files linked yet. Paste a Google Drive, Dropbox, or any URL below.
        </p>
      )}

      <div className="bk-add-form" style={{ flexWrap: 'wrap' }}>
        <select
          className="gtask-select"
          value={type}
          onChange={(e) => setType(e.target.value)}
          style={{ flexShrink: 0 }}
        >
          {FILE_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
        <input
          className="bk-add-input"
          placeholder="Label (e.g. Stage Plot v2)…"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ minWidth: 140 }}
        />
        <input
          className="bk-add-input"
          placeholder="URL…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addFile(); }}
          style={{ minWidth: 200 }}
        />
        <button className="btn-ghost" onClick={addFile} disabled={!url.trim() || !label.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}

// ── Feature 4: Maintenance Log ────────────────────────────────────────────────
function MaintenanceLog({ tasks, shows, onAddTask, onToggleTask, onDeleteTask }) {
  const [newText, setNewText] = useState('');
  const [showId,  setShowId]  = useState('');
  const [dueDate, setDueDate] = useState('');

  const items = (tasks || []).filter((t) => t.category === 'maintenance');

  const add = async () => {
    const text = newText.trim();
    if (!text) return;
    await onAddTask({ text, category: 'maintenance', showId: showId || null, dueDate: dueDate || null });
    setNewText(''); setShowId(''); setDueDate('');
  };

  return (
    <div>
      {items.length === 0 ? (
        <p className="bk-maint-empty">No maintenance items logged — all gear is good.</p>
      ) : (
        <div>
          {items.map((t) => (
            <div key={t.id} className="bk-maint-item">
              <input
                type="checkbox"
                className="bk-maint-check"
                checked={!!t.completed}
                onChange={() => onToggleTask(t.id, !t.completed)}
              />
              <span className={`bk-maint-text${t.completed ? ' bk-maint-text--done' : ''}`} dir="auto">
                {t.text}
              </span>
              {t.dueDate && <span className="bk-maint-due">{fmtDate(t.dueDate)}</span>}
              <button className="bk-icon-btn bk-icon-btn--danger" onClick={() => onDeleteTask(t.id)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bk-add-form" style={{ flexWrap: 'wrap' }}>
        <input
          className="bk-add-input"
          placeholder="Gear issue (e.g. Fix bass amp)…"
          dir="auto"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          style={{ minWidth: 200 }}
        />
        <select
          className="gtask-select"
          value={showId}
          onChange={(e) => setShowId(e.target.value)}
        >
          <option value="">Link to show…</option>
          {(shows || []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input
          type="date"
          className="gtask-date-input"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
        <button className="btn-ghost" onClick={add} disabled={!newText.trim()}>
          Log
        </button>
      </div>
    </div>
  );
}

// ── Tab-bar wrapper ───────────────────────────────────────────────────────────
const TABS = [
  { key: 'checklist',   label: 'Checklist' },
  { key: 'setlist',     label: 'Setlist' },
  { key: 'files',       label: 'Files' },
  { key: 'maintenance', label: 'Maintenance' },
];

function ShowDetail({ show, tasks, shows, crew, onUpdateShow, onAddTask, onToggleTask, onDeleteTask }) {
  const [tab, setTab] = useState('checklist');

  return (
    <div className="bk-detail">
      <div className="bk-detail-header">
        <h3 className="bk-detail-show-name" dir="auto">{show.name}</h3>
        <p className="bk-detail-show-meta">
          {fmtDate(show.date)}
          {show.venue ? ` · ${show.venue}` : ''}
          {show.eventType ? ` · ${show.eventType}` : ''}
        </p>
        <div className="bk-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`bk-tab-btn${tab === t.key ? ' active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bk-panel">
        {tab === 'checklist' && (
          <>
            <div className="bk-section-lbl">Load-in / Load-out Checklist</div>
            <BacklineChecklist show={show} onUpdateShow={onUpdateShow} />
          </>
        )}
        {tab === 'setlist' && (
          <>
            <div className="bk-section-lbl">Technical Setlist</div>
            <TechnicalSetlist show={show} onUpdateShow={onUpdateShow} />
          </>
        )}
        {tab === 'files' && (
          <>
            <div className="bk-section-lbl">Stage Plots & Input Lists</div>
            <TechFiles show={show} onUpdateShow={onUpdateShow} />
          </>
        )}
        {tab === 'maintenance' && (
          <>
            <div className="bk-section-lbl">Maintenance Log</div>
            <MaintenanceLog
              tasks={tasks}
              shows={shows}
              onAddTask={onAddTask}
              onToggleTask={onToggleTask}
              onDeleteTask={onDeleteTask}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function BacklinerDashboard({ shows, tasks, crew, onUpdateShow, onAddTask, onToggleTask, onDeleteTask }) {
  const [selectedId, setSelectedId] = useState(null);

  const sorted = useMemo(() =>
    [...shows]
      .filter((s) => !s.archived)
      .sort((a, b) => new Date(a.date) - new Date(b.date)),
    [shows]
  );

  const selected = sorted.find((s) => s.id === selectedId) || sorted[0] || null;
  const maintenanceTasks = (tasks || []).filter((t) => t.category === 'maintenance');

  return (
    <div className="bk-page">
      {/* Hero */}
      <div className="bk-hero">
        <h2 className="bk-title">Backliner<span className="bk-dot">.</span></h2>
        <p className="bk-sub">
          <span className="bk-sub-num">{String(sorted.length).padStart(2, '0')}</span>
          <span className="bk-sub-sep" />
          <span>show{sorted.length !== 1 ? 's' : ''}</span>
          {maintenanceTasks.filter((t) => !t.completed).length > 0 && (
            <>
              <span className="bk-sub-sep" />
              <span>{maintenanceTasks.filter((t) => !t.completed).length} open maintenance item{maintenanceTasks.filter((t) => !t.completed).length !== 1 ? 's' : ''}</span>
            </>
          )}
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="bk-empty">
          <div className="bk-empty-icon">○</div>
          <span>No shows yet. Add a show in the Shows tab first.</span>
        </div>
      ) : (
        <div className="bk-layout">
          {/* Sidebar */}
          <aside className="bk-sidebar">
            {sorted.map((show) => (
              <ShowRow
                key={show.id}
                show={show}
                selected={show.id === selected?.id}
                onClick={() => setSelectedId(show.id)}
                maintenanceCount={maintenanceTasks.filter((t) => t.showId === show.id && !t.completed).length}
              />
            ))}
          </aside>

          {/* Detail */}
          {selected && (
            <ShowDetail
              show={selected}
              tasks={tasks}
              shows={shows}
              crew={crew}
              onUpdateShow={onUpdateShow}
              onAddTask={onAddTask}
              onToggleTask={onToggleTask}
              onDeleteTask={onDeleteTask}
            />
          )}
        </div>
      )}
    </div>
  );
}
