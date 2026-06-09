import { useState, useEffect, useMemo, useCallback } from 'react';

/* ── Artist categories (matches design handoff data model) ──────────────── */
const ARTISTS = {
  assaf:   { id: 'assaf',   name: 'Assaf Amdursky', color: 'var(--accent)', bg: 'var(--accent-soft)' },
  hila:    { id: 'hila',    name: 'Hila Ruach',     color: 'var(--orange)', bg: 'var(--orange-bg)' },
  general: { id: 'general', name: 'General',        color: 'var(--text-2)', bg: 'var(--surface-sunk)' },
};

/* hours → tidy display string (decimal, trimmed) */
function fmtHours(h) {
  return Number.isInteger(h) ? `${h}.0` : `${h}`;
}

/* "YYYY-MM-DD" (date input) → "DD-MM" (grid format) */
function isoToDDMM(iso) {
  const [, m, d] = iso.split('-');
  return `${d}-${m}`;
}

/* "DD-MM" (stored) → "YYYY-MM-DD" (date input). Year isn't stored, so the
   current year is assumed — consistent with how new entries drop the year. */
function ddmmToIso(ddmm) {
  const [d, m] = String(ddmm || '').split('-');
  if (!d || !m) return new Date().toISOString().slice(0, 10);
  return `${new Date().getFullYear()}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/* ── Artist tag inside a grid row ───────────────────────────────────────── */
function ArtistTag({ artist }) {
  const a = ARTISTS[artist] || ARTISTS.general;
  if (artist === 'general') {
    return <span className="tlog-tag tlog-tag--general">General</span>;
  }
  return (
    <span className="tlog-tag" style={{ background: a.bg, color: a.color }}>
      <span className="tlog-tag-dot" style={{ background: a.color }} />
      {a.name}
    </span>
  );
}

/* ── Billed checkbox ────────────────────────────────────────────────────── */
function BilledCheck({ on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={on ? 'Billed' : 'Mark as billed'}
      title={on ? 'Billed — click to unmark' : 'Unbilled — click to mark billed'}
      className={`tlog-check${on ? ' on' : ''}`}
    >
      {on && (
        <svg width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden="true">
          <path d="M1 4.5L3.8 7.5L10 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

/* ── Edit (pencil) button ───────────────────────────────────────────────── */
function EditButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Edit session"
      title="Edit session"
      className="tlog-edit-btn"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M9.5 1.8l2.7 2.7M1 13l.6-2.9 7.4-7.4 2.3 2.3-7.4 7.4L1 13z"
          stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/* ── Time grid row ──────────────────────────────────────────────────────── */
function TimeRow({ e, last, onToggle, onEdit }) {
  return (
    <div className={`tlog-row${last ? ' tlog-row--last' : ''}`}>
      <span className="tlog-row-date">{e.date}</span>
      <div><ArtistTag artist={e.artist} /></div>
      <span className={`tlog-row-desc${e.billed ? ' is-billed' : ''}`}>{e.desc}</span>
      <div className="tlog-row-hours">
        <span className={`tlog-row-hours-num${e.billed ? ' is-billed' : ''}`}>{fmtHours(e.hours)}</span>
        <span className="tlog-row-hours-unit">h</span>
      </div>
      <div className="tlog-row-check">
        <BilledCheck on={e.billed} onClick={() => onToggle(e.id)} />
      </div>
      <div className="tlog-row-edit">
        <EditButton onClick={() => onEdit(e)} />
      </div>
    </div>
  );
}

/* ── Add / Edit Time form (modal) ───────────────────────────────────────── */
function TimeModal({ entry, onClose, onSave }) {
  const editing = !!entry;
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate]     = useState(editing ? ddmmToIso(entry.date) : today);
  const [artist, setArtist] = useState(editing ? entry.artist : 'general');
  const [desc, setDesc]     = useState(editing ? entry.desc : '');
  const [hours, setHours]   = useState(editing ? String(entry.hours) : '');
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const submit = async (ev) => {
    ev.preventDefault();
    const h = parseFloat(hours);
    if (!desc.trim())   { setErr('Description is required.'); return; }
    if (!(h > 0))       { setErr('Hours must be greater than 0.'); return; }
    setSaving(true); setErr('');
    try {
      // Preserve the billed flag when editing; new entries start unbilled.
      await onSave({ date: isoToDDMM(date), artist, desc: desc.trim(), hours: h, billed: editing ? entry.billed : false });
      onClose();
    } catch (e) {
      setErr(e.message || 'Could not save the session.');
      setSaving(false);
    }
  };

  return (
    <div className="tlog-modal-backdrop" onClick={onClose}>
      <div className="tlog-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="tlog-modal-title">{editing ? 'Edit Time' : 'Add Time'}<span className="tlog-period">.</span></h2>
        <form onSubmit={submit} className="tlog-form">
          <label className="tlog-field">
            <span className="tlog-field-label">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="tlog-field">
            <span className="tlog-field-label">Artist</span>
            <select value={artist} onChange={(e) => setArtist(e.target.value)}>
              <option value="assaf">Assaf Amdursky</option>
              <option value="hila">Hila Ruach</option>
              <option value="general">General</option>
            </select>
          </label>
          <label className="tlog-field">
            <span className="tlog-field-label">Description</span>
            <input
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="What did you work on?"
              autoFocus
            />
          </label>
          <label className="tlog-field">
            <span className="tlog-field-label">Hours</span>
            <input
              type="number"
              step="0.25"
              min="0"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="e.g. 2.5"
            />
          </label>
          {err && <p className="tlog-form-err">{err}</p>}
          <div className="tlog-form-actions">
            <button type="button" className="btn secondary sz-md" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn primary sz-md" disabled={saving}>
              {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Add Time')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────── */
export default function TimeLog({ onBack }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('all');
  const [adding, setAdding]   = useState(false);
  const [editing, setEditing] = useState(null);

  // Load sessions (mirrors Dashboard.jsx's fetch pattern)
  useEffect(() => {
    setLoading(true);
    fetch('/api/timelog', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setEntries(Array.isArray(data) ? data : []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  // Newest-logged first
  const ordered = useMemo(
    () => [...entries].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [entries],
  );

  const toggle = useCallback((id) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    const next = !entry.billed;
    // optimistic
    setEntries((es) => es.map((e) => (e.id === id ? { ...e, billed: next } : e)));
    fetch(`/api/timelog/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ billed: next }),
    }).catch(() => {
      // revert on failure
      setEntries((es) => es.map((e) => (e.id === id ? { ...e, billed: !next } : e)));
    });
  }, [entries]);

  const addEntry = useCallback(async (fields) => {
    const res = await fetch('/api/timelog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Could not save the session.');
    }
    const created = await res.json();
    setEntries((es) => [...es, created]);
  }, []);

  const updateEntry = useCallback(async (id, fields) => {
    const res = await fetch(`/api/timelog/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Could not save the changes.');
    }
    const updated = await res.json();
    setEntries((es) => es.map((e) => (e.id === id ? updated : e)));
  }, []);

  const visible = useMemo(
    () => (filter === 'all' ? ordered : ordered.filter((e) => e.artist === filter)),
    [ordered, filter],
  );

  const unbilled      = entries.filter((e) => !e.billed).reduce((s, e) => s + e.hours, 0);
  const assafM        = entries.filter((e) => e.artist === 'assaf').reduce((s, e) => s + e.hours, 0);
  const hilaM         = entries.filter((e) => e.artist === 'hila').reduce((s, e) => s + e.hours, 0);
  const generalM      = entries.filter((e) => e.artist === 'general').reduce((s, e) => s + e.hours, 0);
  const totalAll      = entries.reduce((s, e) => s + e.hours, 0);
  const unbilledCount = entries.filter((e) => !e.billed).length;
  const totalShown    = visible.reduce((s, e) => s + e.hours, 0);

  const monthName = new Date().toLocaleDateString('en-GB', { month: 'long' });

  // Generate Billing Report → CSV of unbilled sessions
  const generateBillingReport = useCallback(() => {
    const rows = entries.filter((e) => !e.billed);
    if (!rows.length) return;
    const head = ['Date', 'Artist', 'Description', 'Hours'];
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      head.join(','),
      ...rows.map((e) => [e.date, (ARTISTS[e.artist] || ARTISTS.general).name, e.desc, fmtHours(e.hours)].map(esc).join(',')),
      esc('TOTAL') + ',,,' + esc(fmtHours(rows.reduce((s, e) => s + e.hours, 0))),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billing-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [entries]);

  return (
    <div className="tlog">
      {/* ── Back to home ── */}
      {onBack && (
        <button className="tlog-back" onClick={onBack} aria-label="Back to Today">
          ← Today
        </button>
      )}

      {/* ── Page title + hero stats ── */}
      <div className="tlog-title-row">
        <h1 className="tlog-title">Time Log<span className="tlog-period">.</span></h1>
        <div className="tlog-stats">
          <div className="tlog-stat">
            <span className="tlog-stat-eyebrow tlog-stat-eyebrow--blue">Unbilled · {monthName}</span>
            <div className="tlog-stat-row">
              <span className="tlog-stat-num tlog-stat-num--blue">{fmtHours(unbilled)}</span>
              <span className="tlog-stat-unit">hrs</span>
            </div>
          </div>
          <span className="tlog-stat-divider" />
          <div className="tlog-stat">
            <span className="tlog-stat-eyebrow">Logged</span>
            <div className="tlog-stat-row">
              <span className="tlog-stat-num">{entries.length}</span>
              <span className="tlog-stat-unit tlog-stat-unit--word">sessions</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filter pills (carry per-artist hours) ── */}
      <div className="tlog-filter">
        <span className="tlog-filter-eyebrow">Filter</span>
        {[
          { id: 'all',     label: 'All artists',      dot: null,            hours: totalAll },
          { id: 'assaf',   label: 'Assaf Amdursky',   dot: 'var(--accent)', hours: assafM },
          { id: 'hila',    label: 'Hila Ruach',       dot: 'var(--orange)', hours: hilaM },
          { id: 'general', label: 'General', dot: 'var(--text-2)', hours: generalM },
        ].map((p) => {
          const on = filter === p.id;
          return (
            <button
              key={p.id}
              className={`tlog-pill${on ? ' on' : ''}`}
              onClick={() => setFilter(p.id)}
            >
              {p.dot && <span className="tlog-pill-dot" style={{ background: p.dot }} />}
              {p.label}
              <span className="tlog-pill-hours">
                <span className="tlog-pill-hours-num">{fmtHours(p.hours)}</span>
                <span className="tlog-pill-hours-unit">h</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Action bar ── */}
      <div className="tlog-actionbar">
        <div className="tlog-actionbar-left">
          <span className="tlog-actionbar-title">Sessions</span>
          <span className="tlog-actionbar-badge">{visible.length}</span>
          <span className="tlog-actionbar-sub">· {unbilledCount} unbilled</span>
        </div>
        <div className="tlog-actionbar-right">
          <button
            className="tlog-ghost-btn"
            onClick={generateBillingReport}
            disabled={unbilledCount === 0}
            title={unbilledCount === 0 ? 'No unbilled sessions' : 'Download a CSV of unbilled sessions'}
          >
            Generate Billing Report
            <span className="tlog-ghost-arrow" aria-hidden="true">↧</span>
          </button>
          <button className="tlog-add-btn" onClick={() => setAdding(true)}>
            <span className="tlog-add-plus" aria-hidden="true">+</span> Add Time
          </button>
        </div>
      </div>

      {/* ── Time grid ── */}
      <div className="tlog-grid">
        <div className="tlog-grid-head">
          <span className="tlog-grid-head-label">Date</span>
          <span className="tlog-grid-head-label">Artist</span>
          <span className="tlog-grid-head-label">Description</span>
          <span className="tlog-grid-head-label tlog-right">Hours</span>
          <span className="tlog-grid-head-label tlog-center">Bld</span>
          <span className="tlog-grid-head-label" aria-hidden="true" />
        </div>
        {loading ? (
          <div className="tlog-empty">Loading sessions…</div>
        ) : visible.length === 0 ? (
          <div className="tlog-empty">No sessions for this filter.</div>
        ) : (
          visible.map((e, i) => (
            <TimeRow key={e.id} e={e} last={i === visible.length - 1} onToggle={toggle} onEdit={setEditing} />
          ))
        )}
      </div>

      {/* ── Footer total ── */}
      <div className="tlog-footer">
        <span className="tlog-footer-label">Total shown</span>
        <span className="tlog-footer-num">
          {fmtHours(totalShown)}<span className="tlog-footer-unit">h</span>
        </span>
      </div>

      {adding && <TimeModal onClose={() => setAdding(false)} onSave={addEntry} />}
      {editing && (
        <TimeModal
          entry={editing}
          onClose={() => setEditing(null)}
          onSave={(fields) => updateEntry(editing.id, fields)}
        />
      )}
    </div>
  );
}
