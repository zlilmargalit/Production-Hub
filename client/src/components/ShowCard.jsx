import { useState } from 'react';
import TaskManager from './TaskManager';
import TechnicalManager from './TechnicalManager';
import { etColorIdx } from '../utils/etColor';
import { scheduleToString } from '../utils/schedule';

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
const calcProgress = (show) => {
  const sched = typeof show.schedule === 'string' ? show.schedule : scheduleToString(show.schedule || '');
  const checks = [!!sched, (show.crewIds || []).length > 0, !!show.venue, !!show.contacts, !!show.address];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
};

function ProgressBar({ pct }) {
  if (!pct) return null;
  const col = pct === 100 ? '#4E7265' : pct >= 60 ? '#3852B4' : '#F08D39';
  return (
    <div className="show-progress">
      <div className="show-progress-track">
        <div className="show-progress-fill" style={{ width: `${pct}%`, background: col }} />
      </div>
      <span className="show-progress-pct" style={{ color: col }}>{pct}%</span>
    </div>
  );
}

function ShowCard({ show, crew, fieldTemplates, onEdit, onDelete, onUpdateShow, artistId }) {
  const [expanded, setExpanded] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [showTech, setShowTech] = useState(false);
  const [briefStatus, setBriefStatus] = useState(null);
  const [pdfStatus, setPdfStatus] = useState(null);
  const [briefError, setBriefError] = useState(null);
  const [pdfError, setPdfError] = useState(null);
  const [calStatus, setCalStatus] = useState(null); // null | 'loading' | 'done' | 'error'
  const [calMsg, setCalMsg] = useState(null);

  const assignedCrew = (crew || []).filter((m) => (show.crewIds || []).includes(m.id));
  const timeRange    = getTimeRange(show.schedule);
  const progress     = calcProgress(show);
  const MUSICIAN_ROLES = new Set(['Musician', 'Musicians', 'נגן', 'נגנים']);
  const musicians = assignedCrew
    .filter((m) => MUSICIAN_ROLES.has(m.role))
    .map((m) => m.name)
    .join(' | ');
  const TECH_ROLES = ['סאונד', 'תאורה', 'הפקה'];
  const techCrewDisplay = assignedCrew.length > 0
    ? assignedCrew.filter((m) => TECH_ROLES.includes(m.role)).map((m) => `${m.role} – ${m.name}`).join(' | ')
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
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    try {
      const res  = await fetch(`/api/shows/${show.id}/brief${qs}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBriefStatus('error');
        setBriefError(data.error || 'Brief creation failed');
        setTimeout(() => { setBriefStatus(null); setBriefError(null); }, 4000);
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
            setBriefStatus('sent');
            if (sd.docUrl) window.open(sd.docUrl, '_blank');
            setTimeout(() => { setBriefStatus(null); setBriefError(null); }, 3000);
            return;
          }
          if (sd.status === 'error') {
            setBriefStatus('error');
            setBriefError(sd.error || 'Brief creation failed');
            setTimeout(() => { setBriefStatus(null); setBriefError(null); }, 4000);
            return;
          }
        } catch {
          // transient network error — keep polling
        }
        await delay(2000);
      }
      // timed out
      setBriefStatus('error');
      setBriefError('Timed out — check Google Drive in a few minutes');
      setTimeout(() => { setBriefStatus(null); setBriefError(null); }, 5000);
    } catch (e) {
      setBriefStatus('error');
      setBriefError(e.message || 'Network error');
      setTimeout(() => { setBriefStatus(null); setBriefError(null); }, 4000);
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

  return (
    <div className={`show-card ${show.receipt || show.archived ? 'archived' : ''}`} data-event-type={show.eventType || ''} data-et-idx={etIdx}>
      <div className="show-card-band" />
      <div className={`show-card-header${expanded ? ' show-card-header--sticky' : ''}`}>
        <div className="show-card-top-row">
          {show.eventType && <div className="show-card-type" dir="auto">{show.eventType}</div>}
          <div className="show-actions">
            <button className="btn-action" onClick={() => setExpanded(!expanded)} title={expanded ? 'Collapse' : 'Expand'}>
              {expanded ? '−' : '+'}
            </button>
            <button className="btn-action" onClick={() => onEdit(show)}>Edit</button>
            <button className="btn-action btn-action--danger" onClick={() => onDelete(show.id)}>Delete</button>
          </div>
        </div>
        <h2 lang={isHebrew} dir={isHebrew === 'he' ? 'rtl' : 'ltr'}>{show.name}</h2>
        <div className="show-meta">
          {show.date && <span className="meta-date">{formatDate(show.date)}</span>}
          {show.venue && <><span className="meta-dot">·</span><span className="meta-item" dir="auto">{show.venue}</span></>}
          {timeRange && (
            <><span className="meta-dot">·</span><span className="meta-time">{timeRange}</span></>
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
                {assignedCrew.length} crew
              </span>
            </>
          )}
          {show.invoice && <span className="badge badge-invoice">Invoice</span>}
          {show.receipt && <span className="badge badge-receipt">Receipt</span>}
          {(show.archived && !show.invoice) && <span className="badge badge-archive">Archive</span>}
        </div>
        <ProgressBar pct={progress} />
      </div>

      {expanded && (
        <div className="show-details">
          <div className="details-grid">
            <Field label="Address" value={show.address} inPdf={isPdfOn('address')} onTogglePdf={() => togglePdf('address')} />
            <Field label="Parking" value={show.parking} inPdf={isPdfOn('parking')} onTogglePdf={() => togglePdf('parking')} />
            <Field label="Technical Crew" value={techCrewDisplay} inPdf={isPdfOn('technicalCrew')} onTogglePdf={() => togglePdf('technicalCrew')} />
            {musicians && <Field label="Musicians" value={musicians} inPdf={isPdfOn('musicians')} onTogglePdf={() => togglePdf('musicians')} />}
            <Field label="Transportation" value={show.transportation} inPdf={isPdfOn('transportation')} onTogglePdf={() => togglePdf('transportation')} />
            <Field label="Contacts" value={show.contacts} multiline inPdf={isPdfOn('contacts')} onTogglePdf={() => togglePdf('contacts')} />

          </div>

          {assignedCrew.filter((m) => !MUSICIAN_ROLES.has(m.role)).length > 0 && (
            <div className="detail-full">
              <strong>Crew</strong>
              <div className="crew-chips">
                {assignedCrew.filter((m) => !MUSICIAN_ROLES.has(m.role)).map((m) => (
                  <div key={m.id} className="crew-chip">
                    <span className="crew-chip-avatar" style={{ background: colorFor(m.id) }}>{initialsFor(m.name)}</span>
                    <span className="crew-chip-name">{m.name}</span>
                    {m.role && <span className="crew-chip-role">{m.role}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {show.schedule && (
            <div className="detail-full">
              <div className="field-label-row">
                <strong>Schedule</strong>
                <div className="field-label-row-actions">
                  <label className="pdf-toggle" title="Show in coordination sheet">
                    <input type="checkbox" checked={isPdfOn('schedule')} onChange={() => togglePdf('schedule')} />
                    <span className="pdf-toggle-text">PDF</span>
                  </label>
                  <button
                    className={`btn-cal-export ${calStatus === 'done' ? 'done' : calStatus === 'error' ? 'error' : ''}`}
                    onClick={exportToCalendar}
                    disabled={calStatus === 'loading'}
                    title="Create / update Google Calendar event with this schedule and crew invites"
                  >
                    {calStatus === 'loading' ? 'Syncing…' : calStatus === 'done' ? '✓ Cal' : calStatus === 'error' ? '✕ Cal' : 'Export to Cal'}
                  </button>
                </div>
              </div>
              {calMsg && <p className={`cal-export-msg ${calStatus}`}>{calMsg}</p>}
              <pre dir="auto">{scheduleToString(show.schedule)}</pre>
            </div>
          )}

          <div className="detail-full">
            <div className="field-label-row">
              <strong>Additional Details</strong>
              {show.additionalDetails && (
                <label className="pdf-toggle" title="Show in coordination sheet">
                  <input type="checkbox" checked={isPdfOn('additionalDetails')} onChange={() => togglePdf('additionalDetails')} />
                  <span className="pdf-toggle-text">PDF</span>
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
                  <label className="pdf-toggle" title="Show in coordination sheet">
                    <input type="checkbox" checked={show.pdfFields?.check_piano === true} onChange={() => togglePdf('check_piano')} />
                    <span className="pdf-toggle-text">PDF</span>
                  </label>
                </div>
              )}
              <div className="check-pdf-pair">
                <label className="quick-check">
                  <input type="checkbox" checked={show.mirror || false} onChange={() => toggleField('mirror')} />
                  מראת גוף
                </label>
                <label className="pdf-toggle" title="Show in coordination sheet">
                  <input type="checkbox" checked={show.pdfFields?.check_mirror === true} onChange={() => togglePdf('check_mirror')} />
                  <span className="pdf-toggle-text">PDF</span>
                </label>
              </div>
              <div className="check-pdf-pair">
                <label className="quick-check">
                  <input type="checkbox" checked={show.coffeeCorner || false} onChange={() => toggleField('coffeeCorner')} />
                  פינת קפה
                </label>
                <label className="pdf-toggle" title="Show in coordination sheet">
                  <input type="checkbox" checked={show.pdfFields?.check_coffeeCorner === true} onChange={() => togglePdf('check_coffeeCorner')} />
                  <span className="pdf-toggle-text">PDF</span>
                </label>
              </div>
              <div className="check-pdf-pair">
                <label className="quick-check">
                  <input type="checkbox" checked={show.waterBottles || false} onChange={() => toggleField('waterBottles')} />
                  בקבוקי מים
                </label>
                <label className="pdf-toggle" title="Show in coordination sheet">
                  <input type="checkbox" checked={show.pdfFields?.check_waterBottles === true} onChange={() => togglePdf('check_waterBottles')} />
                  <span className="pdf-toggle-text">PDF</span>
                </label>
              </div>
            </div>
          </div>

          {customDefs.length > 0 && (
            <div className="detail-full">
              <strong>Custom Fields</strong>
              <div className="custom-fields-grid">
                {customDefs.map((def) => {
                  const val = show.customFields?.[def.id];
                  const cfKey = 'cf_' + def.id;
                  return (
                    <div key={def.id} className="custom-field-display">
                      <div className="field-label-row">
                        <span className="field-label">{def.label}</span>
                        <label className="pdf-toggle" title="Show in coordination sheet">
                          <input
                            type="checkbox"
                            checked={isPdfOn(cfKey)}
                            onChange={() => togglePdf(cfKey)}
                          />
                          <span className="pdf-toggle-text">PDF</span>
                        </label>
                      </div>
                      {def.type === 'image' && val ? (
                        val?.isPdf ? (
                          <a href={val.data} download={val.name} className="file-download-link" onClick={(e) => e.stopPropagation()}>
                            📎 {val.name}
                          </a>
                        ) : val?._hasData && !val?.data ? (
                          <span className="file-download-link">📎 Image attached</span>
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
                        <span className="field-value">{val ? '✓ כן' : '✕ לא'}</span>
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
                <strong>Notes</strong>
                <label className="pdf-toggle" title="Show in coordination sheet">
                  <input type="checkbox" checked={isPdfOn('notes')} onChange={() => togglePdf('notes')} />
                  <span className="pdf-toggle-text">PDF</span>
                </label>
              </div>
              <p dir="auto">{show.notes}</p>
            </div>
          )}

          {/* ── Technical + Logistics inside accordion ── */}
          <div className="show-expand-section">
            <div className="show-expand-eyebrow">Expand section</div>
            <div className="show-expand-toggle">
              <button
                className={`show-expand-btn${showTech ? ' active' : ''}`}
                onClick={() => { setShowTech((p) => !p); if (showTasks) setShowTasks(false); }}
              >Technical</button>
              <button
                className={`show-expand-btn${showTasks ? ' active' : ''}`}
                onClick={() => { setShowTasks((p) => !p); if (showTech) setShowTech(false); }}
              >Logistics</button>
            </div>
            {showTech && <div className="show-expand-panel"><TechnicalManager show={show} onUpdate={onUpdateShow} /></div>}
            {showTasks && (
              <div className="show-expand-panel hub-panel" aria-label="Production Hub — internal">
                <div className="hub-header">
                  <div className="hub-header-text">
                    <div className="hub-eyebrow">Internal</div>
                    <div className="hub-heading">Production Hub</div>
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
            Invoice
          </label>
          <label className="quick-check footer-check">
            <input type="checkbox" checked={show.receipt || false} onChange={toggleReceipt} />
            Receipt
          </label>
        </div>
      </div>

    </div>
  );
}

function Field({ label, value, inPdf, onTogglePdf, multiline }) {
  return (
    <div className="detail-field">
      <div className="field-label-row">
        <span className="field-label">{label}</span>
        {onTogglePdf !== undefined && (
          <label className="pdf-toggle" title="Show in coordination sheet">
            <input type="checkbox" checked={inPdf} onChange={onTogglePdf} />
            <span className="pdf-toggle-text">PDF</span>
          </label>
        )}
      </div>
      <span
        className="field-value"
        dir="auto"
        style={multiline ? { whiteSpace: 'pre-line' } : undefined}
      >{value || '—'}</span>
    </div>
  );
}

export default ShowCard;
