import { useState, useCallback, useRef, useEffect } from 'react';
import { parseScheduleRows, scheduleToString } from '../utils/schedule';

function compressImage(dataUrl, maxWidth = 1200, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

const BLANK = {
  name: '', date: '', eventType: '', venue: '', address: '',
  parking: '', transportation: '', additionalDetails: '',
  contacts: '', notes: '', invoice: false, receipt: false, archived: false,
  crewIds: [], scheduleRows: [], guestList: [], customFields: {}, pdfFields: {},
};

// ── Group color for crew dot in chips ──────────────────────────────────────
const _GROUP_PALETTE = ['#3852B4', '#C26C1F', '#4E7265', '#7C3A5E', '#1F2D6E', '#B07729'];
function groupColorFor(role) {
  const k = (role || '').toLowerCase();
  if (k.includes('backline') || k.includes('בקלי')) return '#3852B4';
  if (k.includes('production') || k.includes('הפקה')) return '#C26C1F';
  if (k.includes('musician') || k.includes('נגן')) return '#4E7265';
  if (k.includes('sound') || k.includes('סאונד')) return '#C38B86';
  if (k.includes('lighting') || k.includes('תאורה')) return '#7C3A5E';
  return _GROUP_PALETTE[(role || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % _GROUP_PALETTE.length];
}

function buildCrewText(crewIds, crew) {
  return crewIds
    .map((id) => crew.find((m) => m.id === id))
    .filter(Boolean)
    .map((m) => `${m.role} – ${m.name}`)
    .join(' | ');
}

const SECTIONS = [
  { id: 'basics',    label: 'Basics' },
  { id: 'brief',     label: 'Brief Content' },
  { id: 'logistics', label: 'Logistics' },
  { id: 'crew',      label: 'Crew' },
  { id: 'custom',    label: 'Custom' },
];

function isRehearsal(eventType) {
  const t = (eventType || '').toLowerCase();
  return t.includes('חזרה') || t.includes('rehearsal');
}

function hasSectionFlag(sectionId, form) {
  if (sectionId === 'basics')    return !form.name || !form.date;
  if (sectionId === 'brief')     return form.scheduleRows.length === 0;
  return false;
}

function sectionCount(sectionId, form) {
  if (sectionId === 'crew')      return form.crewIds.length || null;
  if (sectionId === 'logistics') return form.guestList?.length || null;
  if (sectionId === 'custom')    return Object.keys(form.customFields || {}).filter((k) => form.customFields[k]).length || null;
  return null;
}

export default function ShowForm({ show, crew, templates, fieldTemplates, eventTypes, onSubmit, onClose }) {
  const formRef = useRef(null);
  const sectionRefs = useRef({});
  const schedTimeRefs     = useRef([]);
  const schedActivityRefs = useRef([]);
  const schedDragIdx      = useRef(null);
  const [schedDragOver,   setSchedDragOver] = useState(null);

  const initialScheduleRows = show
    ? parseScheduleRows(show.schedule)
    : [];

  const [form, setForm] = useState(
    show
      ? {
          name: show.name || '',
          date: show.date || '',
          eventType: show.eventType || '',
          venue: show.venue || '',
          address: show.address || '',
          parking: show.parking || '',
          transportation: show.transportation || '',
          additionalDetails: show.additionalDetails || '',
          contacts: show.contacts || '',
          notes: show.notes || '',
          invoice: show.invoice || false,
          receipt: show.receipt || false,
          archived: show.archived || false,
          crewIds: show.crewIds || [],
          scheduleRows: initialScheduleRows,
          guestList: show.guestList || [],
          customFields: show.customFields || {},
          pdfFields: show.pdfFields || {},
        }
      : { ...BLANK }
  );

  const [activeSection, setActiveSection] = useState('basics');

  const set = (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [e.target.name]: val }));
  };

  const handleEventTypeChange = (e) => {
    const et = e.target.value;
    const templateIds = (templates && templates[et]) || [];
    const crewText = buildCrewText(templateIds, crew || []);
    setForm((f) => ({
      ...f,
      eventType: et,
      crewIds: templateIds,
      technicalCrew: crewText || f.technicalCrew,
    }));
  };

  const toggleCrew = (id) => {
    setForm((f) => {
      const newIds = f.crewIds.includes(id)
        ? f.crewIds.filter((x) => x !== id)
        : [...f.crewIds, id];
      return { ...f, crewIds: newIds };
    });
  };

  // Schedule row helpers
  const addScheduleRow = () => {
    const newIdx = form.scheduleRows.length;
    setForm((f) => ({ ...f, scheduleRows: [...f.scheduleRows, { time: '', activity: '' }] }));
    // Focus the time cell of the new row after React re-renders
    setTimeout(() => { schedTimeRefs.current[newIdx]?.focus(); }, 0);
  };
  const updateScheduleRow = (idx, field, value) =>
    setForm((f) => {
      const rows = f.scheduleRows.map((r, i) => i === idx ? { ...r, [field]: value } : r);
      return { ...f, scheduleRows: rows };
    });
  const removeScheduleRow = (idx) =>
    setForm((f) => ({ ...f, scheduleRows: f.scheduleRows.filter((_, i) => i !== idx) }));

  const onSchedDragStart = (e, idx) => {
    schedDragIdx.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  };
  const onSchedDragOver = (e, idx) => {
    e.preventDefault();
    setSchedDragOver(idx);
  };
  const onSchedDrop = (e, idx) => {
    e.preventDefault();
    const from = schedDragIdx.current;
    if (from === null || from === idx) { setSchedDragOver(null); return; }
    setForm((f) => {
      const rows = [...f.scheduleRows];
      const [moved] = rows.splice(from, 1);
      rows.splice(idx, 0, moved);
      return { ...f, scheduleRows: rows };
    });
    schedDragIdx.current = null;
    setSchedDragOver(null);
  };
  const onSchedDragEnd = () => {
    schedDragIdx.current = null;
    setSchedDragOver(null);
  };

  const schedKeyDown = (e, idx, col) => {
    const total = form.scheduleRows.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (idx < total - 1) {
        (col === 'time' ? schedTimeRefs : schedActivityRefs).current[idx + 1]?.focus();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (idx > 0) {
        (col === 'time' ? schedTimeRefs : schedActivityRefs).current[idx - 1]?.focus();
      }
    } else if (e.key === 'ArrowRight' && col === 'time') {
      const el = schedTimeRefs.current[idx];
      if (el && el.selectionStart === el.value.length) {
        e.preventDefault();
        schedActivityRefs.current[idx]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && col === 'activity') {
      const el = schedActivityRefs.current[idx];
      if (el && el.selectionStart === 0) {
        e.preventDefault();
        schedTimeRefs.current[idx]?.focus();
      }
    }
  };

  // Guest list helpers
  const addGuest = () =>
    setForm((f) => ({ ...f, guestList: [...(f.guestList || []), { name: '', notes: '' }] }));
  const updateGuest = (idx, field, value) =>
    setForm((f) => {
      const gl = (f.guestList || []).map((g, i) => i === idx ? { ...g, [field]: value } : g);
      return { ...f, guestList: gl };
    });
  const removeGuest = (idx) =>
    setForm((f) => ({ ...f, guestList: (f.guestList || []).filter((_, i) => i !== idx) }));

  const setCustomField = (id, value) =>
    setForm((f) => ({ ...f, customFields: { ...f.customFields, [id]: value } }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      schedule: scheduleToString(form.scheduleRows),
      scheduleRows: form.scheduleRows,
    };
    onSubmit(payload);
  };

  // Scroll-spy: update activeSection on form scroll
  useEffect(() => {
    const formEl = formRef.current;
    if (!formEl) return;
    const onScroll = () => {
      const y = formEl.scrollTop + 80;
      let current = 'basics';
      for (const s of SECTIONS) {
        const el = sectionRefs.current[s.id];
        if (el && el.offsetTop <= y) current = s.id;
      }
      setActiveSection(current);
    };
    formEl.addEventListener('scroll', onScroll, { passive: true });
    return () => formEl.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (sectionId) => {
    const el = sectionRefs.current[sectionId];
    const formEl = formRef.current;
    if (el && formEl) {
      formEl.scrollTo({ top: el.offsetTop - 26, behavior: 'smooth' });
    }
  };

  const crewByRole = (crew || []).reduce((acc, m) => {
    const r = m.role || '';
    if (!acc[r]) acc[r] = [];
    acc[r].push(m);
    return acc;
  }, {});
  const sortedRoles = Object.keys(crewByRole).sort((a, b) => a.localeCompare(b, 'he'));
  const customDefs = (form.eventType && fieldTemplates?.[form.eventType]) || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="sf-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="sf-head">
          <div className="sf-head-title">
            <span className="sf-eyebrow">{show ? 'EDIT SHOW' : 'NEW SHOW'}</span>
            <h2 className="sf-title" dir="auto">{form.name || 'Untitled Show'}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div className="sf-body">

          {/* Left rail */}
          <nav className="sf-rail">
            {SECTIONS.map((s) => {
              const flagged = hasSectionFlag(s.id, form);
              const count   = sectionCount(s.id, form);
              return (
                <button
                  key={s.id}
                  type="button"
                  className={[
                    'sf-rail-link',
                    activeSection === s.id ? 'active' : '',
                    flagged ? 'flagged' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => scrollTo(s.id)}
                >
                  <span className="sf-rail-dot" />
                  {s.label}
                  {count != null && <span className="sf-rail-count">{count}</span>}
                </button>
              );
            })}
            <div className="sf-rail-spacer" />
            {show?.updatedAt && (
              <div className="sf-rail-meta">
                <b>Last saved</b> {new Date(show.updatedAt).toLocaleDateString()}
              </div>
            )}
          </nav>

          {/* Scrollable form */}
          <form ref={formRef} className="sf-form" onSubmit={handleSubmit}>

            {/* BASICS */}
            <section ref={(el) => { sectionRefs.current.basics = el; }} className="sf-section" id="sf-basics">
              <div className="sf-sec-head">
                Basics
                <span className="sf-sec-sub">show name · date · type · venue</span>
              </div>
              <div className="sf-grid2">
                <div className="sf-field full">
                  <label>Show Name <span className="sf-req">*</span></label>
                  <input dir="auto" name="name" value={form.name} onChange={set} required placeholder="Show or event name" className="sf-inp" />
                </div>
                <div className="sf-field">
                  <label>Date <span className="sf-req">*</span></label>
                  <input type="date" name="date" value={form.date} onChange={set} className="sf-inp" />
                </div>
                <div className="sf-field">
                  <label>Event Type</label>
                  <select name="eventType" value={form.eventType} onChange={handleEventTypeChange} className="sf-inp">
                    <option value="">Select type…</option>
                    {(eventTypes || []).map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="sf-field">
                  <label>Venue</label>
                  <input dir="auto" name="venue" value={form.venue} onChange={set} placeholder="Hall / stage name" className="sf-inp" />
                </div>
                <div className="sf-field">
                  <label>Address</label>
                  <input dir="auto" name="address" value={form.address} onChange={set} placeholder="Street, City" className="sf-inp" />
                </div>
              </div>
            </section>

            {/* BRIEF CONTENT */}
            <section ref={(el) => { sectionRefs.current.brief = el; }} className="sf-section" id="sf-brief">
              <div className="sf-sec-head">
                Brief Content
                <span className="sf-sec-sub">schedule · contacts · notes</span>
              </div>

              {/* Structured schedule */}
              <div className="sf-field full" style={{ marginBottom: 20 }}>
                <label>Schedule</label>
                {form.scheduleRows.map((row, idx) => (
                  <div
                    key={idx}
                    className={`sf-sched-row${schedDragOver === idx ? ' sf-sched-drop-target' : ''}`}
                    draggable
                    onDragStart={(e) => onSchedDragStart(e, idx)}
                    onDragOver={(e) => onSchedDragOver(e, idx)}
                    onDrop={(e) => onSchedDrop(e, idx)}
                    onDragEnd={onSchedDragEnd}
                  >
                    <span className="sf-sched-handle" title="Drag to reorder">⠿</span>
                    <input
                      type="text"
                      className="sf-inp sf-sched-time"
                      value={row.time}
                      onChange={(e) => updateScheduleRow(idx, 'time', e.target.value)}
                      onKeyDown={(e) => schedKeyDown(e, idx, 'time')}
                      placeholder="00:00"
                      ref={(el) => { schedTimeRefs.current[idx] = el; }}
                    />
                    <input
                      dir="rtl"
                      className="sf-inp sf-sched-activity"
                      value={row.activity}
                      onChange={(e) => updateScheduleRow(idx, 'activity', e.target.value)}
                      onKeyDown={(e) => schedKeyDown(e, idx, 'activity')}
                      placeholder="Activity…"
                      ref={(el) => { schedActivityRefs.current[idx] = el; }}
                    />
                    <button
                      type="button"
                      className="icon-btn danger sf-sched-del"
                      onClick={() => removeScheduleRow(idx)}
                      aria-label="Remove row"
                    >✕</button>
                  </div>
                ))}
                <button type="button" className="sf-sched-add" onClick={addScheduleRow}>
                  ＋ Add row
                </button>
              </div>

              {/* Contacts */}
              <div className="sf-field full" style={{ marginBottom: 20 }}>
                <label>Contacts</label>
                <textarea
                  dir="auto"
                  name="contacts"
                  value={form.contacts}
                  onChange={set}
                  placeholder="Name — Phone"
                  rows={3}
                  className="sf-inp sf-textarea"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) e.preventDefault(); }}
                />
              </div>

              {/* Additional Details */}
              <div className="sf-field full">
                <label>Additional Details</label>
                <textarea
                  dir="auto"
                  name="additionalDetails"
                  value={form.additionalDetails}
                  onChange={set}
                  rows={3}
                  placeholder="Notes, special requirements, equipment…"
                  className="sf-inp sf-textarea"
                />
              </div>
            </section>

            {/* LOGISTICS */}
            <section ref={(el) => { sectionRefs.current.logistics = el; }} className="sf-section" id="sf-logistics">
              <div className="sf-sec-head">
                Logistics
                <span className="sf-sec-sub">parking · transport · guests</span>
              </div>
              <div className="sf-grid2">
                <div className="sf-field">
                  <label>Parking</label>
                  <input dir="auto" name="parking" value={form.parking} onChange={set} placeholder="Parking details" className="sf-inp" />
                </div>
                <div className="sf-field">
                  <label>Transportation</label>
                  <input dir="auto" name="transportation" value={form.transportation} onChange={set} placeholder="Pickup time and details" className="sf-inp" />
                </div>
                <div className="sf-field full">
                  <label>Notes</label>
                  <textarea dir="auto" name="notes" value={form.notes} onChange={set} rows={2} placeholder="Internal notes…" className="sf-inp sf-textarea" />
                </div>
              </div>

              {/* Guest list — hidden for rehearsals */}
              {!isRehearsal(form.eventType) && (
                <div className="sf-field full" style={{ marginTop: 8 }}>
                  <label>
                    Guest List
                    {(form.guestList || []).length > 0 && (
                      <span className="sf-guest-count">{(form.guestList || []).length}</span>
                    )}
                  </label>
                  {(form.guestList || []).map((guest, idx) => (
                    <div key={idx} className="sf-guest-row">
                      <input
                        dir="auto"
                        className="sf-inp sf-guest-name"
                        value={guest.name}
                        onChange={(e) => updateGuest(idx, 'name', e.target.value)}
                        placeholder="Guest name…"
                      />
                      <input
                        dir="auto"
                        className="sf-inp sf-guest-notes"
                        value={guest.notes}
                        onChange={(e) => updateGuest(idx, 'notes', e.target.value)}
                        placeholder="Notes (optional)"
                      />
                      <button
                        type="button"
                        className="icon-btn danger sf-sched-del"
                        onClick={() => removeGuest(idx)}
                        aria-label="Remove guest"
                      >✕</button>
                    </div>
                  ))}
                  <button type="button" className="sf-sched-add" onClick={addGuest}>
                    ＋ Add guest
                  </button>
                </div>
              )}
            </section>

            {/* CREW */}
            <section ref={(el) => { sectionRefs.current.crew = el; }} className="sf-section" id="sf-crew">
              <div className="sf-sec-head">
                Crew
                <span className="sf-sec-sub">tap to toggle assignment</span>
              </div>
              <div className="sf-crew-wrap">
                {sortedRoles.map((role) =>
                  crewByRole[role].map((m) => {
                    const sel = form.crewIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={`sf-crew-chip${sel ? ' sel' : ''}`}
                        onClick={() => toggleCrew(m.id)}
                      >
                        <span className="sf-crew-dot" style={{ background: groupColorFor(m.role) }} />
                        {m.role} – {m.name}
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            {/* CUSTOM */}
            {customDefs.length > 0 && (
              <section ref={(el) => { sectionRefs.current.custom = el; }} className="sf-section" id="sf-custom">
                <div className="sf-sec-head">
                  Custom Fields
                  <span className="sf-sec-sub">{form.eventType}</span>
                </div>
                <div className="sf-grid2">
                  {customDefs.map((def) => (
                    <div key={def.id} className={`sf-field${def.type === 'textarea' ? ' full' : ''}`}>
                      <label dir="rtl">{def.label}</label>
                      {def.type === 'text' && (
                        <input dir="auto" className="sf-inp"
                          value={form.customFields?.[def.id] || ''}
                          onChange={(e) => setCustomField(def.id, e.target.value)}
                          placeholder={def.label} />
                      )}
                      {def.type === 'textarea' && (
                        <textarea dir="auto" className="sf-inp sf-textarea" rows={3}
                          value={form.customFields?.[def.id] || ''}
                          onChange={(e) => setCustomField(def.id, e.target.value)}
                          placeholder={def.label} />
                      )}
                      {def.type === 'checkbox' && (
                        <label className="checkbox-label" style={{ marginTop: 4 }}>
                          <input type="checkbox"
                            checked={form.customFields?.[def.id] || false}
                            onChange={(e) => setCustomField(def.id, e.target.checked)} />
                          {def.label}
                        </label>
                      )}
                      {def.type === 'image' && (
                        <div>
                          <input type="file" accept="image/*,.heic,.heif,application/pdf,.pdf"
                            className="custom-field-file"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = async (ev) => {
                                if (file.type === 'application/pdf') {
                                  setCustomField(def.id, { name: file.name, data: ev.target.result, isPdf: true });
                                } else {
                                  setCustomField(def.id, await compressImage(ev.target.result));
                                }
                              };
                              reader.readAsDataURL(file);
                            }} />
                          {form.customFields?.[def.id] && (
                            <div style={{ marginTop: 6 }}>
                              {form.customFields[def.id]?.isPdf ? (
                                <span style={{ fontSize: '0.85rem', color: 'var(--accent)' }}>
                                  {form.customFields[def.id].name}
                                </span>
                              ) : (
                                <img src={typeof form.customFields[def.id] === 'string' ? form.customFields[def.id] : form.customFields[def.id].data}
                                  alt={def.label}
                                  style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 4, objectFit: 'contain' }} />
                              )}
                              <button type="button" className="btn-icon btn-danger"
                                style={{ marginTop: 4, fontSize: '0.75rem', display: 'block' }}
                                onClick={() => setCustomField(def.id, null)}>Remove</button>
                            </div>
                          )}
                        </div>
                      )}
                      {def.type === 'file' && (
                        <div>
                          <input type="file" className="custom-field-file"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = (ev) => setCustomField(def.id, { name: file.name, data: ev.target.result });
                              reader.readAsDataURL(file);
                            }} />
                          {form.customFields?.[def.id] && (
                            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <a href={form.customFields[def.id].data} download={form.customFields[def.id].name} className="file-download-link">
                                {form.customFields[def.id].name}
                              </a>
                              <button type="button" className="btn-icon btn-danger" style={{ fontSize: '0.75rem' }}
                                onClick={() => setCustomField(def.id, null)}>✕</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* invisible submit target for Enter key */}
            <button type="submit" style={{ display: 'none' }} />
          </form>
        </div>

        {/* Footer */}
        <div className="sf-foot">
          <button type="button" className="btn ghost sz-md" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary sz-md" onClick={handleSubmit}>
            {show ? 'Save Changes' : 'Add Show'}
          </button>
        </div>

      </div>
    </div>
  );
}
