import { useState, useEffect, useRef, useCallback } from 'react';
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

function getShowTime(show) {
  if (show.schedule) {
    const m = show.schedule.match(/\d{1,2}:\d{2}/);
    if (m) return m[0];
  }
  return show.loadIn || '';
}

// Normalise a show's guest list (free-text string or legacy [{name,notes}]) to text.
function guestListToText(gl) {
  if (!gl) return '';
  if (typeof gl === 'string') return gl;
  if (Array.isArray(gl)) return gl.map((g) => g.name + (g.notes ? ` — ${g.notes}` : '')).join('\n');
  return '';
}

// Count total guests from a free-text guest list (mirrors TaskManager rules):
//   זוג / זוגית → 2 · "+N" → 1+N · trailing number N → N · otherwise → 1
function countGuests(text) {
  if (!text || !text.trim()) return 0;
  return text.split('\n').map((l) => l.trim()).filter(Boolean).reduce((total, line) => {
    if (/זוג(ית)?/u.test(line)) return total + 2;
    const plus = line.match(/\+\s*(\d+)/);
    if (plus) return total + 1 + parseInt(plus[1], 10);
    const trailing = line.match(/(\d+)\s*$/);
    return total + (trailing ? parseInt(trailing[1], 10) : 1);
  }, 0);
}

// Copy arbitrary text to the clipboard with a non-secure-context fallback.
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
    return ok;
  }
}

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

// ── Progress Ring ──────────────────────────────────────────────────────────────
function ProgressRing({ done, total, color }) {
  const R = 18;
  const C = 2 * Math.PI * R;
  const pct = total === 0 ? 0 : done / total;
  const offset = C * (1 - pct);
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="cl-ring" aria-hidden="true">
      <circle cx="22" cy="22" r={R} fill="none" stroke="var(--border)" strokeWidth="3" />
      <circle
        cx="22" cy="22" r={R} fill="none"
        stroke={color} strokeWidth="3"
        strokeDasharray={C} strokeDashoffset={offset}
        strokeLinecap="square"
        transform="rotate(-90 22 22)"
        style={{ transition: 'stroke-dashoffset 0.3s' }}
      />
      <text x="22" y="22" textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: '9px', fontWeight: 700, fill: color, fontFamily: 'Bricolage Grotesque, sans-serif' }}>
        {done}/{total}
      </text>
    </svg>
  );
}

