import { useState } from 'react';
import { subscribeToPush } from '../utils/pushSubscribe';

const fmtDate = (d) => {
  if (!d) return null;
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

// ── Inline edit form shown inside a task row ─────────────────────────────────
function TaskEditForm({ task, crew, shows, onSave, onCancel }) {
  const [text,       setText]       = useState(task.text);
  const [dueDate,    setDueDate]    = useState(task.dueDate    || '');
  const [assignedTo, setAssignedTo] = useState(task.assignedTo || '');
  const [showId,     setShowId]     = useState(task.showId     || '');

  const handleSave = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSave({ text: trimmed, dueDate: dueDate || null, assignedTo: assignedTo || null, showId: showId || null });
  };

  return (
    <div className="gtask-edit-form">
      <div className="gtask-add-top">
        <input
          className="gtask-text-input"
          dir="auto"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel(); }}
          autoFocus
        />
      </div>
      <div className="gtask-add-meta">
        <input
          type="date"
          className="gtask-date-input"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
        <select className="gtask-select" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
          <option value="">Assign to…</option>
          {(crew || []).map((m) => (
            <option key={m.id} value={m.id}>{m.name}{m.role ? ` (${m.role})` : ''}</option>
          ))}
        </select>
        <select className="gtask-select" value={showId} onChange={(e) => setShowId(e.target.value)}>
          <option value="">Link to show…</option>
          {[...(shows || [])].sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1).map((s) => (
            <option key={s.id} value={s.id}>{s.name}{s.date ? ` · ${s.date}` : ''}</option>
          ))}
        </select>
      </div>
      <div className="gtask-edit-actions">
        <button className="btn-primary" onClick={handleSave} disabled={!text.trim()}>Save</button>
        <button className="btn-ghost"   onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────
