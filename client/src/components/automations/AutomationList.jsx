import { useState } from 'react';

const TRIGGER_LABELS = {
  'email':      'When an email arrives',
  'schedule':   'On a daily schedule',
  'show-event': 'When a show is created/updated',
  'task':       'When a task is completed',
  'cal-event':  'When a calendar event is created',
};

const ACTION_LABELS = {
  'push':          'send a push notification',
  'create-show':   'create a new show',
  'create-folder': 'create a Google Drive folder',
  'send-email':    'send an email',
  'cal-invite':    'send a calendar invite',
  'add-task':      'add a task',
};

function buildSentence(auto) {
  const trig = TRIGGER_LABELS[auto.triggerType] || auto.triggerType;
  const act  = ACTION_LABELS[auto.actionType]   || auto.actionType;
  const conds = (auto.conditions || []);
  const condStr = conds.length
    ? ` · if ${conds.map((c, i) => {
        const prefix = i > 0 ? ` ${c.logic || 'AND'} ` : '';
        return `${prefix}${c.field} ${c.op} "${c.value}"`;
      }).join('')}`
    : '';
  return `${trig} → ${act}${condStr}`;
}

export default function AutomationList({ automations, onToggle, onDelete }) {
  const [busy, setBusy] = useState(null);

  const handleToggle = async (auto) => {
    setBusy(auto.id + '-toggle');
    try { await onToggle(auto.id, !auto.active); }
    finally { setBusy(null); }
  };

  const handleDelete = async (auto) => {
    if (!window.confirm(`Delete "${auto.label}"?`)) return;
    setBusy(auto.id + '-delete');
    try { await onDelete(auto.id); }
    finally { setBusy(null); }
  };

  return (
    <div className="auto-list">
      <div className="auto-list-head">
        <span className="auto-list-lbl">Active rules</span>
        <span className="auto-list-count">{automations.filter((a) => a.active).length} active</span>
      </div>

      {automations.length === 0 ? (
        <div style={{ padding: '24px 18px', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.875rem' }}>
          No automation rules yet — create one above or activate a recipe.
        </div>
      ) : (
        automations.map((auto) => (
          <div key={auto.id} className={`auto-row${!auto.active ? ' auto-row--off' : ''}`}>
            <span className="auto-row-dot" />
            <div className="auto-sentence">
              <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{auto.label}</strong>
              <div style={{ marginTop: 2, fontSize: '0.75rem', opacity: 0.75 }}>
                {buildSentence(auto)}
              </div>
            </div>
            <div className="auto-row-actions">
              <button
                className="auto-act-btn"
                onClick={() => handleToggle(auto)}
                disabled={busy === auto.id + '-toggle'}
                title={auto.active ? 'Pause' : 'Resume'}
              >
                {auto.active ? '⏸' : '▶'}
              </button>
              <button
                className="auto-act-btn auto-act-btn--del"
                onClick={() => handleDelete(auto)}
                disabled={busy === auto.id + '-delete'}
                title="Delete rule"
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