// ── Checklist Card ─────────────────────────────────────────────────────────────
function ChecklistCard({ label, accentColor, timeLabel, items, doneCount, checkedIds, onToggle, onDelete, isAdded, onAdd }) {
  const [addingText, setAddingText] = useState('');
  const [adding, setAdding] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  const handleAdd = () => {
    const text = addingText.trim();
    setAdding(false);
    setAddingText('');
    if (text) onAdd(text);
  };

  return (
    <div className="cl-card" style={{ '--cl-color': accentColor }}>
      <div className="cl-card-header">
        <ProgressRing done={doneCount} total={items.length} color={accentColor} />
        <div className="cl-card-title-group">
          <span className="cl-card-title">{label}</span>
          {timeLabel && <span className="cl-card-time">{timeLabel}</span>}
        </div>
        <span className="cl-card-count">{doneCount}/{items.length}</span>
      </div>

      <div className="cl-card-items">
        {items.map((item) => {
          const done = checkedIds.has(item.id);
          const added = isAdded(item);
          return (
            <div key={item.id} className={`cl-row${done ? ' cl-row--done' : ''}`}>
              <button
                className={`cl-check${done ? ' cl-check--done' : ''}`}
                style={done ? { background: accentColor, borderColor: accentColor } : {}}
                onClick={() => onToggle(item.id)}
                aria-label={done ? 'Mark incomplete' : 'Mark complete'}
              >
                {done && (
                  <svg width="10" height="8" viewBox="0 0 10 8">
                    <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <span className="cl-row-text" dir="auto">{item.text}</span>
              <button className="cl-row-del" onClick={() => onDelete(item.id, added)} aria-label="Remove">✕</button>
            </div>
          );
        })}

        {adding ? (
          <div className="cl-row cl-row--adding">
            <span className="cl-check cl-check--placeholder" />
            <input
              ref={inputRef}
              className="cl-add-input"
              dir="auto"
              value={addingText}
              onChange={(e) => setAddingText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') { setAdding(false); setAddingText(''); }
              }}
              onBlur={handleAdd}
              placeholder="הוסף משימה..."
            />
          </div>
        ) : (
          <button className="cl-add-btn" onClick={() => setAdding(true)}>+ Add task</button>
        )}
      </div>
    </div>
  );
}

// ── Guest-List Card (compact + editable — mirrors the Logistics guest list) ──────
function GuestListCard({ show, onSaveGuests }) {
  const [text, setText] = useState(() => guestListToText(show.guestList));
  const [copied, setCopied] = useState(false);

  // Re-seed when the underlying show changes (e.g. after a background refetch).
  useEffect(() => { setText(guestListToText(show.guestList)); }, [show.id, show.guestList]);

  const trimmed = text.trim();
  const count   = countGuests(text);

  const save = () => {
    if (text === guestListToText(show.guestList)) return; // unchanged → skip write
    onSaveGuests(show, text);
  };

  const copy = async () => {
    if (!trimmed) return;
    const ok = await copyText(trimmed);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
  };

  // Sort lines alphabetically (Hebrew-aware), like the original Logistics list.
  const sort = () => {
    const sorted = text
      .split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'he'))
      .join('\n');
    if (sorted === text) return;
    setText(sorted);
    onSaveGuests(show, sorted);
  };

  return (
    <div className="cl-card gl-card">
      <div className="cl-card-header gl-card-header">
        <div className="cl-card-title-group">
          <span className="cl-card-title">Guest list</span>
          <span className="cl-card-time" dir="rtl">רשימת מוזמנים</span>
        </div>
        {count > 0 && <span className="gl-count-pill">{count}</span>}
        {trimmed && (
          <div className="guest-btn-group">
            <button
              type="button"
              className={`gl-copy-btn${copied ? ' gl-copy-btn--ok' : ''}`}
              onClick={copy}
              title="Copy the whole guest list"
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
            <button
              type="button"
              className="gl-copy-btn"
              onClick={sort}
              title="Sort the guest list alphabetically (א–ב)"
            >
              Sort א–ב
            </button>
          </div>
        )}
      </div>

      <textarea
        className="gl-textarea"
        dir="auto"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        placeholder={'שם מוזמן\nשם מוזמן נוסף'}
        rows={4}
      />
    </div>
  );
}

