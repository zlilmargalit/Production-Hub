import { useState, useEffect } from 'react';

// ── Recipe definitions ────────────────────────────────────────────────────────
const RECIPES = [
  {
    id:          'email-to-shows',
    name:        'Email → Show',
    desc:        'When a booking email arrives in Gmail, automatically create a new show with the details extracted from the subject and body.',
    color:       '#EA4335',
    requires:    'Requires Gmail',
    triggerType: 'email',
    actionType:  'create-show',
    defaultConditions: [
      { field: 'subject', op: 'contains', value: 'booking', logic: null },
    ],
    defaultParams: {
      senderEmail:    '',
      subjectKeywords:'booking',
      nameField:      'subject',
      namePattern:    '',
      artistPattern:  '',
      venuePattern:   '',
      datePattern:    '',
    },
  },
  {
    id:          'auto-folders',
    name:        'Auto Folders',
    desc:        'When a new show is added, create a matching folder named after the artist and date so files always land in the right place.',
    color:       '#34A853',
    requires:    'Requires Google Drive',
    triggerType: 'show-event',
    actionType:  'create-folder',
    defaultConditions: [],
    defaultParams: {
      folderTemplate: '[Artist] — [Show Date] — [Venue]',
      useDrive:       false,
      driveFolderId:  '',
      useLocal:       false,
      localPath:      '',
    },
  },
  {
    id:          'early-coord',
    name:        'Early Coordination Alert',
    desc:        'Get a push notification N days before every show so you have time to confirm sound, lighting, and logistics well in advance.',
    color:       '#F08D39',
    requires:    'Requires push notifications',
    triggerType: 'schedule',
    actionType:  'push',
    defaultConditions: [
      { field: 'daysBeforeShow', op: 'equals', value: '14', logic: null },
    ],
    defaultParams: {
      message:        'Heads up — [Show Name] is in 14 days! ([Show Date] · [Venue])',
      daysBeforeShow: 14,
    },
  },
];

