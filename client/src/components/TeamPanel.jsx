import { useState, useEffect, useCallback } from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────
const RUBRIC_LABELS = {
  schedule:  'Schedule',
  logistics: 'Logistics (Transport / Food / Contacts)',
  technical: 'Technical (Sound / Lighting)',
  notes:     'Notes',
  budget:    'Budget',
};
const ALL_RUBRICS = Object.keys(RUBRIC_LABELS);

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}
function fmtRelative(iso) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 2)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
function isExpired(iso) { return iso && new Date(iso) < new Date(); }

// ────────────────────────────────────────────────────────────────────────────
//  TAB 1 — Members
// ────────────────────────────────────────────────────────────────────────────
function TabMembers({ users, artists, activityLog, visibleRubrics, userArtistAccess,
                      onDeleteUser, onEditEmail, onSaveAccess }) {
  const [editingEmail, setEditingEmail] = useState(null);
  const [emailDraft,   setEmailDraft]   = useState('');
  const [visRubrics,   setVisRubrics]   = useState(visibleRubrics);
  const [uAccess,      setUAccess]      = useState(userArtistAccess);
  const [saving,       setSaving]       = useState(false);
  const [saveMsg,      setSaveMsg]      = useState('');

  useEffect(() => { setVisRubrics(visibleRubrics); }, [visibleRubrics]);
  useEffect(() => { setUAccess(userArtistAccess); },  [userArtistAccess]);

  // Last-seen from activity log
  const lastSeen = {};
  for (const entry of activityLog) {
    if (!lastSeen[entry.userId]) lastSeen[entry.userId] = entry.timestamp;
  }

  const savePermissions = async () => {
    setSaving(true);
    const r = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibleRubrics: visRubrics, userArtistAccess: uAccess }),
    });
    setSaveMsg(r.ok ? 'Saved' : 'Error');
    setTimeout(() => setSaveMsg(''), 3000);
    setSaving(false);
    if (r.ok) onSaveAccess(visRubrics, uAccess);
  };

  const toggleArtist = (userId, artistId, checked) => {
    const cur = uAccess[userId] || [];
    setUAccess({ ...uAccess, [userId]: checked ? [...cur, artistId] : cur.filter((id) => id !== artistId) });
  };

  return (
    <div className="team-section">
      {/* Members table */}
      <div className="team-members-header">
        <h3 className="team-section-title">Active Members</h3>
        <span className="team-member-count">{users.length} member{users.length !== 1 ? 's' : ''}</span>
      </div>

      {users.length === 0 ? (
        <p className="team-empty">No team members yet. Use the Invite tab to add someone.</p>
      ) : (
        <div className="team-table-wrap">
          <table className="team-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Last seen</th>
                <th>Artists</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const permitted = uAccess[u.id] || [];
                return (
                  <tr key={u.id}>
                    <td className="team-td-name">{u.username}</td>
                    <td className="team-td-email">
                      {editingEmail === u.id ? (
                        <div className="team-email-edit">
                          <input
                            className="team-email-input"
                            type="email"
                            value={emailDraft}
                            onChange={(e) => setEmailDraft(e.target.value)}
                            placeholder="email@example.com"
                            autoFocus
                          />
                          <button className="btn-action" onClick={async () => {
                            await onEditEmail(u.id, emailDraft);
                            setEditingEmail(null);
                          }}>Save</button>
                          <button className="btn-ghost" onClick={() => setEditingEmail(null)}>✕</button>
                        </div>
                      ) : (
                        <span
                          className={`team-email-val ${u.email ? '' : 'team-email-empty'}`}
                          onClick={() => { setEditingEmail(u.id); setEmailDraft(u.email || ''); }}
                          title="Click to edit email"
                        >
                          {u.email || 'No email — click to add'}
                        </span>
                      )}
                    </td>
                    <td><span className={`badge-role badge-role--${u.role}`}>{u.role}</span></td>
                    <td className="team-td-lastseen">{fmtRelative(lastSeen[u.id])}</td>
                    <td className="team-td-artists">
                      {artists.length === 0
                        ? <span className="team-no-artists">—</span>
                        : artists.map((a) => (
                          <label key={a.id} className="team-artist-check" title={a.name}>
                            <input
                              type="checkbox"
                              checked={permitted.includes(a.id)}
                              onChange={(e) => toggleArtist(u.id, a.id, e.target.checked)}
                            />
                            <span>{a.name}</span>
                          </label>
                        ))
                      }
                    </td>
                    <td>
                      <button className="btn-action btn-action--danger" onClick={() => onDeleteUser(u)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Visible sections */}
      <div className="team-access-block">
        <h3 className="team-section-title" style={{ marginTop: 28 }}>Visible Sections for Team</h3>
        <p className="team-section-desc">Which show sections can team members see? (Core info always visible)</p>
        <div className="team-rubric-grid">
          {ALL_RUBRICS.map((key) => (
            <label key={key} className="team-rubric-row">
              <input
                type="checkbox"
                checked={visRubrics.includes(key)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...visRubrics, key]
                    : visRubrics.filter((r) => r !== key);
                  setVisRubrics(next);
                }}
              />
              <span>{RUBRIC_LABELS[key]}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="team-save-row">
        <button className="btn-primary" onClick={savePermissions} disabled={saving}>
          {saving ? 'Saving…' : 'Save Permissions'}
        </button>
        {saveMsg && <span className={`team-save-msg ${saveMsg === 'Saved' ? 'ok' : 'err'}`}>{saveMsg}</span>}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  TAB 2 — Invite
// ────────────────────────────────────────────────────────────────────────────
function TabInvite() {
  const [link,        setLink]        = useState('');
  const [expires,     setExpires]     = useState('');
  const [generating,  setGenerating]  = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [loadingInv,  setLoadingInv]  = useState(true);

  const load = useCallback(async () => {
    setLoadingInv(true);
    const r = await fetch('/api/invitations');
    if (r.ok) setInvitations(await r.json());
    setLoadingInv(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    const r = await fetch('/api/invitations/generate', { method: 'POST' });
    const d = await r.json();
    setLink(d.link);
    setExpires(d.expiresAt);
    setCopied(false);
    await load();
    setGenerating(false);
  };

  const copy = () => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const revoke = async (token) => {
    await fetch(`/api/invitations/${token}`, { method: 'DELETE' });
    setInvitations((prev) => prev.filter((i) => i.token !== token));
    if (link.includes(token)) { setLink(''); setExpires(''); }
  };

  return (
    <div className="team-section">
      <h3 className="team-section-title">Generate Invite Link</h3>
      <p className="team-section-desc">One-time link, valid for 48 hours. The recipient sets their own username and password.</p>

      <button className="btn-primary team-gen-btn" onClick={generate} disabled={generating}>
        {generating ? 'Generating…' : '+ New Invite Link'}
      </button>

      {link && (
        <div className="team-invite-card">
          <div className="team-invite-link-row">
            <input className="team-invite-input" value={link} readOnly />
            <button className="btn-ghost" onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
          </div>

          {/* QR code */}
          <div className="team-qr-wrap">
            <img
              className="team-qr-img"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(link)}`}
              alt="QR code for invite link"
              loading="lazy"
            />
            <div className="team-qr-meta">
              <p className="team-qr-label">Scan to join</p>
              <p className="team-qr-exp">Expires: {fmtDate(expires)}</p>
              <a
                className="btn-ghost"
                href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=16&data=${encodeURIComponent(link)}`}
                download="invite-qr.png"
                target="_blank"
                rel="noreferrer"
              >
                Download QR
              </a>
            </div>
          </div>
        </div>
      )}

      {!loadingInv && invitations.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 className="team-section-title">All Invitations</h3>
          <div className="team-table-wrap">
            <table className="team-table">
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
                        <button className="btn-action btn-action--danger" onClick={() => revoke(inv.token)}>
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  TAB 3 — Activity
// ────────────────────────────────────────────────────────────────────────────
function TabActivity({ activityLog, loading }) {
  const ACTION_LABELS = {
    login:    { icon: '→', label: 'Signed in' },
    register: { icon: '★', label: 'Joined team' },
    notify:   { icon: '✉', label: 'Notification sent' },
  };

  return (
    <div className="team-section">
      <h3 className="team-section-title">Team Activity</h3>
      <p className="team-section-desc">Login and join events from all team members.</p>

      {loading ? (
        <p className="team-empty">Loading…</p>
      ) : activityLog.length === 0 ? (
        <p className="team-empty">No activity recorded yet.</p>
      ) : (
        <div className="team-activity-list">
          {activityLog.map((entry, i) => {
            const meta = ACTION_LABELS[entry.action] || { icon: '·', label: entry.action };
            return (
              <div key={i} className="team-activity-row">
                <span className="team-activity-icon">{meta.icon}</span>
                <div className="team-activity-body">
                  <span className="team-activity-user">{entry.username}</span>
                  <span className="team-activity-action">{entry.detail || meta.label}</span>
                </div>
                <span className="team-activity-time" title={fmtDate(entry.timestamp)}>
                  {fmtRelative(entry.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  TAB 4 — Notify
// ────────────────────────────────────────────────────────────────────────────
function TabNotify({ users }) {
  const [subject,  setSubject]  = useState('');
  const [message,  setMessage]  = useState('');
  const [sending,  setSending]  = useState(false);
  const [result,   setResult]   = useState(null);

  const withEmail = users.filter((u) => u.email);

  const send = async () => {
    if (!message.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const r = await fetch('/api/team/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      });
      const d = await r.json();
      setResult({ ok: r.ok, ...d });
      if (r.ok) { setSubject(''); setMessage(''); }
    } catch (e) {
      setResult({ ok: false, error: e.message });
    }
    setSending(false);
  };

  return (
    <div className="team-section">
      <h3 className="team-section-title">Send Message to Team</h3>
      <p className="team-section-desc">
        Sends an email to all team members that have an email address on file.{' '}
        {withEmail.length === 0
          ? <strong>No members have an email yet — add emails in the Members tab.</strong>
          : <span>{withEmail.length} member{withEmail.length !== 1 ? 's' : ''} will receive this message.</span>}
      </p>

      {withEmail.length > 0 && (
        <div className="team-notify-recipients">
          {withEmail.map((u) => (
            <span key={u.id} className="team-notify-chip">{u.username} <span className="team-chip-email">{u.email}</span></span>
          ))}
        </div>
      )}

      <div className="team-notify-form">
        <input
          className="team-notify-subject"
          placeholder="Subject (optional)"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <textarea
          className="team-notify-body"
          placeholder="Write your message here…"
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          dir="auto"
        />
        <div className="team-notify-actions">
          <button
            className="btn-primary"
            onClick={send}
            disabled={sending || !message.trim() || withEmail.length === 0}
          >
            {sending ? 'Sending…' : `Send to ${withEmail.length} member${withEmail.length !== 1 ? 's' : ''}`}
          </button>
          {result && (
            <span className={`team-save-msg ${result.ok ? 'ok' : 'err'}`}>
              {result.ok
                ? `✓ Sent to ${result.sent} member${result.sent !== 1 ? 's' : ''}${result.failed ? `, ${result.failed} failed` : ''}`
                : result.error || 'Send failed'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  Main TeamPanel
// ────────────────────────────────────────────────────────────────────────────
function TeamPanel({ artists }) {
  const [tab,              setTab]              = useState('members');
  const [users,            setUsers]            = useState([]);
  const [visibleRubrics,   setVisibleRubrics]   = useState([]);
  const [userArtistAccess, setUserArtistAccess] = useState({});
  const [activityLog,      setActivityLog]      = useState([]);
  const [loading,          setLoading]          = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [ur, sr, ar] = await Promise.all([
      fetch('/api/users').then((r) => r.ok ? r.json() : []),
      fetch('/api/admin/settings').then((r) => r.ok ? r.json() : null),
      fetch('/api/team/activity').then((r) => r.ok ? r.json() : []),
    ]);
    setUsers(ur);
    if (sr) { setVisibleRubrics(sr.visibleRubrics || []); setUserArtistAccess(sr.userArtistAccess || {}); }
    setActivityLog(ar);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const deleteUser = async (user) => {
    if (!window.confirm(`Remove ${user.username} from the team?`)) return;
    const r = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
    if (r.ok) setUsers((prev) => prev.filter((u) => u.id !== user.id));
  };

  const editEmail = async (userId, email) => {
    const r = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (r.ok) {
      const updated = await r.json();
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, email: updated.user.email } : u));
    }
  };

  const saveAccess = (rubrics, access) => {
    setVisibleRubrics(rubrics);
    setUserArtistAccess(access);
  };

  const TABS = [
    { key: 'members',  label: 'Members' },
    { key: 'invite',   label: 'Invite' },
    { key: 'activity', label: 'Activity' },
    { key: 'notify',   label: 'Notify' },
  ];

  return (
    <div className="team-page">
      {/* Page header */}
      <div className="page-header-edit">
        <div className="page-header-left">
          <h1 className="page-title">Team<span className="page-title-dot">.</span></h1>
          <p className="page-subtitle">
            <span className="page-subtitle-num">{String(users.length).padStart(2, '0')}</span>
            <span className="page-subtitle-line" />
            <span>members</span>
          </p>
        </div>
        <div className="page-marquee" aria-hidden="true">
          <span className="page-marquee-track">
            <span>Team</span><span>·</span><span>Team</span><span>·</span>
            <span>Team</span><span>·</span><span>Team</span><span>·</span>
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="team-tabs">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            className={`team-tab-btn${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
            {key === 'members'  && users.length > 0       && <span className="team-tab-badge">{users.length}</span>}
            {key === 'activity' && activityLog.length > 0 && <span className="team-tab-badge">{activityLog.length}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="team-loading">Loading…</div>
      ) : (
        <>
          {tab === 'members' && (
            <TabMembers
              users={users}
              artists={artists}
              activityLog={activityLog}
              visibleRubrics={visibleRubrics}
              userArtistAccess={userArtistAccess}
              onDeleteUser={deleteUser}
              onEditEmail={editEmail}
              onSaveAccess={saveAccess}
            />
          )}
          {tab === 'invite'   && <TabInvite />}
          {tab === 'activity' && <TabActivity activityLog={activityLog} loading={loading} />}
          {tab === 'notify'   && <TabNotify users={users} />}
        </>
      )}
    </div>
  );
}

export default TeamPanel;
