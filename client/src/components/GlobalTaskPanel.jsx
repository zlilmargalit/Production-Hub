import { useState } from 'react';

const fmtDate = (d) => {
  if (!d) return null;
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

function GlobalTaskPanel({ tasks, crew, shows, onAdd, onToggle, onDelete }) {
  const [text,       setText]       = useState('');
  const [dueDate,    setDueDate]    = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [showId,     setShowId]     = useState('');
  const [filter,     setFilter]     = useState('active'); // 'active' | 'all' | 'done'

  const handleAdd = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd({
      text:       trimmed,
      dueDate:    dueDate    || null,
      assignedTo: assignedTo || null,
      showId:     showId     || null,
    });
    setText(''); setDueDate(''); setAssignedTo(''); setShowId('');
  };

  const crewById = Object.fromEntries((crew  || []).map((m) => [m.id, m]));
  const showById = Object.fromEntries((shows || []).map((s) => [s.id, s]));

  const filtered = tasks.filter((t) => {
    if (filter === 'active') return !t.completed;
    if (filter === 'done')   return  t.completed;
    return true;
  });

  const countActive = tasks.filter((t) => !t.completed).length;
  const countDone   = tasks.filter((t) =>  t.completed).length;

  return (
    <div className="gtask-page">
      {/* Page header — same editorial pattern as Shows/Crew */}
      <div className="page-header-edit">
        <div className="page-header-left">
          <h1 className="page-title">
            Tasks<span className="page-title-dot">.</span>
          </h1>
          <p className="page-subtitle">
            <span className="page-subtitle-num">{String(countActive).padStart(2, '0')}</span>
            <span className="page-subtitle-line" />
            <span>active</span>
          </p>
        </div>
        <div className="page-marquee" aria-hidden="true">
          <span className="page-marquee-track">
            <span>Tasks</span><span>·</span>
            <span>Tasks</span><span>·</span>
            <span>Tasks</span><span>·</span>
            <span>Tasks</span><span>·</span>
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
          <button
            className="btn-primary gtask-add-btn"
            onClick={handleAdd}
            disabled={!text.trim()}
          >
            Add
          </button>
        </div>
        <div className="gtask-add-meta">
          <input
            type="date"
            className="gtask-date-input"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            title="Due date"
          />
          <select
            className="gtask-select"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
          >
            <option value="">Assign to…</option>
            {(crew || []).map((m) => (
              <option key={m.id} value={m.id}>{m.name}{m.role ? ` (${m.role})` : ''}</option>
            ))}
          </select>
          <select
            className="gtask-select"
            value={showId}
            onChange={(e) => setShowId(e.target.value)}
          >
            <option value="">Link to show…</option>
            {(shows || []).map((s) => (
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
          <button
            key={key}
            className={`gtask-filter-btn ${filter === key ? 'active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
            <span className="gtask-filter-count">{count}</span>
          </button>
        ))}
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="gtask-empty">
          {filter === 'active'
            ? 'No active tasks — you\'re all caught up!'
            : filter === 'done'
            ? 'No completed tasks yet'
            : 'No tasks yet — add one above'}
        </div>
      ) : (
        <ul className="gtask-list">
          {filtered.map((t) => {
            const assignee    = t.assignedTo ? crewById[t.assignedTo]  : null;
            const linkedShow  = t.showId     ? showById[t.showId]      : null;
            const today       = new Date(); today.setHours(0,0,0,0);
            const overdue     = t.dueDate && !t.completed && new Date(t.dueDate) < today;

            return (
              <li
                key={t.id}
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
                    {assignee && (
                      <span className="gtask-pill gtask-pill--crew">{assignee.name}</span>
                    )}
                    {linkedShow && (
                      <span className="gtask-pill gtask-pill--show"
                            title={linkedShow.date ? linkedShow.date : ''}>
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
                <button
                  className="gtask-delete"
                  onClick={() => onDelete(t.id)}
                  title="Delete task"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default GlobalTaskPanel;