// ── Email-to-Show config panel ────────────────────────────────────────────────
function EmailToShowConfig({ params, onChange }) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const set = (key, val) => onChange({ ...params, [key]: val });

  // Live example sentence
  const exSender   = params.senderEmail?.trim()     || 'any sender';
  const exKeywords = params.subjectKeywords?.trim()  || 'any subject';
  const exName     = params.nameField === 'manual' && params.namePattern?.trim()
    ? `"${params.namePattern.trim()}"`
    : params.nameField === 'body' ? 'first match in email body' : 'email subject line';

  return (
    <div className="rc-cfg">
      <div className="rc-cfg-section">
        <div className="rc-cfg-example">
          When Gmail arrives from <strong>{exSender}</strong> with{' '}
          <strong>{exKeywords}</strong> in the subject
          {'→'} create show named from <strong>{exName}</strong>
        </div>
      </div>

      <div className="rc-cfg-section">
        <label className="rc-cfg-label">Only from this sender (optional)</label>
        <input
          className="rc-cfg-input"
          type="email"
          placeholder="e.g. agent@venue.com — leave blank for any sender"
          value={params.senderEmail || ''}
          onChange={e => set('senderEmail', e.target.value)}
          dir="ltr"
        />
      </div>

      <div className="rc-cfg-section">
        <label className="rc-cfg-label">Subject must contain (comma-separated, optional)</label>
        <input
          className="rc-cfg-input"
          type="text"
          placeholder="e.g. booking, concert, show"
          value={params.subjectKeywords || ''}
          onChange={e => set('subjectKeywords', e.target.value)}
          dir="ltr"
        />
        <span className="rc-cfg-hint">
          Leave blank to match all emails. Multiple keywords = any one must appear.
        </span>
      </div>

      <button
        className="rc-cfg-adv-toggle"
        type="button"
        onClick={() => setShowAdvanced(v => !v)}
      >
        {showAdvanced ? '▲' : '▼'} Advanced field mapping
      </button>

      {showAdvanced && (
        <div className="rc-cfg-advanced">
          <div className="rc-cfg-section">
            <label className="rc-cfg-label">Show name taken from</label>
            <select
              className="rc-cfg-select"
              value={params.nameField || 'subject'}
              onChange={e => set('nameField', e.target.value)}
            >
              <option value="subject">Email subject line</option>
              <option value="body">First match in email body</option>
              <option value="manual">Fixed text / manual pattern</option>
            </select>
            {params.nameField === 'manual' && (
              <input
                className="rc-cfg-input"
                style={{ marginTop: 6 }}
                type="text"
                placeholder="e.g. New Show or a regex like /^Show:\s*(.+)/"
                value={params.namePattern || ''}
                onChange={e => set('namePattern', e.target.value)}
                dir="ltr"
              />
            )}
          </div>

          <div className="rc-cfg-row2">
            <div className="rc-cfg-section">
              <label className="rc-cfg-label">Artist hint (regex or keyword)</label>
              <input
                className="rc-cfg-input"
                type="text"
                placeholder="e.g. Artist:"
                value={params.artistPattern || ''}
                onChange={e => set('artistPattern', e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="rc-cfg-section">
              <label className="rc-cfg-label">Venue hint (regex or keyword)</label>
              <input
                className="rc-cfg-input"
                type="text"
                placeholder="e.g. Venue:"
                value={params.venuePattern || ''}
                onChange={e => set('venuePattern', e.target.value)}
                dir="ltr"
              />
            </div>
          </div>

          <div className="rc-cfg-section">
            <label className="rc-cfg-label">Date hint (regex or keyword)</label>
            <input
              className="rc-cfg-input"
              type="text"
              placeholder="e.g. Date: or \d{1,2}/\d{1,2}/\d{4}"
              value={params.datePattern || ''}
              onChange={e => set('datePattern', e.target.value)}
              dir="ltr"
            />
          </div>

          <div className="rc-cfg-tokens">
            <span className="rc-cfg-tokens-label">Available in templates:</span>
            {['[Subject]', '[From]', '[Body]', '[Date]'].map(t => (
              <code key={t} className="rc-cfg-token">{t}</code>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Auto-Folders config panel ─────────────────────────────────────────────────
function AutoFoldersConfig({ params, onChange }) {
  const set = (key, val) => onChange({ ...params, [key]: val });

  return (
    <div className="rc-cfg">
      <div className="rc-cfg-section">
        <label className="rc-cfg-label">Folder name template</label>
        <input
          className="rc-cfg-input"
          type="text"
          value={params.folderTemplate || '[Artist] — [Show Date] — [Venue]'}
          onChange={e => set('folderTemplate', e.target.value)}
          dir="ltr"
        />
        <div className="rc-cfg-tokens">
          <span className="rc-cfg-tokens-label">Tokens:</span>
          {['[Artist]', '[Show Date]', '[Venue]', '[Show Name]'].map(t => (
            <code key={t} className="rc-cfg-token">{t}</code>
          ))}
        </div>
      </div>

      <div className="rc-cfg-paths-label">Create the folder in:</div>

      {/* Google Drive path */}
      <div className="rc-cfg-path-row">
        <label className="rc-cfg-path-check">
          <input
            type="checkbox"
            checked={!!params.useDrive}
            onChange={e => set('useDrive', e.target.checked)}
          />
          <span className="rc-cfg-path-icon rc-cfg-path-icon--drive">
            <svg viewBox="0 0 24 24" fill="none"><path d="M6.5 20L1 11l5-8h12l5 8-5 9H6.5z" fill="#34A853" opacity=".18"/><path d="M15 11L9 3H5.5L11 11H15z" fill="#FBBC05"/><path d="M9 3l6 8-3 9H8l3-9L7 3z" fill="#EA4335" opacity=".7"/><path d="M15 11h5.5l-5 9H9l3-9h3z" fill="#4285F4" opacity=".8"/></svg>
          </span>
          <strong>Google Drive</strong>
        </label>
        {params.useDrive && (
          <input
            className="rc-cfg-input rc-cfg-path-input"
            type="text"
            placeholder="Drive folder ID (from the folder URL after /folders/)"
            value={params.driveFolderId || ''}
            onChange={e => set('driveFolderId', e.target.value)}
            dir="ltr"
          />
        )}
        {params.useDrive && !params.driveFolderId && (
          <span className="rc-cfg-hint">Leave blank to create in My Drive root.</span>
        )}
      </div>

      {/* Local filesystem path */}
      <div className="rc-cfg-path-row">
        <label className="rc-cfg-path-check">
          <input
            type="checkbox"
            checked={!!params.useLocal}
            onChange={e => set('useLocal', e.target.checked)}
          />
          <span className="rc-cfg-path-icon">
            <svg viewBox="0 0 20 20" fill="none"><rect x="2" y="5" width="16" height="12" rx="1.5" fill="currentColor" opacity=".15"/><path d="M2 8h16" stroke="currentColor" strokeWidth="1.5"/><path d="M2 6.5C2 5.67 2.67 5 3.5 5h3.17L8 7H16.5c.83 0 1.5.67 1.5 1.5V16c0 .83-.67 1.5-1.5 1.5h-13C2.67 17.5 2 16.83 2 16V6.5z" stroke="currentColor" strokeWidth="1.3" fill="none"/></svg>
          </span>
          <strong>Local folder</strong>
          <span className="rc-cfg-path-note">(server must run on this machine)</span>
        </label>
        {params.useLocal && (
          <input
            className="rc-cfg-input rc-cfg-path-input"
            type="text"
            placeholder="/Users/you/Shows  or  C:\Users\you\Shows"
            value={params.localPath || ''}
            onChange={e => set('localPath', e.target.value)}
            dir="ltr"
          />
        )}
      </div>

      {!params.useDrive && !params.useLocal && (
        <div className="rc-cfg-hint rc-cfg-hint--warn">
          Select at least one destination above.
        </div>
      )}
    </div>
  );
}

// ── Early-Coord config panel ──────────────────────────────────────────────────
function EarlyCoordConfig({ params, onChange }) {
  const set = (key, val) => onChange({ ...params, [key]: val });
  const days = Number(params.daysBeforeShow) || 14;

  return (
    <div className="rc-cfg">
      <div className="rc-cfg-section">
        <label className="rc-cfg-label">Days before show</label>
        <input
          className="rc-cfg-input rc-cfg-input--sm"
          type="number"
          min="1"
          max="365"
          value={days}
          onChange={e => set('daysBeforeShow', Number(e.target.value))}
          dir="ltr"
        />
      </div>
      <div className="rc-cfg-section">
        <label className="rc-cfg-label">Notification message</label>
        <input
          className="rc-cfg-input"
          type="text"
          value={params.message || ''}
          onChange={e => set('message', e.target.value)}
          dir="ltr"
        />
        <div className="rc-cfg-tokens">
          <span className="rc-cfg-tokens-label">Tokens:</span>
          {['[Show Name]', '[Show Date]', '[Venue]'].map(t => (
            <code key={t} className="rc-cfg-token">{t}</code>
          ))}
        </div>
      </div>
    </div>
  );
}

const CONFIG_PANEL = {
  'email-to-shows': EmailToShowConfig,
  'auto-folders':   AutoFoldersConfig,
  'early-coord':    EarlyCoordConfig,
};

// ── Main export ───────────────────────────────────────────────────────────────
export default function RecipeCards({ automations, onActivate, onUpdate }) {
  // Which recipe card's config panel is open
  const [openConfig, setOpenConfig] = useState(null);
  // Live config form state per recipe (merged from defaults + existing actionParams)
  const [configs, setConfigs]       = useState({});
  const [saving,  setSaving]        = useState(null);

  // Helpers
  const getExisting = (recipeId) =>
    automations.find((a) => a.recipeId === recipeId && a.active) || null;

  const isActive = (recipeId) => !!getExisting(recipeId);

  // When a card is opened, pre-fill form from stored actionParams (or recipe defaults)
  const openCard = (recipe) => {
    const existing = getExisting(recipe.id);
    const stored   = existing?.actionParams || {};
    setConfigs((prev) => ({
      ...prev,
      [recipe.id]: { ...recipe.defaultParams, ...stored },
    }));
    setOpenConfig(recipe.id);
  };

  const closeCard = () => setOpenConfig(null);

  const handleSave = async (recipe) => {
    setSaving(recipe.id);
    const cfg      = configs[recipe.id] || recipe.defaultParams;
    const existing = getExisting(recipe.id);
    try {
      if (existing) {
        // Update existing automation's actionParams
        await onUpdate(existing.id, { actionParams: cfg });
      } else {
        // Create new automation from recipe
        // Build conditions from config where relevant
        const conditions = [...recipe.defaultConditions];
        if (recipe.id === 'email-to-shows' && cfg.senderEmail?.trim()) {
          conditions.push({ field: 'from', op: 'equals', value: cfg.senderEmail.trim(), logic: 'AND' });
        }
        if (recipe.id === 'email-to-shows' && cfg.subjectKeywords?.trim()) {
          const keywords = cfg.subjectKeywords.split(',').map(k => k.trim()).filter(Boolean);
          // Replace default 'booking' condition with the user's keywords
          const withoutDefault = conditions.filter(c => c.field !== 'subject');
          keywords.forEach((kw, i) => {
            withoutDefault.push({ field: 'subject', op: 'contains', value: kw, logic: i === 0 ? null : 'OR' });
          });
          conditions.splice(0, conditions.length, ...withoutDefault);
        }
        if (recipe.id === 'early-coord') {
          const di = conditions.findIndex(c => c.field === 'daysBeforeShow');
          if (di >= 0) conditions[di] = { ...conditions[di], value: String(cfg.daysBeforeShow || 14) };
          cfg.daysBeforeShow = cfg.daysBeforeShow || 14;
          cfg.message = cfg.message || recipe.defaultParams.message;
        }

        await onActivate({
          label:        recipe.name,
          triggerType:  recipe.triggerType,
          conditions,
          actionType:   recipe.actionType,
          actionParams: cfg,
          isRecipe:     true,
          recipeId:     recipe.id,
        });
      }
      setOpenConfig(null);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="recipe-grid">
      {RECIPES.map((recipe) => {
        const active    = isActive(recipe.id);
        const isOpen    = openConfig === recipe.id;
        const ConfigPanel = CONFIG_PANEL[recipe.id];

        return (
          <div key={recipe.id} className={`recipe-card${isOpen ? ' recipe-card--open' : ''}`}>
            <div className="recipe-band" style={{ '--et-color': recipe.color }} />
            <div className="recipe-body">
              <div className="recipe-icon-row">
                <span className="recipe-name">{recipe.name}</span>
                {active && <span className="recipe-active-dot" />}
              </div>
              <p className="recipe-desc">{recipe.desc}</p>
              <span className="recipe-requires">{recipe.requires}</span>
            </div>

            {/* Config panel — expanded when open */}
            {isOpen && ConfigPanel && (
              <div className="recipe-config-area">
                <ConfigPanel
                  params={configs[recipe.id] || recipe.defaultParams}
                  onChange={(next) => setConfigs(prev => ({ ...prev, [recipe.id]: next }))}
                />
              </div>
            )}

            <div className="recipe-foot">
              {!isOpen ? (
                <div className="recipe-foot-row">
                  {active ? (
                    <>
                      <span className="recipe-btn recipe-btn--active" style={{ '--et-color': recipe.color }}>
                        &#10003; Active
                      </span>
                      <button
                        className="recipe-edit-btn"
                        onClick={() => openCard(recipe)}
                      >
                        Edit config
                      </button>
                    </>
                  ) : (
                    <button
                      className="recipe-btn"
                      style={{ '--et-color': recipe.color }}
                      onClick={() => openCard(recipe)}
                    >
                      Activate recipe
                    </button>
                  )}
                </div>
              ) : (
                <div className="recipe-foot-row">
                  <button
                    className="recipe-btn recipe-btn--save"
                    style={{ '--et-color': recipe.color }}
                    onClick={() => handleSave(recipe)}
                    disabled={saving === recipe.id}
                  >
                    {saving === recipe.id
                      ? 'Saving…'
                      : active ? 'Save changes' : 'Save & Activate'}
                  </button>
                  <button className="recipe-cancel-btn" onClick={closeCard}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