// ── Show-Day Banner ────────────────────────────────────────────────────────────
function ShowDayBanner({ show, checklist, onSaveGuests }) {
  const lsKey       = `ph-cl-${show.id}`;
  const collapseKey = `ph-cl-open-${show.id}-${todayStr()}`;

  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(collapseKey) !== 'false'; }
    catch { return true; }
  });

  const loadState = () => {
    try {
      const s = JSON.parse(localStorage.getItem(lsKey) || '{}');
      return {
        checkedIds:  new Set(s.checkedIds  || []),
        addedItems:  s.addedItems  || [],
        deletedIds:  new Set(s.deletedIds  || []),
      };
    } catch {
      return { checkedIds: new Set(), addedItems: [], deletedIds: new Set() };
    }
  };

  const [state, setState] = useState(loadState);

  const saveState = (next) => {
    try {
      localStorage.setItem(lsKey, JSON.stringify({
        checkedIds: [...next.checkedIds],
        addedItems: next.addedItems,
        deletedIds: [...next.deletedIds],
      }));
    } catch {}
    setState(next);
  };

  const toggleOpen = () => {
    const next = !open;
    try { localStorage.setItem(collapseKey, String(next)); } catch {}
    setOpen(next);
  };

  const toggleCheck = (id) => {
    const ids = new Set(state.checkedIds);
    ids.has(id) ? ids.delete(id) : ids.add(id);
    saveState({ ...state, checkedIds: ids });
  };

  const deleteItem = (id, isAdded) => {
    if (isAdded) {
      saveState({ ...state, addedItems: state.addedItems.filter((i) => i.id !== id) });
    } else {
      saveState({ ...state, deletedIds: new Set([...state.deletedIds, id]) });
    }
  };

  const addItem = (phase, text) => {
    const item = { id: `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`, phase, text };
    saveState({ ...state, addedItems: [...state.addedItems, item] });
  };

  const beforeTemplate = (checklist?.before || []).filter((i) => !state.deletedIds.has(i.id));
  const venueTemplate  = (checklist?.venue  || []).filter((i) => !state.deletedIds.has(i.id));
  const beforeAdded    = state.addedItems.filter((i) => i.phase === 'before');
  const venueAdded     = state.addedItems.filter((i) => i.phase === 'venue');

  const beforeItems = [...beforeTemplate, ...beforeAdded];
  const venueItems  = [...venueTemplate,  ...venueAdded];
  const beforeDone  = beforeItems.filter((i) => state.checkedIds.has(i.id)).length;
  const venueDone   = venueItems.filter((i)  => state.checkedIds.has(i.id)).length;

  const time         = getShowTime(show);
  const schedLines   = parseScheduleLines(show.schedule);
  const departTime   = schedLines.find((l) => l.time)?.time || '';
  const arriveTime   = show.loadIn || (schedLines[1]?.time || '');

  return (
    <div className="showday-banner" style={{ background: show.color || 'var(--text)' }}>
      <div className="showday-hdr" onClick={toggleOpen} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && toggleOpen()}>
        <div className="showday-hdr-left">
          <span className="showday-badge">Show today</span>
          <span className="showday-name" dir="auto">{show.name}</span>
          {show.venue && (
            <>
              <span className="showday-sep" aria-hidden="true">·</span>
              <span className="showday-venue" dir="auto">{show.venue}</span>
            </>
          )}
        </div>
        <div className="showday-hdr-right">
          {time && <span className="showday-time">{time}</span>}
          <span className="showday-chevron" aria-hidden="true">{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div className="showday-body">
          <ChecklistCard
            label="Before you leave"
            accentColor="var(--orange)"
            timeLabel={departTime ? `Depart ${departTime}` : ''}
            items={beforeItems}
            doneCount={beforeDone}
            checkedIds={state.checkedIds}
            onToggle={toggleCheck}
            onDelete={deleteItem}
            isAdded={(item) => state.addedItems.some((a) => a.id === item.id)}
            onAdd={(text) => addItem('before', text)}
          />
          <ChecklistCard
            label="At the venue"
            accentColor="var(--accent)"
            timeLabel={arriveTime ? `Arrive ${arriveTime}` : ''}
            items={venueItems}
            doneCount={venueDone}
            checkedIds={state.checkedIds}
            onToggle={toggleCheck}
            onDelete={deleteItem}
            isAdded={(item) => state.addedItems.some((a) => a.id === item.id)}
            onAdd={(text) => addItem('venue', text)}
          />
          <GuestListCard show={show} onSaveGuests={onSaveGuests} />
        </div>
      )}
    </div>
  );
}

// ── Event Pill ─────────────────────────────────────────────────────────────────
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

