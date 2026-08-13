import { useState, useEffect } from 'react';
import { useT } from '../../i18n';

// ── Recipe definitions ────────────────────────────────────────────────────────
const RECIPES = [
  {
    id:          'email-to-shows',
    nameKey:     'recipe.emailShow',
    descKey:     'recipe.emailShowDescription',
    color:       '#EA4335',
    requiresKey: 'recipe.requiresGmail',
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
    nameKey:     'recipe.autoFolders',
    descKey:     'recipe.autoFoldersDescription',
    color:       '#34A853',
    requiresKey: 'recipe.requiresDrive',
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
    nameKey:     'recipe.earlyAlert',
    descKey:     'recipe.earlyAlertDescription',
    color:       '#F08D39',
    requiresKey: 'recipe.requiresPush',
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
  const { t } = useT();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const set = (key, val) => onChange({ ...params, [key]: val });

  // Live example sentence
  const exSender   = params.senderEmail?.trim()     || t('recipe.anySender');
  const exKeywords = params.subjectKeywords?.trim()  || t('recipe.anySubject');
  const exName     = params.nameField === 'manual' && params.namePattern?.trim()
    ? `"${params.namePattern.trim()}"`
    : params.nameField === 'body' ? t('recipe.firstBodyMatch') : t('recipe.emailSubject');

  return (
    <div className="rc-cfg">
      <div className="rc-cfg-section">
        <div className="rc-cfg-example">
          {t('recipe.whenGmailFrom')} <strong dir="auto">{exSender}</strong> {t('recipe.with')}
          <strong dir="auto">{exKeywords}</strong> {t('recipe.inSubject')}
          <span className="mirror" aria-hidden="true">→</span> {t('recipe.createShowFrom')} <strong dir="auto">{exName}</strong>
        </div>
      </div>

      <div className="rc-cfg-section">
        <label className="rc-cfg-label">{t('recipe.senderOptional')}</label>
        <input
          className="rc-cfg-input"
          type="email"
          placeholder={t('recipe.senderPlaceholder')}
          value={params.senderEmail || ''}
          onChange={e => set('senderEmail', e.target.value)}
          dir="ltr"
        />
      </div>

      <div className="rc-cfg-section">
        <label className="rc-cfg-label">{t('recipe.subjectOptional')}</label>
        <input
          className="rc-cfg-input"
          type="text"
          placeholder={t('recipe.subjectPlaceholder')}
          value={params.subjectKeywords || ''}
          onChange={e => set('subjectKeywords', e.target.value)}
          dir="ltr"
        />
        <span className="rc-cfg-hint">
          {t('recipe.subjectHint')}
        </span>
      </div>

      <button
        className="rc-cfg-adv-toggle"
        type="button"
        onClick={() => setShowAdvanced(v => !v)}
      >
        {showAdvanced ? '▲' : '▼'} {t('recipe.advancedMapping')}
      </button>

      {showAdvanced && (
        <div className="rc-cfg-advanced">
          <div className="rc-cfg-section">
            <label className="rc-cfg-label">{t('recipe.showNameFrom')}</label>
            <select
              className="rc-cfg-select"
              value={params.nameField || 'subject'}
              onChange={e => set('nameField', e.target.value)}
            >
              <option value="subject">{t('recipe.emailSubject')}</option>
              <option value="body">{t('recipe.firstBodyMatch')}</option>
              <option value="manual">{t('recipe.fixedText')}</option>
            </select>
            {params.nameField === 'manual' && (
              <input
                className="rc-cfg-input"
                style={{ marginTop: 6 }}
                type="text"
                placeholder={t('recipe.namePatternPlaceholder')}
                value={params.namePattern || ''}
                onChange={e => set('namePattern', e.target.value)}
                dir="ltr"
              />
            )}
          </div>

          <div className="rc-cfg-row2">
            <div className="rc-cfg-section">
              <label className="rc-cfg-label">{t('recipe.artistHint')}</label>
              <input
                className="rc-cfg-input"
                type="text"
                placeholder={t('recipe.artistPlaceholder')}
                value={params.artistPattern || ''}
                onChange={e => set('artistPattern', e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="rc-cfg-section">
              <label className="rc-cfg-label">{t('recipe.venueHint')}</label>
              <input
                className="rc-cfg-input"
                type="text"
                placeholder={t('recipe.venuePlaceholder')}
                value={params.venuePattern || ''}
                onChange={e => set('venuePattern', e.target.value)}
                dir="ltr"
              />
            </div>
          </div>

          <div className="rc-cfg-section">
            <label className="rc-cfg-label">{t('recipe.dateHint')}</label>
            <input
              className="rc-cfg-input"
              type="text"
              placeholder={t('recipe.datePlaceholder')}
              value={params.datePattern || ''}
              onChange={e => set('datePattern', e.target.value)}
              dir="ltr"
            />
          </div>

          <div className="rc-cfg-tokens">
            <span className="rc-cfg-tokens-label">{t('recipe.availableTokens')}</span>
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
  const { t } = useT();
  const set = (key, val) => onChange({ ...params, [key]: val });

  return (
    <div className="rc-cfg">
      <div className="rc-cfg-section">
        <label className="rc-cfg-label">{t('recipe.folderTemplate')}</label>
        <input
          className="rc-cfg-input"
          type="text"
          value={params.folderTemplate || '[Artist] — [Show Date] — [Venue]'}
          onChange={e => set('folderTemplate', e.target.value)}
          dir="ltr"
        />
        <div className="rc-cfg-tokens">
          <span className="rc-cfg-tokens-label">{t('recipe.tokens')}</span>
          {['[Artist]', '[Show Date]', '[Venue]', '[Show Name]'].map(t => (
            <code key={t} className="rc-cfg-token">{t}</code>
          ))}
        </div>
      </div>

      <div className="rc-cfg-paths-label">{t('recipe.createFolderIn')}</div>

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
          <strong>{t('recipe.googleDrive')}</strong>
        </label>
        {params.useDrive && (
          <input
            className="rc-cfg-input rc-cfg-path-input"
            type="text"
            placeholder={t('recipe.driveFolderPlaceholder')}
            value={params.driveFolderId || ''}
            onChange={e => set('driveFolderId', e.target.value)}
            dir="ltr"
          />
        )}
        {params.useDrive && !params.driveFolderId && (
          <span className="rc-cfg-hint">{t('recipe.driveRootHint')}</span>
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
          <strong>{t('recipe.localFolder')}</strong>
          <span className="rc-cfg-path-note">{t('recipe.localFolderHint')}</span>
        </label>
        {params.useLocal && (
          <input
            className="rc-cfg-input rc-cfg-path-input"
            type="text"
            placeholder={t('recipe.localPathPlaceholder')}
            value={params.localPath || ''}
            onChange={e => set('localPath', e.target.value)}
            dir="ltr"
          />
        )}
      </div>

      {!params.useDrive && !params.useLocal && (
        <div className="rc-cfg-hint rc-cfg-hint--warn">
          {t('recipe.selectDestination')}
        </div>
      )}
    </div>
  );
}

// ── Early-Coord config panel ──────────────────────────────────────────────────
function EarlyCoordConfig({ params, onChange }) {
  const { t } = useT();
  const set = (key, val) => onChange({ ...params, [key]: val });
  const days = Number(params.daysBeforeShow) || 14;

  return (
    <div className="rc-cfg">
      <div className="rc-cfg-section">
        <label className="rc-cfg-label">{t('recipe.daysBeforeShow')}</label>
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
        <label className="rc-cfg-label">{t('recipe.notificationMessage')}</label>
        <input
          className="rc-cfg-input"
          type="text"
          value={params.message || ''}
          onChange={e => set('message', e.target.value)}
          dir="ltr"
        />
        <div className="rc-cfg-tokens">
          <span className="rc-cfg-tokens-label">{t('recipe.tokens')}</span>
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
  const { t } = useT();
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
          label:        t(recipe.nameKey),
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
                <span className="recipe-name">{t(recipe.nameKey)}</span>
                {active && <span className="recipe-active-dot" />}
              </div>
              <p className="recipe-desc">{t(recipe.descKey)}</p>
              <span className="recipe-requires">{t(recipe.requiresKey)}</span>
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
                        {t('recipe.active')}
                      </span>
                      <button
                        className="recipe-edit-btn"
                        onClick={() => openCard(recipe)}
                      >
                        {t('recipe.editConfig')}
                      </button>
                    </>
                  ) : (
                    <button
                      className="recipe-btn"
                      style={{ '--et-color': recipe.color }}
                      onClick={() => openCard(recipe)}
                    >
                      {t('recipe.activate')}
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
                      ? t('common.saving')
                      : active ? t('common.saveChanges') : t('recipe.saveActivate')}
                  </button>
                  <button className="recipe-cancel-btn" onClick={closeCard}>
                    {t('common.cancel')}
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
