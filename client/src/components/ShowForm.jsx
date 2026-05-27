import { useState, useCallback } from 'react';

// Compress + resize an image data-URL to JPEG, max 1200px wide, 85% quality
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
    img.onerror = () => resolve(dataUrl); // fall back if format unsupported
    img.src = dataUrl;
  });
}

const BLANK = {
  name: '',
  date: '',
  eventType: '',
  venue: '',
  address: '',
  parking: '',
  technicalCrew: '',
  transportation: '',
  schedule: '',
  contacts: '',
  additionalDetails: '',
  food: '',
  notes: '',
  lightingCoordinated: false,
  soundCoordinated: false,
  rentalNeeds: '',
  rentalSupplier: '',
  invoice: false,
  receipt: false,
  archived: false,
  crewIds: [],
};


function buildCrewText(crewIds, crew) {
  return crewIds
    .map((id) => crew.find((m) => m.id === id))
    .filter(Boolean)
    .map((m) => `${m.role} – ${m.name}`)
    .join(' | ');
}

function ShowForm({ show, crew, templates, fieldTemplates, eventTypes, onSubmit, onClose }) {
  const [form, setForm] = useState(
    show
      ? {
          name: show.name || '',
          date: show.date || '',
          eventType: show.eventType || '',
          venue: show.venue || '',
          address: show.address || '',
          parking: show.parking || '',
          technicalCrew: show.technicalCrew || '',
          transportation: show.transportation || '',
          schedule: show.schedule || '',
          contacts: show.contacts || '',
          additionalDetails: show.additionalDetails || '',
          food: show.food || '',
          notes: show.notes || '',
          lightingCoordinated: show.lightingCoordinated || false,
          soundCoordinated: show.soundCoordinated || false,
          rentalNeeds: show.rentalNeeds || '',
          rentalSupplier: show.rentalSupplier || '',
          invoice: show.invoice || false,
          receipt: show.receipt || false,
          archived: show.archived || false,
          crewIds: show.crewIds || [],
          customFields: show.customFields || {},
          pdfFields: show.pdfFields || {},
        }
      : { ...BLANK, customFields: {}, pdfFields: {} }
  );

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
      return {
        ...f,
        crewIds: newIds,
        technicalCrew: buildCrewText(newIds, crew || []),
      };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  const allCrew = (crew || []).slice().sort((a, b) => (a.role || '').localeCompare(b.role || '', 'he'));
  const customDefs = (form.eventType && fieldTemplates?.[form.eventType]) || [];

  const setCustomField = (id, value) => {
    setForm((f) => ({ ...f, customFields: { ...f.customFields, [id]: value } }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{show ? 'Edit Show' : 'New Show'}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="show-form">
          <div className="form-grid">
            <div className="form-group span-2">
              <label>Show Name *</label>
              <input dir="auto" name="name" value={form.name} onChange={set} required placeholder="Show or event name" />
            </div>

            <div className="form-group">
              <label>Date</label>
              <input type="date" name="date" value={form.date} onChange={set} />
            </div>

            <div className="form-group">
              <label>Event Type</label>
              <select name="eventType" value={form.eventType} onChange={handleEventTypeChange}>
                <option value="">Select type...</option>
                {(eventTypes || []).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Venue</label>
              <input dir="auto" name="venue" value={form.venue} onChange={set} placeholder="Hall / stage name" />
            </div>

            <div className="form-group">
              <label>Address</label>
              <input dir="auto" name="address" value={form.address} onChange={set} placeholder="Street, City" />
            </div>

            <div className="form-group">
              <label>Parking</label>
              <input dir="auto" name="parking" value={form.parking} onChange={set} placeholder="Parking details" />
            </div>

            <div className="form-group">
              <label>Transportation</label>
              <input dir="auto" name="transportation" value={form.transportation} onChange={set} placeholder="Pickup time and details" />
            </div>

            <div className="form-group">
              <label>Food</label>
              <input dir="auto" name="food" value={form.food} onChange={set} placeholder="Catering / rider" />
            </div>

            {/* Crew Section */}
            {allCrew.length > 0 && (
              <div className="form-group span-2">
                <label>Crew</label>
                <div className="crew-pick-grid">
                  {allCrew.map((m) => (
                    <label key={m.id} className="crew-pick-row">
                      <input
                        type="checkbox"
                        checked={form.crewIds.includes(m.id)}
                        onChange={() => toggleCrew(m.id)}
                      />
                      <span className="crew-pick-name">{m.name}</span>
                      <span className="crew-pick-role">{m.role}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="form-group span-2">
              <label>Technical Crew (for brief)</label>
              <input
                dir="rtl"
                name="technicalCrew"
                value={form.technicalCrew}
                onChange={set}
                placeholder="הפקה – שם | סאונד – שם | בקליין – שם"
              />
              <span className="field-hint">Auto-filled from crew selection — edit freely</span>
            </div>

            <div className="form-group span-2">
              <label>Contacts</label>
              <input dir="auto" name="contacts" value={form.contacts} onChange={set} placeholder="Name — Phone" />
            </div>

            <div className="form-group span-2">
              <label>Schedule</label>
              <textarea
                dir="auto"
                name="schedule"
                value={form.schedule}
                onChange={set}
                rows={5}
                placeholder={'08:00 Arrive at venue\n09:00 Load-in & sound\n12:00 Sound check...'}
              />
            </div>

            <div className="form-group span-2">
              <label>Additional Details</label>
              <textarea
                dir="auto"
                name="additionalDetails"
                value={form.additionalDetails}
                onChange={set}
                rows={3}
                placeholder="Notes, special requirements, equipment..."
              />
            </div>

            <div className="form-group span-2">
              <label>Notes</label>
              <textarea
                dir="auto"
                name="notes"
                value={form.notes}
                onChange={set}
                rows={2}
                placeholder="Internal notes..."
              />
            </div>

            {/* Technical Coordination Section */}
            <div className="form-section-divider span-2">
              <span>Technical Coordination</span>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="lightingCoordinated"
                  checked={form.lightingCoordinated}
                  onChange={set}
                />
                Lighting
              </label>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="soundCoordinated"
                  checked={form.soundCoordinated}
                  onChange={set}
                />
                Sound
              </label>
            </div>

            <div className="form-group span-2">
              <label>ציוד להשכרה / השלמה (Sound)</label>
              <textarea
                dir="rtl"
                name="rentalNeeds"
                value={form.rentalNeeds}
                onChange={set}
                rows={3}
                placeholder="פרט ציוד חסר / שיש להשכיר..."
              />
            </div>

            <div className="form-group span-2">
              <label>מאיפה משכירים</label>
              <input
                dir="rtl"
                name="rentalSupplier"
                value={form.rentalSupplier}
                onChange={set}
                placeholder="שם ספק / חברת השכרה"
              />
            </div>

            {customDefs.length > 0 && (
              <div className="form-group span-2">
                <label>Custom Fields — {form.eventType}</label>
                <div className="custom-fields-form">
                  {customDefs.map((def) => (
                    <div key={def.id} className="custom-field-form-row">
                      <span className="custom-field-form-label" dir="rtl">{def.label}</span>
                      {def.type === 'text' && (
                        <input
                          dir="auto"
                          className="custom-field-input-el"
                          value={form.customFields?.[def.id] || ''}
                          onChange={(e) => setCustomField(def.id, e.target.value)}
                          placeholder={def.label}
                        />
                      )}
                      {def.type === 'textarea' && (
                        <textarea
                          dir="auto"
                          className="custom-field-input-el"
                          rows={3}
                          value={form.customFields?.[def.id] || ''}
                          onChange={(e) => setCustomField(def.id, e.target.value)}
                          placeholder={def.label}
                        />
                      )}
                      {def.type === 'checkbox' && (
                        <label className="checkbox-label" style={{ marginTop: 4 }}>
                          <input
                            type="checkbox"
                            checked={form.customFields?.[def.id] || false}
                            onChange={(e) => setCustomField(def.id, e.target.checked)}
                          />
                          {def.label}
                        </label>
                      )}
                      {def.type === 'image' && (
                        <div>
                          <input
                            type="file"
                            accept="image/*,.heic,.heif,application/pdf,.pdf"
                            className="custom-field-file"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = async (ev) => {
                                if (file.type === 'application/pdf') {
                                  // Store PDF as data URL with name metadata
                                  setCustomField(def.id, { name: file.name, data: ev.target.result, isPdf: true });
                                } else {
                                  const compressed = await compressImage(ev.target.result);
                                  setCustomField(def.id, compressed);
                                }
                              };
                              reader.readAsDataURL(file);
                            }}
                          />
                          {form.customFields?.[def.id] && (
                            <div style={{ marginTop: 6 }}>
                              {form.customFields[def.id]?.isPdf ? (
                                <span style={{ fontSize: '0.85rem', color: 'var(--accent)' }}>
                                  📎 {form.customFields[def.id].name}
                                </span>
                              ) : (
                                <img
                                  src={typeof form.customFields[def.id] === 'string' ? form.customFields[def.id] : form.customFields[def.id].data}
                                  alt={def.label}
                                  style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 4, objectFit: 'contain' }}
                                />
                              )}
                              <button
                                type="button"
                                className="btn-icon btn-danger"
                                style={{ marginTop: 4, fontSize: '0.75rem', display: 'block' }}
                                onClick={() => setCustomField(def.id, null)}
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {def.type === 'file' && (
                        <div>
                          <input
                            type="file"
                            className="custom-field-file"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = (ev) => setCustomField(def.id, { name: file.name, data: ev.target.result });
                              reader.readAsDataURL(file);
                            }}
                          />
                          {form.customFields?.[def.id] && (
                            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <a
                                href={form.customFields[def.id].data}
                                download={form.customFields[def.id].name}
                                className="file-download-link"
                              >
                                📎 {form.customFields[def.id].name}
                              </a>
                              <button
                                type="button"
                                className="btn-icon btn-danger"
                                style={{ fontSize: '0.75rem' }}
                                onClick={() => setCustomField(def.id, null)}
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">
              {show ? 'Save Changes' : 'Add Show'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ShowForm;
