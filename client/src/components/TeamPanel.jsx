import { useState, useEffect, useCallback } from 'react';
import BacklineChecklist from './backliner/BacklineChecklist';
import TechnicalSetlist  from './backliner/TechnicalSetlist';
import TechFiles         from './backliner/TechFiles';

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
const ARTIST_ROLES = ['viewer', 'producer', 'backliner', 'sound', 'light'];

/** Convert old array format [artistId, ...] to new object format { artistId: { role } } */
function toObjectAccess(rawAccess) {
  if (!rawAccess || typeof rawAccess !== 'object') return {};
  return Object.fromEntries(
    Object.entries(rawAccess).map(([userId, val]) => {
      if (Array.isArray(val)) {
        return [userId, Object.fromEntries(val.map((id) => [id, { role: 'viewer' }]))];
      }
      // Already object format — normalise values to objects
      const normalised = Object.fromEntries(
        Object.entries(val || {}).map(([artistId, roleInfo]) => [
          artistId,
          typeof roleInfo === 'string' ? { role: roleInfo } : (roleInfo || { role: 'viewer' }),
        ])
      );
      return [userId, normalised];
    })
  );
}

function TabMembers({ users, artists, shows, onUpdateShow, activityLog,
                      userArtistAccess, userPermissions,
                      onDeleteUser, onEditEmail,
                      onSaveAccess, onSaveUser, onOpenBacklinerProfile }) {
  const [editingEmail,       setEditingEmail]       = useState(null);
  const [emailDraft,         setEmailDraft]         = useState('');
  const [uAccess,            setUAccess]            = useState(() => toObjectAccess(userArtistAccess));
  const [localPerms,         setLocalPerms]         = useState(userPermissions || {});
  const [expandedPermUserId, setExpandedPermUserId] = useState(null);
  const [accessSaving,       setAccessSaving]       = useState(false);
  const [accessSaveMsg,      setAccessSaveMsg]      = useState('');
  const [permSaving,         setPermSaving]         = useState(false);
  const [permSaveMsg,        setPermSaveMsg]        = useState({});

  useEffect(() => { setUAccess(toObjectAccess(userArtistAccess)); }, [userArtistAccess]);
  useEffect(() => { setLocalPerms(userPermissions || {}); }, [userPermissions]);

  // Last-seen from activity log
  const lastSeen = {};
  for (const entry of activityLog) {
    if (!lastSeen[entry.userId]) lastSeen[entry.userId] = entry.timestamp;
  }

  // Save artist-access checkboxes only (rubric perms are saved separately per-user)
  const saveArtistAccess = async () => {
    setAccessSaving(true);
    const r = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userArtistAccess: uAccess }),
    });
    setAccessSaveMsg(r.ok ? 'Saved' : 'Error');
    setTimeout(() => setAccessSaveMsg(''), 3000);
    setAccessSaving(false);
    if (r.ok) onSaveAccess(uAccess, localPerms);
  };

  // Toggle which rubrics a user can view/edit
  const togglePerm = (userId, permType, rubric, checked) => {
    const cur = localPerms[userId] || { viewRubrics: [], editRubrics: [] };
    let view = [...(cur.viewRubrics || [])];
    let edit = [...(cur.editRubrics || [])];
    if (permType === 'edit') {
      if (checked) {
        if (!edit.includes(rubric)) edit.push(rubric);
        if (!view.includes(rubric)) view.push(rubric); // auto-check view
      } else {
        edit = edit.filter((r) => r !== rubric);
      }
    } else {
      if (checked) {
        if (!view.includes(rubric)) view.push(rubric);
      } else {
        view = view.filter((r) => r !== rubric);
        edit = edit.filter((r) => r !== rubric); // also uncheck edit
      }
    }
    setLocalPerms({ ...localPerms, [userId]: { viewRubrics: view, editRubrics: edit } });
  };

  // Save per-user rubric permissions only (does not touch userArtistAccess)
  const saveUserPerms = async (userId) => {
    setPermSaving(true);
    const r = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userPermissions: localPerms }),
    });
    const msg = r.ok ? 'Saved' : 'Error';
    setPermSaveMsg((prev) => ({ ...prev, [userId]: msg }));
    setTimeout(() => setPermSaveMsg((prev) => ({ ...prev, [userId]: '' })), 3000);
    setPermSaving(false);
    if (r.ok) onSaveAccess(uAccess, localPerms);
  };

  const toggleArtist = (userId, artistId, checked) => {
    const cur = uAccess[userId] || {};
    if (checked) {
      setUAccess({ ...uAccess, [userId]: { ...cur, [artistId]: { role: 'viewer' } } });
    } else {
      const { [artistId]: _removed, ...rest } = cur;
      setUAccess({ ...uAccess, [userId]: rest });
    }
  };

  const setArtistRole = (userId, artistId, role) => {
    const cur = uAccess[userId] || {};
    setUAccess({ ...uAccess, [userId]: { ...cur, [artistId]: { ...(cur[artistId] || {}), role } } });
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
              {users.flatMap((u) => {
                const permitted = Object.keys(uAccess[u.id] || {});
                const permsOpen = expandedPermUserId === u.id;
                const perms = localPerms[u.id] || { viewRubrics: [], editRubrics: [] };
                return [
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
                    <td>
                      <span className={`badge-workspace-role badge-wr--${u.workspaceRole || 'producer'}`}>
                        {u.workspaceRole || 'producer'}
                      </span>
                    </td>
                    <td className="team-td-lastseen">{fmtRelative(lastSeen[u.id])}</td>
                    <td className="team-td-artists">
                      {artists.length === 0
                        ? <span className="team-no-artists">—</span>
                        : artists.map((a) => {
                          const isChecked  = permitted.includes(a.id);
                          const artistRole = (uAccess[u.id]?.[a.id]?.role) || 'viewer';
                          return (
                            <div key={a.id} className="team-artist-access-row">
                              <label className="team-artist-check" title={a.name}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => toggleArtist(u.id, a.id, e.target.checked)}
                                />
                                <span>{a.name}</span>
                              </label>
                              {isChecked && (
                                <select
                                  className="team-role-select"
                                  value={artistRole}
                                  onChange={(e) => setArtistRole(u.id, a.id, e.target.value)}
                                >
                                  {ARTIST_ROLES.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          );
                        })
                      }
                    </td>
                    <td className="team-td-actions">
                      <button
                        className={`btn-ghost btn-perm-toggle${permsOpen ? ' active' : ''}`}
                        onClick={() => setExpandedPermUserId((prev) => prev === u.id ? null : u.id)}
                        title="Configure view / edit permissions"
                      >
                        Permissions {permsOpen ? '▴' : '▾'}
                      </button>
                      <button className="btn-action btn-action--danger" onClick={() => onDeleteUser(u)}>
                        Remove
                      </button>
                    </td>
                  </tr>,
                  permsOpen && (
                    <tr key={`${u.id}-perms`} className="user-perm-expand-row">
                      <td colSpan={6}>
                        <div className="user-perm-panel">
                          <p className="user-perm-panel-title">
                            Permissions for <strong>{u.username}</strong> — choose what they can see and edit per section
                          </p>
                          {Object.keys(uAccess[u.id] || {}).length === 0 && (
                            <p className="user-perm-no-artist-hint">
                              ⚠ No artists checked above — check at least one artist in the Artists column and click <em>Save Artist Access</em> for this user to see any content.
                            </p>
                          )}
                          <div className="user-perm-grid">
                            {/* Header row */}
                            <div className="user-perm-label-cell user-perm-type-label"></div>
                            {ALL_RUBRICS.map((r) => (
                              <div key={r} className="user-perm-rubric-head">
                                {RUBRIC_LABELS[r].split(' ')[0]}
                              </div>
                            ))}
                            {/* View row */}
                            <div className="user-perm-label-cell user-perm-type-label">View</div>
                            {ALL_RUBRICS.map((rubric) => (
                              <div key={rubric} className="user-perm-check-cell">
                                <input
                                  type="checkbox"
                                  checked={(perms.viewRubrics || []).includes(rubric)}
                                  onChange={(e) => togglePerm(u.id, 'view', rubric, e.target.checked)}
                                />
                              </div>
                            ))}
                            {/* Edit row */}
                            <div className="user-perm-label-cell user-perm-type-label">Edit</div>
                            {ALL_RUBRICS.map((rubric) => (
                              <div key={rubric} className="user-perm-check-cell">
                                <input
                                  type="checkbox"
                                  checked={(perms.editRubrics || []).includes(rubric)}
                                  onChange={(e) => togglePerm(u.id, 'edit', rubric, e.target.checked)}
                                />
                              </div>
                            ))}
                          </div>
                          <div className="user-perm-save-row">
                            <button
                              className="btn-primary"
                              onClick={() => saveUserPerms(u.id)}
                              disabled={permSaving}
                            >
                              {permSaving ? 'Saving…' : 'Save'}
                            </button>
                            {permSaveMsg[u.id] && (
                              <span className={`team-save-msg ${permSaveMsg[u.id] === 'Saved' ? 'ok' : 'err'}`}>
                                {permSaveMsg[u.id]}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ),
                ].filter(Boolean);
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="team-save-row">
        <button className="btn-primary" onClick={saveArtistAccess} disabled={accessSaving}>
          {accessSaving ? 'Saving…' : 'Save Artist Access'}
        </button>
        {accessSaveMsg && <span className={`team-save-msg ${accessSaveMsg === 'Saved' ? 'ok' : 'err'}`}>{accessSaveMsg}</span>}
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
  const [genError,    setGenError]    = useState('');
  const [copied,      setCopied]      = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [loadingInv,  setLoadingInv]  = useState(true);

  // "Add by username" state
  const [usernameInput, setUsernameInput] = useState('');
  const [sendingReq,    setSendingReq]    = useState(false);
  const [reqMsg,        setReqMsg]        = useState(null);  // { type: 'ok'|'error', text }
  const [joinRequests,  setJoinRequests]  = useState([]);

  const load = useCallback(async () => {
    setLoadingInv(true);
    const [invRes, jrRes] = await Promise.all([
      fetch('/api/invitations'),
      fetch('/api/team/join-requests'),
    ]);
    if (invRes.ok) setInvitations(await invRes.json());
    if (jrRes.ok)  setJoinRequests(await jrRes.json());
    setLoadingInv(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    setGenError('');
    setLink('');
    try {
      const r = await fetch('/api/invitations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok) { setGenError(d.error || 'Failed to generate invite link'); return; }
      setLink(d.link);
      setExpires(d.expiresAt);
      setCopied(false);
      await load();
    } catch (e) {
      setGenError(e.message || 'Network error');
    } finally {
      setGenerating(false);
    }
  };

  const sendJoinRequest = async () => {
    if (!usernameInput.trim()) return;
    setSendingReq(true);
    setReqMsg(null);
    try {
      const r = await fetch('/api/team/join-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput.trim() }),
      });
      const d = await r.json();
      if (!r.ok) {
        setReqMsg({ type: 'error', text: d.error || 'Failed to send request' });
      } else {
        setReqMsg({ type: 'ok', text: `Request sent to "${usernameInput.trim()}"` });
        setUsernameInput('');
        await load();
      }
    } catch (e) {
      setReqMsg({ type: 'error', text: e.message || 'Network error' });
    } finally {
      setSendingReq(false);
      setTimeout(() => setReqMsg(null), 4000);
    }
  };

  const cancelJoinRequest = async (id) => {
    await fetch(`/api/team/join-request/${id}`, { method: 'DELETE' });
    setJoinRequests((prev) => prev.filter((r) => r.id !== id));
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
      {/* ── Add by username ─────────────────────────────── */}
      <h3 className="team-section-title">Add by Username</h3>
      <p className="team-section-desc">Send a join request to an existing user. They'll see it in their account and can accept or decline.</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input
          className="team-invite-input"
          value={usernameInput}
          onChange={(e) => setUsernameInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendJoinRequest()}
          placeholder="Username…"
          style={{ maxWidth: 240 }}
        />
        <button className="btn-primary" onClick={sendJoinRequest} disabled={sendingReq || !usernameInput.trim()}>
          {sendingReq ? 'Sending…' : 'Send Request'}
        </button>
      </div>
      {reqMsg && (
        <p style={{ fontSize: 13, color: reqMsg.type === 'ok' ? 'var(--color-success, #2e7d32)' : 'var(--color-danger, #c0392b)', marginBottom: 8 }}>
          {reqMsg.text}
        </p>
      )}

      {/* Pending requests list */}
      {joinRequests.filter((r) => r.status === 'pending').length > 0 && (
        <div style={{ marginTop: 8, marginBottom: 20 }}>
          <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 6 }}>Pending requests:</p>
          {joinRequests.filter((r) => r.status === 'pending').map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 13 }}>{r.toUsername}</span>
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{fmtDate(r.createdAt)}</span>
              <button className="btn-action btn-action--danger" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => cancelJoinRequest(r.id)}>Cancel</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--color-border)', margin: '20px 0' }} />

      {/* ── Invite link ──────────────────────────────────── */}
      <h3 className="team-section-title">Generate Invite Link</h3>
      <p className="team-section-desc">One-time link, valid for 48 hours. The recipient sets their own username and password.</p>

      <button className="btn-primary team-gen-btn" onClick={generate} disabled={generating}>
        {generating ? 'Generating…' : '+ New Invite Link'}
      </button>
      {genError && <p className="team-gen-error">{genError}</p>}

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
                  <th>Role</th>
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
                    <td><span className={`badge-workspace-role badge-wr--${inv.workspaceRole || 'producer'}`}>{inv.workspaceRole || 'producer'}</span></td>
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
    register:   { icon: '★', label: 'Joined team' },
    notify:     { icon: '✉', label: 'Notification sent' },
    view_teams: { icon: '◉', label: 'Viewed shared content' },
  };

  // Filter out plain login events — the admin only needs content interactions
  const relevant = activityLog.filter((e) => e.action !== 'login');

  return (
    <div className="team-section">
      <h3 className="team-section-title">Team Activity</h3>
      <p className="team-section-desc">Content interactions from team members — logins are not shown.</p>

      {loading ? (
        <p className="team-empty">Loading…</p>
      ) : relevant.length === 0 ? (
        <p className="team-empty">No content interactions recorded yet. Activity appears when members view shared data.</p>
      ) : (
        <div className="team-activity-list">
          {relevant.map((entry, i) => {
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
//  TAB 5 — Groups (Teams)
// ────────────────────────────────────────────────────────────────────────────

function TeamGroupCard({ team, users, artists, expanded, onToggle, onUpdate, onDelete }) {
  const [name,         setName]         = useState(team.name);
  const [members,      setMembers]      = useState(team.members || []);
  const [sharedArts,   setSharedArts]   = useState(team.sharedArtists || []);
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);

  // Keep local state in sync if parent refreshes
  useEffect(() => { setName(team.name); setMembers(team.members || []); setSharedArts(team.sharedArtists || []); }, [team]);

  const toggleMember = (id) =>
    setMembers((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const toggleArtist = (artistId) =>
    setSharedArts((prev) => {
      if (prev.find((a) => a.artistId === artistId)) return prev.filter((a) => a.artistId !== artistId);
      return [...prev, { artistId, visibleRubrics: ALL_RUBRICS.slice() }];
    });

  const setRubrics = (artistId, rubrics) =>
    setSharedArts((prev) => prev.map((a) => a.artistId === artistId ? { ...a, visibleRubrics: rubrics } : a));

  const save = async () => {
    setSaving(true);
    await onUpdate({ name, members, sharedArtists: sharedArts });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const memberSummary = users.filter((u) => (team.members || []).includes(u.id)).map((u) => u.username).join(', ') || 'No members';
  const artistSummary = artists.filter((a) => (team.sharedArtists || []).some((s) => s.artistId === a.id)).map((a) => a.name).join(', ');

  return (
    <div className="tg-card">
      <div className="tg-card-header" onClick={onToggle}>
        <div className="tg-card-info">
          <span className="tg-card-name" dir="auto">{team.name}</span>
          <span className="tg-card-meta">
            {memberSummary}
            {artistSummary && <> · {artistSummary}</>}
          </span>
        </div>
        <div className="tg-card-btns" onClick={(e) => e.stopPropagation()}>
          <button className="btn-action btn-action--danger" onClick={onDelete}>Delete</button>
        </div>
        <span className="tg-card-caret">{expanded ? '−' : '+'}</span>
      </div>

      {expanded && (
        <div className="tg-card-body">
          {/* Group name */}
          <div className="tg-field">
            <label className="tg-field-label">Group Name</label>
            <input
              className="team-email-input"
              value={name}
              dir="auto"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Members */}
          <div className="tg-field">
            <label className="tg-field-label">Members</label>
            {users.length === 0
              ? <p className="team-empty">No team members yet — use the Invite tab first.</p>
              : (
                <div className="tg-checkboxes">
                  {users.map((u) => (
                    <label key={u.id} className="tg-check-row">
                      <input type="checkbox" checked={members.includes(u.id)} onChange={() => toggleMember(u.id)} />
                      <span className="tg-check-name">{u.username}</span>
                      {u.email && <span className="tg-check-email">{u.email}</span>}
                    </label>
                  ))}
                </div>
              )
            }
          </div>

          {/* Shared artist pages */}
          <div className="tg-field">
            <label className="tg-field-label">Shared Artist Pages</label>
            <p className="team-section-desc" style={{ marginBottom: 10 }}>
              Select which artists to share and which sections members can see.
            </p>
            {artists.length === 0
              ? <p className="team-empty">No artists created yet.</p>
              : (
                <div className="tg-artist-list">
                  {artists.map((a) => {
                    const shared = sharedArts.find((s) => s.artistId === a.id);
                    return (
                      <div key={a.id} className="tg-artist-block">
                        <label className="tg-check-row tg-artist-check-row">
                          <input type="checkbox" checked={!!shared} onChange={() => toggleArtist(a.id)} />
                          <span className="tg-artist-name" dir="auto">{a.name}</span>
                        </label>
                        {shared && (
                          <div className="tg-rubric-row">
                            {ALL_RUBRICS.map((key) => (
                              <label key={key} className="tg-rubric-check">
                                <input
                                  type="checkbox"
                                  checked={shared.visibleRubrics.includes(key)}
                                  onChange={(e) => {
                                    const next = e.target.checked
                                      ? [...shared.visibleRubrics, key]
                                      : shared.visibleRubrics.filter((r) => r !== key);
                                    setRubrics(a.id, next);
                                  }}
                                />
                                <span>{RUBRIC_LABELS[key]}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            }
          </div>

          <div className="team-save-row">
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
            {saved && <span className="team-save-msg ok">Saved</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function TabGroups({ users, artists }) {
  const [teams,      setTeams]      = useState([]);
  const [loadingT,   setLoadingT]   = useState(true);
  const [creating,   setCreating]   = useState(false);
  const [newName,    setNewName]    = useState('');
  const [newErr,     setNewErr]     = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/teams');
    if (r.ok) setTeams(await r.json());
    setLoadingT(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createTeam = async () => {
    if (!newName.trim()) { setNewErr('Enter a name'); return; }
    const r = await fetch('/api/admin/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (r.ok) {
      const team = await r.json();
      setTeams((prev) => [...prev, team]);
      setNewName(''); setCreating(false); setExpandedId(team.id);
    } else {
      const d = await r.json().catch(() => ({}));
      setNewErr(d.error || 'Error');
    }
  };

  const updateTeam = async (id, data) => {
    const r = await fetch(`/api/admin/teams/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (r.ok) {
      const { team } = await r.json();
      setTeams((prev) => prev.map((t) => t.id === id ? team : t));
    }
  };

  const deleteTeam = async (id) => {
    if (!window.confirm('Delete this group? Members will lose access to shared data.')) return;
    const r = await fetch(`/api/admin/teams/${id}`, { method: 'DELETE' });
    if (r.ok) {
      setTeams((prev) => prev.filter((t) => t.id !== id));
      if (expandedId === id) setExpandedId(null);
    }
  };

  return (
    <div className="team-section">
      <div className="team-members-header">
        <h3 className="team-section-title">Groups</h3>
        <span className="team-member-count">{teams.length} group{teams.length !== 1 ? 's' : ''}</span>
      </div>
      <p className="team-section-desc">
        Create named groups, add members, and share artist pages with custom section visibility.
        Members see shared shows in their Teams tab.
      </p>

      {!creating ? (
        <button className="btn-primary team-gen-btn" onClick={() => setCreating(true)}>+ New Group</button>
      ) : (
        <div className="tg-create-row">
          <input
            className="team-email-input"
            placeholder="Group name"
            value={newName}
            dir="auto"
            autoFocus
            onChange={(e) => { setNewName(e.target.value); setNewErr(''); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createTeam();
              if (e.key === 'Escape') { setCreating(false); setNewName(''); }
            }}
          />
          <button className="btn-primary" onClick={createTeam}>Create</button>
          <button className="btn-ghost" onClick={() => { setCreating(false); setNewName(''); }}>Cancel</button>
          {newErr && <span className="team-gen-error">{newErr}</span>}
        </div>
      )}

      {loadingT ? (
        <p className="team-empty" style={{ marginTop: 16 }}>Loading…</p>
      ) : teams.length === 0 ? (
        <p className="team-empty" style={{ marginTop: 16 }}>No groups yet. Click "+ New Group" to create one.</p>
      ) : (
        <div className="tg-list">
          {teams.map((team) => (
            <TeamGroupCard
              key={team.id}
              team={team}
              users={users}
              artists={artists}
              expanded={expandedId === team.id}
              onToggle={() => setExpandedId((prev) => prev === team.id ? null : team.id)}
              onUpdate={(data) => updateTeam(team.id, data)}
              onDelete={() => deleteTeam(team.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  Backliner profile — helpers
// ────────────────────────────────────────────────────────────────────────────
function fmtShowDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

// Per-show accordion with Checklist / Setlist / Files tabs
function BacklinerShowAccordion({ show, onUpdateShow }) {
  const [open, setOpen] = useState(false);
  const [tab,  setTab]  = useState('checklist');
  return (
    <div className="bkp-show-accordion">
      <button className="bkp-show-accordion-header" onClick={() => setOpen((o) => !o)}>
        <span className="bkp-show-accordion-name" dir="auto">{show.name}</span>
        {show.date && <span className="bkp-show-accordion-date">{fmtShowDate(show.date)}</span>}
        {show.eventType && <span className="bkp-show-accordion-type" dir="auto">{show.eventType}</span>}
        <span className="bkp-show-accordion-caret">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="bkp-show-accordion-body">
          <div className="bkp-show-tabs">
            {['checklist', 'setlist', 'files'].map((t) => (
              <button
                key={t}
                className={`bk-inline-tab-btn${tab === t ? ' active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div className="bkp-show-tab-body">
            {tab === 'checklist' && <BacklineChecklist show={show} onUpdateShow={onUpdateShow} />}
            {tab === 'setlist'   && <TechnicalSetlist  show={show} onUpdateShow={onUpdateShow} />}
            {tab === 'files'     && <TechFiles         show={show} onUpdateShow={onUpdateShow} />}
          </div>
        </div>
      )}
    </div>
  );
}

// Full backliner profile modal
function BacklinerProfileModal({ user, shows, onUpdateShow, onSaveUser, onClose }) {
  const [assignedIds, setAssignedIds] = useState(user.assignedShowIds || []);
  const [saving,      setSaving]      = useState(false);
  const [saveMsg,     setSaveMsg]     = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = [...shows]
    .filter((s) => !s.invoice && !s.archived && (!s.date || s.date >= today))
    .sort((a, b) => (a.date || '') > (b.date || '') ? 1 : -1);

  const assignedShows = shows.filter((s) => assignedIds.includes(s.id))
    .sort((a, b) => (a.date || '') > (b.date || '') ? 1 : -1);

  const toggle = (id) =>
    setAssignedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const save = async () => {
    setSaving(true);
    await onSaveUser(user.id, { assignedShowIds: assignedIds });
    setSaveMsg('Saved');
    setTimeout(() => setSaveMsg(''), 2500);
    setSaving(false);
  };

  return (
    <div className="modal-overlay confirm-overlay bkp-overlay" onClick={onClose}>
      <div className="bkp-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bkp-header">
          <div className="bkp-header-info">
            <h3 className="bkp-name">{user.username}</h3>
            <span className="bkp-role-tag">Backliner</span>
            {user.email && <span className="bkp-email">{user.email}</span>}
          </div>
          <button className="bkp-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Assign to shows */}
        <div className="bkp-section">
          <h4 className="bkp-section-title">Assign to Shows</h4>
          {upcoming.length === 0 ? (
            <p className="bkp-empty">No upcoming shows to assign.</p>
          ) : (
            <div className="bkp-assign-list">
              {upcoming.map((s) => (
                <label key={s.id} className="bkp-assign-row">
                  <input
                    type="checkbox"
                    className="bkp-assign-check"
                    checked={assignedIds.includes(s.id)}
                    onChange={() => toggle(s.id)}
                  />
                  <span className="bkp-assign-name" dir="auto">{s.name}</span>
                  {s.date && <span className="bkp-assign-date">{fmtShowDate(s.date)}</span>}
                  {s.eventType && <span className="bkp-assign-type" dir="auto">{s.eventType}</span>}
                </label>
              ))}
            </div>
          )}
          <div className="bkp-save-row">
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save Assignments'}
            </button>
            {saveMsg && <span className="bkp-save-msg">{saveMsg}</span>}
          </div>
        </div>

        {/* Backline setup per assigned show */}
        {assignedShows.length > 0 && (
          <div className="bkp-section">
            <h4 className="bkp-section-title">Backline Setup</h4>
            <p className="bkp-section-desc">Configure checklists, setlists and files for each assigned show.</p>
            {assignedShows.map((show) => (
              <BacklinerShowAccordion key={show.id} show={show} onUpdateShow={onUpdateShow} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  Main TeamPanel
// ────────────────────────────────────────────────────────────────────────────
function TeamPanel({ artists, shows = [], onUpdateShow }) {
  const [tab,              setTab]              = useState('members');
  const [users,            setUsers]            = useState([]);
  const [visibleRubrics,   setVisibleRubrics]   = useState([]);
  const [userArtistAccess, setUserArtistAccess] = useState({});
  const [userPermissions,  setUserPermissions]  = useState({});
  const [activityLog,      setActivityLog]      = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [selectedBackliner, setSelectedBackliner] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const [ur, sr, ar] = await Promise.all([
      fetch('/api/users').then((r) => r.ok ? r.json() : []),
      fetch('/api/admin/settings').then((r) => r.ok ? r.json() : null),
      fetch('/api/team/activity').then((r) => r.ok ? r.json() : []),
    ]);
    setUsers(ur);
    if (sr) {
      setVisibleRubrics(sr.visibleRubrics || []);
      setUserArtistAccess(sr.userArtistAccess || {});
      setUserPermissions(sr.userPermissions || {});
    }
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

  const saveUserData = async (userId, data) => {
    const r = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (r.ok) {
      const updated = await r.json();
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, ...data, ...(updated.user || {}) } : u));
    }
  };

  const saveAccess = (access, perms) => {
    setUserArtistAccess(access);
    if (perms) setUserPermissions(perms);
  };

  const TABS = [
    { key: 'members',  label: 'Members' },
    { key: 'groups',   label: 'Groups' },
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
              shows={shows}
              onUpdateShow={onUpdateShow}
              activityLog={activityLog}
              userArtistAccess={userArtistAccess}
              userPermissions={userPermissions}
              onDeleteUser={deleteUser}
              onEditEmail={editEmail}
              onSaveAccess={saveAccess}
              onSaveUser={saveUserData}
              onOpenBacklinerProfile={(user) => setSelectedBackliner(user)}
            />
          )}
          {tab === 'groups'   && <TabGroups users={users} artists={artists} />}
          {tab === 'invite'   && <TabInvite />}
          {tab === 'activity' && <TabActivity activityLog={activityLog} loading={loading} />}
          {tab === 'notify'   && <TabNotify users={users} />}
        </>
      )}

      {selectedBackliner && (
        <BacklinerProfileModal
          user={selectedBackliner}
          shows={shows}
          onUpdateShow={onUpdateShow}
          onSaveUser={saveUserData}
          onClose={() => setSelectedBackliner(null)}
        />
      )}
    </div>
  );
}

export default TeamPanel;
