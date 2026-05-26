import { useState, useEffect, useRef } from 'react';

const MODES = ['מונית', 'ואן', 'עצמאית'];

function buildTransportText(mode, driver, time) {
  const parts = [];
  if (mode) parts.push(mode);
  if (driver) parts.push(`נהג: ${driver}`);
  if (time) parts.push(time);
  return parts.join(' — ');
}

function TaskManager({ show, onUpdate }) {
  const [transport, setTransport] = useState({
    mode: show.transportMode || '',
    driver: show.transportDriver || '',
    time: show.transportTime || '',
  });
  const [food, setFood] = useState({
    name: show.foodContactName || '',
    phone: show.foodContactPhone || '',
    time: show.foodContactTime || '',
  });
  const [newTask, setNewTask] = useState('');
  const tasks = show.tasks || [];

  useEffect(() => {
    setTransport({
      mode: show.transportMode || '',
      driver: show.transportDriver || '',
      time: show.transportTime || '',
    });
    setFood({
      name: show.foodContactName || '',
      phone: show.foodContactPhone || '',
      time: show.foodContactTime || '',
    });
  }, [show.id]);

  const saveTransport = (updated) => {
    const text = buildTransportText(updated.mode, updated.driver, updated.time);
    onUpdate(show.id, {
      ...show,
      transportMode: updated.mode,
      transportDriver: updated.driver,
      transportTime: updated.time,
      transportation: text || show.transportation,
    });
  };

  const saveFood = (updated) => {
    onUpdate(show.id, {
      ...show,
      foodContactName: updated.name,
      foodContactPhone: updated.phone,
      foodContactTime: updated.time,
    });
  };

  const setMode = (mode) => {
    const next = { ...transport, mode: transport.mode === mode ? '' : mode };
    setTransport(next);
    saveTransport(next);
  };

  const addTask = () => {
    const text = newTask.trim();
    if (!text) return;
    onUpdate(show.id, {
      ...show,
      tasks: [...tasks, { id: crypto.randomUUID(), text, completed: false }],
    });
    setNewTask('');
  };

  const toggleTask = (id) =>
    onUpdate(show.id, {
      ...show,
      tasks: tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    });

  const removeTask = (id) =>
    onUpdate(show.id, { ...show, tasks: tasks.filter((t) => t.id !== id) });

  const [inviteStatus, setInviteStatus] = useState(null);
  const sendCalendarInvite = async (testMode = false) => {
    setInviteStatus('loading');
    try {
      const url = `/api/calendar/invite/${show.id}${testMode ? '?test=1' : ''}`;
      const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      setInviteStatus(res.ok ? { ok: true, data } : { error: data.error });
      setTimeout(() => setInviteStatus(null), 6000);
    } catch (err) {
      setInviteStatus({ error: err.message });
      setTimeout(() => setInviteStatus(null), 5000);
    }
  };

  // Calendar config (which calendar to search)
  const [calConfig, setCalConfig] = useState(null);   // { calendarId, calendarName, calendars }
  const [showCalPicker, setShowCalPicker] = useState(false);
  const calPickerRef = useRef(null);

  const loadCalConfig = async () => {
    try {
      const res = await fetch('/api/calendar/config');
      if (res.ok) setCalConfig(await res.json());
    } catch {}
  };

  useEffect(() => { loadCalConfig(); }, []);

  const saveCalendar = async (id) => {
    await fetch('/api/calendar/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendarId: id }),
    });
    setShowCalPicker(false);
    loadCalConfig();
  };

  return (
    <div className="fixed-tasks">
      {/* Transport */}
      <div className="fixed-task-section">
        <h4 className="fixed-task-title">Transport</h4>
        <div className="transport-modes">
          {MODES.map((m) => (
            <label key={m} className="mode-check-label">
              <input
                type="checkbox"
                checked={transport.mode === m}
                onChange={() => setMode(m)}
              />
              {m}
            </label>
          ))}
        </div>
        <div className="fixed-inputs-row">
          <div className="fixed-input-group">
            <label>שם נהג</label>
            <input
              className="fixed-input"
              dir="rtl"
              value={transport.driver}
              onChange={(e) => setTransport((p) => ({ ...p, driver: e.target.value }))}
              onBlur={() => saveTransport(transport)}
              placeholder="שם הנהג"
            />
          </div>
          <div className="fixed-input-group">
            <label>שעה</label>
            <input
              className="fixed-input"
              dir="ltr"
              value={transport.time}
              onChange={(e) => setTransport((p) => ({ ...p, time: e.target.value }))}
              onBlur={() => saveTransport(transport)}
              placeholder="17:00"
            />
          </div>
        </div>
      </div>

      {/* Food */}
      <div className="fixed-task-section">
        <h4 className="fixed-task-title">Food</h4>
        <div className="fixed-inputs-row">
          <div className="fixed-input-group">
            <label>שם</label>
            <input
              className="fixed-input"
              dir="rtl"
              value={food.name}
              onChange={(e) => setFood((p) => ({ ...p, name: e.target.value }))}
              onBlur={() => saveFood(food)}
              placeholder="שם / מסעדה"
            />
          </div>
          <div className="fixed-input-group">
            <label>טלפון</label>
            <input
              className="fixed-input"
              dir="ltr"
              value={food.phone}
              onChange={(e) => setFood((p) => ({ ...p, phone: e.target.value }))}
              onBlur={() => saveFood(food)}
              placeholder="050-..."
            />
          </div>
          <div className="fixed-input-group">
            <label>שעה</label>
            <input
              className="fixed-input"
              dir="ltr"
              value={food.time}
              onChange={(e) => setFood((p) => ({ ...p, time: e.target.value }))}
              onBlur={() => saveFood(food)}
              placeholder="13:00"
            />
          </div>
        </div>
      </div>

      {/* Calendar Invite */}
      <div className="fixed-task-section">
        <h4 className="fixed-task-title">Calendar Invite</h4>

        {/* Calendar selector */}
        <div className="cal-picker-row" ref={calPickerRef}>
          <span className="cal-picker-label">📅 Calendar:</span>
          <button className="cal-picker-btn" onClick={() => setShowCalPicker((p) => !p)}>
            {calConfig ? calConfig.calendarName : 'primary'} ▾
          </button>
          {showCalPicker && calConfig && (
            <div className="cal-picker-dropdown">
              {calConfig.calendars.length === 0 && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', padding: '6px 10px' }}>No calendars found</p>
              )}
              {calConfig.calendars.map((c) => (
                <button
                  key={c.id}
                  className={`cal-picker-option${calConfig.calendarId === c.id || (calConfig.calendarId === 'primary' && c.primary) ? ' selected' : ''}`}
                  onClick={() => saveCalendar(c.id)}
                >
                  {c.name}{c.primary ? ' ★' : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          <button
            className="btn-calendar-invite"
            onClick={() => sendCalendarInvite(true)}
            disabled={inviteStatus === 'loading'}
            title="Test — sends invite only to zlilmargalit0@gmail.com"
          >
            📅 Test invite (my email only)
          </button>
          <button
            className="btn-calendar-invite btn-calendar-invite--full"
            onClick={() => sendCalendarInvite(false)}
            disabled={inviteStatus === 'loading'}
            title="Send calendar invite to all crew members assigned to this show"
          >
            📅 Invite all crew
          </button>
        </div>
        {inviteStatus && inviteStatus !== 'loading' && (
          <p style={{ fontSize: '0.8rem', marginTop: 6, color: inviteStatus.ok ? '#3D7A51' : '#B05448' }}>
            {inviteStatus.ok
              ? `✓ Event ${inviteStatus.data?.action || 'sent'} — ${inviteStatus.data?.attendees?.join(', ')}`
              : `✕ ${inviteStatus.error}`}
          </p>
        )}
      </div>

      {/* Tasks */}
      <div className="fixed-task-section">
        <h4 className="fixed-task-title">Tasks</h4>
        <div className="task-add-row">
          <input
            className="fixed-input"
            dir="auto"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTask()}
            placeholder="Add task..."
          />
          <button className="btn-add-task" onClick={addTask}>Add</button>
        </div>
        {tasks.length > 0 && (
          <ul className="task-list">
            {tasks.map((t) => (
              <li key={t.id} className={`task-item ${t.completed ? 'completed' : ''}`}>
                <input type="checkbox" checked={t.completed} onChange={() => toggleTask(t.id)} />
                <span className="task-text" dir="auto">{t.text}</span>
                <button className="task-remove" onClick={() => removeTask(t.id)}>✕</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default TaskManager;
