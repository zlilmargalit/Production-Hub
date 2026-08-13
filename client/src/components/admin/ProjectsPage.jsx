import { useState, useMemo } from 'react';
import PageBar from '../ui/PageBar';
import ProjectCard from './ProjectCard';
import {
  ils, fmtDate, dateRange, todayStr, ballInCourt, projectAlert, firstWorkDay,
} from './adminFormat';
import { useT } from '../../i18n';

// Projects list — the structural sibling of Shows: same page header cluster,
// same tab bar, same two-column card grid.
//
// UI chrome follows the selected interface language. User-entered content
// (project, client, brand) is never translated and carries dir="auto" —
// direction follows the value, not the app.

export default function ProjectsPage({
  projects = [], assistants = [], busy = false, loading = false,
  onNew, onEdit, onAddClient, makeHandlers, hasClients = true,
}) {
  const { t } = useT();
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

  const isEmpty = !loading && projects.length === 0;

  return (
    <div className="adm-page">
      {/* headerAction, not actions: this puts the button on the title row, which
          is where the Shows screen puts Sync / Apply Crew / + New. `actions`
          renders a second row below the divider, and that extra row — plus the
          counters that used to sit under it — is what pushed the first card so
          far down the page. */}
      <PageBar
        title={t('projects.title')}
        count={projects.length}
        countLabel={t('projects.count')}
        headerAction={onNew ? <button className="btn-primary" onClick={onNew}>{t('projects.new')}</button> : null}
      />

      {!isEmpty && (
        <div className="adm-tabs">
          {['upcoming', 'past', 'archived', 'all'].map((key) => (
            <button
              key={key}
              className={`adm-tab${tab === key ? ' adm-tab--active' : ''}`}
              onClick={() => setTab(key)}
            >
              {t(`projects.tab.${key}`)}
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
          <p>{t('projects.empty.setup')}</p>
          <div className="adm-empty-actions">
            <button className="btn-primary" onClick={onAddClient}>{t('projects.addClient')}</button>
            <button className="btn-ghost" onClick={onNew} disabled={!hasClients}>{t('projects.new')}</button>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <p className="adm-none">{t('projects.empty.filter')}</p>
      ) : (
        <div className="adm-grid">
          {visible.map((p) => (
            <ProjectCard
              key={p.id} project={p} assistants={assistants} busy={busy}
              onEdit={onEdit} handlers={makeHandlers(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
