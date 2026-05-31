import { useState, useEffect, useCallback } from 'react';

const RUBRIC_LABELS = {
  schedule:  'Schedule',
  logistics: 'Logistics (Transport / Food / Contacts)',
  technical: 'Technical (Sound / Lighting)',
  notes:     'Notes',
  budget:    'Budget',
};

const ALL_RUBRICS = Object.keys(RUBRIC_LABELS);

// ── Panel A: Invite link + users table ───────────────────────────────────────
function PanelInvite({ users, onDeleteUser, onChangeWorkspaceRole }) {
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
      <h3 className="settings-section-title">Invite New Team Member</h3>
      <p className="settings-section-desc">Generate a one-time invite link. Expires in 48 hours.</p>

      <div className="settings-invite-role-row">
        <span className="settings-invite-role-label">Role:</span>
        <label className="settings-role-radio">
          <input type="radio" name="inviteRole" value="producer" checked={inviteRole === 'producer'} onChange={() => setInviteRole('producer')} />
          Producer
        </label>
        <label className="settings-role-radio">
          <input type="radio" name="inviteRole" value="backliner" checked={inviteRole === 'backliner'} onChange={() => setInviteRole('backliner')} />
          Backliner
        </label>
      </div>
      <button className="btn-primary settings-generate-btn" onClick={generate} disabled={generating}>
        {generating ? 'Generating…' : 'Generate Invite Link'}
      </button>

      {link && (
        <div className="settings-invite-box">
          <input className="settings-invite-input" value={link} readOnly />
          <button className="btn-ghost settings-copy-btn" onClick={copyLink}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <p className="settings-invite-exp">Expires: {fmtDate(expires)}</p>
        </div>
      )}

      {/* Active invitations */}
      {!loadingInv && invitations.length > 0 && (
        <div className="settings-inv-list">
          <h4 className="settings-sub-title">Active Invitations</h4>
          <table className="settings-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Created</th>
                <th>Expires</th>
                <th>Used by</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.token} className={isExpired(inv.expiresAt) ? 'row-muted' : ''}>
                  <td>
                    {inv.usedBy
                      ? <span className="badge-used">Used</span>
                      : isExpired(inv.expiresAt)
                        ? <span className="badge-expired">Expired</span>
                        : <span className="badge-active">Active</span>}
                  </td>
                  <td>{fmtDate(inv.createdAt)}</td>
                  <td>{fmtDate(inv.expiresAt)}</td>
                  <td>{inv.usedByUsername || '—'}</td>
                  <td>
                    {!inv.usedBy && (
                      <button className="btn-action btn-action--danger" onClick={() => revokeInvite(inv.token)}>
                        Revoke
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
      <h3 className="settings-section-title" style={{ marginTop: '28px' }}>Team Members</h3>
      {users.length === 0
        ? <p className="settings-empty">No team members yet. Generate an invite link to add someone.</p>
        : (
          <table className="settings-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Auth Role</th>
                <th>Workspace Role</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td><span className={`badge-role badge-role--${u.role}`}>{u.role}</span></td>
                  <td>
                    <select
                      className="settings-role-select"
                      value={u.workspaceRole || 'producer'}
                      onChange={(e) => onChangeWorkspaceRole(u.id, e.target.value)}
                    >
                      <option value="producer">Producer</option>
                      <option value="backliner">Backliner</option>
                    </select>
                  </td>
                  <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
                  <td>
                    <button className="btn-action btn-action--danger" onClick={() => onDeleteUser(u)}>
                      Remove
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
  return (
    <div className="settings-section">
      <h3 className="settings-section-title">Visible Sections for Team</h3>
      <p className="settings-section-desc">
        Choose which show sections team members can see. Core info (name, date, venue) is always visible.
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
            <span>{RUBRIC_LABELS[key]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Panel C: Per-user artist access ──────────────────────────────────────────
function PanelAccess({ users, artists, userArtistAccess, onChange }) {
  if (users.length === 0) {
    return (
      <div className="settings-section">
        <h3 className="settings-section-title">Artist Access per Member</h3>
        <p className="settings-empty">No team members yet.</p>
      </div>
    );
  }
  if (artists.length === 0) {
    return (
      <div className="settings-section">
        <h3 className="settings-section-title">Artist Access per Member</h3>
        <p className="settings-empty">No artists in your workspace yet.</p>
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
      <h3 className="settings-section-title">Artist Access per Member</h3>
      <p className="settings-section-desc">
        Check which artists each team member can view. They will only see the rubrics enabled above.
      </p>
      <div className="settings-access-table-wrap">
        <table className="settings-table settings-access-table">
          <thead>
            <tr>
              <th>Member</th>
              {artists.map((a) => <th key={a.id}>{a.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const permitted = userArtistAccess[u.id] || [];
              return (
                <tr key={u.id}>
                  <td>{u.username}</td>
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
        setSaveMsg('Saved');
      } else {
        setSaveMsg('Error saving');
      }
      setTimeout(() => setSaveMsg(''), 3000);
    } finally { setSaving(false); }
  };

  const deleteUser = async (user) => {
    if (!window.confirm(`Remove ${user.username} from the team?`)) return;
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
          <h1 className="page-title">Settings<span className="page-title-dot">.</span></h1>
          <p className="page-subtitle">
            <span className="page-subtitle-num">{String(users.length).padStart(2, '0')}</span>
            <span className="page-subtitle-line" />
            <span>team members</span>
          </p>
        </div>
        <div className="page-marquee" aria-hidden="true">
          <span className="page-marquee-track">
            <span>Settings</span><span>·</span><span>Settings</span><span>·</span>
            <span>Settings</span><span>·</span><span>Settings</span><span>·</span>
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="settings-tabs">
        {[
          { key: 'invite',  label: 'Team & Invites' },
          { key: 'rubrics', label: 'Visible Sections' },
          { key: 'access',  label: 'Artist Access' },
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
        <div className="settings-loading">Loading…</div>
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
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              {saveMsg && <span className={`settings-save-msg${saveMsg === 'Saved' ? ' ok' : ' err'}`}>{saveMsg}</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default SettingsPanel;
