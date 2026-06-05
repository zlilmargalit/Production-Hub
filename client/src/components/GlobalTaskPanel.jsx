import { useState, useRef } from 'react';
import { subscribeToPush } from '../utils/pushSubscribe';

const fmtDate = (d) => {
  if (!d) return null;
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

const sortedShows = (shows) =>
  [...(shows || [])].sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1);

// ── Inline edit form ──────────────────────────────────────────────────────────
function TaskEditForm({ task, crew, shows, onSave, onCancel }) {
  const [text,       setText]       = useState(task.text);
  const [notes,      setNotes]      = useState(task.notes || '');
  const [dueDate,    setDueDate]    = useState(task.dueDate    || '');
  const [assignedTo, setAssignedTo] = useState(task.assignedTo || '');
  const [showId,     setShowId]     = useState(task.showId     || '');

  const handleSave = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSave({ text: trimmed, notes: notes.trim() || null, dueDate: dueDate || null, assignedTo: assignedTo || null, showId: showId || null });
  };

  return (
    <div className="gtask-edit-form">
      <div className="gtask-add-top">
        <input
          className="gtask-text-input"
          dir="auto"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
          autoFocus
        />
      </div>
      <textarea
        className="gtask-notes-input"
        dir="auto"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Additional details…"
        rows={3}
      />
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
          {sortedShows(shows).map((s) => (
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

// ── Main panel ────────────────────────────────────────────────────────────────
function GlobalTaskPanel({ tasks, crew, shows, onAdd, onToggle, onDelete, onUpdate }) {
  const [text,        setText]        = useState('');
  const [notes,       setNotes]       = useState('');
  const [showNotes,   setShowNotes]   = useState(false);
  const [dueDate,     setDueDate]     = useState('');
  const [assignedTo,  setAssignedTo]  = useState('');
  const [showId,      setShowId]      = useState('');
  const [filter,      setFilter]      = useState('active');
  const [editingId,   setEditingId]   = useState(null);
  const [expandedId,  setExpandedId]  = useState(null);
  const [noteDraft,   setNoteDraft]   = useState('');   // draft for expanded inline notes
  const [pushStatus,  setPushStatus]  = useState(null);
  const [pushMsg,     setPushMsg]     = useState('');
  const noteSaveTimer = useRef(null);

  const handleTestPush = async () => {
    setPushStatus('sending'); setPushMsg('');
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        await subscribeToPush().catch(() => {});
      }
      const res  = await fetch('/api/automations/push/test', { method: 'POST' });
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
    onAdd({ text: trimmed, notes: notes.trim() || null, dueDate: dueDate || null, assignedTo: assignedTo || null, showId: showId || null });
    setText(''); setNotes(''); setShowNotes(false); setDueDate(''); setAssignedTo(''); setShowId('');
  };

  const handleSaveEdit = (id, data) => {
    onUpdate(id, data);
    setEditingId(null);
  };

  // Expand a task row to show inline notes editor
  const toggleExpand = (t) => {
    if (editingId === t.id) return;
    if (expandedId === t.id) {
      setExpandedId(null);
    } else {
      setExpandedId(t.id);
      setNoteDraft(t.notes || '');
    }
  };

  // Auto-save notes on blur
  const saveNoteBlur = (taskId) => {
    clearTimeout(noteSaveTimer.current);
    noteSaveTimer.current = setTimeout(() => {
      onUpdate(taskId, { notes: noteDraft.trim() || null });
    }, 300);
  };

  const crewById = Object.fromEntries((crew  || []).map((m) => [m.id, m]));
  const showById = Object.fromEntries((shows || []).map((s) => [s.id, s]));

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
          title="Send a test push notification"
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

        {/* Expandable details textarea */}
        {showNotes ? (
          <textarea
            className="gtask-notes-input"
            dir="auto"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional details…"
            rows={3}
            autoFocus
          />
        ) : (
          <button
            className="gtask-add-details-btn"
            onClick={() => setShowNotes(true)}
          >
            + Details
          </button>
        )}

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
            {sortedShows(shows).map((s) => (
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

      {/* Assigned-to-me section */}
      {assignedTasks.length > 0 && (
        <div className="gtask-assigned-section">
          <div className="gtask-assigned-header">Assigned to me</div>
          <ul className="gtask-list">
            {assignedTasks.map((t) => {
              const today  = new Date(); today.setHours(0, 0, 0, 0);
              const overdue = t.dueDate && !t.completed && new Date(t.dueDate) < today;
              const isExpanded = expandedId === t.id;
              return (
                <li key={t.id}
                  className={`gtask-item${t.completed ? ' completed' : ''}${overdue ? ' overdue' : ''}${isExpanded ? ' expanded' : ''}`}
                >
                  <input type="checkbox" className="gtask-check" checked={t.completed}
                    onChange={() => onToggle(t.id, !t.completed)} />
                  <div className="gtask-body" onClick={() => toggleExpand(t)}>
                    <span className="gtask-text" dir="auto">{t.text}</span>
                    <div className="gtask-pills">
                      <span className="gtask-pill gtask-pill--assigned">assigned</span>
                      {t.dueDate && (
                        <span className={`gtask-pill gtask-pill--date${overdue ? ' overdue' : ''}`}>
                          {overdue ? '⚠ ' : ''}{fmtDate(t.dueDate)}
                        </span>
                      )}
                    </div>
                    {isExpanded && (
                      <textarea
                        className="gtask-notes-inline"
                        dir="auto"
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        onBlur={() => saveNoteBlur(t.id)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Additional details…"
                        rows={3}
                        autoFocus
                      />
                    )}
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
            const isEditing  = editingId  === t.id;
            const isExpanded = expandedId === t.id;

            return (
              <li key={t.id}
                className={`gtask-item${t.completed ? ' completed' : ''}${overdue ? ' overdue' : ''}${isEditing ? ' editing' : ''}${isExpanded ? ' expanded' : ''}`}
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
                    <div
                      className="gtask-body"
                      onClick={() => toggleExpand(t)}
                      style={{ cursor: 'pointer' }}
                    >
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
                        {t.notes && !isExpanded && (
                          <span className="gtask-pill gtask-pill--notes" title={t.notes}>
                            details
                          </span>
                        )}
                      </div>

                      {/* Inline notes panel */}
                      {isExpanded && (
                        <div className="gtask-notes-panel" onClick={(e) => e.stopPropagation()}>
                          <textarea
                            className="gtask-notes-inline"
                            dir="auto"
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            onBlur={() => saveNoteBlur(t.id)}
                            placeholder="Additional details…"
                            rows={3}
                            autoFocus
                          />
                          <div className="gtask-notes-hint">Saves automatically when you click away</div>
                        </div>
                      )}
                    </div>

                    <div className="gtask-item-actions">
                      <button className="btn-action" onClick={(e) => { e.stopPropagation(); setEditingId(t.id); setExpandedId(null); }}>Edit</button>
                      <button className="btn-action btn-action--danger" onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}>Delete</button>
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