// ── Quick-view Popover ─────────────────────────────────────────────────────────
function QuickViewPopover({ show, artists, onClose, onOpenShow }) {
  const ref    = useRef(null);
  const artist = artists.find((a) => a.id === show.artistId);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const dateStr = show.date
    ? new Date(show.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const scheduleLines = parseScheduleLines(show.schedule);
  const artistColor   = artist?.color || 'var(--accent)';

  return (
    <div className="qv-backdrop">
      <div className="qv-popover" ref={ref}
        style={{ '--qv-color': artistColor, '--qv-soft': artist?.soft || 'var(--accent-soft)' }}>
        <div className="qv-top-band" />
        <div className="qv-body">
          <button className="qv-close" onClick={onClose} aria-label="Close">✕</button>
          {artist && (
            <div className="qv-artist" style={{ color: artistColor }}>
              <span className="qv-artist-dot" /> {artist.name}
            </div>
          )}
          <h3 className="qv-show-name" dir="auto">{show.name}</h3>
          <p className="qv-date">{dateStr}{show.loadIn ? ` · Doors ${show.loadIn}` : ''}</p>
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
                    {line.time && <span className="qv-sched-time" style={{ color: artistColor }}>{line.time}</span>}
                    <span className="qv-sched-label" dir="auto">{line.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="qv-footer">
            <button className="qv-open-link" onClick={() => { onOpenShow(show); onClose(); }}>
              Open show →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Calendar ───────────────────────────────────────────────────────────────────
function sundayOfWeek(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
}

function MasterCalendar({ allShows, artists, selectedArtists, onOpenShow }) {
  const [view, setView]     = useState('month');
  const [month, setMonth]   = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [weekStart, setWeekStart] = useState(() => sundayOfWeek(new Date()));
  const [popover, setPopover]     = useState(null);

  const today  = todayStr();
  const year   = month.getFullYear();
  const m      = month.getMonth();

  const filtered = selectedArtists.length === 0
    ? allShows
    : allShows.filter((s) => selectedArtists.includes(s.artistId));

  const firstDay   = new Date(year, m, 1);
  const lastDay    = new Date(year, m + 1, 0);
  const startPad   = firstDay.getDay();
  const totalCells = Math.ceil((startPad + lastDay.getDate()) / 7) * 7;

  const cells = Array.from({ length: totalCells }, (_, i) => {
    const date           = new Date(year, m, 1 + (i - startPad));
    const dateStr        = localDateStr(date);
    const isCurrentMonth = date.getMonth() === m;
    const isToday        = dateStr === today;
    const shows          = filtered.filter((s) => toDateStr(s.date) === dateStr && !s.archived)
      .sort((a, b) => getShowTime(a).localeCompare(getShowTime(b)));
    return { date, dateStr, isCurrentMonth, isToday, shows };
  });

  const weekCells = Array.from({ length: 7 }, (_, i) => {
    const date    = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
    const dateStr = localDateStr(date);
    return { date, dateStr, isToday: dateStr === today, shows: filtered.filter((s) => toDateStr(s.date) === dateStr && !s.archived) };
  });

  const displayedMonth = (view === 'week' ? weekStart : month).toLocaleString('default', { month: 'long' });
  const displayedYear  = view === 'week' ? weekStart.getFullYear() : year;

  const prevMonth = () => setMonth(new Date(year, m - 1, 1));
  const nextMonth = () => setMonth(new Date(year, m + 1, 1));
  const prevWeek  = () => setWeekStart(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7));
  const nextWeek  = () => setWeekStart(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7));
  const goToday   = () => { const n = new Date(); setMonth(new Date(n.getFullYear(), n.getMonth(), 1)); setWeekStart(sundayOfWeek(n)); };

  const handlePrev = view === 'week' ? prevWeek : prevMonth;
  const handleNext = view === 'week' ? nextWeek : nextMonth;

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
        <SegmentedControl items={[{ id: 'month', label: 'Month' }, { id: 'week', label: 'Week' }]} activeId={view} onChange={setView} />
      </div>

      {view === 'month' ? (
        <div className="mcal-grid">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => (
            <div key={i} className="mcal-day-hdr">{d}</div>
          ))}
          {cells.map(({ date, dateStr, isCurrentMonth, isToday, shows }) => (
            <div key={dateStr} className={['mcal-cell', !isCurrentMonth ? 'mcal-cell--out' : '', isToday ? 'mcal-cell--today' : ''].filter(Boolean).join(' ')}>
              <span className="mcal-day-num">{date.getDate()}</span>
              {shows.slice(0, 2).map((show) => (
                <EventPill key={show.id} show={show} onClick={() => setPopover({ show })} />
              ))}
              {shows.length > 2 && <span className="mcal-more">+{shows.length - 2}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="mcal-week-grid">
          {weekCells.map(({ date, dateStr, isToday, shows }) => (
            <div key={dateStr} className={['mcal-week-col', isToday ? 'mcal-week-col--today' : ''].filter(Boolean).join(' ')}>
              <div className="mcal-week-col-hdr">
                <span className="mcal-week-wday">{date.toLocaleString('default', { weekday: 'short' })}</span>
                <span className={`mcal-week-daynum${isToday ? ' mcal-week-daynum--today' : ''}`}>{date.getDate()}</span>
              </div>
              <div className="mcal-week-col-body">
                {shows.map((show) => <EventPill key={show.id} show={show} onClick={() => setPopover({ show })} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {popover && (
        <QuickViewPopover show={popover.show} artists={artists} onClose={() => setPopover(null)} onOpenShow={onOpenShow} />
      )}
    </div>
  );
}

// ── Up Next ────────────────────────────────────────────────────────────────────
function UpNext({ allShows, artists, selectedArtists, onOpenShow }) {
  const today = todayStr();
  const rows  = allShows
    .filter((s) => !s.archived && toDateStr(s.date) >= today)
    .filter((s) => selectedArtists.length === 0 || selectedArtists.includes(s.artistId))
    .sort((a, b) => toDateStr(a.date).localeCompare(toDateStr(b.date)))
    .slice(0, 6);

  return (
    <div className="upnext">
      <div className="upnext-header"><h2 className="upnext-title">Up Next</h2></div>
      <div className="upnext-list">
      {rows.length === 0 && <p className="upnext-empty">No upcoming shows.</p>}
      {rows.map((show) => {
        const artist = artists.find((a) => a.id === show.artistId);
        const date   = new Date(show.date + 'T12:00:00');
        return (
          <div key={show.id} className="upnext-row"
            style={{ '--row-color': artist?.color || 'var(--border)' }}
            onClick={() => onOpenShow(show)}>
            <div className="upnext-datecol">
              <span className="upnext-day">{date.getDate()}</span>
              <span className="upnext-mon">{date.toLocaleString('default', { month: 'short' }).toUpperCase()}</span>
              <span className="upnext-wday">{date.toLocaleString('default', { weekday: 'short' }).toUpperCase()}</span>
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
                {getShowTime(show) && <span>{getShowTime(show)}</span>}
                {getShowTime(show) && show.venue && <span className="upnext-sep"> · </span>}
                {show.venue && <span dir="auto">{show.venue}</span>}
              </span>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

// ── My Tasks ───────────────────────────────────────────────────────────────────
function MyTasks({ tasks, allShows, artists, onToggleTask }) {
  const today  = todayStr();
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
          <p className="mytasks-sub">assigned to you</p>
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
              // Prefer the task's own artist tag (aggregated on Global Home) so
              // every task is labelled even when it isn't linked to a show.
              const artist = (task.artistId && artists.find((a) => a.id === task.artistId))
                || (show ? artists.find((a) => a.id === show?.artistId) : null);
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
                    <span className={`mytask-text${task.completed ? ' mytask-text--done' : ''}`} dir="auto">{task.text}</span>
                    <div className="mytask-meta">
                      {artist && (
                        <>
                          <span className="mytask-artist-dot" style={{ background: artist.color }} />
                          <span className="mytask-artist" style={{ color: artist.color }}>{artist.name}</span>
                          {show && <span className="mytask-sep">·</span>}
                        </>
                      )}
                      {show && <span className="mytask-show" dir="auto">{show.name}</span>}
                      {task.dueDate && (
                        <span className={`mytask-due${overdue ? ' mytask-due--overdue' : ''}`}>{task.dueDate.slice(5)}</span>
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
export default function Dashboard({ artists: rawArtists, tasks, crew, onOpenShow, onToggleTask, eventTypeChecklists = {}, onOpenTimeLog }) {
  const artists = withColor(rawArtists);
  const [allShows, setAllShows]       = useState([]);
  const [loadingShows, setLoading]    = useState(true);
  const [selectedArtists, setSelected] = useState([]);
  // Global Home aggregates tasks across EVERY artist (not just the one you
  // happened to come from). Each task is tagged with its owning artist so the
  // shared home view always shows everyone's tasks with the right label.
  const [allTasks, setAllTasks] = useState([]);

  useEffect(() => {
    if (!artists.length) { setAllShows([]); setLoading(false); return; }
    setLoading(true);
    Promise.all(
      artists.map((a) =>
        fetch(`/api/shows?artistId=${encodeURIComponent(a.id)}`, { credentials: 'include' })
          .then((r) => r.ok ? r.json() : [])
          .then((shows) => shows.map((s) => ({ ...s, artistId: a.id, artistName: a.name, color: a.color, soft: a.soft })))
          .catch(() => [])
      )
    ).then((results) => { setAllShows(results.flat()); setLoading(false); });
  }, [rawArtists]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!artists.length) { setAllTasks([]); return; }
    Promise.all(
      artists.map((a) =>
        fetch(`/api/tasks?artistId=${encodeURIComponent(a.id)}`, { credentials: 'include' })
          .then((r) => r.ok ? r.json() : [])
          .then((ts) => ts.map((t) => ({ ...t, artistId: a.id, artistName: a.name, color: a.color, soft: a.soft })))
          .catch(() => [])
      )
    ).then((results) => setAllTasks(results.flat()));
  }, [rawArtists]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle a task using ITS OWN artist scope (not the current workspace's), so
  // completing any artist's task from the shared home hits the right file.
  const toggleGlobalTask = useCallback((taskId, completed) => {
    const task = allTasks.find((t) => t.id === taskId);
    if (!task) return;
    setAllTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, completed } : t)));
    fetch(`/api/tasks/${taskId}?artistId=${encodeURIComponent(task.artistId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ completed }),
    }).then((r) => {
      if (!r.ok) setAllTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, completed: !completed } : t)));
    }).catch(() => {
      setAllTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, completed: !completed } : t)));
    });
  }, [allTasks]);

  // Persist guest-list edits from the home show-day card. Sends only the
  // guestList field (partial PUT) so the server merge can't null out slimmed
  // customField data. Optimistic; reverts handled by the next refetch.
  const saveGuests = useCallback((show, text) => {
    setAllShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, guestList: text } : s)));
    fetch(`/api/shows/${show.id}?artistId=${encodeURIComponent(show.artistId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ guestList: text }),
    }).catch(() => {});
  }, []);

  const today      = todayStr();
  const now        = new Date();
  const openTasks  = allTasks.filter((t) => !t.completed);
  const allUpcoming = allShows.filter((s) => !s.archived);

  const toggleArtist = useCallback((id) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  // Date label
  const dateLabel = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Artist chip counts
  const artistCounts = artists.map((a) => ({
    ...a,
    count: allShows.filter((s) => !s.archived && s.artistId === a.id && toDateStr(s.date) >= today).length,
  }));

  // Shows happening today
  const todayShows = allShows.filter((s) => !s.archived && toDateStr(s.date) === today);

  return (
    <div className="dashboard">

      {/* ── Compact header ── */}
      <div className="dash-compact-header">
        {/* Row 1: title + date LEFT / stat strip RIGHT */}
        <div className="dash-hdr-row1">
          <div className="dash-hdr-left">
            <h1 className="dash-title">Today<span className="dash-title-period">.</span></h1>
            <span className="dash-date-label">{dateLabel}</span>
          </div>
          <div className="dash-stats">
            <div className="dash-stat">
              <span className="dash-stat-value">{String(artists.length).padStart(2, '0')}</span>
              <span className="dash-stat-label">Artists</span>
            </div>
            <div className="dash-stat">
              <span className="dash-stat-value">{String(allUpcoming.length).padStart(2, '0')}</span>
              <span className="dash-stat-label">Shows</span>
            </div>
            <div className="dash-stat">
              <span className="dash-stat-value">{String(openTasks.length).padStart(2, '0')}</span>
              <span className="dash-stat-label">Tasks</span>
            </div>
          </div>
        </div>

        {/* Row 2: marquee (Home-only brand strip) */}
        <div className="dash-marquee" aria-hidden="true">
          <div className="dash-marquee-track">
            {Array.from({ length: 10 }).map((_, i) => (
              <span key={i} className="dash-marquee-item">
                Production Hub<span className="dash-marquee-dot">•</span>
              </span>
            ))}
          </div>
        </div>

        {/* Row 3: 2px divider + artist filter chips */}
        <div className="dash-filter-divider">
          <span className="dash-filter-eyebrow">Artists</span>
          <div className="dash-filter-chips">
            <button
              className={`dash-chip${selectedArtists.length === 0 ? ' dash-chip--active' : ''}`}
              onClick={() => setSelected([])}
            >
              All artists
            </button>
            {artistCounts.map((a) => {
              const active = selectedArtists.includes(a.id);
              return (
                <button
                  key={a.id}
                  className={`dash-chip dash-chip--artist${active ? ' dash-chip--active' : ''}`}
                  style={{ '--chip-c': a.color, '--chip-s': a.soft }}
                  onClick={() => toggleArtist(a.id)}
                >
                  <span className="dash-chip-dot" style={{ background: a.color }} />
                  {a.name} {a.count}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Show-day checklist banner (only when a show is today) ── */}
      {todayShows.length > 0 && !loadingShows && todayShows.map((show) => (
        <ShowDayBanner
          key={show.id}
          show={show}
          checklist={eventTypeChecklists[show.eventType] || null}
          onSaveGuests={saveGuests}
        />
      ))}

      {/* ── Body ── */}
      {loadingShows ? (
        <div className="dash-loading"><div className="spinner" /><p>Loading shows…</p></div>
      ) : (
        <>
          <div className="dash-body">
            <MasterCalendar allShows={allShows} artists={artists} selectedArtists={selectedArtists} onOpenShow={onOpenShow} />
            <UpNext allShows={allShows} artists={artists} selectedArtists={selectedArtists} onOpenShow={onOpenShow} />
          </div>
          <MyTasks tasks={allTasks} allShows={allShows} artists={artists} onToggleTask={toggleGlobalTask} />
        </>
      )}
    </div>
  );
}
