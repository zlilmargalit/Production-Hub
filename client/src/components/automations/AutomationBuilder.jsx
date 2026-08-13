import { useState } from 'react';
import { useT } from '../../i18n';

const TRIGGERS = [
  { value: 'email',      labelKey: 'auto.trigger.email' },
  { value: 'schedule',   labelKey: 'auto.trigger.schedule' },
  { value: 'show-event', labelKey: 'auto.trigger.showEvent' },
  { value: 'task',       labelKey: 'auto.trigger.task' },
  { value: 'cal-event',  labelKey: 'auto.trigger.calEvent' },
];

const ACTIONS = [
  { value: 'push',          labelKey: 'auto.action.push' },
  { value: 'create-show',   labelKey: 'auto.action.createShow' },
  { value: 'create-folder', labelKey: 'auto.action.createFolder' },
  { value: 'send-email',    labelKey: 'auto.action.sendEmail' },
  { value: 'cal-invite',    labelKey: 'auto.action.calInvite' },
  { value: 'add-task',      labelKey: 'auto.action.addTask' },
];

const FIELDS = [
  { value: 'subject',       labelKey: 'auto.field.subject' },
  { value: 'from',          labelKey: 'auto.field.from' },
  { value: 'body',          labelKey: 'auto.field.body' },
  { value: 'daysBeforeShow',labelKey: 'auto.field.daysBeforeShow' },
  { value: 'eventType',     labelKey: 'auto.field.eventType' },
  { value: 'venue',         labelKey: 'auto.field.venue' },
  { value: 'status',        labelKey: 'auto.field.status' },
];

// Automation template tokens. server/routes/automations.js matches these
// literally, so they are syntax and never translate — in either dictionary.
const SHOW_TOKENS   = ['[Show Name]', '[Show Date]', '[Venue]'];  // i18n-ignore
const FOLDER_TOKENS = ['[Artist]', '[Show Date]', '[Venue]'];     // i18n-ignore

const tokenList = (tokens) => tokens.map((tok, i) => (
  <span key={tok}>{i > 0 ? ', ' : null}<code>{tok}</code></span>
));

const OPS = [
  { value: 'contains',     labelKey: 'auto.op.contains' },
  { value: 'not-contains', labelKey: 'auto.op.notContains' },
  { value: 'equals',       labelKey: 'auto.op.equals' },
  { value: 'not-equals',   labelKey: 'auto.op.notEquals' },
  { value: 'gt',           labelKey: 'auto.op.gt' },
  { value: 'lt',           labelKey: 'auto.op.lt' },
];

// `t` is passed in rather than read from a hook: these run at render time,
// but they are module-scope helpers with no component of their own.
function buildLabel(t, trigger, action, conditions) {
  const trig = t(TRIGGERS.find((x) => x.value === trigger)?.labelKey) || trigger;
  const act  = t(ACTIONS.find((x)  => x.value === action)?.labelKey)  || action;
  const cond = conditions.length
    ? ` · if ${conditions.map((condition, index) => (
      `${index ? ` ${condition.logic || 'AND'} ` : ''}${condition.field} ${condition.op} "${condition.value}"`
    )).join('')}`
    : '';
  return `${trig} → ${act}${cond}`;
}

