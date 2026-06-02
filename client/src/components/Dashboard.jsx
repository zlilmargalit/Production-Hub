import { useState, useEffect, useRef, useCallback } from 'react';

// ── Artist colour palette (4 colours, cycling) ────────────────────────────────
const PALETTE = [
  { color: '#3852B4', soft: '#EEF1FB' },
  { color: '#F08D39', soft: '#FEF3E7' },
  { color: '#C79A3F', soft: '#FBF4E3' },
  { color: '#4E7265', soft: '#E8F0ED' },
];

function withColor(artists) {
  return artists.map((a, i) => ({ ...a, ...PALETTE[i % PALETTE.length] }));
}

function toDateStr(d) {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00');
  return isNaN(dt) ? '' : dt.toISOString().split('T')[0];
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function isMissingCrew(show) {
  return !show.crewIds || show.crewIds.length === 0;
}

function isNoInvoice(show) {
  return !show.invoice;
}

// ── Event pill ────────────────────────────────────────────────────────────────
function EventPill({ show, onClick }) {
  const missing = isMissingCrew(show) || isNoInvoice(show);
  const time = show.schedule
    ? show.schedule.split('\n')[0].match(/\d{1,2}:\d{2}/)?.[0] || ''
    : '';
  return (
    <button
      className="ev-pill"
      style={{ '--pill-color': show.color }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={show.name}
    >
      <span className="ev-pill-bar" />
      {time && <span className="ev-pill-time">{time}</span>}
      <span className="ev-pill-name">{show.artistName || show.name}</span>
      {missing && <span className="ev-pill-warn" aria-label="needs attention" />}
    </button>
  );
}

// ── Quick-view popover ────────────────────────────────────────────────────────
function QuickViewPopover({ show, crew, artists, onClose, onOpenShow }) {
  const ref = useRef(null);
  const artist = artists.find((a) => a.id === show.artistId);

  const assigned = (show.crewIds || [])
    .map((id) => crew.find((m) => m.id === id))
    .filter(Boolean);

  const missing  = isMissingCrew(show);
  const noInv    = isNoInvoice(show);

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const dateStr = show.date
    ? new Date(show.date + 'T12:00:00').toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      })
    : '';

  return (
    <div className="qv-backdrop">
      <div className="qv-popover" ref={ref}>
        <button className="qv-close" onClick={onClose} aria-label="Close">✕</button>

        {artist && (
          <div className="qv-artist" style={{ color: artist.color, '--artist-soft': artist.soft }}>
            <span className="qv-artist-dot" />
            {artist.name}
          </div>
        )}

        <h3 className="qv-show-name" dir="auto">{show.name}</h3>
        {dateStr && <p className="qv-date">{dateStr}</p>}

        {(show.venue || show.address) && (
          <div className="qv-section">
            {show.venue  && <p className="qv-venue" dir="auto">{show.venue}</p>}
            {show.address && <p className="qv-address" dir="auto">{show.address}</p>}
          </div>
        )}

        {assigned.length > 0 && (
          <div className="qv-section">
            <p className="qv-section-label">Crew</p>
            {assigned.map((m) => (
              <div key={m.id} className="qv-crew-row">
                <span className="qv-avatar" aria-hidden="true">
                  {(m.name || '?')[0].toUpperCase()}
                </span>
                <span dir="auto">{m.name}</span>
                <span className="qv-role" dir="auto">{m.role}</span>
              </div>
            ))}
          </div>
        )}

        <div className="qv-flags">
          {missing  && <span className="flag flag-danger">Missing crew</span>}
          {noInv    && <span className="flag flag-warn">No invoice</span>}
          {!missing && !noInv && <span className="flag flag-ok">Fully staffed</span>}
        </div>

        <button
          className="qv-open-btn"
          onClick={() => { onOpenShow(show); onClose(); }}
        >
          Open show →
        </button>
      </div>
    </div>
  );
}

