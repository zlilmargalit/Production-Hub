import { useState } from 'react';
import TaskManager from './TaskManager';
import TechnicalManager from './TechnicalManager';
import { etColorIdx } from '../utils/etColor';
import { scheduleToString } from '../utils/schedule';
import { useT } from '../i18n';

// ── Module-level constants — not recreated on every render ──────────────────
const CREW_PALETTE = ['#3852B4', '#5E7AC4', '#F08D39', '#C26C1F', '#1F2D6E', '#B07729', '#8F4F1A', '#7A8FE0'];
const colorFor     = (id) => CREW_PALETTE[(id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % CREW_PALETTE.length];
const initialsFor  = (name) => (name || '').split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
const formatDate   = (d) => d ? new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

// Extract first–last HH:MM from a schedule string
const getTimeRange = (schedule) => {
  if (!schedule) return null;
  const s = typeof schedule === 'string' ? schedule : scheduleToString(schedule);
  const times = s.match(/\d{1,2}:\d{2}/g) || [];
  if (!times.length) return null;
  return times.length > 1 ? `${times[0]} – ${times[times.length - 1]}` : times[0];
};

// Completion: fraction of key fields present (0–100)
// Returns { pct, missing[] } so the bar can show a tooltip
const calcProgress = (show) => {
  const sched = typeof show.schedule === 'string' ? show.schedule : scheduleToString(show.schedule || '');
  const items = [
    { ok: !!sched,                                labelKey: 'card.schedule' },
    { ok: (show.crewIds || []).length > 0,        labelKey: 'card.crew' },
    { ok: !!show.venue,                           labelKey: 'card.venue' },
    { ok: !!show.contacts,                        labelKey: 'card.contacts' },
    { ok: !!show.address,                         labelKey: 'card.address' },
    { ok: !!show.soundCoordinated,                labelKey: 'card.soundCoordinated' },
    { ok: !!show.lightingCoordinated,             labelKey: 'card.lightingCoordinated' },
    { ok: !!show.transportation,                  labelKey: 'card.transportation' },
    { ok: !!show.food,                            labelKey: 'card.food' },
  ];
  const pct     = Math.round(items.filter(i => i.ok).length / items.length * 100);
  const missing = items.filter(i => !i.ok).map(i => i.labelKey);
  return { pct, missing };
};

function ProgressBar({ pct, missing = [] }) {
  const { t } = useT();
  if (!pct && pct !== 0) return null;
  const col     = pct === 100 ? '#4E7265' : pct >= 60 ? '#3852B4' : '#F08D39';
  const tooltip = missing.length ? `${t('card.missing')}: ${missing.map((key) => t(key)).join(', ')}` : t('card.allDone');
  return (
    <div className="show-progress" title={tooltip}>
      <div className="show-progress-track">
        <div className="show-progress-fill" style={{ width: `${pct}%`, background: col }} />
      </div>
      <span className="show-progress-pct" style={{ color: col }}>{pct}%</span>
    </div>
  );
}

function ShowCard({ show, crew, fieldTemplates, onEdit, onDelete, onUpdateShow, artistId, onConfirmImport }) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [showTech, setShowTech] = useState(false);
  const [briefStatus, setBriefStatus] = useState(null);
  const [pdfStatus, setPdfStatus] = useState(null);
  const [briefError, setBriefError] = useState(null);
  const [pdfError, setPdfError] = useState(null);
  const [briefDocUrl, setBriefDocUrl] = useState(null);
  const [calStatus, setCalStatus] = useState(null); // null | 'loading' | 'done' | 'error'
  const [calMsg, setCalMsg] = useState(null);

  const assignedCrew = (crew || []).filter((m) => (show.crewIds || []).includes(m.id));
  const timeRange    = getTimeRange(show.schedule);
  const { pct: progressPct, missing: progressMissing } = calcProgress(show);
  const MUSICIAN_ROLES = new Set(['Musician', 'Musicians', 'נגן', 'נגנים']);

  // Rendered as nodes, not joined strings. "Sound – יובל | Backline – נעם" in a
  // single run is a chain of English and Hebrew parts separated by bidi-neutral
  // dashes and pipes: the neutrals attach to whichever side wins, and the parts
  // reorder. Isolating each atom lets DOM order carry the reading order while
  // the visible text stays exactly what it was. The stored `technicalCrew`
  // string is untouched — it is still the fallback below.
  const joinIsolated = (people, render) =>
    people.map((m, i) => (
      <span key={m.id ?? i}>
        {i > 0 ? ' | ' : null}
        {render(m)}
      </span>
    ));

  const musicianList = assignedCrew.filter((m) => MUSICIAN_ROLES.has(m.role));
  const musicians = musicianList.length
    ? joinIsolated(musicianList, (m) => <span dir="auto">{m.name}</span>)
    : null;

  // Technical crew = everyone assigned who isn't a musician (backliner included).
  const techCrew = assignedCrew.filter((m) => !MUSICIAN_ROLES.has(m.role));
  // Guard on techCrew, not assignedCrew: an all-musician crew leaves this empty,
  // and an empty array is truthy — Field would print a blank instead of its
  // placeholder.
  const techCrewDisplay = techCrew.length > 0
    ? joinIsolated(techCrew, (m) => (
        <><span dir="auto">{m.role}</span>{' – '}<span dir="auto">{m.name}</span></>
      ))
    : show.technicalCrew;

  const customDefs = (show.eventType && fieldTemplates?.[show.eventType]) || [];

  const toggleField = (field) => {
    onUpdateShow(show.id, { ...show, [field]: !show[field] });
  };

  const isPdfOn = (key) => {
    if (key.startsWith('check_')) return show.pdfFields?.[key] === true;
    if (!key.startsWith('cf_')) return show.pdfFields?.[key] !== false;
    const defId = key.slice(3);
    const def = customDefs.find((d) => d.id === defId);
    if (def?.type === 'image') return show.pdfFields?.[key] !== false;
    return show.pdfFields?.[key] === true;
  };

  const togglePdf = (key) => {
    const current = isPdfOn(key);
    onUpdateShow(show.id, {
      ...show,
      pdfFields: { ...(show.pdfFields || {}), [key]: !current },
    });
  };

  const qs = artistId ? `?artistId=${encodeURIComponent(artistId)}` : '';

  const createBrief = async () => {
    setBriefStatus('loading');
    setBriefError(null);
    setBriefDocUrl(null);
    // After 15s the Brief button returns to its plain state completely — no
    // "Sent ✓", no error, and no "Open doc" link. The reset flag also stops the
    // background poll from re-showing any of them afterwards.
    let reset = false;
    setTimeout(() => {
      reset = true;
      setBriefStatus(null); setBriefError(null); setBriefDocUrl(null);
    }, 15000);
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    try {
      const res  = await fetch(`/api/shows/${show.id}/brief${qs}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!reset) {
          setBriefStatus('error');
          setBriefError(data.error || 'Brief creation failed');
          setTimeout(() => { setBriefStatus(null); setBriefError(null); }, 4000);
        }
        return;
      }
      // Server processes asynchronously — poll status until done or timeout (2 min)
      const { jobId } = data;
      await delay(3000); // wait before first check
      for (let attempt = 0; attempt < 60; attempt++) {
        try {
          const sr = await fetch(`/api/shows/${show.id}/brief/${jobId}${qs}`);
          const sd = await sr.json().catch(() => ({}));
          if (sd.status === 'done') {
            // Only surface Sent ✓ + the doc link if we haven't already reverted
            if (!reset) {
              if (sd.docUrl) setBriefDocUrl(sd.docUrl);
              setBriefStatus('sent');
            }
            return;
          }
          if (sd.status === 'error') {
            if (!reset) {
              setBriefStatus('error');
              setBriefError(sd.error || 'Brief creation failed');
              setTimeout(() => { setBriefStatus(null); setBriefError(null); }, 4000);
            }
            return;
          }
        } catch {
          // transient network error — keep polling
        }
        await delay(2000);
      }
      // timed out
      if (!reset) {
        setBriefStatus('error');
        setBriefError('Timed out — check Google Drive in a few minutes');
        setTimeout(() => { setBriefStatus(null); setBriefError(null); }, 5000);
      }
    } catch (e) {
      if (!reset) {
        setBriefStatus('error');
        setBriefError(e.message || 'Network error');
        setTimeout(() => { setBriefStatus(null); setBriefError(null); }, 4000);
      }
    }
  };

  const savePdf = async () => {
    setPdfStatus('loading');
    setPdfError(null);
    try {
      const res = await fetch(`/api/shows/${show.id}/pdf${qs}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPdfStatus('error');
        setPdfError(data.details || data.error || 'PDF generation failed');
        setTimeout(() => { setPdfStatus(null); setPdfError(null); }, 2000);
        return;
      }
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/pdf')) {
        const blob = await res.blob();
        const cd = res.headers.get('content-disposition') || '';
        const nameMatch = cd.match(/filename\*=UTF-8''(.+)/i) || cd.match(/filename="?([^"]+)"?/i);
        const fname = nameMatch ? decodeURIComponent(nameMatch[1]) : 'coordination-sheet.pdf';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = fname; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setPdfStatus('saved');
      setTimeout(() => { setPdfStatus(null); setPdfError(null); }, 2000);
    } catch (e) {
      setPdfStatus('error');
      setPdfError(e.message || 'Network error');
      setTimeout(() => { setPdfStatus(null); setPdfError(null); }, 2000);
    }
  };

  const exportToCalendar = async () => {
    setCalStatus('loading'); setCalMsg(null);
    try {
      const res  = await fetch(`/api/calendar/insert-show-event${qs}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ showId: show.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCalStatus('error');
        setCalMsg(data.error || 'Calendar export failed');
      } else {
        setCalStatus('done');
        setCalMsg(`Schedule added to "${data.eventName || show.name}" ✓`);
      }
    } catch (e) {
      setCalStatus('error');
      setCalMsg(e.message || 'Network error');
    }
    setTimeout(() => { setCalStatus(null); setCalMsg(null); }, 5000);
  };

  // Detect Hebrew so the heading can pick the right font stack via :lang(he)
  const isHebrew = (show.name && /[\u0590-\u05FF]/.test(show.name)) ? 'he' : 'en';

  // Deterministic palette slot for event type (16 slots → CSS data-et-idx)
  const etIdx = etColorIdx(show.eventType);

  // Receipt = show is done → archive. Invoice = separate billing flag.
  const toggleReceipt = () => {
    const next = !show.receipt;
    onUpdateShow(show.id, { ...show, receipt: next, archived: next });
  };

  // Auto-imported and not vouched for yet. The flag only drives presentation
  // plus the Confirm strip below — every other behaviour is unchanged.
  const pending = !!show.importPending;

  return (
    <div
      className={`show-card ${show.receipt || show.archived ? 'archived' : ''}${pending ? ' show-card--pending' : ''}`}
      data-event-type={show.eventType || ''}
      data-et-idx={etIdx}
    >
      <div className="show-card-band" />
      {pending && (
        <div className="show-card-review">
          <span className="badge badge-import" title={t('import.badgeTitle')}>{t('import.badge')}</span>
          {onConfirmImport && (
            <button
              className="btn-confirm-import"
              onClick={() => onConfirmImport([show.id])}
              title={t('import.confirmTitle')}
            >
              {t('import.confirm')}
            </button>
          )}
        </div>
      )}
      <div className={`show-card-header${expanded ? ' show-card-header--sticky' : ''}`}>
        <div className="show-card-top-row">
          {show.eventType && <div className="show-card-type" dir="auto">{show.eventType}</div>}
          <div className="show-actions">
            <button className="btn-action" onClick={() => setExpanded(!expanded)} title={expanded ? t('card.collapse') : t('card.expand')}>
              {expanded ? '−' : '+'}
            </button>
            <button className="btn-action" onClick={() => onEdit(show)}>{t('card.edit')}</button>
            <button className="btn-action btn-action--danger" onClick={() => onDelete(show.id)}>{t('card.delete')}</button>
          </div>
        </div>
        {/* lang still drives the font; direction is left to dir="auto", which
            reads the first strong character instead of "contains any Hebrew" —
            "Show at בארבי" is an English title and should read left-to-right. */}
        <h2 lang={isHebrew} dir="auto">{show.name}</h2>
        <div className="show-meta">
          {show.date && <span className="meta-date">{formatDate(show.date)}</span>}
          {show.venue && <><span className="meta-dot">·</span><span className="meta-item" dir="auto">{show.venue}</span></>}
          {/* "18:15 – 22:20" is two neutral-led operands around a neutral dash.
              Inside an RTL line it reorders to "22:20 – 18:15" — a show that
              ends before it starts. .ltr isolates the whole atom. */}
          {timeRange && (
            <><span className="meta-dot">·</span><span className="meta-time ltr">{timeRange}</span></>
          )}
          {assignedCrew.length > 0 && (
            <>
              <span className="meta-dot">·</span>
              <span className="meta-crew-summary">
                <span className="meta-crew-avatars">
                  {assignedCrew.slice(0, 3).map((m, i) => (
                    <span key={m.id} className="meta-crew-avatar" style={{ background: colorFor(m.id), marginLeft: i > 0 ? -4 : 0 }}>
                      {initialsFor(m.name)}
                    </span>
                  ))}
                </span>
                {assignedCrew.length} {t('card.crew')}
              </span>
            </>
          )}
          {show.invoice && <span className="badge badge-invoice">{t('card.invoice')}</span>}
          {show.receipt && <span className="badge badge-receipt">{t('card.receipt')}</span>}
          {(show.archived && !show.invoice) && <span className="badge badge-archive">{t('card.archive')}</span>}
        </div>
        <ProgressBar pct={progressPct} missing={progressMissing} />
      </div>

      {expanded && (
        <div className="show-details">
          <div className="details-grid">
            <Field label={t('card.address')} value={show.address} inPdf={isPdfOn('address')} onTogglePdf={() => togglePdf('address')} />
            <Field label={t('card.parking')} value={show.parking} inPdf={isPdfOn('parking')} onTogglePdf={() => togglePdf('parking')} />
            <Field label={t('card.technicalCrew')} value={techCrewDisplay} inPdf={isPdfOn('technicalCrew')} onTogglePdf={() => togglePdf('technicalCrew')} />
            {musicians && <Field label={t('card.musicians')} value={musicians} inPdf={isPdfOn('musicians')} onTogglePdf={() => togglePdf('musicians')} />}
            <Field label={t('card.transportation')} value={show.transportation} inPdf={isPdfOn('transportation')} onTogglePdf={() => togglePdf('transportation')} />
            <Field label={t('card.contacts')} value={show.contacts} multiline inPdf={isPdfOn('contacts')} onTogglePdf={() => togglePdf('contacts')} />


          </div>

          {assignedCrew.filter((m) => !MUSICIAN_ROLES.has(m.role)).length > 0 && (
            <div className="detail-full">
              <strong>{t('card.crew')}</strong>
              <div className="crew-chips">
                {assignedCrew.filter((m) => !MUSICIAN_ROLES.has(m.role)).map((m) => (
                  <div key={m.id} className="crew-chip">
                    <span className="crew-chip-avatar" style={{ background: colorFor(m.id) }}>{initialsFor(m.name)}</span>
                    <span className="crew-chip-name" dir="auto">{m.name}</span>
                    {m.role && <span className="crew-chip-role">{m.role}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {show.schedule && (
            <div className="detail-full">
              <div className="field-label-row">
                <strong>{t('card.schedule')}</strong>
                <div className="field-label-row-actions">
                  <label className="pdf-toggle" title={t('card.showInSheet')}>
                    <input type="checkbox" checked={isPdfOn('schedule')} onChange={() => togglePdf('schedule')} />
                    <span className="pdf-toggle-text">{t('card.pdf')}</span>
                  </label>
                  <button
                    className={`btn-cal-export ${calStatus === 'done' ? 'done' : calStatus === 'error' ? 'error' : ''}`}
                    onClick={exportToCalendar}
                    disabled={calStatus === 'loading'}
                    title={t('card.calendarExportHint')}
                  >
                    {calStatus === 'loading' ? t('card.syncing') : calStatus === 'done' ? '✓ Cal' : calStatus === 'error' ? '✕ Cal' : t('card.exportCalendar')}
                  </button>
                </div>
              </div>
              {calMsg && <p className={`cal-export-msg ${calStatus}`}>{calMsg}</p>}
              {/* Per-line direction: schedule rows are "18:15 הגעת צוות טכני",
                  digits first then Hebrew. dir="auto" would resolve the whole
                  block from the first line only. */}
              <pre className="bidi-lines">{scheduleToString(show.schedule)}</pre>
            </div>
          )}

          <div className="detail-full">
            <div className="field-label-row">
              <strong>{t('card.additionalDetails')}</strong>
              {show.additionalDetails && (
                <label className="pdf-toggle" title={t('card.showInSheet')}>
                  <input type="checkbox" checked={isPdfOn('additionalDetails')} onChange={() => togglePdf('additionalDetails')} />
                  <span className="pdf-toggle-text">{t('card.pdf')}</span>
                </label>
              )}
            </div>
            {show.additionalDetails && <p dir="auto" style={{ marginBottom: 8 }}>{show.additionalDetails}</p>}
            <div className="additional-checks">
              {show.eventType === 'אני גיטרה' && (
                <div className="check-pdf-pair">
                  <label className="quick-check">
                    <input type="checkbox" checked={show.piano || false} onChange={() => toggleField('piano')} />
                    פסנתר
                  </label>
                  <label className="pdf-toggle" title={t('card.showInSheet')}>
                    <input type="checkbox" checked={show.pdfFields?.check_piano === true} onChange={() => togglePdf('check_piano')} />
                    <span className="pdf-toggle-text">{t('card.pdf')}</span>
                  </label>
                </div>
              )}
              <div className="check-pdf-pair">
                <label className="quick-check">
                  <input type="checkbox" checked={show.mirror || false} onChange={() => toggleField('mirror')} />
                  מראת גוף
                </label>
                <label className="pdf-toggle" title={t('card.showInSheet')}>
                  <input type="checkbox" checked={show.pdfFields?.check_mirror === true} onChange={() => togglePdf('check_mirror')} />
                  <span className="pdf-toggle-text">{t('card.pdf')}</span>
                </label>
              </div>
              <div className="check-pdf-pair">
                <label className="quick-check">
                  <input type="checkbox" checked={show.coffeeCorner || false} onChange={() => toggleField('coffeeCorner')} />
                  פינת קפה
                </label>
                <label className="pdf-toggle" title={t('card.showInSheet')}>
                  <input type="checkbox" checked={show.pdfFields?.check_coffeeCorner === true} onChange={() => togglePdf('check_coffeeCorner')} />
                  <span className="pdf-toggle-text">{t('card.pdf')}</span>
                </label>
              </div>
              <div className="check-pdf-pair">
                <label className="quick-check">
                  <input type="checkbox" checked={show.waterBottles || false} onChange={() => toggleField('waterBottles')} />
                  בקבוקי מים
                </label>
                <label className="pdf-toggle" title={t('card.showInSheet')}>
                  <input type="checkbox" checked={show.pdfFields?.check_waterBottles === true} onChange={() => togglePdf('check_waterBottles')} />
                  <span className="pdf-toggle-text">{t('card.pdf')}</span>
                </label>
              </div>
            </div>
          </div>

          {customDefs.length > 0 && (
            <div className="detail-full">
              <strong>{t('card.customFields')}</strong>
              <div className="custom-fields-grid">
                {customDefs.map((def) => {
                  const val = show.customFields?.[def.id];
                  const cfKey = 'cf_' + def.id;
                  return (
                    <div key={def.id} className="custom-field-display">
                      <div className="field-label-row">
                        <span className="field-label">{def.label}</span>
                        <label className="pdf-toggle" title={t('card.showInSheet')}>
                          <input
                            type="checkbox"
                            checked={isPdfOn(cfKey)}
                            onChange={() => togglePdf(cfKey)}
                          />
                          <span className="pdf-toggle-text">{t('card.pdf')}</span>
                        </label>
                      </div>
                      {def.type === 'image' && val ? (
                        val?.isPdf ? (
                          <a href={val.data} download={val.name} className="file-download-link" onClick={(e) => e.stopPropagation()}>
                            📎 {val.name}
                          </a>
                        ) : val?._hasData && !val?.data ? (
                          <span className="file-download-link">📎 {t('card.imageAttached')}</span>
                        ) : (
                          <img
                            src={typeof val === 'string' ? val : val.data}
                            alt={def.label}
                            style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 4, marginTop: 4, objectFit: 'contain' }}
                          />
                        )
                      ) : def.type === 'file' && val ? (
                        <a
                          href={val.data}
                          download={val.name}
                          className="file-download-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          📎 {val.name}
                        </a>
                      ) : def.type === 'checkbox' ? (
                        <span className="field-value">{val ? t('card.yes') : t('card.no')}</span>
                      ) : (
                        <span className="field-value" dir="auto">{val || '—'}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {show.notes && (
            <div className="detail-full">
              <div className="field-label-row">
                <strong>{t('card.notes')}</strong>
              </div>
              <p dir="auto">{show.notes}</p>
            </div>
          )}

          {/* ── Technical + Logistics inside accordion ── */}
          <div className="show-expand-section">
            <div className="show-expand-eyebrow">{t('card.expandSection')}</div>
            <div className="show-expand-toggle">
              <button
                className={`show-expand-btn${showTech ? ' active' : ''}`}
                onClick={() => { setShowTech((p) => !p); if (showTasks) setShowTasks(false); }}
              >{t('card.technical')}</button>
              <button
                className={`show-expand-btn${showTasks ? ' active' : ''}`}
                onClick={() => { setShowTasks((p) => !p); if (showTech) setShowTech(false); }}
              >{t('card.logistics')}</button>
            </div>
            {showTech && <div className="show-expand-panel"><TechnicalManager show={show} onUpdate={onUpdateShow} /></div>}
            {showTasks && (
              <div className="show-expand-panel hub-panel" aria-label={t('card.internalHub')}>
                <div className="hub-header">
                  <div className="hub-header-text">
                    <div className="hub-eyebrow">{t('card.internal')}</div>
                    <div className="hub-heading">{t('app.productName')}</div>
                  </div>
                </div>

                <TaskManager show={show} onUpdate={onUpdateShow} artistId={artistId} />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="show-card-footer">
        <div className="footer-left">
          <div className="btn-action-wrap">
            <button
              className={`btn-brief ${briefStatus === 'sent' ? 'sent' : briefStatus === 'error' ? 'error' : ''}`}
              onClick={createBrief}
              disabled={briefStatus === 'loading'}
            >
              {briefStatus === 'loading' ? 'Creating…' :
               briefStatus === 'sent' ? 'Sent ✓' :
               briefStatus === 'error' ? 'Error ✕' :
               'Brief'}
            </button>
            {briefError && <span className="btn-error-msg" title={briefError}>{briefError}</span>}
            {briefDocUrl && <a className="btn-doc-link" href={briefDocUrl} target="_blank" rel="noreferrer">{t('card.openDoc')} <span className="mirror" aria-hidden="true">→</span></a>}
          </div>
          <div className="btn-action-wrap">
            <button
              className={`btn-pdf ${pdfStatus === 'saved' ? 'saved' : pdfStatus === 'error' ? 'error' : ''}`}
              onClick={savePdf}
              disabled={pdfStatus === 'loading'}
            >
              {pdfStatus === 'loading' ? 'Saving...' :
               pdfStatus === 'saved' ? 'Saved ✓' :
               pdfStatus === 'error' ? 'Error ✕' :
               'PDF'}
            </button>
            {pdfError && <span className="btn-error-msg" title={pdfError}>{pdfError}</span>}
          </div>
        </div>

        <div className="footer-center">
          <label className="quick-check footer-check">
            <input type="checkbox" checked={show.invoice || false} onChange={() => toggleField('invoice')} />
            {t('card.invoice')}
          </label>
          <label className="quick-check footer-check">
            <input type="checkbox" checked={show.receipt || false} onChange={toggleReceipt} />
            {t('card.receipt')}
          </label>
        </div>
      </div>

    </div>
  );
}

function Field({ label, value, inPdf, onTogglePdf, multiline }) {
  const { t } = useT();
  return (
    <div className="detail-field">
      <div className="field-label-row">
        <span className="field-label">{label}</span>
        {onTogglePdf !== undefined && (
          <label className="pdf-toggle" title={t('card.showInSheet')}>
            <input type="checkbox" checked={inPdf} onChange={onTogglePdf} />
            <span className="pdf-toggle-text">{t('card.pdf')}</span>
          </label>
        )}
      </div>
      {/* Multi-line values (schedule, contacts, notes, guest list) mix languages
          line by line, so one direction for the whole block is always wrong for
          some of it. .bidi-lines applies unicode-bidi: plaintext, which resolves
          each line independently — that is what makes "18:15 הגעת צוות טכני"
          read RTL even though it opens with digits. Single-line values keep
          dir="auto", where first-strong is the right call. */}
      <span
        className={`field-value${multiline ? ' bidi-lines' : ''}`}
        dir={multiline ? undefined : 'auto'}
        style={multiline ? { whiteSpace: 'pre-line' } : undefined}
      >{value || '—'}</span>
    </div>
  );
}

export default ShowCard;
