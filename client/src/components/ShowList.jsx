import { useState } from 'react';
import ShowCard from './ShowCard';

function ShowList({ shows, crew, fieldTemplates, onEdit, onDelete, onUpdateShow, artistId, onNew, workspaceRole }) {
  const [filter, setFilter] = useState('upcoming');

  const today = new Date();
  const now = today.toISOString().slice(0, 10);
  const isArchived = (s) => s.invoice || s.archived;

  // Count shows whose date falls in the current calendar month
  const thisMonthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const thisMonthCount  = shows.filter((s) => s.date && s.date.startsWith(thisMonthPrefix)).length;
  const monthName = today.toLocaleDateString('en-US', { month: 'long' });

  const filtered = shows.filter((s) => {
    if (filter === 'upcoming') return !isArchived(s) && (!s.date || s.date >= now);
    if (filter === 'past') return !isArchived(s) && s.date && s.date < now;
    if (filter === 'archived') return isArchived(s);
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (filter === 'past' || filter === 'archived') {
      return (b.date || '') < (a.date || '') ? -1 : 1;
    }
    return (a.date || '') > (b.date || '') ? 1 : -1;
  });

  const counts = {
    upcoming: shows.filter((s) => !isArchived(s) && (!s.date || s.date >= now)).length,
    past: shows.filter((s) => !isArchived(s) && s.date && s.date < now).length,
    archived: shows.filter((s) => isArchived(s)).length,
    all: shows.length,
  };

  return (
    <div>
      {/* Editorial page header */}
      <div className="page-header-edit">
        <div className="page-header-left">
          <h1 className="page-title">Shows<span className="page-title-dot">.</span></h1>
          <div className="page-subtitle-row">
            <p className="page-subtitle">
              <span className="page-subtitle-num">{thisMonthCount.toString().padStart(2, '0')}</span>
              <span className="page-subtitle-line" />
              <span>productions in {monthName}</span>
            </p>
            {onNew && (
              <button className="btn-primary btn-new-mobile" onClick={onNew}>+ New</button>
            )}
          </div>
        </div>
        <div className="page-marquee" aria-hidden="true">
          <span className="page-marquee-track">
            <span>Production Hub</span><span>·</span>
            <span>Production Hub</span><span>·</span>
            <span>Production Hub</span><span>·</span>
            <span>Production Hub</span><span>·</span>
          </span>
        </div>
      </div>

      <div className="filter-bar">
        {[
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'past', label: 'Past' },
          { key: 'archived', label: 'Archived' },
          { key: 'all', label: 'All' },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`filter-btn ${filter === key ? 'active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
            <span className="filter-count">{counts[key]}</span>
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon" aria-hidden="true" />
          <p>No shows in this view</p>
          <p className="empty-sub">
            {filter === 'upcoming' ? 'Click "+ New" to add one' : 'Try a different filter'}
          </p>
        </div>
      ) : (
        <div className="shows-grid">
          {sorted.map((show) => (
            <ShowCard
              key={show.id}
              show={show}
              crew={crew}
              fieldTemplates={fieldTemplates || {}}
              onEdit={onEdit}
              onDelete={onDelete}
              onUpdateShow={onUpdateShow}
              artistId={artistId}
              workspaceRole={workspaceRole}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default ShowList;