// ── Master Calendar ───────────────────────────────────────────────────────────
function MasterCalendar({ allShows, artists, crew, selectedArtists, onOpenShow }) {
  const [month, setMonth]   = useState(() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [popover, setPopover] = useState(null); // { show }

  const today  = todayStr();
  const year   = month.getFullYear();
  const m      = month.getMonth();

  const filtered = selectedArtists.length === 0
    ? allShows
    : allShows.filter((s) => selectedArtists.includes(s.artistId));

  // Build grid cells
  const firstDay = new Date(year, m, 1);
  const lastDay  = new Date(year, m + 1, 0);
  const startPad = firstDay.getDay(); // 0=Sun
  const totalCells = Math.ceil((startPad + lastDay.getDate()) / 7) * 7;

  const cells = Array.from({ length: totalCells }, (_, i) => {
    const dayOffset = i - startPad;
    const date = new Date(year, m, 1 + dayOffset);
    const dateStr = date.toISOString().split('T')[0];
    const isCurrentMonth = date.getMonth() === m;
    const isToday = dateStr === today;
    const shows = filtered
      .filter((s) => toDateStr(s.date) === dateStr && !s.archived)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return { date, dateStr, isCurrentMonth, isToday, shows };
  });

  const monthLabel = month.toLocaleString('default', { month: 'long', year: 'numeric' });

  const prevMonth = () => setMonth(new Date(year, m - 1, 1));
  const nextMonth = () => setMonth(new Date(year, m + 1, 1));
  const goToday   = () => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  return (
    <div className="mcal">
      <div className="mcal-topbar">
        <h2 className="mcal-title">Master Calendar</h2>
        <div className="mcal-nav">
          <button className="mcal-nav-btn" onClick={prevMonth} aria-label="Previous month">‹</button>
          <button className="mcal-month-label" onClick={goToday}>{monthLabel}</button>
          <button className="mcal-nav-btn" onClick={nextMonth} aria-label="Next month">›</button>
        </div>
        <div className="mcal-view-tabs">
          <button className="mcal-view-tab active">Month</button>
          <button className="mcal-view-tab">Week</button>
        </div>
      </div>

      {/* Day headers */}
      <div className="mcal-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="mcal-day-hdr">{d}</div>
        ))}

        {cells.map(({ date, dateStr, isCurrentMonth, isToday, shows }) => (
          <div
            key={dateStr}
            className={[
              'mcal-cell',
              isCurrentMonth ? '' : 'mcal-cell--out',
              isToday ? 'mcal-cell--today' : '',
            ].filter(Boolean).join(' ')}
          >
            <span className="mcal-day-num">{date.getDate()}</span>

            {shows.slice(0, 2).map((show) => (
              <EventPill
                key={show.id}
                show={show}
                onClick={() => setPopover({ show })}
              />
            ))}

            {shows.length > 2 && (
              <span className="mcal-more">+{shows.length - 2} more</span>
            )}
          </div>
        ))}
      </div>

      {popover && (
        <QuickViewPopover
          show={popover.show}
          crew={crew}
          artists={artists}
          onClose={() => setPopover(null)}
          onOpenShow={onOpenShow}
        />
      )}
    </div>
  );
}

