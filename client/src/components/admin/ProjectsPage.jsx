import { useState, useMemo } from 'react';
import PageBar from '../ui/PageBar';
import {
  ils, fmtDate, dateRange, todayStr, ballInCourt, projectAlert, firstWorkDay,
} from './adminFormat';

// Projects list — the structural sibling of Shows: same page header cluster,
// same tab bar, same two-column card grid.
//
// UI chrome is English. Only user-entered content (project, client, brand) is
// Hebrew and carries dir="rtl" via `.he`.

const TYPE_LABEL = {
  advertising: 'Advertising', film: 'Film', talent: 'Talent', other: 'Other',
};

// Top bar colour is the PROJECT TYPE, never the status — status is carried by
// the ball-in-court line instead.
const TYPE_COLOR = {
  advertising: '#3852B4', film: '#7A4E8C', talent: '#C26C1F', other: '#4E7265',
};

function ProjectCard({ project, onOpen }) {
  const status = ballInCourt(project);
  const alert  = projectAlert(project);
  const days   = (project.workDays || []).length;
  const isPaid = project.status === 'paid';

  const secondary = [project.clientNameSnapshot, project.brand,
    days ? `${days} work day${days === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ');

  return (
    <div
      className={`adm-card${isPaid ? ' adm-card--settled' : ''}`}
      onClick={() => onOpen?.(project)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen?.(project)}
    >
      <div className="adm-card-bar" style={{ background: TYPE_COLOR[project.projectType] || TYPE_COLOR.other }} />
      <div className="adm-card-body">
        <div className="adm-card-top">
          <span className="adm-card-type">{TYPE_LABEL[project.projectType] || 'Other'}</span>
          <span className="adm-card-date n">{dateRange(project)}</span>
        </div>

        <h3 className="adm-card-name he">{project.name}</h3>
        {secondary && <p className="adm-card-sub he">{secondary}</p>}

        {alert && (
          <p className={`adm-line adm-line--${alert.level}`}>{alert.text}</p>
        )}
      </div>

      <div className="adm-card-foot">
        <span className={`adm-ball adm-ball--${status.marker}`} />
        <span className="adm-ball-label">{status.label}</span>
        <span className="adm-ball-caption">{status.caption}</span>
      </div>
    </div>
  );
}

export default function ProjectsPage({
  projects = [], loading = false, onOpen, onNew, onAddClient, hasClients = true,
}) {
  const [tab, setTab] = useState('upcoming');
  const today = todayStr();

  const groups = useMemo(() => {
    const upcoming = [], past = [], archived = [];
    for (const p of projects) {
      if (p.archived) { archived.push(p); continue; }
      const first = firstWorkDay(p);
      // No work days yet means it is still ahead of us, not history.
      if (!first || first >= today) upcoming.push(p); else past.push(p);
    }
    return { upcoming, past, archived, all: projects };
  }, [projects, today]);

  // Whoever has to act comes first, then by date — not date alone.
  const visible = useMemo(() => {
    const list = [...(groups[tab] || [])];
    return list.sort((a, b) => {
      const rank = (p) => (p.ballInCourt === 'me' ? 0 : p.ballInCourt === 'them' ? 1 : 2);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return (firstWorkDay(a) || '9999') < (firstWorkDay(b) || '9999') ? -1 : 1;
    });
  }, [groups, tab]);

  const stats = useMemo(() => ({
    needsMe: projects.filter((p) => p.ballInCourt === 'me').length,
    active:  projects.filter((p) => !p.archived && p.status !== 'paid').length,
    overdue: projects.filter((p) => projectAlert(p)?.level === 'alarm').length,
  }), [projects]);

  const pad = (n) => String(n).padStart(2, '0');
  const isEmpty = !loading && projects.length === 0;

  return (
    <div className="adm-page">
      <PageBar
        title="Projects"
        count={projects.length}
        countLabel="PROJECTS"
        actions={onNew ? <button className="btn-primary" onClick={onNew}>+ New Project</button> : null}
      />

      {/* Counters render as skeletons while loading — never as real-looking
          figures that would be wrong for a moment. */}
      <div className="adm-stats">
        <div className="adm-stat adm-stat--tinted">
          <span className="adm-stat-num n">{loading ? <i className="adm-skel adm-skel--num" /> : pad(stats.needsMe)}</span>
          <span className="adm-stat-label">NEEDS ME</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-num n">{loading ? <i className="adm-skel adm-skel--num" /> : pad(stats.active)}</span>
          <span className="adm-stat-label">ACTIVE</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-num n">{loading ? <i className="adm-skel adm-skel--num" /> : pad(stats.overdue)}</span>
          <span className="adm-stat-label">OVERDUE</span>
        </div>
      </div>

      {!isEmpty && (
        <div className="adm-tabs">
          {[['upcoming', 'UPCOMING'], ['past', 'PAST'], ['archived', 'ARCHIVED'], ['all', 'ALL']].map(([key, label]) => (
            <button
              key={key}
              className={`adm-tab${tab === key ? ' adm-tab--active' : ''}`}
              onClick={() => setTab(key)}
            >
              {label}
              {!loading && groups[key].length > 0 && (
                <span className="adm-tab-count n">{groups[key].length}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        // Skeletons at the real card height and count so nothing reflows.
        <div className="adm-grid">
          {[0, 1, 2, 3].map((i) => <div key={i} className="adm-card adm-card--skeleton" />)}
        </div>
      ) : isEmpty ? (
        // Clients before projects: a project needs a client.
        <div className="adm-empty">
          <p>Add a client first, then create a project for them.</p>
          <div className="adm-empty-actions">
            <button className="btn-primary" onClick={onAddClient}>+ Add client</button>
            <button className="btn-ghost" onClick={onNew} disabled={!hasClients}>+ New project</button>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <p className="adm-none">No projects here.</p>
      ) : (
        <div className="adm-grid">
          {visible.map((p) => <ProjectCard key={p.id} project={p} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
}
