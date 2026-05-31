import { useState, useMemo } from 'react';
import BacklineChecklist from './BacklineChecklist';
import TechnicalSetlist  from './TechnicalSetlist';
import TechFiles         from './TechFiles';
import './backliner.css';

const uuidv4  = () => crypto.randomUUID();
const fmtDate = (d) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

// ── Checklist % helper ────────────────────────────────────────────────────────
function checklistProgress(show) {
  const items = [...(show.checklist?.loadIn || []), ...(show.checklist?.loadOut || [])];
  if (!items.length) return null;
  return Math.round((items.filter((i) => i.checked).length / items.length) * 100);
}

// ── Sidebar show row ──────────────────────────────────────────────────────────
function ShowRow({ show, selected, onClick, maintenanceCount }) {
  const pct = checklistProgress(show);
  return (
    <button className={`bk-show-row${selected ? ' active' : ''}`} onClick={onClick}>
      <span className="bk-show-name">{show.name}</span>
      <span className="bk-show-meta">
        {fmtDate(show.date)}{show.venue ? ` · ${show.venue}` : ''}
      </span>
      <span className="bk-show-badges">
        {pct !== null && (
          <span className="bk-show-badge bk-show-badge--checklist">Checklist {pct}%</span>
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

// ── Maintenance log (local to this view) ─────────────────────────────────────
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
        <p className="bk-maint-empty">No maintenance items — all gear is good.</p>
      ) : (
        items.map((t) => (
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
            <button className="bk-icon-btn bk-icon-btn--danger" onClick={() => onDeleteTask(t.id)}>✕</button>
          </div>
        ))
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
        <select className="gtask-select" value={showId} onChange={(e) => setShowId(e.target.value)}>
          <option value="">Link to show…</option>
          {(shows || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input
          type="date"
          className="gtask-date-input"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
        <button className="btn-ghost" onClick={add} disabled={!newText.trim()}>Log</button>
      </div>
    </div>
  );
}

// ── Per-show detail panel ─────────────────────────────────────────────────────
const TABS = [
  { key: 'checklist',   label: 'Checklist' },
  { key: 'setlist',     label: 'Setlist' },
  { key: 'files',       label: 'Files' },
  { key: 'maintenance', label: 'Maintenance' },
];

function ShowDetail({ show, tasks, shows, onUpdateShow, onAddTask, onToggleTask, onDeleteTask }) {
  const [tab, setTab] = useState('checklist');
  return (
    <div className="bk-detail">
      <div className="bk-detail-header">
        <h3 className="bk-detail-show-name" dir="auto">{show.name}</h3>
        <p className="bk-detail-show-meta">
          {fmtDate(show.date)}{show.venue ? ` · ${show.venue}` : ''}{show.eventType ? ` · ${show.eventType}` : ''}
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
        {tab === 'checklist'   && <><div className="bk-section-lbl">Load-in / Load-out Checklist</div><BacklineChecklist show={show} onUpdateShow={onUpdateShow} /></>}
        {tab === 'setlist'     && <><div className="bk-section-lbl">Technical Setlist</div><TechnicalSetlist show={show} onUpdateShow={onUpdateShow} /></>}
        {tab === 'files'       && <><div className="bk-section-lbl">Stage Plots & Input Lists</div><TechFiles show={show} onUpdateShow={onUpdateShow} /></>}
        {tab === 'maintenance' && <><div className="bk-section-lbl">Maintenance Log</div><MaintenanceLog tasks={tasks} shows={shows} onAddTask={onAddTask} onToggleTask={onToggleTask} onDeleteTask={onDeleteTask} /></>}
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function BacklinerDashboard({ shows, tasks, crew, onUpdateShow, onAddTask, onToggleTask, onDeleteTask }) {
  const [selectedId, setSelectedId] = useState(null);

  const sorted = useMemo(() =>
    [...shows].filter((s) => !s.archived).sort((a, b) => new Date(a.date) - new Date(b.date)),
    [shows]
  );

  const selected = sorted.find((s) => s.id === selectedId) || sorted[0] || null;
  const maintenanceTasks = (tasks || []).filter((t) => t.category === 'maintenance');

  return (
    <div className="bk-page">
      <div className="bk-hero">
        <h2 className="bk-title">Backliner<span className="bk-dot">.</span></h2>
        <p className="bk-sub">
          <span className="bk-sub-num">{String(sorted.length).padStart(2, '0')}</span>
          <span className="bk-sub-sep" />
          <span>show{sorted.length !== 1 ? 's' : ''}</span>
          {maintenanceTasks.filter((t) => !t.completed).length > 0 && (
            <><span className="bk-sub-sep" /><span>{maintenanceTasks.filter((t) => !t.completed).length} open maintenance</span></>
          )}
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="bk-empty">
          <div className="bk-empty-icon">○</div>
          <span>No shows yet — add one in the Shows tab.</span>
        </div>
      ) : (
        <div className="bk-layout">
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
          {selected && (
            <ShowDetail
              show={selected}
              tasks={tasks}
              shows={shows}
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
