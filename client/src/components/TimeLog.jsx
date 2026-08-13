import { useState, useEffect, useMemo, useCallback } from 'react';
import { useT } from '../i18n';

/* ── Artist categories (matches design handoff data model) ──────────────── */
// Artist names are data, not interface copy: they render identically in both
// language modes. Only the catch-all 'general' bucket carries a translated label.
const ARTISTS = {  // i18n-ignore
    assaf:   { id: 'assaf',   name: 'Assaf Amdursky', color: 'var(--accent)', bg: 'var(--accent-soft)' },  // i18n-ignore
    hila:    { id: 'hila',    name: 'Hila Ruach',     color: 'var(--orange)', bg: 'var(--orange-bg)' },  // i18n-ignore
    general: { id: 'general', nameKey: 'tlog.artist.general', color: 'var(--text-2)', bg: 'var(--surface-sunk)' },
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
  const { t } = useT();
  const a = ARTISTS[artist] || ARTISTS.general;
  if (artist === 'general') {
    return <span className="tlog-tag tlog-tag--general">{t('tlog.artist.general')}</span>;
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
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={on ? t('tlog.billed.on') : t('tlog.billed.mark')}
      title={on ? t('tlog.billed.onHint') : t('tlog.billed.offHint')}
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
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('tlog.edit')}
      title={t('tlog.edit')}
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
      <span dir="auto" className={`tlog-row-desc${e.billed ? ' is-billed' : ''}`}>{e.desc}</span>
      <div className="tlog-row-hours">
        <span className={`tlog-row-hours-num ltr${e.billed ? ' is-billed' : ''}`}>{fmtHours(e.hours)}</span>
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
  const { t } = useT();
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
    if (!desc.trim())   { setErr(t('tlog.err.desc')); return; }
    if (!(h > 0))       { setErr(t('tlog.err.hours')); return; }
    setSaving(true); setErr('');
    try {
      // Preserve the billed flag when editing; new entries start unbilled.
      await onSave({ date: isoToDDMM(date), artist, desc: desc.trim(), hours: h, billed: editing ? entry.billed : false });
      onClose();
    } catch (e) {
      setErr(e.message || t('tlog.err.save'));
      setSaving(false);
    }
  };

  return (
    <div className="tlog-modal-backdrop" onClick={onClose}>
      <div className="tlog-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="tlog-modal-title">{editing ? t('tlog.modal.edit') : t('tlog.modal.add')}<span className="tlog-period">.</span></h2>
        <form onSubmit={submit} className="tlog-form">
          <label className="tlog-field">
            <span className="tlog-field-label">{t('tlog.col.date')}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="tlog-field">
            <span className="tlog-field-label">{t('tlog.col.artist')}</span>
            <select value={artist} onChange={(e) => setArtist(e.target.value)}>
              <option value="assaf">Assaf Amdursky</option>  {/* i18n-ignore — artist name is data */}
              <option value="hila">Hila Ruach</option>  {/* i18n-ignore — artist name is data */}
              <option value="general">{t('tlog.artist.general')}</option>
            </select>
          </label>
          <label className="tlog-field">
            <span className="tlog-field-label">{t('tlog.col.desc')}</span>
            <input
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder={t('tlog.ph.desc')}
              autoFocus
            />
          </label>
          <label className="tlog-field">
            <span className="tlog-field-label">{t('tlog.col.hours')}</span>
            <input
              type="number"
              step="0.25"
              min="0"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder={t('tlog.ph.hours')}
            />
          </label>
          {err && <p className="tlog-form-err">{err}</p>}
          <div className="tlog-form-actions">
            <button type="button" className="btn secondary sz-md" onClick={onClose} disabled={saving}>{t('tlog.cancel')}</button>
            <button type="submit" className="btn primary sz-md" disabled={saving}>
              {saving ? t('tlog.saving') : (editing ? t('tlog.saveChanges') : t('tlog.modal.add'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────── */
export default function TimeLog({ onBack }) {
  const { t, tx, lang } = useT();
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
      throw new Error(body.error || t('tlog.err.save'));
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
      throw new Error(body.error || t('tlog.err.saveChanges'));
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

  // Follows the interface language. This was hardcoded to 'en-GB', so the month
  // stayed English even with the rest of the page in Hebrew.
  const monthName = new Date().toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { month: 'long' });

  // Generate Billing Report → CSV of unbilled sessions
  const generateBillingReport = useCallback(() => {
    const rows = entries.filter((e) => !e.billed);
    if (!rows.length) return;
    const head = [t('tlog.col.date'), t('tlog.col.artist'), t('tlog.col.desc'), t('tlog.col.hours')];
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      head.join(','),
      ...rows.map((e) => [e.date, (ARTISTS[e.artist] || ARTISTS.general).name, e.desc, fmtHours(e.hours)].map(esc).join(',')),
      esc(t('tlog.csv.total')) + ',,,' + esc(fmtHours(rows.reduce((s, e) => s + e.hours, 0))),
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
        <button className="tlog-back" onClick={onBack} aria-label={t('tlog.back')}>
          <span className="mirror" aria-hidden="true">←</span> {t('tlog.back')}
        </button>
      )}

      {/* ── Page title + hero stats ── */}
      <div className="tlog-title-row">
        <h1 className="tlog-title">{t('tlog.title')}<span className="tlog-period">.</span></h1>
        <div className="tlog-stats">
          <div className="tlog-stat">
            <span className="tlog-stat-eyebrow tlog-stat-eyebrow--blue">{tx('tlog.stat.unbilled', { month: monthName })}</span>
            <div className="tlog-stat-row">
              <span className="tlog-stat-num tlog-stat-num--blue">{fmtHours(unbilled)}</span>
              <span className="tlog-stat-unit">{t('tlog.stat.hrs')}</span>
            </div>
          </div>
          <span className="tlog-stat-divider" />
          <div className="tlog-stat">
            <span className="tlog-stat-eyebrow">{t('tlog.stat.logged')}</span>
            <div className="tlog-stat-row">
              <span className="tlog-stat-num">{entries.length}</span>
              <span className="tlog-stat-unit tlog-stat-unit--word">{t('tlog.stat.sessions')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filter pills (carry per-artist hours) ── */}
      <div className="tlog-filter">
        <span className="tlog-filter-eyebrow">{t('tlog.filter')}</span>
        {[
          { id: 'all',     labelKey: 'tlog.filter.all',     dot: null,            hours: totalAll },
          { id: 'assaf',   label: 'Assaf Amdursky',   dot: 'var(--accent)', hours: assafM },  // i18n-ignore
          { id: 'hila',    label: 'Hila Ruach',       dot: 'var(--orange)', hours: hilaM },  // i18n-ignore
          { id: 'general', labelKey: 'tlog.artist.general', dot: 'var(--text-2)', hours: generalM },
        ].map((p) => {
          const on = filter === p.id;
          return (
            <button
              key={p.id}
              className={`tlog-pill${on ? ' on' : ''}`}
              onClick={() => setFilter(p.id)}
            >
              {p.dot && <span className="tlog-pill-dot" style={{ background: p.dot }} />}
              {p.labelKey ? t(p.labelKey) : p.label}
              <span className="tlog-pill-hours">
                <span className="tlog-pill-hours-num ltr">{fmtHours(p.hours)}</span>
                <span className="tlog-pill-hours-unit">h</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Action bar ── */}
      <div className="tlog-actionbar">
        <div className="tlog-actionbar-left">
          <span className="tlog-actionbar-title">{t('tlog.sessions')}</span>
          <span className="tlog-actionbar-badge">{visible.length}</span>
          <span className="tlog-actionbar-sub">{tx('tlog.unbilledCount', { count: unbilledCount })}</span>
        </div>
        <div className="tlog-actionbar-right">
          <button
            className="tlog-ghost-btn"
            onClick={generateBillingReport}
            disabled={unbilledCount === 0}
            title={unbilledCount === 0 ? t('tlog.report.none') : t('tlog.report.hint')}
          >
            {t('tlog.report')}
            <span className="tlog-ghost-arrow" aria-hidden="true">↧</span>
          </button>
          <button className="tlog-add-btn" onClick={() => setAdding(true)}>
            <span className="tlog-add-plus" aria-hidden="true">+</span> {t('tlog.add')}
          </button>
        </div>
      </div>

      {/* ── Time grid ── */}
      <div className="tlog-grid">
        <div className="tlog-grid-head">
          <span className="tlog-grid-head-label">{t('tlog.col.date')}</span>
          <span className="tlog-grid-head-label">{t('tlog.col.artist')}</span>
          <span className="tlog-grid-head-label">{t('tlog.col.desc')}</span>
          <span className="tlog-grid-head-label tlog-right">{t('tlog.col.hours')}</span>
          <span className="tlog-grid-head-label tlog-center">{t('tlog.col.billed')}</span>
          <span className="tlog-grid-head-label" aria-hidden="true" />
        </div>
        {loading ? (
          <div className="tlog-empty">{t('tlog.loading')}</div>
        ) : visible.length === 0 ? (
          <div className="tlog-empty">{t('tlog.empty')}</div>
        ) : (
          visible.map((e, i) => (
            <TimeRow key={e.id} e={e} last={i === visible.length - 1} onToggle={toggle} onEdit={setEditing} />
          ))
        )}
      </div>

      {/* ── Footer total ── */}
      <div className="tlog-footer">
        <span className="tlog-footer-label">{t('tlog.totalShown')}</span>
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