function GlobalTaskPanel({ tasks, crew, shows, onAdd, onToggle, onDelete, onUpdate }) {
  const [text,       setText]       = useState('');
  const [dueDate,    setDueDate]    = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [showId,     setShowId]     = useState('');
  const [filter,     setFilter]     = useState('active');
  const [editingId,  setEditingId]  = useState(null);
  const [pushStatus, setPushStatus] = useState(null); // null | 'sending' | 'ok' | 'error'
  const [pushMsg,    setPushMsg]    = useState('');

  const handleTestPush = async () => {
    setPushStatus('sending');
    setPushMsg('');
    try {
      // Silently re-register subscription so the server always has a current endpoint,
      // regardless of whether the user has visited the Automations page yet.
      if ('Notification' in window && Notification.permission === 'granted') {
        await subscribeToPush().catch(() => {});
      }
      const res = await fetch('/api/automations/push/test', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setPushStatus('error'); setPushMsg(data.error || 'Failed'); }
      else         { setPushStatus('ok');    setPushMsg(`Sent to ${data.sent} subscription${data.sent !== 1 ? 's' : ''}`); }
    } catch {
      setPushStatus('error'); setPushMsg('Network error');
    }
    setTimeout(() => { setPushStatus(null); setPushMsg(''); }, 4000);
  };

  const handleAdd = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd({ text: trimmed, dueDate: dueDate || null, assignedTo: assignedTo || null, showId: showId || null });
    setText(''); setDueDate(''); setAssignedTo(''); setShowId('');
  };

  const handleSaveEdit = (id, data) => {
    onUpdate(id, data);
    setEditingId(null);
  };

  const crewById = Object.fromEntries((crew  || []).map((m) => [m.id, m]));
  const showById = Object.fromEntries((shows || []).map((s) => [s.id, s]));

  // Split own tasks vs tasks assigned to me from team
  const ownTasks      = tasks.filter((t) => !t.assignedToMe);
  const assignedTasks = tasks.filter((t) =>  t.assignedToMe);

  const filtered = ownTasks.filter((t) => {
    if (filter === 'active') return !t.completed;
    if (filter === 'done')   return  t.completed;
    return true;
  });

  const countActive = ownTasks.filter((t) => !t.completed).length;
  const countDone   = ownTasks.filter((t) =>  t.completed).length;

  return (
    <div className="gtask-page">
      {/* Page header */}
      <div className="page-header-edit">
        <div className="page-header-left">
          <h1 className="page-title">Tasks<span className="page-title-dot">.</span></h1>
          <p className="page-subtitle">
            <span className="page-subtitle-num">{String(countActive).padStart(2, '0')}</span>
            <span className="page-subtitle-line" />
            <span>active</span>
          </p>
        </div>
        <button
          className={`gtask-test-push-btn${pushStatus === 'ok' ? ' gtask-test-push-btn--ok' : pushStatus === 'error' ? ' gtask-test-push-btn--err' : ''}`}
          onClick={handleTestPush}
          disabled={pushStatus === 'sending'}
          title="Send a test push notification to verify your browser subscription"
        >
          {pushStatus === 'sending' ? 'Sending…'
            : pushStatus === 'ok'   ? `✓ ${pushMsg}`
            : pushStatus === 'error'? `✕ ${pushMsg}`
            : 'Test Push'}
        </button>

        <div className="page-marquee" aria-hidden="true">
          <span className="page-marquee-track">
            <span>Tasks</span><span>·</span><span>Tasks</span><span>·</span>
            <span>Tasks</span><span>·</span><span>Tasks</span><span>·</span>
          </span>
        </div>
      </div>

      {/* Add-task form */}
      <div className="gtask-add-card">
        <div className="gtask-add-top">
          <input
            className="gtask-text-input"
            dir="auto"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="New task…"
          />
          <button className="btn-primary gtask-add-btn" onClick={handleAdd} disabled={!text.trim()}>
            Add
          </button>
        </div>
        <div className="gtask-add-meta">
          <input type="date" className="gtask-date-input" value={dueDate}
            onChange={(e) => setDueDate(e.target.value)} title="Due date" />
          <select className="gtask-select" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">Assign to…</option>
            {(crew || []).map((m) => (
              <option key={m.id} value={m.id}>{m.name}{m.role ? ` (${m.role})` : ''}</option>
            ))}
          </select>
          <select className="gtask-select" value={showId} onChange={(e) => setShowId(e.target.value)}>
            <option value="">Link to show…</option>
            {[...(shows || [])].sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1).map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.date ? ` · ${s.date}` : ''}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Filter bar */}
      <div className="gtask-filter-bar">
        {[
          { key: 'active', label: 'Active',    count: countActive },
          { key: 'all',    label: 'All',        count: tasks.length },
          { key: 'done',   label: 'Completed',  count: countDone },
        ].map(({ key, label, count }) => (
          <button key={key}
            className={`gtask-filter-btn ${filter === key ? 'active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}<span className="gtask-filter-count">{count}</span>
          </button>
        ))}
      </div>

      {/* Assigned-to-me section (team tasks) */}
      {assignedTasks.length > 0 && (
        <div className="gtask-assigned-section">
          <div className="gtask-assigned-header">Assigned to me</div>
          <ul className="gtask-list">
            {assignedTasks.map((t) => {
              const today = new Date(); today.setHours(0, 0, 0, 0);
              const overdue = t.dueDate && !t.completed && new Date(t.dueDate) < today;
              return (
                <li key={t.id}
                  className={`gtask-item${t.completed ? ' completed' : ''}${overdue ? ' overdue' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="gtask-check"
                    checked={t.completed}
                    onChange={() => onToggle(t.id, !t.completed)}
                  />
                  <div className="gtask-body">
                    <span className="gtask-text" dir="auto">{t.text}</span>
                    <div className="gtask-pills">
                      <span className="gtask-pill gtask-pill--assigned">assigned</span>
                      {t.dueDate && (
                        <span className={`gtask-pill gtask-pill--date${overdue ? ' overdue' : ''}`}>
                          {overdue ? '⚠ ' : ''}{fmtDate(t.dueDate)}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="gtask-empty">
          {filter === 'active' ? "No active tasks — you're all caught up!"
            : filter === 'done' ? 'No completed tasks yet'
            : 'No tasks yet — add one above'}
        </div>
      ) : (
        <ul className="gtask-list">
          {filtered.map((t) => {
            const assignee   = t.assignedTo ? crewById[t.assignedTo] : null;
            const linkedShow = t.showId     ? showById[t.showId]     : null;
            const today      = new Date(); today.setHours(0, 0, 0, 0);
            const overdue    = t.dueDate && !t.completed && new Date(t.dueDate) < today;
            const isEditing  = editingId === t.id;

            return (
              <li key={t.id}
                className={`gtask-item${t.completed ? ' completed' : ''}${overdue ? ' overdue' : ''}${isEditing ? ' editing' : ''}`}
              >
                {isEditing ? (
                  <TaskEditForm
                    task={t}
                    crew={crew}
                    shows={shows}
                    onSave={(data) => handleSaveEdit(t.id, data)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    <input
                      type="checkbox"
                      className="gtask-check"
                      checked={t.completed}
                      onChange={() => onToggle(t.id, !t.completed)}
                    />
                    <div className="gtask-body">
                      <span className="gtask-text" dir="auto">{t.text}</span>
                      <div className="gtask-pills">
                        {assignee && (
                          <span className="gtask-pill gtask-pill--crew">{assignee.name}</span>
                        )}
                        {linkedShow && (
                          <span className="gtask-pill gtask-pill--show" title={linkedShow.date || ''}>
                            {linkedShow.name}
                          </span>
                        )}
                        {t.dueDate && (
                          <span className={`gtask-pill gtask-pill--date${overdue ? ' overdue' : ''}`}>
                            {overdue ? '⚠ ' : ''}{fmtDate(t.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="gtask-item-actions">
                      <button className="btn-action" onClick={() => setEditingId(t.id)}>Edit</button>
                      <button className="btn-action btn-action--danger" onClick={() => onDelete(t.id)}>Delete</button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default GlobalTaskPanel;
