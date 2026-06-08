import { useState, useEffect, useCallback, useRef } from 'react';
import BacklineChecklist from './backliner/BacklineChecklist';
import TechnicalSetlist  from './backliner/TechnicalSetlist';
import TechFiles         from './backliner/TechFiles';
import SegmentedControl  from './ui/SegmentedControl';
import PageBar           from './ui/PageBar';
import SavedPill, { useSavedPill } from './ui/SavedPill';

// ── Constants ─────────────────────────────────────────────────────────────────
const RUBRIC_LABELS = {
  schedule:  'Schedule',
  logistics: 'Logistics',
  technical: 'Technical',
};
const RUBRIC_SUBTITLES = {
  schedule:  'Arrival times · Soundcheck · Door opening',
  logistics: 'Travel · Vehicles · Hotels · Catering · Contacts',
  technical: 'Tech spec · Stages · Setlist · Equipment checklist',
};
const ALL_RUBRICS = ['schedule', 'logistics', 'technical'];

const ARTIST_ROLES = ['viewer', 'producer', 'backliner', 'sound', 'light'];

const ROLE_LABELS = {
  backliner: 'Backliner',
  sound:     'Soundman',
  light:     'Lighting',
  producer:  'Producer',
  viewer:    'Viewer',
};

const PALETTE = ['#3852B4','#5E7AC4','#F08D39','#C26C1F','#1F2D6E','#B07729','#8F4F1A','#7A8FE0'];
const avatarColor = (id) => PALETTE[(id||'').split('').reduce((a,c) => a + c.charCodeAt(0), 0) % PALETTE.length];
const initials    = (name) => (name||'').split(' ').map(p => p[0]).filter(Boolean).slice(0,2).join('').toUpperCase() || '?';

// ── Helpers ───────────────────────────────────────────────────────────────────
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
  return `${Math.floor(h / 24)}d ago`;
}
function fmtShowDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
function isExpired(iso) { return iso && new Date(iso) < new Date(); }

