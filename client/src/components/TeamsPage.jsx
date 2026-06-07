import { useState, useEffect } from 'react';
import PageBar from './ui/PageBar';

const RUBRIC_LABELS = {
  schedule:  'Schedule',
  logistics: 'Logistics',
  technical: 'Technical',
  notes:     'Notes',
  budget:    'Budget',
};

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

// Maps rubric names to the actual show field names that store their data.
// Rubric names like 'logistics' and 'technical' don't correspond to a single
// show field — they're grouping concepts covering multiple sub-fields.
const RUBRIC_FIELDS = {
  schedule:  ['schedule'],
  logistics: ['transportation', 'parking', 'food', 'contacts'],
  technical: ['lightingCoordinated', 'soundCoordinated', 'rentalNeeds', 'rentalSupplier'],
  notes:     ['notes'],
  budget:    ['budget'],
};

function rubricText(show, rubric) {
  const fields = RUBRIC_FIELDS[rubric] || [rubric];
  const parts = fields
    .map((f) => {
      const v = show[f];
      if (v == null || v === '') return null;
      if (typeof v === 'string') return v.trim() || null;
      if (typeof v === 'object') {
        const s = Object.values(v).filter(Boolean).join(' · ');
        return s || null;
      }
      return String(v);
    })
    .filter(Boolean);
  return parts.join(' | ');
}

// ── Compact read-only show row ─────────────────────────────────────────────
function TeamShowRow({ show, visibleRubrics }) {
  const [open, setOpen] = useState(false);

  const hasDetail = visibleRubrics.some((r) => rubricText(show, r).length > 0);

  return (
    <div className="tsp-show-row">
      <div
        className={`tsp-show-header${hasDetail ? ' clickable' : ''}`}
        onClick={hasDetail ? () => setOpen((o) => !o) : undefined}
      >
        <div className="tsp-show-main">
          <span className="tsp-show-name" dir="auto">{show.name}</span>
          {show.date && <span className="tsp-show-date">{fmtDate(show.date)}</span>}
          {show.eventType && <span className="tsp-show-type" dir="auto">{show.eventType}</span>}
          {show.location && <span className="tsp-show-loc" dir="auto">{show.location}</span>}
        </div>
        {hasDetail && (
          <span className="tsp-show-caret" aria-hidden="true">{open ? '−' : '+'}</span>
        )}
      </div>

      {open && hasDetail && (
        <div className="tsp-show-detail">
          {visibleRubrics.map((r) => {
            const text = rubricText(show, r);
            if (!text) return null;
            return (
              <div key={r} className="tsp-rubric-block">
                <span className="tsp-rubric-label">{RUBRIC_LABELS[r] || r}</span>
                <p className="tsp-rubric-text" dir="auto">{text}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Artist section within a team ──────────────────────────────────────────
function TeamArtistSection({ artistName, visibleRubrics, shows, role }) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = [...shows]
    .filter((s) => !s.invoice && !s.archived && (!s.date || s.date >= today))
    .sort((a, b) => (a.date || '') > (b.date || '') ? 1 : -1);
  const past = [...shows]
    .filter((s) => !s.invoice && !s.archived && s.date && s.date < today)
    .sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1);

  return (
    <div className="tsp-artist-section">
      <div className="tsp-artist-header">
        <h3 className="tsp-artist-name" dir="auto">{artistName}</h3>
        {role && <span className={`tsp-role-badge tsp-role-badge--${role}`}>{role}</span>}
      </div>
      {visibleRubrics.length > 0 && (
        <div className="tsp-rubric-badges">
          {visibleRubrics.map((r) => (
            <span key={r} className="tsp-rubric-badge">{RUBRIC_LABELS[r] || r}</span>
          ))}
        </div>
      )}

      {upcoming.length === 0 && past.length === 0 ? (
        <p className="tsp-empty">No shows shared yet.</p>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="tsp-show-group">
              <span className="tsp-show-group-label">Upcoming</span>
              {upcoming.map((s) => (
                <TeamShowRow key={s.id} show={s} visibleRubrics={visibleRubrics} />
              ))}
            </div>
          )}
          {past.length > 0 && (
            <div className="tsp-show-group">
              <span className="tsp-show-group-label">Past</span>
              {past.slice(0, 5).map((s) => (
                <TeamShowRow key={s.id} show={s} visibleRubrics={visibleRubrics} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Pending join requests banner ──────────────────────────────────────────
function PendingInvitations({ onAccepted }) {
  const [requests, setRequests] = useState([]);
  const [busy,     setBusy]     = useState({});

  useEffect(() => {
    fetch('/api/me/join-requests')
      .then((r) => r.ok ? r.json() : [])
      .then(setRequests)
      .catch(() => {});
  }, []);

  const respond = async (id, action) => {
    setBusy((b) => ({ ...b, [id]: true }));
    await fetch(`/api/me/join-requests/${id}/${action}`, { method: 'POST' }).catch(() => {});
    setRequests((prev) => prev.filter((r) => r.id !== id));
    setBusy((b) => ({ ...b, [id]: false }));
    if (action === 'accept') onAccepted();
  };

  if (requests.length === 0) return null;

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 10,
      padding: '16px 20px',
      marginBottom: 28,
    }}>
      <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
        Team invitation{requests.length > 1 ? 's' : ''} waiting
      </p>
      {requests.map((r) => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <p style={{ fontSize: 13, flex: 1 }}>
            <strong>{r.fromUsername || 'Admin'}</strong> invited you to join their team.
          </p>
          <button
            className="btn-primary btn-sm"
            disabled={!!busy[r.id]}
            onClick={() => respond(r.id, 'accept')}
          >
            Accept
          </button>
          <button
            className="btn-secondary btn-sm"
            disabled={!!busy[r.id]}
            onClick={() => respond(r.id, 'decline')}
          >
            Decline
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Main Teams page ───────────────────────────────────────────────────────
function TeamsPage() {
  const [teams,   setTeams]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const loadTeams = () => {
    fetch('/api/teams')
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data) => { setTeams(data); setLoading(false); })
      .catch(() => { setError('Could not load teams data.'); setLoading(false); });
  };

  useEffect(() => { loadTeams(); }, []);

  return (
    <div>
      <PageBar
        title="Teams"
        accentColor="var(--orange)"
        count={teams.length}
        countLabel="groups"
        metrics={[
          { value: teams.length, label: 'Total' },
        ]}
      />

      {/* Pending invitations — shown above everything else */}
      <PendingInvitations onAccepted={loadTeams} />

      {loading ? (
        <div className="team-loading">Loading…</div>
      ) : error ? (
        <p className="tsp-empty">{error}</p>
      ) : teams.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon" aria-hidden="true" />
          <p>You are not in any groups yet.</p>
          <p className="empty-sub">Ask your admin to add you to a group and share content with you.</p>
        </div>
      ) : (
        <div className="tsp-teams-list">
          {teams.map((team) => (
            <div key={team.id} className={`tsp-team-card${team.name ? '' : ' tsp-team-card--direct'}`}>
              {team.name && <h2 className="tsp-team-name" dir="auto">{team.name}</h2>}
              {team.artistsData && team.artistsData.length > 0 ? (
                team.artistsData.map((ad) => (
                  <TeamArtistSection
                    key={ad.artistId}
                    artistName={ad.artistName}
                    role={ad.role || null}
                    visibleRubrics={ad.visibleRubrics || []}
                    shows={ad.shows || []}
                  />
                ))
              ) : (
                <p className="tsp-empty">No artists shared with this group yet.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TeamsPage;
