import { useState, useEffect } from 'react';
import { subscribeToPush } from '../utils/pushSubscribe';
import { useT } from '../i18n';

const DAY_KEYS = [
  'notifications.day.sun',
  'notifications.day.mon',
  'notifications.day.tue',
  'notifications.day.wed',
  'notifications.day.thu',
  'notifications.day.fri',
  'notifications.day.sat',
]; // 0=Sun … 6=Sat

const DEFAULTS = {
  autoTimed: { on: true, offset: 3 },
  digest:    { on: true, time: '08:00', days: [0, 1, 2, 3, 4] },
  overdue:   { on: true, time: '09:00' },
  assigned:  { on: true },
  imported:  { on: true },
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
  const { t, tx } = useT();
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
      if (!r.ok) throw new Error(t('notifications.error.save'));
      setMsg({ type: 'ok', text: t('notifications.saved') });
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally { setSaving(false); }
  };

  const enablePush = async () => {
    setMsg(null);
    try {
      await subscribeToPush();
      set('channels', { push: true });
      setMsg({ type: 'ok', text: t('notifications.pushEnabled') });
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    }
  };

  const sendTest = async () => {
    setMsg(null);
    try {
      const r = await fetch('/api/notifications/test', { method: 'POST', credentials: 'include' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || t('notifications.error.test'));
      const parts = [];
      if (data.result?.push && data.result.push !== 'skip') parts.push(`push: ${data.result.push}`);
      if (data.result?.email && data.result.email !== 'skip') parts.push(`email: ${data.result.email}`);
      const warn = (data.warnings || []).length ? ` — ${data.warnings.join(' ')}` : '';
      setMsg({ type: (data.warnings || []).length ? 'err' : 'ok', text: tx('notifications.testSent', { result: `${parts.join(', ')}${warn}` }) });
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
    ? tx('notifications.preview.reminder', { hours: `${s.autoTimed.offset}h` })
    : t('notifications.preview.off');

  if (loading) return <div className="nset-screen"><div className="nset-loading">{t('common.loading')}</div></div>;

  return (
    <div className="nset-screen">
      <div className="nset-head">
        <button className="nset-back" onClick={onClose}><span className="mirror" aria-hidden="true">←</span> {t('notifications.backTasks')}</button>
        <h1 className="nset-title">{t('notifications.title')}</h1>
      </div>

      {/* Lock-screen preview */}
      <div className="nset-preview">
        <div className="nset-preview-phone">
          <div className="nset-preview-time">9:41</div>
          <div className="nset-preview-card">
            <div className="nset-preview-app">{t('notifications.preview.app')}</div>
            <div className="nset-preview-body">{previewBody}</div>
          </div>
        </div>
      </div>

      <div className="nset-rules">
        {/* 1. Auto reminder */}
        <div className="nset-rule">
          <div className="nset-rule-head">
            <div>
              <div className="nset-rule-name">{t('notifications.autoTimed.name')}</div>
              <div className="nset-rule-desc">{t('notifications.autoTimed.desc')}</div>
            </div>
            <Toggle on={s.autoTimed.on} onChange={(v) => set('autoTimed', { on: v })} />
          </div>
          {s.autoTimed.on && (
            <div className="nset-rule-sub">
              <span className="nset-sub-label">{t('notifications.hoursBefore')}</span>
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
              <div className="nset-rule-name">{t('notifications.digest.name')}</div>
              <div className="nset-rule-desc">{t('notifications.digest.desc')}</div>
            </div>
            <Toggle on={s.digest.on} onChange={(v) => set('digest', { on: v })} />
          </div>
          {s.digest.on && (
            <div className="nset-rule-sub nset-rule-sub--col">
              <div className="nset-sub-row">
                <span className="nset-sub-label">{t('notifications.time')}</span>
                <input type="time" className="nset-time" value={s.digest.time}
                  onChange={(e) => set('digest', { time: e.target.value })} />
              </div>
              <div className="nset-day-chips">
                {DAY_KEYS.map((key, i) => (
                  <button key={i}
                    className={`nset-day-chip${s.digest.days.includes(i) ? ' on' : ''}`}
                    onClick={() => toggleDay(i)}>{t(key)}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 3. Overdue nudge */}
        <div className="nset-rule">
          <div className="nset-rule-head">
            <div>
              <div className="nset-rule-name">{t('notifications.overdue.name')}</div>
              <div className="nset-rule-desc">{t('notifications.overdue.desc')}</div>
            </div>
            <Toggle on={s.overdue.on} onChange={(v) => set('overdue', { on: v })} />
          </div>
          {s.overdue.on && (
            <div className="nset-rule-sub">
              <span className="nset-sub-label">{t('notifications.time')}</span>
              <input type="time" className="nset-time" value={s.overdue.time}
                onChange={(e) => set('overdue', { time: e.target.value })} />
            </div>
          )}
        </div>

        {/* 4. Assigned to me */}
        <div className="nset-rule">
          <div className="nset-rule-head">
            <div>
              <div className="nset-rule-name">{t('notifications.assigned.name')}</div>
              <div className="nset-rule-desc">{t('notifications.assigned.desc')}</div>
            </div>
            <Toggle on={s.assigned.on} onChange={(v) => set('assigned', { on: v })} />
          </div>
        </div>

        {/* 5. Shows imported */}
        <div className="nset-rule">
          <div className="nset-rule-head">
            <div>
              <div className="nset-rule-name">{t('import.notifRule')}</div>
              <div className="nset-rule-desc">{t('import.notifRuleDesc')}</div>
            </div>
            <Toggle on={s.imported.on} onChange={(v) => set('imported', { on: v })} />
          </div>
        </div>

        {/* 6. Quiet hours */}
        <div className="nset-rule">
          <div className="nset-rule-head">
            <div>
              <div className="nset-rule-name">{t('notifications.quiet.name')}</div>
              <div className="nset-rule-desc">{t('notifications.quiet.desc')}</div>
            </div>
            <Toggle on={s.quiet.on} onChange={(v) => set('quiet', { on: v })} />
          </div>
          {s.quiet.on && (
            <div className="nset-rule-sub">
              <span className="nset-sub-label">{t('notifications.from')}</span>
              <input type="time" className="nset-time" value={s.quiet.from}
                onChange={(e) => set('quiet', { from: e.target.value })} />
              <span className="nset-sub-label">{t('notifications.to')}</span>
              <input type="time" className="nset-time" value={s.quiet.to}
                onChange={(e) => set('quiet', { to: e.target.value })} />
            </div>
          )}
        </div>
      </div>

      {/* Channels */}
      <div className="nset-section-label">{t('notifications.channels.label')}</div>
      <div className="nset-channels">
        <div className="nset-channel">
          <div className="nset-channel-head">
            <div>
              <div className="nset-rule-name">{t('notifications.push.name')}</div>
              <div className="nset-rule-desc">{t('notifications.push.desc')}</div>
            </div>
            <Toggle on={s.channels.push} onChange={(v) => set('channels', { push: v })} />
          </div>
          {s.channels.push && (
            <button className="nset-link-btn" onClick={enablePush}>{t('notifications.push.enable')}</button>
          )}
        </div>

        <div className="nset-channel">
          <div className="nset-channel-head">
            <div>
              <div className="nset-rule-name">{t('notifications.email.name')}</div>
              <div className="nset-rule-desc">{t('notifications.email.desc')}</div>
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
        <button className="nset-test-btn" onClick={sendTest}>{t('notifications.sendTest')}</button>
        <button className="nset-save-btn" onClick={save} disabled={saving}>
          {saving ? t('common.saving') : t('notifications.saveSettings')}
        </button>
      </div>
    </div>
  );
}