function buildPreview(t, trigger, action, params) {
  const trig = t(TRIGGERS.find((x) => x.value === trigger)?.labelKey) || trigger;
  const act  = t(ACTIONS.find((x)  => x.value === action)?.labelKey)  || action;
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
  const { t, tx } = useT();
  const set = (k, v) => onChange({ ...params, [k]: v });

  switch (action) {
    case 'push':
      return (
        <div className="bldr-cond-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <input
            className="bldr-input bldr-input--full"
            placeholder={t('auto.param.pushExample')}
            value={params.message || ''}
            onChange={(e) => set('message', e.target.value)}
          />
          {/* The [Token] names are matched literally by interpolate() on the
              server, so they are syntax rather than copy and never translate.
              They ride in as one interpolated value. */}
          <p className="bldr-param-hint">
            {tx('auto.param.pushHint', { tokens: tokenList(SHOW_TOKENS) })}
          </p>
        </div>
      );
    case 'create-show':
      return (
        <input
          className="bldr-input bldr-input--full"
          placeholder={t('auto.param.showTemplate')}
          value={params.nameTemplate || ''}
          onChange={(e) => set('nameTemplate', e.target.value)}
        />
      );
    case 'create-folder':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            className="bldr-input bldr-input--full"
            placeholder={t('auto.param.folderTemplate')}
            value={params.folderTemplate || ''}
            onChange={(e) => set('folderTemplate', e.target.value)}
          />
          <p className="bldr-param-hint">
            {tx('auto.param.folderHint', { tokens: tokenList(FOLDER_TOKENS) })}
          </p>
        </div>
      );
    case 'send-email':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            className="bldr-input bldr-input--full"
            placeholder={t('auto.param.subject')}
            value={params.emailSubject || ''}
            onChange={(e) => set('emailSubject', e.target.value)}
          />
          <textarea
            className="bldr-input bldr-input--full"
            rows={3}
            placeholder={t('auto.param.emailBody')}
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
            placeholder={t('auto.param.eventTitle')}
            value={params.title || ''}
            onChange={(e) => set('title', e.target.value)}
          />
          <input
            className="bldr-input"
            style={{ flex: '0 0 80px' }}
            type="number"
            min={1}
            max={90}
            placeholder={t('auto.param.daysBefore')}
            value={params.daysBeforeShow || ''}
            onChange={(e) => set('daysBeforeShow', e.target.value)}
            title={t('auto.param.daysBeforeHint')}
          />
        </div>
      );
    case 'add-task':
      return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="bldr-input"
            style={{ flex: 2, minWidth: 180 }}
            placeholder={t('auto.param.taskTitle')}
            value={params.taskTitle || ''}
            onChange={(e) => set('taskTitle', e.target.value)}
          />
          <select
            className="bldr-select bldr-select--sm"
            value={params.taskPriority || 'medium'}
            onChange={(e) => set('taskPriority', e.target.value)}
            style={{ flex: '0 0 130px' }}
          >
            <option value="low">{t('auto.param.priorityLow')}</option>
            <option value="medium">{t('auto.param.priorityMed')}</option>
            <option value="high">{t('auto.param.priorityHigh')}</option>
          </select>
        </div>
      );
    default:
      return null;
  }
}

// ── Main Builder ─────────────────────────────────────────────────────────────
export default function AutomationBuilder({ onSave }) {
  const { t } = useT();
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
      const label = buildLabel(t, trigger, action, conditions);
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

  const preview = buildPreview(t, trigger, action, params);

  return (
    <div className="bldr-card">
      {/* TRIGGER */}
      <div className="bldr-block">
        <div className="bldr-block-label">
          <span className="bldr-kw bldr-kw--trigger">{t('auto.col.trigger')}</span>
          <span className="bldr-block-hint">{t('auto.col.triggerHint')}</span>
        </div>
        <select
          className="bldr-select"
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
        >
          {TRIGGERS.map((opt) => (
            <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
          ))}
        </select>
      </div>

      {/* CONDITIONS */}
      <div className="bldr-block">
        <div className="bldr-block-label">
          <span className="bldr-kw bldr-kw--cond">{t('auto.col.conditions')}</span>
          <span className="bldr-block-hint">{t('auto.col.conditionsHint')}</span>
        </div>
        <div className="bldr-cond-stack">
          {conditions.map((cond, i) => (
            <div key={i} className="bldr-cond-row">
              {i === 0 ? (
                <span className="bldr-cond-first-label">{t('auto.cond.where')}</span>
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
                  <option key={f.value} value={f.value}>{t(f.labelKey)}</option>
                ))}
              </select>
              <select
                className="bldr-select bldr-select--op"
                value={cond.op}
                onChange={(e) => updateCond(i, { op: e.target.value })}
              >
                {OPS.map((o) => (
                  <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                ))}
              </select>
              <input
                className="bldr-input"
                style={{ flex: '1 1 120px', minWidth: 80 }}
                placeholder="value"
                value={cond.value}
                onChange={(e) => updateCond(i, { value: e.target.value })}
              />
              <button className="bldr-remove-btn" onClick={() => removeCond(i)} title={t('auto.cond.remove')}>
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
          <span className="bldr-kw bldr-kw--action">{t('auto.col.action')}</span>
          <span className="bldr-block-hint">{t('auto.col.actionHint')}</span>
        </div>
        <select
          className="bldr-select"
          value={action}
          onChange={(e) => changeAction(e.target.value)}
        >
          {ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>{t(a.labelKey)}</option>
          ))}
        </select>
      </div>

      {/* PARAMETERS */}
      <div className="bldr-block">
        <div className="bldr-block-label">
          <span className="bldr-kw bldr-kw--param">{t('auto.col.params')}</span>
          <span className="bldr-block-hint">{t('auto.col.paramsHint')}</span>
        </div>
        <ParamFields action={action} params={params} onChange={setParams} />
      </div>

      {/* Save bar */}
      <div className="bldr-actions">
        <div className="bldr-preview">
          <span className="bldr-preview-label">{t('auto.preview')}</span>
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
