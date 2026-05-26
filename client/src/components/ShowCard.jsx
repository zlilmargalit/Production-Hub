import { useState } from 'react';
import TaskManager from './TaskManager';

function ShowCard({ show, crew, fieldTemplates, onEdit, onDelete, onUpdateShow }) {
  const [expanded, setExpanded] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [briefStatus, setBriefStatus] = useState(null);
  const [pdfStatus, setPdfStatus] = useState(null);

  const assignedCrew = (crew || []).filter((m) => (show.crewIds || []).includes(m.id));
  const musicians = assignedCrew
    .filter((m) => m.role === 'נגן')
    .map((m) => m.name)
    .join(' | ');
  // Technical crew display — always exclude musicians, built from live crewIds
  const techCrewDisplay = assignedCrew.length > 0
    ? assignedCrew.filter((m) => m.role !== 'נגן').map((m) => `${m.role} – ${m.name}`).join(' | ')
    : show.technicalCrew;

  // Custom field definitions for this show's event type
  const customDefs = (show.eventType && fieldTemplates?.[show.eventType]) || [];

  const formatDate = (d) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const toggleField = (field) => {
    onUpdateShow(show.id, { ...show, [field]: !show[field] });
  };

  // PDF toggle logic:
  // Standard fields default to true (appear in PDF unless explicitly set to false)
  // Image-type custom fields default to true (show image by default)
  // Other custom fields (cf_*) default to false (hidden unless explicitly set to true)
  const isPdfOn = (key) => {
    // check_ items and non-standard fields default to OFF (must be explicitly enabled)
    if (key.startsWith('check_')) return show.pdfFields?.[key] === true;
    if (!key.startsWith('cf_')) return show.pdfFields?.[key] !== false;
    const defId = key.slice(3);
    const def = customDefs.find((d) => d.id === defId);
    if (def?.type === 'image') return show.pdfFields?.[key] !== false; // image: default on
    return show.pdfFields?.[key] === true; // other custom fields: default off
  };

  const togglePdf = (key) => {
    const current = isPdfOn(key);
    onUpdateShow(show.id, {
      ...show,
      pdfFields: { ...(show.pdfFields || {}), [key]: !current },
    });
  };

  const createBrief = async () => {
    setBriefStatus('loading');
    try {
      const res = await fetch(`/api/shows/${show.id}/brief`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setBriefStatus('sent');
        if (data.docUrl) window.open(data.docUrl, '_blank');
      } else {
        setBriefStatus('error');
      }
      setTimeout(() => setBriefStatus(null), 4000);
    } catch {
      setBriefStatus('error');
      setTimeout(() => setBriefStatus(null), 4000);
    }
  };

  const savePdf = async () => {
    setPdfStatus('loading');
    try {
      const res = await fetch(`/api/shows/${show.id}/pdf`, { method: 'POST' });
      if (!res.ok) { setPdfStatus('error'); setTimeout(() => setPdfStatus(null), 4000); return; }
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/pdf')) {
        // Cloud mode: stream as download
        const blob = await res.blob();
        const cd = res.headers.get('content-disposition') || '';
        const nameMatch = cd.match(/filename\*=UTF-8''(.+)/i) || cd.match(/filename="?([^"]+)"?/i);
        const fname = nameMatch ? decodeURIComponent(nameMatch[1]) : 'coordination-sheet.pdf';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = fname; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setPdfStatus('saved');
      setTimeout(() => setPdfStatus(null), 4000);
    } catch {
      setPdfStatus('error');
      setTimeout(() => setPdfStatus(null), 4000);
    }
  };

  return (
    <div className={`show-card ${show.invoice || show.archived ? 'archived' : ''}`}>
      <div className="show-card-header">
        <div className="show-card-title">
          <h2 dir="rtl">{show.name}</h2>
          <div className="show-meta">
            {show.eventType && <span className="tag" dir="auto">{show.eventType}</span>}
            {show.date && <span className="meta-item">{formatDate(show.date)}</span>}
            {show.venue && <span className="meta-item meta-sep" dir="auto">{show.venue}</span>}
            {show.invoice && <span className="badge badge-invoice">Invoice</span>}
            {show.receipt && <span className="badge badge-receipt">Receipt</span>}
            {(show.archived && !show.invoice) && <span className="badge badge-archive">Archive</span>}
          </div>
        </div>
        <div className="show-actions">
          <button className="btn-icon" onClick={() => setExpanded(!expanded)} title={expanded ? 'Collapse' : 'Expand'}>
            {expanded ? '−' : '+'}
          </button>
          <button className="btn-icon" onClick={() => onEdit(show)} title="Edit">✎</button>
          <button className="btn-icon btn-danger" onClick={() => onDelete(show.id)} title="Delete">✕</button>
        </div>
      </div>

      {expanded && (
        <div className="show-details">
          <div className="details-grid">
            <Field label="Address" value={show.address} inPdf={isPdfOn('address')} onTogglePdf={() => togglePdf('address')} />
            <Field label="Parking" value={show.parking} inPdf={isPdfOn('parking')} onTogglePdf={() => togglePdf('parking')} />
            <Field label="Technical Crew" value={techCrewDisplay} inPdf={isPdfOn('technicalCrew')} onTogglePdf={() => togglePdf('technicalCrew')} />
            {musicians && <Field label="הרכב" value={musicians} inPdf={isPdfOn('musicians')} onTogglePdf={() => togglePdf('musicians')} />}
            <Field label="Transportation" value={show.transportation} inPdf={isPdfOn('transportation')} onTogglePdf={() => togglePdf('transportation')} />
            <Field label="Contacts" value={show.contacts} inPdf={isPdfOn('contacts')} onTogglePdf={() => togglePdf('contacts')} />
            {show.food && <Field label="Food" value={show.food} inPdf={isPdfOn('food')} onTogglePdf={() => togglePdf('food')} />}
            <Field label="Venue Contact" value={show.venueContact} inPdf={isPdfOn('venueContact')} onTogglePdf={() => togglePdf('venueContact')} />
          </div>

          {assignedCrew.filter((m) => m.role !== 'נגן').length > 0 && (
            <div className="detail-full">
              <strong>Crew</strong>
              <div className="crew-chips">
                {assignedCrew.filter((m) => m.role !== 'נגן').map((m) => (
                  <div key={m.id} className="crew-chip">
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
                <label className="pdf-toggle" title="Show in coordination sheet">
                  <input type="checkbox" checked={isPdfOn('schedule')} onChange={() => togglePdf('schedule')} />
                  <span className="pdf-toggle-text">PDF</span>
                </label>
              </div>
              <pre dir="rtl">{show.schedule}</pre>
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
            {show.additionalDetails && <p dir="rtl" style={{ marginBottom: 8 }}>{show.additionalDetails}</p>}
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

          {/* Custom fields from event type template */}
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
              <p dir="rtl">{show.notes}</p>
            </div>
          )}
        </div>
      )}

      <div className="show-card-footer">
        {/* Document actions — Brief + PDF are related */}
        <button
          className={`btn-brief ${briefStatus === 'sent' ? 'sent' : briefStatus === 'error' ? 'error' : ''}`}
          onClick={createBrief}
          disabled={briefStatus === 'loading'}
        >
          {briefStatus === 'loading' ? 'Sending...' :
           briefStatus === 'sent' ? 'Sent ✓' :
           briefStatus === 'error' ? 'Error' :
           'Brief'}
        </button>
        <button
          className={`btn-pdf ${pdfStatus === 'saved' ? 'saved' : pdfStatus === 'error' ? 'error' : ''}`}
          onClick={savePdf}
          disabled={pdfStatus === 'loading'}
        >
          {pdfStatus === 'loading' ? 'Saving...' :
           pdfStatus === 'saved' ? 'Saved ✓' :
           pdfStatus === 'error' ? 'Error' :
           'PDF'}
        </button>

        {/* Spacer L */}
        <div style={{ flex: 1 }} />

        {/* Center: status checkboxes */}
        <div className="quick-checks">
          <label className="quick-check">
            <input type="checkbox" checked={show.invoice || false} onChange={() => toggleField('invoice')} />
            Invoice
          </label>
          <label className="quick-check">
            <input type="checkbox" checked={show.receipt || false} onChange={() => toggleField('receipt')} />
            Receipt
          </label>
        </div>

        {/* Spacer R */}
        <div style={{ flex: 1 }} />

        {/* Far right: Logistics */}
        <button
          className={`btn-tasks ${showTasks ? 'active' : ''}`}
          onClick={() => setShowTasks(!showTasks)}
        >
          Logistics
        </button>
      </div>

      {showTasks && <TaskManager show={show} onUpdate={onUpdateShow} />}
    </div>
  );
}

function Field({ label, value, inPdf, onTogglePdf }) {
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
      <span className="field-value" dir="auto">{value || '—'}</span>
    </div>
  );
}

export default ShowCard;
