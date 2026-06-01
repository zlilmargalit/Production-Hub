import { useState, useEffect } from 'react';

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

// ── Compact read-only show row ─────────────────────────────────────────────
function TeamShowRow({ show, visibleRubrics }) {
  const [open, setOpen] = useState(false);

  const hasDetail = visibleRubrics.some((r) => {
    const val = show[r];
    if (!val) return false;
    if (typeof val === 'string') return val.trim().length > 0;
    if (typeof val === 'object') return Object.keys(val).length > 0;
    return true;
  });

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
            const val = show[r];
            if (!val) return null;
            const text = typeof val === 'string' ? val : typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
            if (!text.trim()) return null;
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

// ── Main Teams page ───────────────────────────────────────────────────────
function TeamsPage() {
  const [teams,   setTeams]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    fetch('/api/teams')
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data) => { setTeams(data); setLoading(false); })
      .catch(() => { setError('Could not load teams data.'); setLoading(false); });
  }, []);

  return (
    <div>
      <div className="page-header-edit">
        <div className="page-header-left">
          <h1 className="page-title">Teams<span className="page-title-dot">.</span></h1>
          <p className="page-subtitle">
            <span className="page-subtitle-num">{String(teams.length).padStart(2, '0')}</span>
            <span className="page-subtitle-line" />
            <span>groups</span>
          </p>
        </div>
        <div className="page-marquee" aria-hidden="true">
          <span className="page-marquee-track">
            <span>Teams</span><span>·</span><span>Teams</span><span>·</span>
            <span>Teams</span><span>·</span><span>Teams</span><span>·</span>
          </span>
        </div>
      </div>

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
