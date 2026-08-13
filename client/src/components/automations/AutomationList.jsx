import { useState } from 'react';
import { useT } from '../../i18n';

const TRIGGER_LABELS = {
  'email':      'auto.list.trigger.email',
  'schedule':   'auto.list.trigger.schedule',
  'show-event': 'auto.list.trigger.showEvent',
  'task':       'auto.list.trigger.task',
  'cal-event':  'auto.list.trigger.calEvent',
};

const ACTION_LABELS = {
  'push':          'auto.list.action.push',
  'create-show':   'auto.list.action.createShow',
  'create-folder': 'auto.list.action.createFolder',
  'send-email':    'auto.list.action.sendEmail',
  'cal-invite':    'auto.list.action.calInvite',
  'add-task':      'auto.list.action.addTask',
};

function buildSentence(t, auto) {
  const trig = TRIGGER_LABELS[auto.triggerType] ? t(TRIGGER_LABELS[auto.triggerType]) : auto.triggerType;
  const act  = ACTION_LABELS[auto.actionType] ? t(ACTION_LABELS[auto.actionType]) : auto.actionType;
  const conds = (auto.conditions || []);
  const condStr = conds.length
    ? ` · ${t('auto.list.if')} ${conds.map((c, i) => {
        const prefix = i > 0 ? ` ${c.logic || 'AND'} ` : '';
        return `${prefix}${c.field} ${c.op} "${c.value}"`;
      }).join('')}`
    : '';
  return `${trig} → ${act}${condStr}`;
}

export default function AutomationList({ automations, onToggle, onDelete }) {
  const { t, tx } = useT();
  const [busy, setBusy] = useState(null);

  const handleToggle = async (auto) => {
    setBusy(auto.id + '-toggle');
    try { await onToggle(auto.id, !auto.active); }
    finally { setBusy(null); }
  };

  const handleDelete = async (auto) => {
    if (!window.confirm(t('auto.list.confirmDelete'))) return;
    setBusy(auto.id + '-delete');
    try { await onDelete(auto.id); }
    finally { setBusy(null); }
  };

  return (
    <div className="auto-list">
      <div className="auto-list-head">
        <span className="auto-list-lbl">{t('auto.list.activeRules')}</span>
        <span className="auto-list-count">{tx('auto.list.activeCount', { count: automations.filter((a) => a.active).length })}</span>
      </div>

      {automations.length === 0 ? (
        <div style={{ padding: '24px 18px', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.875rem' }}>
          {t('auto.list.empty')}
        </div>
      ) : (
        automations.map((auto) => (
          <div key={auto.id} className={`auto-row${!auto.active ? ' auto-row--off' : ''}`}>
            <span className="auto-row-dot" />
            <div className="auto-sentence">
              <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{auto.label}</strong>
              <div style={{ marginTop: 2, fontSize: '0.75rem', opacity: 0.75 }}>
                {buildSentence(t, auto)}
              </div>
            </div>
            <div className="auto-row-actions">
              <button
                className="auto-act-btn"
                onClick={() => handleToggle(auto)}
                disabled={busy === auto.id + '-toggle'}
                title={auto.active ? t('auto.list.pause') : t('auto.list.resume')}
              >
                {auto.active ? '⏸' : '▶'}
              </button>
              <button
                className="auto-act-btn auto-act-btn--del"
                onClick={() => handleDelete(auto)}
                disabled={busy === auto.id + '-delete'}
                title={t('auto.list.delete')}
              >
                ✕
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
