import { useState, useEffect, useCallback } from 'react';
import { useT } from '../i18n';

const RUBRIC_LABELS = {
  schedule:  'settings.rubric.schedule',
  logistics: 'settings.rubric.logistics',
  technical: 'settings.rubric.technical',
  notes:     'settings.rubric.notes',
  budget:    'settings.rubric.budget',
};

const ALL_RUBRICS = Object.keys(RUBRIC_LABELS);

// ── Panel A: Invite link + users table ───────────────────────────────────────
function PanelInvite({ users, onDeleteUser, onChangeWorkspaceRole }) {
  const { t, tx } = useT();
  const [link,          setLink]          = useState('');
  const [expires,       setExpires]       = useState('');
  const [copied,        setCopied]        = useState(false);
  const [generating,    setGenerating]    = useState(false);
  const [inviteRole,    setInviteRole]    = useState('producer');
  const [invitations,   setInvitations]   = useState([]);
  const [loadingInv,    setLoadingInv]    = useState(true);

  const loadInvitations = useCallback(async () => {
    setLoadingInv(true);
    try {
      const r = await fetch('/api/invitations');
      if (r.ok) setInvitations(await r.json());
    } finally { setLoadingInv(false); }
  }, []);

  useEffect(() => { loadInvitations(); }, [loadInvitations]);

  const generate = async () => {
    setGenerating(true);
    try {
      const r = await fetch('/api/invitations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceRole: inviteRole }),
      });
      const d = await r.json();
      setLink(d.link);
      setExpires(d.expiresAt);
      setCopied(false);
      await loadInvitations();
    } finally { setGenerating(false); }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const revokeInvite = async (token) => {
    await fetch(`/api/invitations/${token}`, { method: 'DELETE' });
    setInvitations((prev) => prev.filter((i) => i.token !== token));
    if (link.includes(token)) { setLink(''); setExpires(''); }
  };

  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
  };

  const isExpired = (iso) => iso && new Date(iso) < new Date();

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">{t('settings.inviteMember')}</h3>
      <p className="settings-section-desc">{t('settings.inviteMemberHint')}</p>

      <div className="settings-invite-role-row">
        <span className="settings-invite-role-label">{t('settings.role')}</span>
        <label className="settings-role-radio">
          <input type="radio" name="inviteRole" value="producer" checked={inviteRole === 'producer'} onChange={() => setInviteRole('producer')} />
          {t('settings.producer')}
        </label>
        <label className="settings-role-radio">
          <input type="radio" name="inviteRole" value="backliner" checked={inviteRole === 'backliner'} onChange={() => setInviteRole('backliner')} />
          {t('settings.backliner')}
        </label>
      </div>
      <button className="btn-primary settings-generate-btn" onClick={generate} disabled={generating}>
        {generating ? t('settings.generating') : t('settings.generateInvite')}
      </button>

      {link && (
        <div className="settings-invite-box">
          <input className="settings-invite-input" value={link} readOnly />
          <button className="btn-ghost settings-copy-btn" onClick={copyLink}>
            {copied ? t('common.copied') : t('common.copy')}
          </button>
          <p className="settings-invite-exp">{tx('settings.expires', { date: fmtDate(expires) })}</p>
        </div>
      )}

      {/* Active invitations */}
      {!loadingInv && invitations.length > 0 && (
        <div className="settings-inv-list">
          <h4 className="settings-sub-title">{t('settings.activeInvitations')}</h4>
          <table className="settings-table">
            <thead>
              <tr>
                <th>{t('settings.status')}</th>
                <th>{t('settings.created')}</th>
                <th>{t('settings.expiresLabel')}</th>
                <th>{t('settings.usedBy')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.token} className={isExpired(inv.expiresAt) ? 'row-muted' : ''}>
                  <td>
                    {inv.usedBy
                      ? <span className="badge-used">{t('settings.used')}</span>
                      : isExpired(inv.expiresAt)
                        ? <span className="badge-expired">{t('settings.expired')}</span>
                        : <span className="badge-active">{t('settings.active')}</span>}
                  </td>
                  <td>{fmtDate(inv.createdAt)}</td>
                  <td>{fmtDate(inv.expiresAt)}</td>
                  <td>{inv.usedByUsername ? <span dir="auto">{inv.usedByUsername}</span> : '—'}</td>
                  <td>
                    {!inv.usedBy && (
                      <button className="btn-action btn-action--danger" onClick={() => revokeInvite(inv.token)}>
                        {t('settings.revoke')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Users table */}
      <h3 className="settings-section-title" style={{ marginTop: '28px' }}>{t('settings.teamMembers')}</h3>
      {users.length === 0
        ? <p className="settings-empty">{t('settings.emptyTeam')}</p>
        : (
          <table className="settings-table">
            <thead>
              <tr>
                <th>{t('settings.username')}</th>
                <th>{t('settings.authRole')}</th>
                <th>{t('settings.workspaceRole')}</th>
                <th>{t('settings.joined')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><span dir="auto">{u.username}</span></td>
                  <td><span className={`badge-role badge-role--${u.role}`}>{u.role}</span></td>
                  <td>
                    <select
                      className="settings-role-select"
                      value={u.workspaceRole || 'producer'}
                      onChange={(e) => onChangeWorkspaceRole(u.id, e.target.value)}
                    >
                      <option value="producer">{t('settings.producer')}</option>
                      <option value="backliner">{t('settings.backliner')}</option>
                    </select>
                  </td>
                  <td>{u.createdAt ? <span className="ltr" dir="ltr">{new Date(u.createdAt).toLocaleDateString()}</span> : '—'}</td>
                  <td>
                    <button className="btn-action btn-action--danger" onClick={() => onDeleteUser(u)}>
                      {t('common.remove')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    </div>
  );
}

// ── Panel B: Rubric visibility ────────────────────────────────────────────────
function PanelRubrics({ visibleRubrics, onChange }) {
  const { t } = useT();
  return (
    <div className="settings-section">
      <h3 className="settings-section-title">{t('settings.visibleSections')}</h3>
      <p className="settings-section-desc">
        {t('settings.visibleSectionsHint')}
      </p>
      <div className="settings-rubric-list">
        {ALL_RUBRICS.map((key) => (
          <label key={key} className="settings-rubric-row">
            <input
              type="checkbox"
              className="settings-rubric-check"
              checked={visibleRubrics.includes(key)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...visibleRubrics, key]
                  : visibleRubrics.filter((r) => r !== key);
                onChange(next);
              }}
            />
            <span>{t(RUBRIC_LABELS[key])}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Panel C: Per-user artist access ──────────────────────────────────────────
function PanelAccess({ users, artists, userArtistAccess, onChange }) {
  const { t } = useT();
  if (users.length === 0) {
    return (
      <div className="settings-section">
        <h3 className="settings-section-title">{t('settings.artistAccess')}</h3>
        <p className="settings-empty">{t('settings.noTeamMembers')}</p>
      </div>
    );
  }
  if (artists.length === 0) {
    return (
      <div className="settings-section">
        <h3 className="settings-section-title">{t('settings.artistAccess')}</h3>
        <p className="settings-empty">{t('settings.noArtists')}</p>
      </div>
    );
  }

  const toggle = (userId, artistId, checked) => {
    const current = userArtistAccess[userId] || [];
    const next = checked
      ? [...current, artistId]
      : current.filter((id) => id !== artistId);
    onChange({ ...userArtistAccess, [userId]: next });
  };

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">{t('settings.artistAccess')}</h3>
      <p className="settings-section-desc">
        {t('settings.artistAccessHint')}
      </p>
      <div className="settings-access-table-wrap">
        <table className="settings-table settings-access-table">
          <thead>
            <tr>
              <th>{t('settings.member')}</th>
              {artists.map((a) => <th key={a.id}><span dir="auto">{a.name}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const permitted = userArtistAccess[u.id] || [];
              return (
                <tr key={u.id}>
                  <td><span dir="auto">{u.username}</span></td>
                  {artists.map((a) => (
                    <td key={a.id} className="settings-access-cell">
                      <input
                        type="checkbox"
                        checked={permitted.includes(a.id)}
                        onChange={(e) => toggle(u.id, a.id, e.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Settings Panel ───────────────────────────────────────────────────────
function SettingsPanel({ artists }) {
  const { t } = useT();
  const [tab,              setTab]              = useState('invite');
  const [users,            setUsers]            = useState([]);
  const [visibleRubrics,   setVisibleRubrics]   = useState([]);
  const [userArtistAccess, setUserArtistAccess] = useState({});
  const [saving,           setSaving]           = useState(false);
  const [saveMsg,          setSaveMsg]          = useState('');
  const [loadingUsers,     setLoadingUsers]     = useState(true);
  const [loadingSettings,  setLoadingSettings]  = useState(true);

  // Load users
  useEffect(() => {
    setLoadingUsers(true);
    fetch('/api/users')
      .then((r) => r.ok ? r.json() : [])
      .then(setUsers)
      .finally(() => setLoadingUsers(false));
  }, []);

  // Load team settings
  useEffect(() => {
    setLoadingSettings(true);
    fetch('/api/admin/settings')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) {
          setVisibleRubrics(d.visibleRubrics || []);
          setUserArtistAccess(d.userArtistAccess || {});
        }
      })
      .finally(() => setLoadingSettings(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const r = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibleRubrics, userArtistAccess }),
      });
      if (r.ok) {
        setSaveMsg('settings.saved');
      } else {
        setSaveMsg('settings.saveError');
      }
      setTimeout(() => setSaveMsg(''), 3000);
    } finally { setSaving(false); }
  };

  const deleteUser = async (user) => {
    if (!window.confirm(t('settings.removeMemberConfirmation'))) return;
    const r = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
    if (r.ok) setUsers((prev) => prev.filter((u) => u.id !== user.id));
  };

  const changeWorkspaceRole = async (userId, workspaceRole) => {
    const r = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceRole }),
    });
    if (r.ok) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, workspaceRole } : u));
    }
  };

  const isLoading = loadingUsers || loadingSettings;

  return (
    <div className="settings-page">
      {/* Page header */}
      <div className="page-header-edit">
        <div className="page-header-left">
          <h1 className="page-title">{t('settings.title')}<span className="page-title-dot">.</span></h1>
          <p className="page-subtitle">
            <span className="page-subtitle-num">{String(users.length).padStart(2, '0')}</span>
            <span className="page-subtitle-line" />
            <span>{t('settings.teamMembers')}</span>
          </p>
        </div>
        <div className="page-marquee" aria-hidden="true">
          <span className="page-marquee-track">
            <span>{t('settings.title')}</span><span>·</span><span>{t('settings.title')}</span><span>·</span>
            <span>{t('settings.title')}</span><span>·</span><span>{t('settings.title')}</span><span>·</span>
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="settings-tabs">
        {[
          { key: 'invite',  label: t('settings.teamInvites') },
          { key: 'rubrics', label: t('settings.visibleSections') },
          { key: 'access',  label: t('settings.artistAccess') },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`settings-tab-btn${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="settings-loading">{t('common.loading')}</div>
      ) : (
        <>
          {tab === 'invite' && (
            <PanelInvite users={users} onDeleteUser={deleteUser} onChangeWorkspaceRole={changeWorkspaceRole} />
          )}
          {tab === 'rubrics' && (
            <PanelRubrics visibleRubrics={visibleRubrics} onChange={setVisibleRubrics} />
          )}
          {tab === 'access' && (
            <PanelAccess
              users={users}
              artists={artists}
              userArtistAccess={userArtistAccess}
              onChange={setUserArtistAccess}
            />
          )}

          {/* Save button for rubrics + access tabs */}
          {(tab === 'rubrics' || tab === 'access') && (
            <div className="settings-save-row">
              <button className="btn-primary" onClick={save} disabled={saving}>
                {saving ? t('common.saving') : t('common.saveChanges')}
              </button>
              {saveMsg && <span className={`settings-save-msg${saveMsg === 'settings.saved' ? ' ok' : ' err'}`}>{t(saveMsg)}</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default SettingsPanel;
