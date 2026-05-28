import { useState, useEffect, useRef } from 'react';
import ConfirmModal from './ConfirmModal';

const MODES = ['Taxi', 'Van', 'Self'];

function buildTransportText(mode, driver, time) {
  const parts = [];
  if (mode) parts.push(mode);
  if (driver) parts.push(`Driver: ${driver}`);
  if (time) parts.push(time);
  return parts.join(' — ');
}

function TaskManager({ show, onUpdate, artistId }) {
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
  const [coord, setCoord] = useState({
    lighting: show.lightingCoordinated || false,
    sound: show.soundCoordinated || false,
    rentalNeeds: show.rentalNeeds || '',
    rentalSupplier: show.rentalSupplier || '',
  });
  // ── Tasks — typed ────────────────────────────────────────────────────
  const [newTaskType, setNewTaskType] = useState('checkbox');
  const [newTaskLabel, setNewTaskLabel] = useState('');
  const [newTaskValue, setNewTaskValue] = useState('');
  const [pendingFile, setPendingFile] = useState(null); // { data, name, isPdf? } for image/file
  const [newImgWidth, setNewImgWidth] = useState(80);   // default 80% for images
  const tasks = show.tasks || [];

  // Normalise legacy tasks (only have {id,text,completed}) to new shape
  const normalisedTasks = tasks.map((t) =>
    t.type ? t : { ...t, type: 'checkbox', label: t.text ?? '', inBrief: false }
  );

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

  const saveCoord = (updated) => {
    onUpdate(show.id, {
      ...show,
      lightingCoordinated: updated.lighting,
      soundCoordinated: updated.sound,
      rentalNeeds: updated.rentalNeeds,
      rentalSupplier: updated.rentalSupplier,
    });
  };

  const toggleCoord = (field) => {
    const next = { ...coord, [field]: !coord[field] };
    setCoord(next);
    saveCoord(next);
  };

  const setMode = (mode) => {
    const next = { ...transport, mode: transport.mode === mode ? '' : mode };
    setTransport(next);
    saveTransport(next);
  };

  const addTask = () => {
    const label = newTaskLabel.trim();
    if (!label && !pendingFile) return;
    let newT = { id: crypto.randomUUID(), type: newTaskType, label, inBrief: false };
    if (newTaskType === 'checkbox') {
      newT = { ...newT, completed: false };
    } else if (newTaskType === 'text') {
      newT = { ...newT, value: newTaskValue.trim() };
    } else if (newTaskType === 'image') {
      newT = { ...newT, data: pendingFile?.data ?? '', name: pendingFile?.name ?? '', imgWidth: newImgWidth, inBrief: true };
    } else if (newTaskType === 'file') {
      newT = { ...newT, data: pendingFile?.data ?? '', name: pendingFile?.name ?? '' };
    }
    onUpdate(show.id, { ...show, tasks: [...normalisedTasks, newT] });
    setNewTaskLabel('');
    setNewTaskValue('');
    setPendingFile(null);
    setNewImgWidth(80);
  };

  const toggleTask = (id) =>
    onUpdate(show.id, {
      ...show,
      tasks: normalisedTasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    });

  const removeTask = (id) =>
    onUpdate(show.id, { ...show, tasks: normalisedTasks.filter((t) => t.id !== id) });

  const toggleBrief = (id) =>
    onUpdate(show.id, {
      ...show,
      tasks: normalisedTasks.map((t) => (t.id === id ? { ...t, inBrief: !t.inBrief } : t)),
    });

  const updateImgWidth = (id, w) =>
    onUpdate(show.id, {
      ...show,
      tasks: normalisedTasks.map((t) => (t.id === id ? { ...t, imgWidth: w } : t)),
    });

  const handleFileInput = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPendingFile({ data: ev.target.result, name: file.name, isPdf: file.type === 'application/pdf' });
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const [inviteStatus, setInviteStatus] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  const doSendCalendarInvite = async (testMode = false) => {
    setInviteStatus('loading');
    try {
      const qs = new URLSearchParams();
      if (artistId) qs.set('artistId', artistId);
      if (testMode) qs.set('test', '1');
      const qsStr = qs.toString() ? `?${qs.toString()}` : '';
      const url = `/api/calendar/invite/${show.id}${qsStr}`;
      const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      setInviteStatus(res.ok ? { ok: true, data } : { error: data.error });
      setTimeout(() => setInviteStatus(null), 6000);
    } catch (err) {
      setInviteStatus({ error: err.message });
      setTimeout(() => setInviteStatus(null), 5000);
    }
  };

  const sendCalendarInvite = (testMode = false) => {
    setConfirmModal({
      title: testMode ? 'Send Test Invite' : 'Send Invite to All Crew',
      message: testMode
        ? 'Send a calendar invite to your email only (zlilmargalit0@gmail.com)?'
        : `Send a calendar invite to all crew members assigned to "${show.name}"?`,
      danger: false,
      confirmLabel: 'Send',
      onConfirm: () => { setConfirmModal(null); doSendCalendarInvite(testMode); },
    });
  };

  // Calendar config (which calendar to search)
  const [calConfig, setCalConfig] = useState(null);   // { calendarId, calendarName, calendars }
  const [showCalPicker, setShowCalPicker] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const calPickerRef = useRef(null);
  const calBtnRef = useRef(null);

  const loadCalConfig = async () => {
    try {
      const res = await fetch('/api/calendar/config');
      if (res.ok) {
        setCalConfig(await res.json());
      } else {
        // Calendar not configured on this server (e.g. Railway without Google auth)
        setCalConfig({ calendarId: 'primary', calendarName: 'primary', calendars: [] });
      }
    } catch {
      setCalConfig({ calendarId: 'primary', calendarName: 'primary', calendars: [] });
    }
  };

  useEffect(() => { loadCalConfig(); }, []);

  // Close picker when clicking outside
  useEffect(() => {
    if (!showCalPicker) return;
    const handler = (e) => {
      if (calBtnRef.current && !calBtnRef.current.contains(e.target)) {
        setShowCalPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCalPicker]);

  const openCalPicker = () => {
    if (!showCalPicker && calBtnRef.current) {
      const rect = calBtnRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    }
    setShowCalPicker((p) => !p);
  };

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
            <label>Driver</label>
            <input
              className="fixed-input"
              dir="auto"
              value={transport.driver}
              onChange={(e) => setTransport((p) => ({ ...p, driver: e.target.value }))}
              onBlur={() => saveTransport(transport)}
              placeholder="Driver name"
            />
          </div>
          <div className="fixed-input-group">
            <label>Time</label>
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
            <label>Name</label>
            <input
              className="fixed-input"
              dir="auto"
              value={food.name}
              onChange={(e) => setFood((p) => ({ ...p, name: e.target.value }))}
              onBlur={() => saveFood(food)}
              placeholder="Name / Restaurant"
            />
          </div>
          <div className="fixed-input-group">
            <label>Phone</label>
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
            <label>Time</label>
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

      {/* Technical Coordination */}
      <div className="fixed-task-section">
        <h4 className="fixed-task-title">Technical Coordination</h4>
        <div className="tech-coord-cols">
          {/* Left: Sound + rental needs */}
          <div className="tech-coord-col">
            <label className="mode-check-label">
              <input
                type="checkbox"
                checked={coord.sound}
                onChange={() => toggleCoord('sound')}
              />
              Sound
            </label>
            <textarea
              className="fixed-input tech-coord-rental"
              dir="rtl"
              rows={2}
              value={coord.rentalNeeds}
              onChange={(e) => setCoord((p) => ({ ...p, rentalNeeds: e.target.value }))}
              onBlur={() => saveCoord(coord)}
              placeholder="Equipment to rent..."
            />
          </div>
          {/* Right: Lighting */}
          <div className="tech-coord-col">
            <label className="mode-check-label">
              <input
                type="checkbox"
                checked={coord.lighting}
                onChange={() => toggleCoord('lighting')}
              />
              Lighting
            </label>
          </div>
        </div>
        <div className="fixed-input-group" style={{ marginTop: 10 }}>
          <label>Rental supplier</label>
          <input
            className="fixed-input"
            dir="auto"
            value={coord.rentalSupplier}
            onChange={(e) => setCoord((p) => ({ ...p, rentalSupplier: e.target.value }))}
            onBlur={() => saveCoord(coord)}
            placeholder="Supplier / Rental company"
          />
        </div>
      </div>

      {/* Calendar Invite */}
      <div className="fixed-task-section">
        <h4 className="fixed-task-title">Calendar Invite</h4>

        {/* Calendar selector */}
        <div className="cal-picker-row">
          <span className="cal-picker-label">Calendar:</span>
          <button className="cal-picker-btn" ref={calBtnRef} onClick={openCalPicker}>
            {calConfig ? calConfig.calendarName : 'primary'} ▾
          </button>
          {showCalPicker && calConfig && (
            <div
              className="cal-picker-dropdown"
              style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
            >
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
            Test invite (my email only)
          </button>
          <button
            className="btn-calendar-invite btn-calendar-invite--full"
            onClick={() => sendCalendarInvite(false)}
            disabled={inviteStatus === 'loading'}
            title="Send calendar invite to all crew members assigned to this show"
          >
            Invite all crew
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

        {/* Type selector */}
        <div className="task-type-row">
          {[
            { key: 'checkbox', label: 'Checkbox' },
            { key: 'text',     label: 'Text' },
            { key: 'image',    label: 'Image' },
            { key: 'file',     label: 'File' },
          ].map(({ key, label }) => (
            <button
              key={key}
              className={`task-type-btn ${newTaskType === key ? 'active' : ''}`}
              onClick={() => { setNewTaskType(key); setPendingFile(null); }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Label / content inputs */}
        <div className="task-add-row">
          <input
            className="fixed-input"
            dir="auto"
            value={newTaskLabel}
            onChange={(e) => setNewTaskLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && newTaskType !== 'text' && addTask()}
            placeholder={newTaskType === 'checkbox' ? 'Task description…' : 'Label…'}
          />
          <button className="btn-add-task" onClick={addTask}>Add</button>
        </div>

        {newTaskType === 'text' && (
          <textarea
            className="fixed-input task-textarea"
            dir="auto"
            value={newTaskValue}
            onChange={(e) => setNewTaskValue(e.target.value)}
            placeholder="Text content…"
            rows={3}
          />
        )}

        {(newTaskType === 'image' || newTaskType === 'file') && (
          <div className="task-file-row">
            <label className="task-file-btn">
              {pendingFile ? pendingFile.name : (newTaskType === 'image' ? 'Choose image…' : 'Choose file…')}
              <input type="file" accept={newTaskType === 'image' ? 'image/*,application/pdf' : '*/*'} onChange={handleFileInput} style={{ display: 'none' }} />
            </label>
            {pendingFile && newTaskType === 'image' && !pendingFile.isPdf && (
              <img src={pendingFile.data} alt="preview" className="task-img-preview-sm" />
            )}
          </div>
        )}

        {newTaskType === 'image' && (
          <div className="task-img-width-row">
            <label className="task-img-width-label">Brief width: <strong>{newImgWidth}%</strong></label>
            <input type="range" min={20} max={100} step={5} value={newImgWidth} onChange={(e) => setNewImgWidth(+e.target.value)} className="task-img-slider" />
          </div>
        )}

        {/* Task list */}
        {normalisedTasks.length > 0 && (
          <ul className="task-list">
            {normalisedTasks.map((t) => (
              <li key={t.id} className={`task-item task-item--${t.type} ${t.completed ? 'completed' : ''}`}>
                {t.type === 'checkbox' && (
                  <input type="checkbox" checked={t.completed || false} onChange={() => toggleTask(t.id)} />
                )}
                {t.type !== 'checkbox' && (
                  <span className="task-type-badge">
                    {t.type === 'text' ? 'T' : t.type === 'image' ? 'IMG' : 'FILE'}
                  </span>
                )}

                <div className="task-body">
                  <span className="task-text" dir="auto">{t.label || t.text}</span>

                  {t.type === 'text' && t.value && (
                    <p className="task-text-value" dir="auto">{t.value}</p>
                  )}

                  {t.type === 'image' && t.data && (
                    <div className="task-img-block">
                      {t.data.startsWith('data:application/pdf') || t.name?.endsWith('.pdf') ? (
                        <a href={t.data} download={t.name} className="file-download-link">📎 {t.name}</a>
                      ) : (
                        <img src={t.data} alt={t.label} className="task-img-preview" style={{ width: `${t.imgWidth ?? 80}%` }} />
                      )}
                      <div className="task-img-width-row">
                        <label className="task-img-width-label">Brief width: <strong>{t.imgWidth ?? 80}%</strong></label>
                        <input
                          type="range" min={20} max={100} step={5}
                          value={t.imgWidth ?? 80}
                          onChange={(e) => updateImgWidth(t.id, +e.target.value)}
                          className="task-img-slider"
                        />
                      </div>
                    </div>
                  )}

                  {t.type === 'file' && t.data && (
                    <a href={t.data} download={t.name} className="file-download-link">📎 {t.name}</a>
                  )}
                </div>

                <div className="task-item-actions">
                  {(t.type === 'text' || t.type === 'image' || t.type === 'file') && (
                    <label className="task-brief-toggle" title="Include in Brief / PDF">
                      <input type="checkbox" checked={t.inBrief || false} onChange={() => toggleBrief(t.id)} />
                      <span className="task-brief-label">Brief</span>
                    </label>
                  )}
                  <button className="task-remove" onClick={() => removeTask(t.id)} title="Remove">✕</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          danger={confirmModal.danger !== false}
          confirmLabel={confirmModal.confirmLabel || 'Yes'}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  );
}

export default TaskManager;
