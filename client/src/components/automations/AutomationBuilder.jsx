import { useState } from 'react';

const TRIGGERS = [
  { value: 'email',      label: 'Email arrives (Gmail)' },
  { value: 'schedule',   label: 'Daily schedule check' },
  { value: 'show-event', label: 'Show is created or updated' },
  { value: 'task',       label: 'Task is completed' },
  { value: 'cal-event',  label: 'Calendar event is created' },
];

const ACTIONS = [
  { value: 'push',          label: 'Send push notification' },
  { value: 'create-show',   label: 'Create a new show' },
  { value: 'create-folder', label: 'Create Google Drive folder' },
  { value: 'send-email',    label: 'Send email' },
  { value: 'cal-invite',    label: 'Send calendar invite' },
  { value: 'add-task',      label: 'Add a task' },
];

const FIELDS = [
  { value: 'subject',       label: 'Email subject' },
  { value: 'from',          label: 'Email from' },
  { value: 'body',          label: 'Email body' },
  { value: 'daysBeforeShow',label: 'Days before show' },
  { value: 'eventType',     label: 'Event type' },
  { value: 'venue',         label: 'Venue' },
  { value: 'status',        label: 'Show status' },
];

const OPS = [
  { value: 'contains',     label: 'contains' },
  { value: 'not-contains', label: 'does not contain' },
  { value: 'equals',       label: 'equals' },
  { value: 'not-equals',   label: 'does not equal' },
  { value: 'gt',           label: 'is greater than' },
  { value: 'lt',           label: 'is less than' },
];

function buildLabel(trigger, action, conditions) {
  const trig = TRIGGERS.find((t) => t.value === trigger)?.label || trigger;
  const act  = ACTIONS.find((a)  => a.value === action)?.label  || action;
  const cond = conditions.length
    ? ` · if ${conditions.map((c) => `${c.field} ${c.op} "${c.value}"`).join(` ${c?.logic || 'AND'} `)}`
    : '';
  return `${trig} → ${act}${cond}`;
}

function buildPreview(trigger, action, params) {
  const trig = TRIGGERS.find((t) => t.value === trigger)?.label || trigger;
  const act  = ACTIONS.find((a)  => a.value === action)?.label  || action;
  const detail = params.message
    ? ` "${params.message.slice(0, 60)}${params.message.length > 60 ? '…' : ''}"`
    : params.taskTitle
    ? ` "${params.taskTitle}"`
    : params.folderTemplate
    ? ` "${params.folderTemplate}"`
    : '';
  return `When ${trig} → ${act}${detail}`;
}

// ── Parameter fields per action type ────────────────────────────────────────
function ParamFields({ action, params, onChange }) {
  const set = (k, v) => onChange({ ...params, [k]: v });

  switch (action) {
    case 'push':
      return (
        <div className="bldr-cond-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <input
            className="bldr-input bldr-input--full"
            placeholder='e.g. Heads up — [Show Name] is in 14 days! ([Show Date])'
            value={params.message || ''}
            onChange={(e) => set('message', e.target.value)}
          />
          <p className="bldr-param-hint">
            Use <code>[Show Name]</code>, <code>[Show Date]</code>, <code>[Venue]</code> to interpolate show details.
          </p>
        </div>
      );
    case 'create-show':
      return (
        <input
          className="bldr-input bldr-input--full"
          placeholder="Show name template, e.g. [Subject]"
          value={params.nameTemplate || ''}
          onChange={(e) => set('nameTemplate', e.target.value)}
        />
      );
    case 'create-folder':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            className="bldr-input bldr-input--full"
            placeholder="Folder name template, e.g. [Artist] — [Show Date] — [Venue]"
            value={params.folderTemplate || ''}
            onChange={(e) => set('folderTemplate', e.target.value)}
          />
          <p className="bldr-param-hint">
            Use <code>[Artist]</code>, <code>[Show Date]</code>, <code>[Venue]</code> as dynamic values.
          </p>
        </div>
      );
    case 'send-email':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            className="bldr-input bldr-input--full"
            placeholder="Subject"
            value={params.emailSubject || ''}
            onChange={(e) => set('emailSubject', e.target.value)}
          />
          <textarea
            className="bldr-input bldr-input--full"
            rows={3}
            placeholder="Email body…"
            value={params.emailBody || ''}
            onChange={(e) => set('emailBody', e.target.value)}
            style={{ resize: 'vertical' }}
          />
        </div>
      );
    case 'cal-invite':
      return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="bldr-input"
            style={{ flex: 2, minWidth: 180 }}
            placeholder="Event title"
            value={params.title || ''}
            onChange={(e) => set('title', e.target.value)}
          />
          <input
            className="bldr-input"
            style={{ flex: '0 0 80px' }}
            type="number"
            min={1}
            max={90}
            placeholder="Days before"
            value={params.daysBeforeShow || ''}
            onChange={(e) => set('daysBeforeShow', e.target.value)}
            title="Days before show to send the invite"
          />
        </div>
      );
    case 'add-task':
      return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="bldr-input"
            style={{ flex: 2, minWidth: 180 }}
            placeholder="Task title"
            value={params.taskTitle || ''}
            onChange={(e) => set('taskTitle', e.target.value)}
          />
          <select
            className="bldr-select bldr-select--sm"
            value={params.taskPriority || 'medium'}
            onChange={(e) => set('taskPriority', e.target.value)}
            style={{ flex: '0 0 130px' }}
          >
            <option value="low">Low priority</option>
            <option value="medium">Medium priority</option>
            <option value="high">High priority</option>
          </select>
        </div>
      );
    default:
      return null;
  }
}

