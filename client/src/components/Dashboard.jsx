import { useState, useEffect, useRef, useCallback } from 'react';
import FilterChip from './ui/FilterChip';
import SegmentedControl from './ui/SegmentedControl';

// ── Artist colour palette (stable by index) ────────────────────────────────────
const PALETTE = [
  { color: '#3852B4', soft: '#E8ECF7' },
  { color: '#F08D39', soft: '#FCE3CC' },
  { color: '#C79A3F', soft: '#F6EDD7' },
  { color: '#4E7265', soft: '#E6EDEA' },
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
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Extract first HH:MM from schedule text or loadIn
function getShowTime(show) {
  if (show.schedule) {
    const m = show.schedule.match(/\d{1,2}:\d{2}/);
    if (m) return m[0];
  }
  return show.loadIn || '';
}

// Parse "HH:MM label" lines from schedule field
function parseScheduleLines(text) {
  if (!text) return [];
  return text.split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(\d{1,2}:\d{2})\s+(.+)$/);
      return m ? { time: m[1], label: m[2] } : { time: '', label: l };
    });
}

// ── Event pill ─────────────────────────────────────────────────────────────────
function EventPill({ show, onClick }) {
  const time = getShowTime(show);
  return (
    <button
      className="ev-pill"
      style={{ '--pill-color': show.color, '--pill-soft': show.soft }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={show.name}
    >
      <span className="ev-pill-bar" />
      {time && <span className="ev-pill-time">{time}</span>}
      <span className="ev-pill-name">{show.name}</span>
    </button>
  );
}

// ── Quick-view popover ─────────────────────────────────────────────────────────
function QuickViewPopover({ show, artists, onClose, onOpenShow }) {
  const ref = useRef(null);
  const artist = artists.find((a) => a.id === show.artistId);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const dateStr = show.date
    ? new Date(show.date + 'T12:00:00').toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : '';

  const scheduleLines = parseScheduleLines(show.schedule);
  const artistColor   = artist?.color || 'var(--accent)';

  return (
    <div className="qv-backdrop">
      <div
        className="qv-popover"
        ref={ref}
        style={{ '--qv-color': artistColor, '--qv-soft': artist?.soft || 'var(--accent-soft)' }}
      >
        <div className="qv-top-band" />
        <div className="qv-body">
          <button className="qv-close" onClick={onClose} aria-label="Close">✕</button>

          {artist && (
            <div className="qv-artist" style={{ color: artistColor }}>
              <span className="qv-artist-dot" />
              {artist.name}
            </div>
          )}

          <h3 className="qv-show-name" dir="auto">{show.name}</h3>

          <p className="qv-date">
            {dateStr}{show.loadIn ? ` · Doors ${show.loadIn}` : ''}
          </p>

          {(show.venue || show.address) && (
            <div className="qv-venue-row">
              <span className="qv-venue-label">Venue</span>
              <div className="qv-venue-val">
                {show.venue   && <span dir="auto">{show.venue}</span>}
                {show.address && <span className="qv-venue-addr" dir="auto">{show.address}</span>}
              </div>
            </div>
          )}

          {scheduleLines.length > 0 && (
            <div className="qv-section">
              <p className="qv-section-label">Schedule · לו״ז</p>
              <div className="qv-sched">
                {scheduleLines.map((line, i) => (
                  <div key={i} className="qv-sched-row">
                    {line.time && (
                      <span className="qv-sched-time" style={{ color: artistColor }}>
                        {line.time}
                      </span>
                    )}
                    <span className="qv-sched-label" dir="auto">{line.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="qv-footer">
            <button
              className="qv-open-link"
              onClick={() => { onOpenShow(show); onClose(); }}
            >
              Open show →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Master Calendar ────────────────────────────────────────────────────────────
function sundayOfWeek(d) {
  const day = d.getDay(); // 0=Sun
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}

function MasterCalendar({ allShows, artists, selectedArtists, onOpenShow }) {
  const [view, setView]   = useState('month');
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [weekStart, setWeekStart] = useState(() => sundayOfWeek(new Date()));
  const [popover, setPopover] = useState(null);

  const today = todayStr();
  const year  = month.getFullYear();
  const m     = month.getMonth();

  const filtered = selectedArtists.length === 0
    ? allShows
    : allShows.filter((s) => selectedArtists.includes(s.artistId));

  // Week starts Sunday (getDay() returns 0 for Sunday — no offset needed)
  const firstDay   = new Date(year, m, 1);
  const lastDay    = new Date(year, m + 1, 0);
  const startPad   = firstDay.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const totalCells = Math.ceil((startPad + lastDay.getDate()) / 7) * 7;

  const cells = Array.from({ length: totalCells }, (_, i) => {
    const dayOffset = i - startPad;
    const date      = new Date(year, m, 1 + dayOffset);
    const dateStr   = localDateStr(date);
    const isCurrentMonth = date.getMonth() === m;
    const isToday        = dateStr === today;
    const shows = filtered
      .filter((s) => toDateStr(s.date) === dateStr && !s.archived)
      .sort((a, b) => getShowTime(a).localeCompare(getShowTime(b)));
    return { date, dateStr, isCurrentMonth, isToday, shows };
  });

  // Week view: 7 days starting from weekStart (Sunday)
  const weekCells = Array.from({ length: 7 }, (_, i) => {
    const date    = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
    const dateStr = localDateStr(date);
    const isToday = dateStr === today;
    const shows   = filtered
      .filter((s) => toDateStr(s.date) === dateStr && !s.archived)
      .sort((a, b) => getShowTime(a).localeCompare(getShowTime(b)));
    return { date, dateStr, isToday, shows };
  });

  const displayedMonth = view === 'week'
    ? weekStart.toLocaleString('default', { month: 'long' })
    : month.toLocaleString('default', { month: 'long' });
  const displayedYear = view === 'week' ? weekStart.getFullYear() : year;

  const prevMonth = () => setMonth(new Date(year, m - 1, 1));
  const nextMonth = () => setMonth(new Date(year, m + 1, 1));
  const prevWeek  = () => setWeekStart(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7));
  const nextWeek  = () => setWeekStart(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7));

  const handlePrev = view === 'week' ? prevWeek : prevMonth;
  const handleNext = view === 'week' ? nextWeek : nextMonth;

  const goToday = () => {
    const n = new Date();
    setMonth(new Date(n.getFullYear(), n.getMonth(), 1));
    setWeekStart(sundayOfWeek(n));
  };

  return (
    <div className="mcal">
      <div className="mcal-topbar">
        <div className="mcal-title-group">
          <span className="mcal-month-name">{displayedMonth}</span>
          <span className="mcal-year">{displayedYear}</span>
        </div>
        <div className="mcal-nav">
          <button className="mcal-nav-btn" onClick={handlePrev} aria-label="Previous">‹</button>
          <button className="mcal-today-btn" onClick={goToday}>Today</button>
          <button className="mcal-nav-btn" onClick={handleNext} aria-label="Next">›</button>
        </div>
        <SegmentedControl
          items={[{ id: 'month', label: 'Month' }, { id: 'week', label: 'Week' }]}
          activeId={view}
          onChange={setView}
        />
      </div>

      {view === 'month' ? (
        <div className="mcal-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="mcal-day-hdr">{d}</div>
          ))}

          {cells.map(({ date, dateStr, isCurrentMonth, isToday, shows }) => (
            <div
              key={dateStr}
              className={[
                'mcal-cell',
                !isCurrentMonth ? 'mcal-cell--out'   : '',
                isToday         ? 'mcal-cell--today'  : '',
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
      ) : (
        <div className="mcal-week-grid">
          {weekCells.map(({ date, dateStr, isToday, shows }) => (
            <div
              key={dateStr}
              className={['mcal-week-col', isToday ? 'mcal-week-col--today' : ''].filter(Boolean).join(' ')}
            >
              <div className="mcal-week-col-hdr">
                <span className="mcal-week-wday">
                  {date.toLocaleString('default', { weekday: 'short' })}
                </span>
                <span className={`mcal-week-daynum${isToday ? ' mcal-week-daynum--today' : ''}`}>
                  {date.getDate()}
                </span>
              </div>
              <div className="mcal-week-col-body">
                {shows.map((show) => (
                  <EventPill
                    key={show.id}
                    show={show}
                    onClick={() => setPopover({ show })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {popover && (
        <QuickViewPopover
          show={popover.show}
          artists={artists}
          onClose={() => setPopover(null)}
          onOpenShow={onOpenShow}
        />
      )}
    </div>
  );
}

// ── Up Next ────────────────────────────────────────────────────────────────────
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
      </div>

      {rows.length === 0 && (
        <p className="upnext-empty">No upcoming shows.</p>
      )}

      {rows.map((show) => {
        const artist = artists.find((a) => a.id === show.artistId);
        const date   = new Date(show.date + 'T12:00:00');
        const day    = date.getDate();
        const mon    = date.toLocaleString('default', { month: 'short' }).toUpperCase();
        const wday   = date.toLocaleString('default', { weekday: 'short' }).toUpperCase();
        const time   = getShowTime(show);

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
                  <span className="upnext-artist-dot" style={{ background: artist.color }} />
                  {artist.name}
                </span>
              )}
              <span className="upnext-name" dir="auto">{show.name}</span>
              <span className="upnext-meta">
                {time && <span>{time}</span>}
                {time && show.venue && <span className="upnext-sep"> · </span>}
                {show.venue && <span dir="auto">{show.venue}</span>}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── My Tasks ───────────────────────────────────────────────────────────────────
function MyTasks({ tasks, allShows, artists, onToggleTask }) {
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
    <div className="mytasks">
      <div className="mytasks-header">
        <div className="mytasks-header-text">
          <h2 className="mytasks-title">My Tasks</h2>
          <p className="mytasks-sub">Assigned to you · across all productions</p>
        </div>
        <span className="mytasks-count-badge">{myTasks.length}</span>
      </div>

      <div className="mytasks-card">
        {myTasks.length === 0 ? (
          <p className="mytasks-empty">All clear.</p>
        ) : (
          <div className="mytasks-grid">
            {myTasks.map((task) => {
              const show   = task.showId ? allShows.find((s) => s.id === task.showId) : null;
              const artist = show ? artists.find((a) => a.id === show?.artistId) : null;
              const overdue = task.dueDate && task.dueDate < today;

              return (
                <div key={task.id} className={`mytask-row${overdue ? ' mytask-row--overdue' : ''}`}>
                  <button
                    className={`mytask-check${task.completed ? ' mytask-check--done' : ''}`}
                    onClick={() => onToggleTask(task.id, !task.completed)}
                    aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {task.completed && (
                      <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                        <path d="M1 4.5L3.8 7.5L10 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  <div className="mytask-content">
                    <span className={`mytask-text${task.completed ? ' mytask-text--done' : ''}`} dir="auto">
                      {task.text}
                    </span>
                    <div className="mytask-meta">
                      {artist && (
                        <>
                          <span className="mytask-artist-dot" style={{ background: artist.color }} />
                          <span className="mytask-artist" style={{ color: artist.color }}>{artist.name}</span>
                          {show && <span className="mytask-sep">·</span>}
                        </>
                      )}
                      {show && (
                        <span className="mytask-show" dir="auto">{show.name}</span>
                      )}
                      {task.dueDate && (
                        <span className={`mytask-due${overdue ? ' mytask-due--overdue' : ''}`}>
                          Due {task.dueDate}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dashboard root ─────────────────────────────────────────────────────────────
export default function Dashboard({ artists: rawArtists, tasks, crew, onOpenShow, onToggleTask }) {
  const artists = withColor(rawArtists);
  const [allShows, setAllShows]     = useState([]);
  const [loadingShows, setLoading]  = useState(true);
  const [selectedArtists, setSelected] = useState([]);

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

  const today       = todayStr();
  const _now        = new Date();
  const monthPrefix = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}`;
  const upcoming    = allShows.filter((s) => !s.archived && s.date && s.date.startsWith(monthPrefix));
  const openTasks = tasks.filter((t) => !t.completed);

  const toggleArtist = useCallback((id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  // Sub-line date label
  const now  = new Date();
  const dateLabel = now.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="dashboard">

      {/* ── Hero ── */}
      <div className="dash-hero">
        <h1 className="dash-title">
          Today<span className="dash-title-period">.</span>
        </h1>
        <div className="dash-subline">
          <span>{dateLabel}</span>
          <span className="dash-subline-rule" aria-hidden="true" />
          <span>{artists.length} active artist{artists.length !== 1 ? 's' : ''}</span>
          <span className="dash-subline-rule" aria-hidden="true" />
          <span>{upcoming.length} show{upcoming.length !== 1 ? 's' : ''} this month</span>
        </div>
      </div>

      {/* ── Artist filter chips ── */}
      <div className="dash-filters">
        <FilterChip
          on={selectedArtists.length === 0}
          onToggle={() => setSelected([])}
        >
          All artists
        </FilterChip>
        {artists.map((a) => {
          const count = allShows.filter(
            (s) => !s.archived && s.artistId === a.id && toDateStr(s.date) >= today
          ).length;
          return (
            <FilterChip
              key={a.id}
              on={selectedArtists.includes(a.id)}
              swatch={a.color}
              count={count}
              onToggle={() => toggleArtist(a.id)}
            >
              {a.name}
            </FilterChip>
          );
        })}
      </div>

      {/* ── Body ── */}
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

          <MyTasks
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