// ── Up Next ───────────────────────────────────────────────────────────────────
function UpNext({ allShows, artists, selectedArtists, onOpenShow }) {
  const today = todayStr();
  const rows = allShows
    .filter((s) => !s.archived && toDateStr(s.date) >= today)
    .filter((s) => selectedArtists.length === 0 || selectedArtists.includes(s.artistId))
    .sort((a, b) => toDateStr(a.date).localeCompare(toDateStr(b.date)))
    .slice(0, 7);

  return (
    <div className="upnext">
      <div className="upnext-header">
        <h2 className="upnext-title">Up Next</h2>
        <button className="upnext-more-btn">Next →</button>
      </div>

      {rows.length === 0 && (
        <p className="upnext-empty">No upcoming shows.</p>
      )}

      {rows.map((show) => {
        const artist = artists.find((a) => a.id === show.artistId);
        const date   = new Date(show.date + 'T12:00:00');
        const day    = date.getDate();
        const mon    = date.toLocaleString('default', { month: 'short' });
        const wday   = date.toLocaleString('default', { weekday: 'short' });
        const missing = isMissingCrew(show);
        const noInv   = isNoInvoice(show);

        return (
          <div
            key={show.id}
            className="upnext-row"
            style={{ '--row-color': artist?.color || 'var(--border)' }}
            onClick={() => onOpenShow(show)}
          >
            <div className="upnext-datecol">
              <span className="upnext-day">{day}</span>
              <span className="upnext-mon">{mon}</span>
              <span className="upnext-wday">{wday}</span>
            </div>
            <div className="upnext-colorbar" />
            <div className="upnext-info">
              {artist && (
                <span className="upnext-artist" style={{ color: artist.color }}>
                  {artist.name}
                </span>
              )}
              <span className="upnext-name" dir="auto">{show.name}</span>
              {show.venue && (
                <span className="upnext-venue" dir="auto">{show.venue}</span>
              )}
            </div>
            {(missing || noInv) && (
              <div className="upnext-flags">
                {missing && <span className="flag flag-danger">Missing crew</span>}
                {noInv   && <span className="flag flag-warn">No invoice</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Task Inbox — My Tasks only ────────────────────────────────────────────────
function TaskInbox({ tasks, allShows, artists, onToggleTask }) {
  const today = todayStr();

  const myTasks = [...tasks]
    .filter((t) => !t.completed)
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });

  return (
    <div className="tinbox">
      <h2 className="tinbox-title">Task Inbox</h2>
      <div className="tinbox-col">
        <div className="tinbox-col-hdr">
          <span>My Tasks</span>
          <span className="tinbox-count">{myTasks.length}</span>
        </div>

        {myTasks.length === 0 && (
          <p className="tinbox-empty">All clear.</p>
        )}

        {myTasks.map((task) => {
          const show   = task.showId ? allShows.find((s) => s.id === task.showId) : null;
          const artist = show ? artists.find((a) => a.id === show?.artistId) : null;
          const overdue = task.dueDate && task.dueDate < today;

          return (
            <div key={task.id} className={`tinbox-row ${overdue ? 'tinbox-row--overdue' : ''}`}>
              <input
                type="checkbox"
                className="tinbox-check"
                checked={task.completed}
                onChange={() => onToggleTask(task.id)}
              />
              <div className="tinbox-content">
                <span className="tinbox-text" dir="auto">{task.text}</span>
                <div className="tinbox-meta">
                  {artist && (
                    <span className="tinbox-artist" style={{ color: artist.color }}>
                      {artist.name}
                    </span>
                  )}
                  {show && !artist && (
                    <span className="tinbox-artist">{show.name}</span>
                  )}
                  {task.dueDate && (
                    <span className={`tinbox-due ${overdue ? 'tinbox-due--overdue' : ''}`}>
                      Due {task.dueDate}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ value, label, accent, warn }) {
  return (
    <div className={[
      'dash-stat',
      accent ? 'dash-stat--accent' : '',
      warn   ? 'dash-stat--warn'   : '',
    ].filter(Boolean).join(' ')}>
      <span className="dash-stat-value">{value}</span>
      <span className="dash-stat-label">{label}</span>
    </div>
  );
}

// ── Dashboard (root) ──────────────────────────────────────────────────────────
export default function Dashboard({ artists: rawArtists, tasks, crew, onOpenShow, onToggleTask }) {
  const artists = withColor(rawArtists);
  const [allShows, setAllShows]   = useState([]);
  const [loadingShows, setLoading] = useState(true);
  const [selectedArtists, setSelected] = useState([]); // [] = All

  // Fetch all artists' shows in parallel
  useEffect(() => {
    if (!artists.length) { setAllShows([]); setLoading(false); return; }
    setLoading(true);
    Promise.all(
      artists.map((a) =>
        fetch(`/api/shows?artistId=${encodeURIComponent(a.id)}`, { credentials: 'include' })
          .then((r) => r.ok ? r.json() : [])
          .then((shows) => shows.map((s) => ({
            ...s,
            artistId:   a.id,
            artistName: a.name,
            color:      a.color,
            soft:       a.soft,
          })))
          .catch(() => [])
      )
    ).then((results) => {
      setAllShows(results.flat());
      setLoading(false);
    });
  }, [rawArtists]); // eslint-disable-line react-hooks/exhaustive-deps

  const today  = todayStr();
  const upcoming = allShows.filter((s) => !s.archived && toDateStr(s.date) >= today);
  const needAttn = upcoming.filter((s) => isMissingCrew(s) || isNoInvoice(s));
  const openTasks = tasks.filter((t) => !t.completed);

  const toggleArtist = useCallback((id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  return (
    <div className="dashboard">
      {/* Header row */}
      <div className="dash-head">
        <div>
          <h1 className="dash-today">Today.</h1>
          <p className="dash-sub">
            {new Date().toLocaleDateString('en-GB', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </p>
        </div>
        <span className="dash-context-label">GLOBAL VIEW · AGENCY PRODUCER</span>
      </div>

      {/* Stat cards */}
      <div className="dash-stats">
        <StatCard value={upcoming.length} label="Upcoming Shows" accent />
        <StatCard value={artists.length}  label="Active Artists" />
        <StatCard
          value={needAttn.length}
          label="Need Attention"
          warn={needAttn.length > 0}
        />
        <StatCard value={openTasks.length} label="Open Tasks" />
      </div>

      {/* Artist filter chips — shared by calendar + up-next */}
      <div className="dash-filters">
        <button
          className={`artist-chip ${selectedArtists.length === 0 ? 'artist-chip--active' : ''}`}
          onClick={() => setSelected([])}
        >
          All artists
        </button>
        {artists.map((a) => (
          <button
            key={a.id}
            className={`artist-chip ${selectedArtists.includes(a.id) ? 'artist-chip--active' : ''}`}
            style={{ '--chip-color': a.color, '--chip-soft': a.soft }}
            onClick={() => toggleArtist(a.id)}
          >
            <span className="artist-chip-dot" />
            {a.name}
          </button>
        ))}
      </div>

      {/* Body: calendar + up-next side by side */}
      {loadingShows ? (
        <div className="dash-loading">
          <div className="spinner" />
          <p>Loading shows…</p>
        </div>
      ) : (
        <>
          <div className="dash-body">
            <MasterCalendar
              allShows={allShows}
              artists={artists}
              crew={crew}
              selectedArtists={selectedArtists}
              onOpenShow={onOpenShow}
            />
            <UpNext
              allShows={allShows}
              artists={artists}
              selectedArtists={selectedArtists}
              onOpenShow={onOpenShow}
            />
          </div>

          <TaskInbox
            tasks={tasks}
            allShows={allShows}
            artists={artists}
            onToggleTask={onToggleTask}
          />
        </>
      )}
    </div>
  );
}
