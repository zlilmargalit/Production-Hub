import { useState, useMemo, useRef, useEffect } from 'react';
import ShowCard from './ShowCard';
import PageBar  from './ui/PageBar';

// ── Filter dropdown (month + type) ── Change 3: chips + footer ───────────────
function FilterDropdown({ monthOptions, typeOptions, filterMonth, filterType, onChangeMonth, onChangeType }) {
  const [open,        setOpen]        = useState(false);
  // Staged (uncommitted) state — committed on Apply
  const [stagedMonth, setStagedMonth] = useState(filterMonth);
  const [stagedType,  setStagedType]  = useState(filterType);
  const ref = useRef(null);

  // Keep staged in sync when dropdown opens
  useEffect(() => {
    if (open) { setStagedMonth(filterMonth); setStagedType(filterType); }
  }, [open, filterMonth, filterType]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const activeCount = (filterMonth ? 1 : 0) + (filterType ? 1 : 0);

  const apply = () => {
    onChangeMonth(stagedMonth);
    onChangeType(stagedType);
    setOpen(false);
  };

  const clear = () => {
    setStagedMonth('');
    setStagedType('');
    onChangeMonth('');
    onChangeType('');
    setOpen(false);
  };

  const monthLabel = filterMonth
    ? (monthOptions.find(o => o.value === filterMonth)?.label || filterMonth)
    : null;
  const typeLabel = filterType || null;
  const summaryParts = [monthLabel, typeLabel].filter(Boolean);

  return (
    <div className="filter-drop" ref={ref}>
      <button
        className={`filter-drop-btn${activeCount > 0 ? ' active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <svg className="filter-drop-icon" width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <path d="M1 2h11M3 6.5h7M5 11h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
        Filter
        {activeCount > 0 && <span className="filter-drop-badge">{activeCount}</span>}
        <span className="filter-drop-caret" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="filter-drop-panel">
          {monthOptions.length > 1 && (
            <div className="filter-drop-section">
              <div className="filter-drop-section-head">
                <span className="filter-drop-label">Month</span>
                {stagedMonth && (
                  <button className="filter-drop-section-clear" onClick={() => setStagedMonth('')}>
                    Clear
                  </button>
                )}
              </div>
              {/* Change 3: wrapping chips instead of vertical stack */}
              <div className="filter-drop-chips filter-drop-chips--wrap">
                <button
                  className={`filter-drop-chip${!stagedMonth ? ' active' : ''}`}
                  onClick={() => setStagedMonth('')}
                >All</button>
                {monthOptions.map((o) => (
                  <button
                    key={o.value}
                    className={`filter-drop-chip${stagedMonth === o.value ? ' active' : ''}`}
                    onClick={() => setStagedMonth(o.value)}
                  >{o.label}</button>
                ))}
              </div>
            </div>
          )}
          {typeOptions.length > 1 && (
            <div className="filter-drop-section">
              <div className="filter-drop-section-head">
                <span className="filter-drop-label">Type</span>
                {stagedType && (
                  <button className="filter-drop-section-clear" onClick={() => setStagedType('')}>
                    Clear
                  </button>
                )}
              </div>
              <div className="filter-drop-chips filter-drop-chips--wrap">
                <button
                  className={`filter-drop-chip${!stagedType ? ' active' : ''}`}
                  onClick={() => setStagedType('')}
                >All</button>
                {typeOptions.map((t) => (
                  <button
                    key={t}
                    dir="auto"
                    className={`filter-drop-chip${stagedType === t ? ' active' : ''}`}
                    onClick={() => setStagedType(t)}
                  >{t}</button>
                ))}
              </div>
            </div>
          )}
          {/* Footer: summary + Apply */}
          <div className="filter-drop-footer filter-drop-footer--bar">
            <span className="filter-drop-summary">
              {summaryParts.length > 0
                ? `Showing ${summaryParts.join(' · ')}`
                : 'All shows'}
            </span>
            <div className="filter-drop-footer-actions">
              {(stagedMonth || stagedType) && (
                <button className="filter-drop-clear" onClick={clear}>
                  Clear
                </button>
              )}
              <button className="filter-drop-apply" onClick={apply}>
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShowList({ shows, crew, fieldTemplates, onEdit, onDelete, onUpdateShow, artistId, onNew, workspaceRole,
                    onSync, syncStatus, onApplyCrew, applyStatus }) {
  const [filter,      setFilter]      = useState('upcoming');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterType,  setFilterType]  = useState('');

  const today = new Date();
  const now = today.toISOString().slice(0, 10);
  const isArchived = (s) => s.archived;

  // Count shows whose date falls in the current calendar month
  const thisMonthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const thisMonthCount  = shows.filter((s) => s.date && s.date.startsWith(thisMonthPrefix)).length;
  const monthName = today.toLocaleDateString('en-US', { month: 'long' });

  // Derive month and type options from all shows (used for filter dropdowns)
  const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const monthOptions = useMemo(() => {
    const seen = new Set();
    const opts = [];
    shows.forEach((s) => {
      if (!s.date) return;
      const prefix = s.date.slice(0, 7); // 'YYYY-MM'
      if (!seen.has(prefix)) {
        seen.add(prefix);
        const [, m] = prefix.split('-');
        const label = SHORT_MONTHS[Number(m) - 1] || prefix;
        opts.push({ value: prefix, label });
      }
    });
    return opts.sort((a, b) => a.value.localeCompare(b.value));
  }, [shows]);

  const typeOptions = useMemo(() => {
    const seen = new Set();
    shows.forEach((s) => { if (s.eventType) seen.add(s.eventType); });
    return [...seen].sort();
  }, [shows]);

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

  // Apply month + type secondary filters on top of the tab filter
  const visible = sorted.filter((s) => {
    if (filterMonth && !(s.date && s.date.startsWith(filterMonth))) return false;
    if (filterType  && s.eventType !== filterType) return false;
    return true;
  });

  const counts = {
    upcoming: shows.filter((s) => !isArchived(s) && (!s.date || s.date >= now)).length,
    past: shows.filter((s) => !isArchived(s) && s.date && s.date < now).length,
    archived: shows.filter((s) => isArchived(s)).length,
    all: shows.length,
  };

  return (
    <div>
      <PageBar
        title="Shows"
        count={thisMonthCount}
        countLabel={`in ${monthName}`}
        headerAction={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {onSync && (
              <button
                className="btn-sync"
                onClick={onSync}
                disabled={syncStatus === 'loading'}
                title="Sync new shows from Excel spreadsheet"
              >
                {syncStatus === 'loading' ? 'Syncing…'
                  : syncStatus?.error ? 'Error'
                  : syncStatus?.added != null ? `+${syncStatus.added} added`
                  : 'Sync'}
              </button>
            )}
            {onApplyCrew && (
              <button
                className="btn-sync"
                onClick={onApplyCrew}
                disabled={applyStatus === 'loading'}
                title="Auto-assign crew to active shows based on event type templates"
              >
                {applyStatus === 'loading' ? 'Applying…'
                  : applyStatus?.error ? 'Error'
                  : applyStatus?.updated != null ? `${applyStatus.updated} updated`
                  : 'Apply Crew'}
              </button>
            )}
            {onNew && (
              <button className="btn-primary" onClick={onNew}>+ New</button>
            )}
          </div>
        }
      />

      <div className="filter-bar-row">
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
              onClick={() => { setFilter(key); setFilterMonth(''); setFilterType(''); }}
            >
              {label}
              <span className="filter-count">{counts[key]}</span>
            </button>
          ))}
        </div>

        {(monthOptions.length > 1 || typeOptions.length > 1) && (
          <FilterDropdown
            monthOptions={monthOptions}
            typeOptions={typeOptions}
            filterMonth={filterMonth}
            filterType={filterType}
            onChangeMonth={setFilterMonth}
            onChangeType={setFilterType}
          />
        )}
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon" aria-hidden="true" />
          <p>No shows in this view</p>
          <p className="empty-sub">
            {filter === 'upcoming' && !filterMonth && !filterType
              ? 'Click "+ New" to add one'
              : 'Try a different filter'}
          </p>
        </div>
      ) : (
        <div className="shows-grid">
          {visible.map((show) => (
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