// ── Main Builder ─────────────────────────────────────────────────────────────
export default function AutomationBuilder({ onSave }) {
  const [trigger,    setTrigger]    = useState('schedule');
  const [conditions, setConditions] = useState([]);
  const [action,     setAction]     = useState('push');
  const [params,     setParams]     = useState({ message: '' });
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);

  // Reset params when action changes
  const changeAction = (val) => {
    setAction(val);
    setParams({});
  };

  const addCondition = () => {
    setConditions((prev) => [
      ...prev,
      { field: 'subject', op: 'contains', value: '', logic: prev.length ? 'AND' : null },
    ]);
  };

  const updateCond = (i, patch) => {
    setConditions((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };

  const removeCond = (i) => {
    setConditions((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      // First condition logic must always be null
      if (next.length > 0) next[0] = { ...next[0], logic: null };
      return next;
    });
  };

  const toggleLogic = (i) => {
    updateCond(i, { logic: conditions[i].logic === 'AND' ? 'OR' : 'AND' });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const label = buildLabel(trigger, action, conditions);
      await onSave({ label, triggerType: trigger, conditions, actionType: action, actionParams: params });
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        // Reset builder
        setTrigger('schedule');
        setConditions([]);
        setAction('push');
        setParams({ message: '' });
      }, 1500);
    } finally {
      setSaving(false);
    }
  };

  const preview = buildPreview(trigger, action, params);

  return (
    <div className="bldr-card">
      {/* TRIGGER */}
      <div className="bldr-block">
        <div className="bldr-block-label">
          <span className="bldr-kw bldr-kw--trigger">Trigger</span>
          <span className="bldr-block-hint">What starts this automation?</span>
        </div>
        <select
          className="bldr-select"
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
        >
          {TRIGGERS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* CONDITIONS */}
      <div className="bldr-block">
        <div className="bldr-block-label">
          <span className="bldr-kw bldr-kw--cond">Conditions</span>
          <span className="bldr-block-hint">Optional filters — all must match unless using OR</span>
        </div>
        <div className="bldr-cond-stack">
          {conditions.map((cond, i) => (
            <div key={i} className="bldr-cond-row">
              {i === 0 ? (
                <span className="bldr-cond-first-label">Where</span>
              ) : (
                <button className="bldr-logic-pill" onClick={() => toggleLogic(i)}>
                  {cond.logic || 'AND'}
                </button>
              )}
              <select
                className="bldr-select bldr-select--sm"
                value={cond.field}
                onChange={(e) => updateCond(i, { field: e.target.value })}
              >
                {FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              <select
                className="bldr-select bldr-select--op"
                value={cond.op}
                onChange={(e) => updateCond(i, { op: e.target.value })}
              >
                {OPS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                className="bldr-input"
                style={{ flex: '1 1 120px', minWidth: 80 }}
                placeholder="value"
                value={cond.value}
                onChange={(e) => updateCond(i, { value: e.target.value })}
              />
              <button className="bldr-remove-btn" onClick={() => removeCond(i)} title="Remove condition">
                ×
              </button>
            </div>
          ))}
          <button className="bldr-add-cond-btn" onClick={addCondition}>
            + Add condition
          </button>
        </div>
      </div>

      {/* ACTION */}
      <div className="bldr-block">
        <div className="bldr-block-label">
          <span className="bldr-kw bldr-kw--action">Action</span>
          <span className="bldr-block-hint">What should happen?</span>
        </div>
        <select
          className="bldr-select"
          value={action}
          onChange={(e) => changeAction(e.target.value)}
        >
          {ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
      </div>

      {/* PARAMETERS */}
      <div className="bldr-block">
        <div className="bldr-block-label">
          <span className="bldr-kw bldr-kw--param">Parameters</span>
          <span className="bldr-block-hint">Configure the action</span>
        </div>
        <ParamFields action={action} params={params} onChange={setParams} />
      </div>

      {/* Save bar */}
      <div className="bldr-actions">
        <div className="bldr-preview">
          <span className="bldr-preview-label">Preview:</span>
          <span className="bldr-preview-text">{preview}</span>
        </div>
        <button
          className={`btn-primary${saved ? ' btn--saved' : ''}`}
          onClick={handleSave}
          disabled={saving || saved}
          style={{ flexShrink: 0 }}
        >
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save rule'}
        </button>
      </div>
    </div>
  );
}
