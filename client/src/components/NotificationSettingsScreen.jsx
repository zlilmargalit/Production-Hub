import { useState, useEffect } from 'react';
import { subscribeToPush } from '../utils/pushSubscribe';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // 0=Sun … 6=Sat

const DEFAULTS = {
  autoTimed: { on: true, offset: 3 },
  digest:    { on: true, time: '08:00', days: [0, 1, 2, 3, 4] },
  overdue:   { on: true, time: '09:00' },
  assigned:  { on: true },
  quiet:     { on: false, from: '22:00', to: '07:00' },
  channels:  { push: true, email: false },
  email:     { address: '' },
};

function Toggle({ on, onChange, disabled }) {
  return (
    <button
      type="button"
      className={`nset-toggle${on ? ' on' : ''}`}
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      aria-pressed={on}
    >
      <span className="nset-toggle-knob" />
    </button>
  );
}

export default function NotificationSettingsScreen({ onClose }) {
  const [s, setS]           = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/notification-settings', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : DEFAULTS))
      .then((data) => { if (alive) { setS({ ...DEFAULTS, ...data }); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const set = (key, patch) => setS((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch('/api/notification-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(s),
      });
      if (!r.ok) throw new Error('Save failed');
      setMsg({ type: 'ok', text: 'Settings saved' });
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally { setSaving(false); }
  };

  const enablePush = async () => {
    setMsg(null);
    try {
      await subscribeToPush();
      set('channels', { push: true });
      setMsg({ type: 'ok', text: 'Push enabled on this device' });
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    }
  };

  const sendTest = async () => {
    setMsg(null);
    try {
      const r = await fetch('/api/notifications/test', { method: 'POST', credentials: 'include' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Test failed');
      const parts = [];
      if (data.result?.push && data.result.push !== 'skip') parts.push(`push: ${data.result.push}`);
      if (data.result?.email && data.result.email !== 'skip') parts.push(`email: ${data.result.email}`);
      const warn = (data.warnings || []).length ? ` — ${data.warnings.join(' ')}` : '';
      setMsg({ type: (data.warnings || []).length ? 'err' : 'ok', text: `Test sent (${parts.join(', ')})${warn}` });
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    }
  };

  const toggleDay = (d) => {
    const days = s.digest.days.includes(d)
      ? s.digest.days.filter((x) => x !== d)
      : [...s.digest.days, d].sort((a, b) => a - b);
    set('digest', { days });
  };

  // Live lock-screen preview line for the auto reminder
  const previewBody = s.autoTimed.on
    ? `Reminder · ${s.autoTimed.offset}h before a timed task`
    : 'Auto reminders off';

  if (loading) return <div className="nset-screen"><div className="nset-loading">Loading…</div></div>;

  return (
    <div className="nset-screen">
      <div className="nset-head">
        <button className="nset-back" onClick={onClose}>← Tasks</button>
        <h1 className="nset-title">Notifications</h1>
      </div>

      {/* Lock-screen preview */}
      <div className="nset-preview">
        <div className="nset-preview-phone">
          <div className="nset-preview-time">9:41</div>
          <div className="nset-preview-card">
            <div className="nset-preview-app">PRODUCTION HUB · now</div>
            <div className="nset-preview-body">{previewBody}</div>
          </div>
        </div>
      </div>

      <div className="nset-rules">
        {/* 1. Auto reminder */}
        <div className="nset-rule">
          <div className="nset-rule-head">
            <div>
              <div className="nset-rule-name">Auto reminder</div>
              <div className="nset-rule-desc">Every timed task gets an alert before it&#39;s due.</div>
            </div>
            <Toggle on={s.autoTimed.on} onChange={(v) => set('autoTimed', { on: v })} />
          </div>
          {s.autoTimed.on && (
            <div className="nset-rule-sub">
              <span className="nset-sub-label">Hours before</span>
              <div className="nset-stepper">
                <button onClick={() => set('autoTimed', { offset: Math.max(1, s.autoTimed.offset - 1) })}>−</button>
                <span>{s.autoTimed.offset}h</span>
                <button onClick={() => set('autoTimed', { offset: Math.min(12, s.autoTimed.offset + 1) })}>+</button>
              </div>
            </div>
          )}
        </div>

        {/* 2. Daily digest */}
        <div className="nset-rule">
          <div className="nset-rule-head">
            <div>
              <div className="nset-rule-name">Daily digest</div>
              <div className="nset-rule-desc">A summary of open tasks at a set time.</div>
            </div>
            <Toggle on={s.digest.on} onChange={(v) => set('digest', { on: v })} />
          </div>
          {s.digest.on && (
            <div className="nset-rule-sub nset-rule-sub--col">
              <div className="nset-sub-row">
                <span className="nset-sub-label">Time</span>
                <input type="time" className="nset-time" value={s.digest.time}
                  onChange={(e) => set('digest', { time: e.target.value })} />
              </div>
              <div className="nset-day-chips">
                {DAYS.map((d, i) => (
                  <button key={i}
                    className={`nset-day-chip${s.digest.days.includes(i) ? ' on' : ''}`}
                    onClick={() => toggleDay(i)}>{d}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 3. Overdue nudge */}
        <div className="nset-rule">
          <div className="nset-rule-head">
            <div>
              <div className="nset-rule-name">Overdue nudge</div>
              <div className="nset-rule-desc">A daily reminder for tasks past their date.</div>
            </div>
            <Toggle on={s.overdue.on} onChange={(v) => set('overdue', { on: v })} />
          </div>
          {s.overdue.on && (
            <div className="nset-rule-sub">
              <span className="nset-sub-label">Time</span>
              <input type="time" className="nset-time" value={s.overdue.time}
                onChange={(e) => set('overdue', { time: e.target.value })} />
            </div>
          )}
        </div>

        {/* 4. Assigned to me */}
        <div className="nset-rule">
          <div className="nset-rule-head">
            <div>
              <div className="nset-rule-name">Assigned to me</div>
              <div className="nset-rule-desc">Immediate alert when a task is assigned to you.</div>
            </div>
            <Toggle on={s.assigned.on} onChange={(v) => set('assigned', { on: v })} />
          </div>
        </div>

        {/* 5. Quiet hours */}
        <div className="nset-rule">
          <div className="nset-rule-head">
            <div>
              <div className="nset-rule-name">Quiet hours</div>
              <div className="nset-rule-desc">Mute alerts overnight (digest still arrives).</div>
            </div>
            <Toggle on={s.quiet.on} onChange={(v) => set('quiet', { on: v })} />
          </div>
          {s.quiet.on && (
            <div className="nset-rule-sub">
              <span className="nset-sub-label">From</span>
              <input type="time" className="nset-time" value={s.quiet.from}
                onChange={(e) => set('quiet', { from: e.target.value })} />
              <span className="nset-sub-label">To</span>
              <input type="time" className="nset-time" value={s.quiet.to}
                onChange={(e) => set('quiet', { to: e.target.value })} />
            </div>
          )}
        </div>
      </div>

      {/* Channels */}
      <div className="nset-section-label">Channels — pick one or more</div>
      <div className="nset-channels">
        <div className="nset-channel">
          <div className="nset-channel-head">
            <div>
              <div className="nset-rule-name">Push</div>
              <div className="nset-rule-desc">Notifications on this device.</div>
            </div>
            <Toggle on={s.channels.push} onChange={(v) => set('channels', { push: v })} />
          </div>
          {s.channels.push && (
            <button className="nset-link-btn" onClick={enablePush}>Enable on this device</button>
          )}
        </div>

        <div className="nset-channel">
          <div className="nset-channel-head">
            <div>
              <div className="nset-rule-name">Email</div>
              <div className="nset-rule-desc">Notifications to your inbox.</div>
            </div>
            <Toggle on={s.channels.email} onChange={(v) => set('channels', { email: v })} />
          </div>
          {s.channels.email && (
            <input type="email" className="nset-email" placeholder="you@example.com"
              value={s.email.address}
              onChange={(e) => set('email', { address: e.target.value })} />
          )}
        </div>
      </div>

      {msg && <div className={`nset-msg nset-msg--${msg.type}`}>{msg.text}</div>}

      <div className="nset-footer">
        <button className="nset-test-btn" onClick={sendTest}>Send test</button>
        <button className="nset-save-btn" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </div>
  );
}