function toObjectAccess(rawAccess) {
  if (!rawAccess || typeof rawAccess !== 'object') return {};
  return Object.fromEntries(
    Object.entries(rawAccess).map(([userId, val]) => {
      if (Array.isArray(val)) {
        return [userId, Object.fromEntries(val.map(id => [id, { role: 'viewer' }]))];
      }
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

// ── Three-dot dropdown menu ───────────────────────────────────────────────────
function DotMenu({ onRemove, onBind }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="tm-dotmenu" ref={ref}>
      <button
        className="tm-dots-btn"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-label="More options"
      >
        ···
      </button>
      {open && (
        <div className="tm-dots-dropdown">
          {onBind && (
            <button className="tm-dots-item" onClick={() => { onBind(); setOpen(false); }}>
              Bind to this workspace
            </button>
          )}
          <button className="tm-dots-item tm-dots-item--danger" onClick={() => { onRemove(); setOpen(false); }}>
            Remove from team
          </button>
        </div>
      )}
    </div>
  );
}

// ── Inline permissions editor (shown directly in the expanded card) ───────────
function InlinePermissions({ userId, perms, onSave }) {
  const [local, setLocal] = useState(perms || { viewRubrics: [], editRubrics: [] });
  const [saving, setSaving] = useState(false);
  const { show: saved, flash } = useSavedPill();

  // Sync when switching between expanded users
  useEffect(() => { setLocal(perms || { viewRubrics: [], editRubrics: [] }); }, [userId, perms]);

  const toggle = (permType, rubric, checked) => {
    let view = [...(local.viewRubrics || [])];
    let edit = [...(local.editRubrics || [])];
    if (permType === 'edit') {
      if (checked) {
        if (!edit.includes(rubric)) edit.push(rubric);
        if (!view.includes(rubric)) view.push(rubric);
      } else {
        edit = edit.filter(r => r !== rubric);
      }
    } else {
      if (checked) {
        if (!view.includes(rubric)) view.push(rubric);
      } else {
        view = view.filter(r => r !== rubric);
        edit = edit.filter(r => r !== rubric);
      }
    }
    setLocal({ viewRubrics: view, editRubrics: edit });
  };

  const save = async () => {
    setSaving(true);
    await onSave(userId, local);
    setSaving(false);
    flash();
  };

  return (
    <div className="tm-inline-perms">
      {/* Change 2: compact View/Edit matrix */}
      <div className="tm-perm-matrix">
        {/* Header row — 3-column grid matches data rows */}
        <div className="tm-perm-matrix-head">
          <span className="tm-perm-matrix-area-col">Area</span>
          <span className="tm-perm-matrix-cell-col">View</span>
          <span className="tm-perm-matrix-cell-col">Edit</span>
        </div>
        {/* Data rows */}
        {ALL_RUBRICS.map(rubric => {
          const canView = (local.viewRubrics || []).includes(rubric);
          const canEdit = (local.editRubrics || []).includes(rubric);
          return (
            <div key={rubric} className="tm-perm-matrix-row">
              <div className="tm-perm-matrix-area">
                <span className="tm-perm-rubric-name">{RUBRIC_LABELS[rubric]}</span>
                <span className="tm-perm-rubric-sub">{RUBRIC_SUBTITLES[rubric]}</span>
              </div>
              <button
                className={`tm-perm-cell${canView ? ' tm-perm-cell--on' : ''}`}
                onClick={() => toggle('view', rubric, !canView)}
                aria-pressed={canView}
                aria-label={`${RUBRIC_LABELS[rubric]} View`}
              >
                {canView && <span className="tm-perm-check">✓</span>}
              </button>
              <button
                className={`tm-perm-cell${canEdit ? ' tm-perm-cell--on' : ''}`}
                onClick={() => toggle('edit', rubric, !canEdit)}
                aria-pressed={canEdit}
                aria-label={`${RUBRIC_LABELS[rubric]} Edit`}
              >
                {canEdit && <span className="tm-perm-check">✓</span>}
              </button>
            </div>
          );
        })}
      </div>
      <div className="tm-perm-footer">
        <button className="tm-perm-matrix-save" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <SavedPill show={saved} />
    </div>
  );
}

// ── Expandable user details ────────────────────────────────────────────────────
function UserExpanded({ user, shows, tasks = [], activityLog, onUpdateShow }) {
  const [section, setSection] = useState('tasks');
  const today = new Date().toISOString().slice(0, 10);

  // Assigned open tasks — prefer the global tasks array (keyed by assigneeId);
  // fall back to legacy show.tasks for backward compat with older data.
  const showMap = Object.fromEntries(shows.map(s => [s.id, s]));
  const assignedTasks = tasks.length > 0
    ? tasks
        .filter(t => !t.completed && t.assigneeId === user.id)
        .map(t => ({
          ...t,
          showName: showMap[t.showId]?.name || '',
          showObj:  showMap[t.showId] || null,
        }))
    : shows.flatMap(s =>
        (s.tasks || [])
          .filter(t => !t.completed && (t.assignedToUserId === user.id || t.assignedTo === user.id))
          .map(t => ({ ...t, showName: s.name, showId: s.id, showObj: s }))
      );

  // Upcoming shows (next 5 where user is assigned)
  const upcomingShows = shows
    .filter(s =>
      !s.archived &&
      (user.assignedShowIds || []).includes(s.id) &&
      (!s.date || s.date >= today)
    )
    .sort((a, b) => (a.date || '') > (b.date || '') ? 1 : -1)
    .slice(0, 5);

  // Recent activity (last 3 actions for this user)
  const userActivity = activityLog
    .filter(e => e.userId === user.id || e.username === user.username)
    .slice(0, 3);

  const markDone = (showId, taskId, showObj) => {
    const updatedTasks = (showObj.tasks || []).map(t =>
      t.id === taskId ? { ...t, completed: true } : t
    );
    onUpdateShow(showId, { ...showObj, tasks: updatedTasks });
  };

  const [newTask, setNewTask]   = useState('');
  const [taskShowId, setTaskShowId] = useState(shows[0]?.id || '');
  const addTask = () => {
    if (!newTask.trim() || !taskShowId) return;
    const show = shows.find(s => s.id === taskShowId);
    if (!show) return;
    const task = { id: `t${Date.now()}`, text: newTask.trim(), completed: false, assignedToUserId: user.id };
    onUpdateShow(taskShowId, { ...show, tasks: [...(show.tasks || []), task] });
    setNewTask('');
  };

  return (
    <div className="tm-expanded" onClick={e => e.stopPropagation()}>
      <div className="tm-expanded-tabs">
        {[['tasks','Assigned Tasks'],['shows','Upcoming Shows'],['activity','Recent Activity']].map(([key, label]) => (
          <button
            key={key}
            className={`tm-exp-tab${section === key ? ' active' : ''}`}
            onClick={() => setSection(key)}
          >
            {label}
            {key === 'tasks' && assignedTasks.length > 0 && (
              <span className="tm-exp-badge">{assignedTasks.length}</span>
            )}
          </button>
        ))}
      </div>

      {section === 'tasks' && (
        <div className="tm-exp-section">
          {assignedTasks.length === 0 ? (
            <p className="tm-exp-empty">No open tasks assigned to {user.username}.</p>
          ) : (
            <ul className="tm-task-list">
              {assignedTasks.map(t => (
                <li key={`${t.showId}-${t.id}`} className="tm-task-row">
                  <label className="tm-task-check">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => markDone(t.showId, t.id, t.showObj)}
                    />
                  </label>
                  <span className="tm-task-text">{t.text}</span>
                  <span className="tm-task-show" dir="auto">{t.showName}</span>
                </li>
              ))}
            </ul>
          )}
          {shows.length > 0 && (
            <div className="tm-add-task-row">
              <select
                className="tm-task-show-select"
                value={taskShowId}
                onChange={e => setTaskShowId(e.target.value)}
              >
                {shows.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input
                className="tm-task-input"
                placeholder="New task…"
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTask()}
              />
              <button className="btn-action" onClick={addTask} disabled={!newTask.trim()}>Add</button>
            </div>
          )}
        </div>
      )}

      {section === 'shows' && (
        <div className="tm-exp-section">
          {upcomingShows.length === 0 ? (
            <p className="tm-exp-empty">
              {(user.assignedShowIds || []).length === 0
                ? `${user.username} is not assigned to any shows yet.`
                : 'No upcoming shows assigned.'}
            </p>
          ) : (
            <ul className="tm-show-list">
              {upcomingShows.map(s => (
                <li key={s.id} className="tm-show-row">
                  <span className="tm-show-name" dir="auto">{s.name}</span>
                  {s.date && <span className="tm-show-date">{fmtShowDate(s.date)}</span>}
                  {s.eventType && <span className="tm-show-type" dir="auto">{s.eventType}</span>}
                  {s.venue && <span className="tm-show-venue" dir="auto">{s.venue}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {section === 'activity' && (
        <div className="tm-exp-section">
          {userActivity.length === 0 ? (
            <p className="tm-exp-empty">No activity recorded yet.</p>
          ) : (
            <ul className="tm-activity-list">
              {userActivity.map((e, i) => (
                <li key={i} className="tm-activity-row">
                  <span className="tm-activity-action">{e.detail || e.action}</span>
                  <span className="tm-activity-time">{fmtRelative(e.timestamp)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Members tab ───────────────────────────────────────────────────────────────
function TabMembers({ users, unboundUsers = [], artists, shows, tasks = [], activityLog,
                      userArtistAccess, userPermissions,
                      onDeleteUser, onEditEmail,
                      onSaveAccess, onSavePerms, onUpdateShow,
                      artistId, onBindUser }) {

  const [localPerms,  setLocalPerms]  = useState(userPermissions || {});
  const [expandedId,  setExpandedId]  = useState(null);
  const [emailEditing,setEmailEditing]= useState(null);
  const [emailDraft,  setEmailDraft]  = useState('');

  useEffect(() => { setLocalPerms(userPermissions || {}); }, [userPermissions]);

  const lastSeen = {};
  for (const entry of activityLog) {
    if (!lastSeen[entry.userId]) lastSeen[entry.userId] = entry.timestamp;
  }

  const savePerms = async (userId, perms) => {
    const next = { ...localPerms, [userId]: perms };
    setLocalPerms(next);
    const r = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userPermissions: next }),
    });
    if (r.ok) onSavePerms(next);
  };

  const toggleExpand = (id) =>
    setExpandedId(prev => prev === id ? null : id);

  return (
    <div className="team-section">
      <div className="team-members-header">
        <h3 className="team-section-title">Active Members</h3>
        <span className="team-member-count">{users.length} member{users.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="tm-member-list">
          {users.length === 0 && unboundUsers.length === 0 && (
            <p className="team-empty">No team members yet. Use the Invite tab to add someone.</p>
          )}
          {users.map(u => {
            const isExpanded = expandedId === u.id;

            return (
              <div key={u.id} className={`tm-member-card${isExpanded ? ' expanded' : ''}`}>
                {/* ── Main row ── */}
                <div className="tm-member-row" onClick={() => toggleExpand(u.id)}>
                  <div className="tm-avatar" style={{ background: avatarColor(u.id) }}>
                    {initials(u.username)}
                  </div>

                  <div className="tm-member-info">
                    <span className="tm-member-name">{u.username}</span>
                    {emailEditing === u.id ? (
                      <div className="tm-email-edit" onClick={e => e.stopPropagation()}>
                        <input
                          className="team-email-input"
                          type="email"
                          value={emailDraft}
                          onChange={e => setEmailDraft(e.target.value)}
                          placeholder="email@example.com"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') { onEditEmail(u.id, emailDraft); setEmailEditing(null); }
                            if (e.key === 'Escape') setEmailEditing(null);
                          }}
                        />
                        <button className="btn-action" onClick={async () => {
                          await onEditEmail(u.id, emailDraft);
                          setEmailEditing(null);
                        }}>Save</button>
                        <button className="btn-ghost" onClick={() => setEmailEditing(null)}>✕</button>
                      </div>
                    ) : (
                      <span
                        className={`tm-member-email${u.email ? '' : ' empty'}`}
                        title="Click to edit email"
                        onClick={e => { e.stopPropagation(); setEmailEditing(u.id); setEmailDraft(u.email || ''); }}
                      >
                        {u.email || 'No email — click to add'}
                      </span>
                    )}
                  </div>

                  <span className={`tm-role-badge tm-role--${u.workspaceRole || 'producer'}`}>
                    {ROLE_LABELS[u.workspaceRole] || u.workspaceRole || 'Producer'}
                  </span>

                  <span className="tm-last-seen" title={fmtDate(lastSeen[u.id])}>
                    {fmtRelative(lastSeen[u.id])}
                  </span>

                  <DotMenu
                    onRemove={() => onDeleteUser(u)}
                    onBind={artistId && u.artistId !== artistId && onBindUser
                      ? () => onBindUser(u.id, artistId)
                      : undefined}
                  />
                </div>

                {/* ── Expanded: Access + Permissions side by side, then tabs ── */}
                {isExpanded && (
                  <>
                    <div className="tm-expanded-settings" onClick={e => e.stopPropagation()}>
                      {/* Content permissions */}
                      <div className="tm-settings-col">
                        <span className="tm-settings-col-label">Content Permissions</span>
                        <InlinePermissions
                          userId={u.id}
                          perms={localPerms[u.id] || { viewRubrics: [], editRubrics: [] }}
                          onSave={savePerms}
                        />
                      </div>
                    </div>

                    <UserExpanded
                      user={u}
                      shows={shows}
                      tasks={tasks}
                      activityLog={activityLog}
                      onUpdateShow={onUpdateShow}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

      {artistId && unboundUsers.length > 0 && (
        <div className="team-unbound-section">
          <div className="team-members-header" style={{ marginTop: 24 }}>
            <h3 className="team-section-title">Unassigned Members</h3>
            <span className="team-member-count">{unboundUsers.length} — not linked to any workspace</span>
          </div>
          <div className="tm-member-list">
            {unboundUsers.map(u => (
              <div key={u.id} className="tm-member-card">
                <div className="tm-member-row">
                  <div className="tm-avatar" style={{ background: '#9AA0A8' }}>
                    {initials(u.username)}
                  </div>
                  <div className="tm-member-info">
                    <span className="tm-member-name">{u.username}</span>
                    <span className="tm-member-email empty">Not assigned to any workspace</span>
                  </div>
                  <span className={`tm-role-badge tm-role--${u.workspaceRole || 'producer'}`}>
                    {ROLE_LABELS[u.workspaceRole] || 'Producer'}
                  </span>
                  {onBindUser && (
                    <button
                      className="btn-action"
                      style={{ fontSize: '0.72rem', padding: '4px 10px' }}
                      onClick={() => onBindUser(u.id, artistId)}
                    >
                      Bind to this workspace
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  Tab: Invite (unchanged)
// ────────────────────────────────────────────────────────────────────────────
function TabInvite({ artistId = null }) {
  const [link,        setLink]        = useState('');
  const [expires,     setExpires]     = useState('');
  const [generating,  setGenerating]  = useState(false);
  const [genError,    setGenError]    = useState('');
  const [copied,      setCopied]      = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [loadingInv,  setLoadingInv]  = useState(true);
  const [usernameInput, setUsernameInput] = useState('');
  const [sendingReq,    setSendingReq]    = useState(false);
  const [reqMsg,        setReqMsg]        = useState(null);
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
    setGenerating(true); setGenError(''); setLink('');
    try {
      const r = await fetch('/api/invitations/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId }),
      });
      const d = await r.json();
      if (!r.ok) { setGenError(d.error || 'Failed to generate invite link'); return; }
      setLink(d.link); setExpires(d.expiresAt); setCopied(false);
      await load();
    } catch (e) { setGenError(e.message || 'Network error'); }
    finally     { setGenerating(false); }
  };

  const sendJoinRequest = async () => {
    if (!usernameInput.trim()) return;
    setSendingReq(true); setReqMsg(null);
    try {
      const r = await fetch('/api/team/join-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput.trim(), artistId }),
      });
      const d = await r.json();
      if (!r.ok) { setReqMsg({ type: 'error', text: d.error || 'Failed' }); }
      else { setReqMsg({ type: 'ok', text: `Request sent to "${usernameInput.trim()}"` }); setUsernameInput(''); await load(); }
    } catch (e) { setReqMsg({ type: 'error', text: e.message || 'Network error' }); }
    finally { setSendingReq(false); setTimeout(() => setReqMsg(null), 4000); }
  };

  const cancelJoinRequest = async (id) => {
    await fetch(`/api/team/join-request/${id}`, { method: 'DELETE' });
    setJoinRequests(prev => prev.filter(r => r.id !== id));
  };

  const copy = () => {
    navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  };

  const revoke = async (token) => {
    await fetch(`/api/invitations/${token}`, { method: 'DELETE' });
    setInvitations(prev => prev.filter(i => i.token !== token));
    if (link.includes(token)) { setLink(''); setExpires(''); }
  };

  return (
    <div className="team-section">
      <h3 className="team-section-title">Add by Username</h3>
      <p className="team-section-desc">Send a join request to an existing user.</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input className="team-invite-input" value={usernameInput}
          onChange={e => setUsernameInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendJoinRequest()}
          placeholder="Username…" style={{ maxWidth: 240 }} />
        <button className="btn-primary" onClick={sendJoinRequest} disabled={sendingReq || !usernameInput.trim()}>
          {sendingReq ? 'Sending…' : 'Send Request'}
        </button>
      </div>
      {reqMsg && (
        <p style={{ fontSize: 13, color: reqMsg.type === 'ok' ? 'var(--accent)' : 'var(--clay)', marginBottom: 8 }}>
          {reqMsg.text}
        </p>
      )}
      {joinRequests.filter(r => r.status === 'pending').length > 0 && (
        <div style={{ marginTop: 8, marginBottom: 20 }}>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>Pending requests:</p>
          {joinRequests.filter(r => r.status === 'pending').map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 13 }}>{r.toUsername}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtDate(r.createdAt)}</span>
              <button className="btn-action btn-action--danger" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => cancelJoinRequest(r.id)}>Cancel</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0' }} />

      <h3 className="team-section-title">Generate Invite Link</h3>
      <p className="team-section-desc">One-time link, valid 48 h. They set their own username and password.</p>

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
          <div className="team-qr-wrap">
            <img className="team-qr-img"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(link)}`}
              alt="QR code" loading="lazy" />
            <div className="team-qr-meta">
              <p className="team-qr-label">Scan to join</p>
              <p className="team-qr-exp">Expires: {fmtDate(expires)}</p>
              <a className="btn-ghost"
                href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=16&data=${encodeURIComponent(link)}`}
                download="invite-qr.png" target="_blank" rel="noreferrer">Download QR</a>
            </div>
          </div>
        </div>
      )}

      {!loadingInv && invitations.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 className="team-section-title">All Invitations</h3>
          <div className="team-table-wrap">
            <table className="team-table">
              <thead><tr><th>Status</th><th>Created</th><th>Expires</th><th>Used by</th><th></th></tr></thead>
              <tbody>
                {invitations.map(inv => (
                  <tr key={inv.token} className={isExpired(inv.expiresAt) ? 'row-muted' : ''}>
                    <td>
                      {inv.usedBy ? <span className="badge-used">Used</span>
                        : isExpired(inv.expiresAt) ? <span className="badge-expired">Expired</span>
                        : <span className="badge-active">Active</span>}
                    </td>
                    <td>{fmtDate(inv.createdAt)}</td>
                    <td>{fmtDate(inv.expiresAt)}</td>
                    <td>{inv.usedByUsername || '—'}</td>
                    <td>{!inv.usedBy && <button className="btn-action btn-action--danger" onClick={() => revoke(inv.token)}>Revoke</button>}</td>
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
//  Tab: Activity (unchanged)
// ────────────────────────────────────────────────────────────────────────────
function TabActivity({ activityLog, loading }) {
  const relevant = activityLog.filter(e => e.action !== 'login');
  return (
    <div className="team-section">
      <h3 className="team-section-title">Team Activity</h3>
      <p className="team-section-desc">Content interactions from team members — logins not shown.</p>
      {loading ? (
        <p className="team-empty">Loading…</p>
      ) : relevant.length === 0 ? (
        <p className="team-empty">No content interactions recorded yet.</p>
      ) : (
        <div className="team-activity-list">
          {relevant.map((entry, i) => (
            <div key={i} className="team-activity-row">
              <span className="team-activity-icon">·</span>
              <div className="team-activity-body">
                <span className="team-activity-user">{entry.username}</span>
                <span className="team-activity-action">{entry.detail || entry.action}</span>
              </div>
              <span className="team-activity-time" title={fmtDate(entry.timestamp)}>
                {fmtRelative(entry.timestamp)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  Backliner profile modal (unchanged)
// ────────────────────────────────────────────────────────────────────────────
function BacklinerShowAccordion({ show, onUpdateShow }) {
  const [open, setOpen] = useState(false);
  const [tab,  setTab]  = useState('checklist');
  return (
    <div className="bkp-show-accordion">
      <button className="bkp-show-accordion-header" onClick={() => setOpen(o => !o)}>
        <span className="bkp-show-accordion-name" dir="auto">{show.name}</span>
        {show.date && <span className="bkp-show-accordion-date">{fmtShowDate(show.date)}</span>}
        {show.eventType && <span className="bkp-show-accordion-type" dir="auto">{show.eventType}</span>}
        <span className="bkp-show-accordion-caret">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="bkp-show-accordion-body">
          <div className="bkp-show-tabs">
            {['checklist','setlist','files'].map(t => (
              <button key={t} className={`bk-inline-tab-btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
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

function BacklinerProfileModal({ user, shows, onUpdateShow, onSaveUser, onClose }) {
  const [assignedIds, setAssignedIds] = useState(user.assignedShowIds || []);
  const [saving, setSaving] = useState(false);
  const { show: saved, flash } = useSavedPill();

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = [...shows]
    .filter(s => !s.invoice && !s.archived && (!s.date || s.date >= today))
    .sort((a, b) => (a.date || '') > (b.date || '') ? 1 : -1);
  const assignedShows = shows.filter(s => assignedIds.includes(s.id))
    .sort((a, b) => (a.date || '') > (b.date || '') ? 1 : -1);

  const toggle = (id) => setAssignedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const save = async () => {
    setSaving(true);
    await onSaveUser(user.id, { assignedShowIds: assignedIds });
    flash();
    setSaving(false);
  };

  return (
    <div className="modal-overlay confirm-overlay bkp-overlay" onClick={onClose}>
      <div className="bkp-modal" onClick={e => e.stopPropagation()}>
        <div className="bkp-header">
          <div className="bkp-header-info">
            <h3 className="bkp-name">{user.username}</h3>
            <span className="bkp-role-tag">Backliner</span>
            {user.email && <span className="bkp-email">{user.email}</span>}
          </div>
          <button className="bkp-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="bkp-section">
          <h4 className="bkp-section-title">Assign to Shows</h4>
          {upcoming.length === 0 ? (
            <p className="bkp-empty">No upcoming shows to assign.</p>
          ) : (
            <div className="bkp-assign-list">
              {upcoming.map(s => (
                <label key={s.id} className="bkp-assign-row">
                  <input type="checkbox" className="bkp-assign-check" checked={assignedIds.includes(s.id)} onChange={() => toggle(s.id)} />
                  <span className="bkp-assign-name" dir="auto">{s.name}</span>
                  {s.date && <span className="bkp-assign-date">{fmtShowDate(s.date)}</span>}
                  {s.eventType && <span className="bkp-assign-type" dir="auto">{s.eventType}</span>}
                </label>
              ))}
            </div>
          )}
          <div className="bkp-save-row">
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Assignments'}</button>
            <SavedPill show={saved} />
          </div>
        </div>
        {assignedShows.length > 0 && (
          <div className="bkp-section">
            <h4 className="bkp-section-title">Backline Setup</h4>
            {assignedShows.map(show => <BacklinerShowAccordion key={show.id} show={show} onUpdateShow={onUpdateShow} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  Main TeamPanel
// ────────────────────────────────────────────────────────────────────────────
function TeamPanel({ artists, shows = [], tasks = [], onUpdateShow, artistId = null }) {
  const [tab,              setTab]              = useState('members');
  const [users,            setUsers]            = useState([]);
  const [unboundUsers,     setUnboundUsers]     = useState([]);
  const [userArtistAccess, setUserArtistAccess] = useState({});
  const [userPermissions,  setUserPermissions]  = useState({});
  const [activityLog,      setActivityLog]      = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [selectedBackliner, setSelectedBackliner] = useState(null);

  const qs = artistId ? `?artistId=${encodeURIComponent(artistId)}` : '';

  const reload = useCallback(async () => {
    setLoading(true);
    const fetches = [
      fetch(`/api/users${qs}`).then(r => r.ok ? r.json() : []),
      fetch('/api/admin/settings').then(r => r.ok ? r.json() : null),
      fetch('/api/team/activity').then(r => r.ok ? r.json() : []),
    ];
    if (artistId) fetches.push(fetch('/api/users?unbound=1').then(r => r.ok ? r.json() : []));
    const [ur, sr, ar, unbound] = await Promise.all(fetches);
    setUsers(ur);
    setUnboundUsers(artistId ? (unbound || []) : []);
    if (sr) {
      setUserArtistAccess(sr.userArtistAccess || {});
      setUserPermissions(sr.userPermissions || {});
    }
    setActivityLog(ar);
    setLoading(false);
  }, [qs]);

  useEffect(() => { reload(); }, [reload]);

  const deleteUser = async (user) => {
    if (!window.confirm(`Remove ${user.username} from the team?`)) return;
    const r = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
    if (r.ok) setUsers(prev => prev.filter(u => u.id !== user.id));
  };

  const editEmail = async (userId, email) => {
    const r = await fetch(`/api/users/${userId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (r.ok) {
      const updated = await r.json();
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, email: updated.user.email } : u));
    }
  };

  const saveUserData = async (userId, data) => {
    const r = await fetch(`/api/users/${userId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (r.ok) {
      const updated = await r.json();
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...data, ...(updated.user || {}) } : u));
    }
  };

  const saveAccess = (access, perms) => {
    setUserArtistAccess(access);
    if (perms) setUserPermissions(perms);
  };

  const savePerms = (perms) => { setUserPermissions(perms); };

  const bindUserToWorkspace = async (userId, targetArtistId) => {
    const r = await fetch(`/api/users/${userId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artistId: targetArtistId }),
    });
    if (r.ok) {
      const { user: updated } = await r.json();
      if (updated.artistId === targetArtistId) {
        // Move from unbound list into the bound list
        const wasUnbound = unboundUsers.find(u => u.id === userId);
        if (wasUnbound) {
          setUnboundUsers(prev => prev.filter(u => u.id !== userId));
          setUsers(prev => [...prev, { ...wasUnbound, artistId: updated.artistId }]);
        } else {
          setUsers(prev => prev.map(u => u.id === userId ? { ...u, artistId: updated.artistId } : u));
        }
      }
    }
  };

  // ── Role counters for stats bar
  const count = (role) => users.filter(u => u.workspaceRole === role).length;

  const TABS = [
    { key: 'members',  label: 'Members',  badge: users.length },
    { key: 'invite',   label: 'Invite',   badge: 0 },
    { key: 'activity', label: 'Activity', badge: activityLog.filter(e => e.action !== 'login').length },
  ];

  return (
    <div className="team-page">
      <PageBar
        title="Teams"
        count={users.length}
        countLabel="members"
        metrics={[
          { value: users.length,       label: 'Total' },
          { value: count('backliner'), label: 'Backline' },
          { value: count('sound'),     label: 'Sound' },
          { value: count('light'),     label: 'Lighting' },
        ]}
      >
        <SegmentedControl
          items={TABS.map(({ key, label, badge }) => ({ id: key, label, count: badge > 0 ? badge : undefined }))}
          activeId={tab}
          onChange={setTab}
          className="team-seg"
        />
      </PageBar>

      {loading ? (
        <div className="team-loading">Loading…</div>
      ) : (
        <>
          {tab === 'members' && (
            <TabMembers
              users={users}
              unboundUsers={unboundUsers}
              artists={artists}
              shows={shows}
              tasks={tasks}
              activityLog={activityLog}
              userArtistAccess={userArtistAccess}
              userPermissions={userPermissions}
              onDeleteUser={deleteUser}
              onEditEmail={editEmail}
              onSaveAccess={saveAccess}
              onSavePerms={savePerms}
              onUpdateShow={onUpdateShow}
              artistId={artistId}
              onBindUser={bindUserToWorkspace}
            />
          )}
          {tab === 'invite'   && <TabInvite artistId={artistId} />}
          {tab === 'activity' && <TabActivity activityLog={activityLog} loading={loading} />}
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
