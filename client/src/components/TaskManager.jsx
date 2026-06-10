import { useState, useEffect, useRef } from 'react';
import ConfirmModal from './ConfirmModal';
// ConfirmModal kept for calendar invite confirm dialog

const MODES = ['Taxi', 'Van', 'Self'];

function buildTransportText(mode, driver, time) {
  const parts = [];
  if (mode) parts.push(mode);
  if (driver) parts.push(`Driver: ${driver}`);
  if (time) parts.push(time);
  return parts.join(' — ');
}

const guestListToText = (gl) => {
  if (!gl) return '';
  if (typeof gl === 'string') return gl;
  if (Array.isArray(gl)) return gl.map((g) => g.name + (g.notes ? ` — ${g.notes}` : '')).join('\n');
  return '';
};

// Count total guests from free-text guest list.
// Rules per line:
//   זוג / זוגית          → 2
//   +N  (e.g. +1, +2)    → 1 + N  (the named person plus N more)
//   trailing number N    → N  (e.g. "עדי דוברת 2" = 2 guests on that name)
//   no number            → 1
const countGuests = (text) => {
  if (!text || !text.trim()) return 0;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let total = 0;
  for (const line of lines) {
    if (/זוג(ית)?/u.test(line)) {
      total += 2;
    } else {
      const plusMatch = line.match(/\+\s*(\d+)/);
      if (plusMatch) {
        total += 1 + parseInt(plusMatch[1], 10);
      } else {
        const numMatch = line.match(/(\d+)\s*$/);
        if (numMatch) {
          total += parseInt(numMatch[1], 10);
        } else {
          total += 1;
        }
      }
    }
  }
  return total;
};

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
    soundRentalNeeds: show.soundRentalNeeds || '',
    soundRentalSupplier: show.soundRentalSupplier || '',
    lightingRentalNeeds: show.lightingRentalNeeds || '',
    lightingRentalSupplier: show.lightingRentalSupplier || '',
  });
  const [guestText, setGuestText] = useState(() => guestListToText(show.guestList));

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
    setCoord({
      lighting: show.lightingCoordinated || false,
      sound: show.soundCoordinated || false,
      rentalNeeds: show.rentalNeeds || '',
      rentalSupplier: show.rentalSupplier || '',
      soundRentalNeeds: show.soundRentalNeeds || '',
      soundRentalSupplier: show.soundRentalSupplier || '',
      lightingRentalNeeds: show.lightingRentalNeeds || '',
      lightingRentalSupplier: show.lightingRentalSupplier || '',
    });
    setGuestText(guestListToText(show.guestList));
  }, [
    show.id,
    show.transportMode, show.transportDriver, show.transportTime,
    show.foodContactName, show.foodContactPhone, show.foodContactTime,
    show.lightingCoordinated, show.soundCoordinated,
    show.rentalNeeds, show.rentalSupplier,
    show.soundRentalNeeds, show.soundRentalSupplier,
    show.lightingRentalNeeds, show.lightingRentalSupplier,
    show.guestList,
  ]);

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
      soundRentalNeeds: updated.soundRentalNeeds,
      soundRentalSupplier: updated.soundRentalSupplier,
      lightingRentalNeeds: updated.lightingRentalNeeds,
      lightingRentalSupplier: updated.lightingRentalSupplier,
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

  const saveGuestList = (text) => {
    onUpdate(show.id, { ...show, guestList: text });
  };

  // Copy the whole guest list to the clipboard (no manual selection needed).
  const [guestCopied, setGuestCopied] = useState(false);
  const copyGuestList = async () => {
    const text = guestText.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for non-secure contexts / older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    setGuestCopied(true);
    setTimeout(() => setGuestCopied(false), 1500);
  };

  // Sort the guest list lines alphabetically (Hebrew-aware), preserving any
  // trailing "+1" / count suffixes since they're part of the line text.
  const sortGuestList = () => {
    const sorted = guestText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'he'))
      .join('\n');
    if (sorted === guestText) return;
    setGuestText(sorted);
    saveGuestList(sorted);
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

      {/* Guest List */}
      <div className="fixed-task-section">
        <div className="fixed-task-title-row">
          <h4 className="fixed-task-title">Guest List</h4>
          {countGuests(guestText) > 0 && (
            <span className="guest-count-badge">{countGuests(guestText)}</span>
          )}
          {guestText.trim() && (
            <div className="guest-btn-group">
              <button
                type="button"
                className={`guest-sort-btn${guestCopied ? ' guest-sort-btn--ok' : ''}`}
                onClick={copyGuestList}
                title="Copy the whole guest list"
              >
                {guestCopied ? 'Copied ✓' : 'Copy'}
              </button>
              <button
                type="button"
                className="guest-sort-btn"
                onClick={sortGuestList}
                title="Sort the guest list alphabetically (א–ב)"
              >
                Sort א–ב
              </button>
            </div>
          )}
        </div>
        <textarea
          className="fixed-input guest-list-textarea"
          dir="auto"
          value={guestText}
          onChange={(e) => setGuestText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              // Enter = new line (default textarea behavior — no override needed)
            }
          }}
          onBlur={() => saveGuestList(guestText)}
          placeholder={`שם מוזמן\nשם מוזמן נוסף`}
          rows={4}
        />
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
