import { useState, useEffect } from 'react';
import ConfirmModal from './ConfirmModal';
import { etColorIdx } from '../utils/etColor';
const uuidv4 = () => crypto.randomUUID();

// All crew role accents use the same brand orange for visual consistency
const roleColor = () => '#F08D39';


const BLANK_MEMBER = {
  name: '',
  role: '',
  phone: '',
  email: '',
  notes: '',
  eventTypes: [],
};

function buildCrewText(crewIds, crew) {
  return crewIds
    .map((id) => crew.find((m) => m.id === id))
    .filter(Boolean)
    .map((m) => `${m.role} – ${m.name}`)
    .join(' | ');
}

function CrewManager({ crew, setCrew, templates, setTemplates, fieldTemplates, onSaveFieldTemplate, eventTypes, onSaveEventTypes, demoMode = false }) {
  const [tab, setTab] = useState('members');
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);

  const openAdd = () => { setEditing(null); setShowForm(true); };
  const openEdit = (m) => { setEditing(m); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditing(null); };

  const saveMember = async (data) => {
    if (demoMode) {
      if (editing) {
        setCrew((prev) => prev.map((m) => (m.id === editing.id ? { ...m, ...data } : m)));
      } else {
        setCrew((prev) => [...prev, { id: 'demo-crew-' + Date.now(), ...data }]);
      }
      closeForm();
      return;
    }
    if (editing) {
      const res = await fetch(`/api/crew/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const updated = await res.json();
      setCrew((prev) => prev.map((m) => (m.id === editing.id ? updated : m)));
    } else {
      const res = await fetch('/api/crew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const created = await res.json();
      setCrew((prev) => [...prev, created]);
    }
    closeForm();
  };

  const deleteMember = (id) => {
    const member = crew.find((m) => m.id === id);
    setConfirmModal({
      title: 'Delete Crew Member',
      message: member ? `Remove "${member.name}" from all shows and templates? This cannot be undone.` : 'Delete this crew member?',
      onConfirm: async () => {
        setConfirmModal(null);
        if (!demoMode) await fetch(`/api/crew/${id}`, { method: 'DELETE' });
        setCrew((prev) => prev.filter((m) => m.id !== id));
        setTemplates((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((et) => {
            next[et] = next[et].filter((cid) => cid !== id);
          });
          return next;
        });
      },
    });
  };

  const saveTemplate = async (eventType, crewIds) => {
    if (!demoMode) {
      await fetch(`/api/templates/${encodeURIComponent(eventType)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crewIds }),
      });
    }
    setTemplates((prev) => ({ ...prev, [eventType]: crewIds }));
  };

  const [collapsedRoles, setCollapsedRoles] = useState(new Set());
  const toggleRole = (role) => setCollapsedRoles((prev) => {
    const next = new Set(prev);
    if (next.has(role)) next.delete(role); else next.add(role);
    return next;
  });

  const byRole = crew.reduce((acc, m) => {
    const role = m.role || 'Other';
    if (!acc[role]) acc[role] = [];
    acc[role].push(m);
    return acc;
  }, {});

  return (
    <div>
      {/* Editorial page header — matches Shows page style */}
      <div className="page-header-edit">
        <div className="page-header-left">
          <h1 className="page-title">
            {tab === 'members' ? 'Crew' : 'Event Types'}
            <span className="page-title-dot">.</span>
          </h1>
          <p className="page-subtitle">
            {tab === 'members' ? (
              <>
                <span className="page-subtitle-num">{crew.length.toString().padStart(2, '0')}</span>
                <span className="page-subtitle-line" />
                <span>team members</span>
              </>
            ) : (
              <>
                <span className="page-subtitle-num">{(eventTypes || []).length.toString().padStart(2, '0')}</span>
                <span className="page-subtitle-line" />
                <span>event types defined</span>
              </>
            )}
          </p>
        </div>
        <div className="page-marquee" aria-hidden="true">
          <span className="page-marquee-track">
            <span>Crew & Types</span><span>·</span>
            <span>Crew & Types</span><span>·</span>
            <span>Crew & Types</span><span>·</span>
            <span>Crew & Types</span><span>·</span>
          </span>
        </div>
      </div>

      <div className="crew-header">
        <div className="crew-tab-bar">
          <button
            className={`crew-tab ${tab === 'members' ? 'active' : ''}`}
            onClick={() => setTab('members')}
          >
            Members <span className="crew-count">{crew.length}</span>
          </button>
          <button
            className={`crew-tab ${tab === 'templates' ? 'active' : ''}`}
            onClick={() => setTab('templates')}
          >
            Event Types
          </button>
        </div>
        {tab === 'members' && (
          <button className="btn-primary" onClick={openAdd}>+ Add Member</button>
        )}
      </div>

      {tab === 'members' ? (
        crew.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">—</div>
            <p>No crew members yet</p>
            <p className="empty-sub">Click "+ Add Member" to get started</p>
          </div>
        ) : (
          <div className="crew-groups">
            {Object.entries(byRole).sort(([a], [b]) => a.localeCompare(b, 'he')).map(([role, members]) => (
              <div key={role} className="crew-group" style={{ '--role-color': roleColor(role) }}>
                <h3 className="crew-group-title">
                  <button
                    className="crew-group-toggle"
                    onClick={() => toggleRole(role)}
                    title={collapsedRoles.has(role) ? 'Expand' : 'Collapse'}
                  >
                    {collapsedRoles.has(role) ? '+' : '−'}
                  </button>
                  {role}
                  <span className="crew-group-count">{members.length}</span>
                </h3>
                {!collapsedRoles.has(role) && (
                  <div className="crew-list">
                    {members.map((m) => (
                      <div key={m.id} className="crew-card">
                        <div className="crew-card-info">
                          <div className="crew-card-name">{m.name}</div>
                          <div className="crew-card-details">
                            {m.phone && <a href={`tel:${m.phone}`} className="crew-detail-link">{m.phone}</a>}
                            {m.email && <a href={`mailto:${m.email}`} className="crew-detail-link">{m.email}</a>}
                          </div>
                          {(m.eventTypes || []).length > 0 && (
                            <div className="crew-event-types">
                              {m.eventTypes.map((t) => (
                                <span key={t} className="tag" dir="auto" data-et-idx={etColorIdx(t)}>{t}</span>
                              ))}
                            </div>
                          )}
                          {m.notes && <p className="crew-card-notes" dir="auto">{m.notes}</p>}
                        </div>
                        <div className="crew-card-actions">
                          <button className="btn-icon" onClick={() => openEdit(m)} title="Edit">✎</button>
                          <button className="btn-icon btn-danger" onClick={() => deleteMember(m.id)} title="Delete">✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        <TemplatesTab
          crew={crew}
          templates={templates}
          fieldTemplates={fieldTemplates || {}}
          eventTypes={eventTypes || []}
          onSave={saveTemplate}
          onSaveFieldTemplate={onSaveFieldTemplate}
          onSaveEventTypes={onSaveEventTypes}
        />
      )}

      {showForm && (
        <CrewForm member={editing} eventTypes={eventTypes || []} onSubmit={saveMember} onClose={closeForm} />
      )}

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          danger={confirmModal.danger !== false}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  );
}

const FIELD_TYPES = [
  { value: 'text',     label: 'Text (single line)' },
  { value: 'textarea', label: 'Text (multi-line)' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'image',    label: 'Image' },
  { value: 'file',     label: 'File' },
];

function TemplatesTab({ crew, templates, fieldTemplates, eventTypes, onSave, onSaveFieldTemplate, onSaveEventTypes }) {
  // ── Confirmation modal (for delete) ──
  const [confirmModal, setConfirmModal] = useState(null);

  // ── Crew editing state ──
  const [editingCrewType, setEditingCrewType] = useState(null);
  const [localIds, setLocalIds] = useState([]);

  const startCrewEdit = (et) => { setEditingCrewType(et); setLocalIds(templates[et] || []); };
  const toggleId = (id) =>
    setLocalIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const saveCrew = () => { onSave(editingCrewType, localIds); setEditingCrewType(null); };

  // Drag state for crew order
  const [dragCrewIdx, setDragCrewIdx] = useState(null);
  const dropCrew = (toIdx) => {
    if (dragCrewIdx == null || dragCrewIdx === toIdx) return;
    setLocalIds((prev) => {
      const n = [...prev];
      const [item] = n.splice(dragCrewIdx, 1);
      n.splice(toIdx, 0, item);
      return n;
    });
    setDragCrewIdx(null);
  };

  // ── Add / delete event types ──
  const [newTypeName, setNewTypeName] = useState('');
  const addEventType = () => {
    const t = newTypeName.trim();
    if (!t || eventTypes.includes(t)) return;
    onSaveEventTypes([...eventTypes, t]);
    setNewTypeName('');
  };
  const deleteEventType = (et) => {
    setConfirmModal({
      title: 'Delete Event Type',
      message: `Delete "${et}"? Existing shows with this type won't be affected.`,
      onConfirm: () => {
        setConfirmModal(null);
        onSaveEventTypes(eventTypes.filter((t) => t !== et));
      },
    });
  };

  // ── Field editing state ──
  const [editingFieldsType, setEditingFieldsType] = useState(null);
  const [localFields, setLocalFields] = useState([]);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');

  const startFieldsEdit = (et) => {
    setEditingFieldsType(et);
    setLocalFields([...(fieldTemplates[et] || [])]);
    setNewFieldLabel('');
    setNewFieldType('text');
  };

  const addField = () => {
    const label = newFieldLabel.trim();
    if (!label) return;
    setLocalFields((prev) => [...prev, { id: uuidv4(), label, type: newFieldType }]);
    setNewFieldLabel('');
    setNewFieldType('text');
  };

  const removeField = (id) => setLocalFields((prev) => prev.filter((f) => f.id !== id));

  // Drag state for field order
  const [dragFieldIdx, setDragFieldIdx] = useState(null);
  const dropField = (toIdx) => {
    if (dragFieldIdx == null || dragFieldIdx === toIdx) return;
    setLocalFields((prev) => {
      const n = [...prev];
      const [item] = n.splice(dragFieldIdx, 1);
      n.splice(toIdx, 0, item);
      return n;
    });
    setDragFieldIdx(null);
  };

  const saveFields = () => { onSaveFieldTemplate(editingFieldsType, localFields); setEditingFieldsType(null); };

  return (
    <div className="templates-page">
      <p className="templates-desc">
        Define default crew and custom fields (rubrics) for each event type.
      </p>
      <div className="templates-list">
        {eventTypes.map((et) => {
          const ids = templates[et] || [];
          const crewPreview = buildCrewText(ids, crew);
          const fieldDefs = fieldTemplates[et] || [];
          const musicians = ids
            .map((id) => crew.find((m) => m.id === id))
            .filter((m) => m && m.role === 'נגן')
            .map((m) => m.name)
            .join(', ');

          const isEditingCrew = editingCrewType === et;
          const isEditingFields = editingFieldsType === et;

          return (
            <div key={et} className={`template-card ${isEditingCrew || isEditingFields ? 'editing' : ''}`} data-et-idx={etColorIdx(et)}>
              {/* Single compact header — buttons LEFT, event type name RIGHT (RTL) */}
              <div className="template-card-header">
                <div className="template-header-actions">
                  <button
                    className={`btn-secondary btn-sm${isEditingCrew ? ' template-btn-active' : ''}`}
                    onClick={() => isEditingCrew ? setEditingCrewType(null) : startCrewEdit(et)}
                  >
                    Crew{ids.length > 0 ? ` (${ids.length})` : ''}
                  </button>
                  <button
                    className={`btn-secondary btn-sm${isEditingFields ? ' template-btn-active' : ''}`}
                    onClick={() => isEditingFields ? setEditingFieldsType(null) : startFieldsEdit(et)}
                  >
                    Fields{fieldDefs.length > 0 ? ` (${fieldDefs.length})` : ''}
                  </button>
                  <button className="btn-icon btn-danger" onClick={() => deleteEventType(et)} title="Delete event type">✕</button>
                </div>
                <span className="template-type" dir="rtl">{et}</span>
              </div>

              {/* ── Crew editor — toggle independently ── */}
              {isEditingCrew && (
                <div className="template-editor">
                  <div className="template-crew-picker">
                    {crew.map((m) => (
                      <label key={m.id} className="crew-pick-row">
                        <input type="checkbox" checked={localIds.includes(m.id)} onChange={() => toggleId(m.id)} />
                        <span className="crew-pick-name">{m.name}</span>
                        <span className="crew-pick-role">{m.role}</span>
                      </label>
                    ))}
                  </div>
                  {localIds.length > 0 && (
                    <div className="template-order">
                      <p className="crew-section-label">Order — drag to reorder</p>
                      {localIds.map((id, idx) => {
                        const m = crew.find((c) => c.id === id);
                        if (!m) return null;
                        return (
                          <div
                            key={id}
                            className="template-order-row"
                            draggable
                            onDragStart={() => setDragCrewIdx(idx)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => dropCrew(idx)}
                            onDragEnd={() => setDragCrewIdx(null)}
                            style={{ opacity: dragCrewIdx === idx ? 0.35 : 1, cursor: 'grab' }}
                          >
                            <span className="drag-handle">⠿</span>
                            <span className="template-order-text">{m.role} – {m.name}</span>
                          </div>
                        );
                      })}
                      <div className="template-preview">
                        <span className="crew-section-label">Preview:</span>
                        <span className="template-preview-text" dir="rtl">{buildCrewText(localIds, crew)}</span>
                      </div>
                    </div>
                  )}
                  <div className="template-actions">
                    <button className="btn-secondary" onClick={() => setEditingCrewType(null)}>Cancel</button>
                    <button className="btn-primary" onClick={saveCrew}>Save Crew</button>
                  </div>
                </div>
              )}

              {/* ── Fields editor — toggle independently ── */}
              {isEditingFields && (
                <div className="template-editor" style={isEditingCrew ? { marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)' } : {}}>
                  <div className="field-add-row">
                    <input
                      dir="rtl"
                      className="task-input"
                      value={newFieldLabel}
                      onChange={(e) => setNewFieldLabel(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addField()}
                      placeholder="Field name..."
                    />
                    <select
                      className="field-type-select"
                      value={newFieldType}
                      onChange={(e) => setNewFieldType(e.target.value)}
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <button className="btn-primary btn-sm" onClick={addField}>+ Add</button>
                  </div>
                  {localFields.length > 0 && (
                    <div className="fields-list">
                      {localFields.map((f, idx) => (
                        <div
                          key={f.id}
                          className="field-def-row"
                          draggable
                          onDragStart={() => setDragFieldIdx(idx)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => dropField(idx)}
                          onDragEnd={() => setDragFieldIdx(null)}
                          style={{ opacity: dragFieldIdx === idx ? 0.35 : 1, cursor: 'grab' }}
                        >
                          <span className="drag-handle">⠿</span>
                          <span className="field-def-label" dir="rtl">{f.label}</span>
                          <span className="field-def-type">{FIELD_TYPES.find((t) => t.value === f.type)?.label || f.type}</span>
                          <div className="field-def-actions">
                            <button className="btn-icon btn-danger" onClick={() => removeField(f.id)}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="template-actions">
                    <button className="btn-secondary" onClick={() => setEditingFieldsType(null)}>Cancel</button>
                    <button className="btn-primary" onClick={saveFields}>Save Fields</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Add new event type ── */}
      <div className="event-type-add" style={{ marginTop: 14 }}>
        <input
          dir="rtl"
          className="task-input"
          value={newTypeName}
          onChange={(e) => setNewTypeName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addEventType()}
          placeholder="Add new event type…"
        />
        <button className="btn-primary btn-sm" onClick={addEventType}>+ Add</button>
      </div>

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          danger={confirmModal.danger !== false}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  );
}

function EventTypesTab({ eventTypes, onSave }) {
  const [types, setTypes] = useState([...eventTypes]);
  const [newType, setNewType] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setTypes([...eventTypes]);
  }, [eventTypes]);

  const add = () => {
    const t = newType.trim();
    if (!t || types.includes(t)) return;
    const next = [...types, t];
    setTypes(next);
    setNewType('');
    setDirty(true);
  };

  const remove = (t) => {
    setTypes((prev) => prev.filter((x) => x !== t));
    setDirty(true);
  };

  const moveUp = (i) => {
    if (i === 0) return;
    setTypes((prev) => { const n = [...prev]; [n[i-1],n[i]]=[n[i],n[i-1]]; return n; });
    setDirty(true);
  };

  const moveDown = (i) => {
    setTypes((prev) => {
      if (i === prev.length - 1) return prev;
      const n = [...prev]; [n[i],n[i+1]]=[n[i+1],n[i]]; return n;
    });
    setDirty(true);
  };

  const save = () => { onSave(types); setDirty(false); };

  return (
    <div className="event-types-page">
      <p className="templates-desc">
        Add, remove, or reorder event types. These appear in the show form and crew templates.
      </p>
      <div className="event-types-list">
        {types.map((t, i) => (
          <div key={t} className="event-type-row">
            <span className="event-type-name" dir="rtl">{t}</span>
            <div className="event-type-actions">
              <button className="btn-icon" onClick={() => moveUp(i)} disabled={i === 0}>↑</button>
              <button className="btn-icon" onClick={() => moveDown(i)} disabled={i === types.length - 1}>↓</button>
              <button className="btn-icon btn-danger" onClick={() => remove(t)} title="Remove">✕</button>
            </div>
          </div>
        ))}
      </div>
      <div className="event-type-add">
        <input
          dir="rtl"
          className="task-input"
          value={newType}
          onChange={(e) => setNewType(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Type new event type and press Enter"
        />
        <button className="btn-primary btn-sm" onClick={add}>Add</button>
      </div>
      {dirty && (
        <div className="event-types-save">
          <button className="btn-primary" onClick={save}>Save Changes</button>
        </div>
      )}
    </div>
  );
}

function CrewForm({ member, eventTypes, onSubmit, onClose }) {
  const [form, setForm] = useState(
    member
      ? { name: member.name || '', role: member.role || '', phone: member.phone || '', email: member.email || '', notes: member.notes || '', eventTypes: member.eventTypes || [] }
      : { ...BLANK_MEMBER }
  );

  const set = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const toggleEventType = (t) => {
    setForm((f) => ({
      ...f,
      eventTypes: f.eventTypes.includes(t)
        ? f.eventTypes.filter((x) => x !== t)
        : [...f.eventTypes, t],
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{member ? 'Edit Crew Member' : 'Add Crew Member'}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="show-form">
          <div className="form-grid">
            <div className="form-group span-2">
              <label>Name *</label>
              <input dir="auto" name="name" value={form.name} onChange={set} required placeholder="Full name" />
            </div>
            <div className="form-group">
              <label>Role</label>
              <input dir="auto" name="role" value={form.role} onChange={set} placeholder="הפקה, סאונד, בקליין, תאורה..." />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input name="phone" value={form.phone} onChange={set} placeholder="050-..." type="tel" />
            </div>
            <div className="form-group span-2">
              <label>Email</label>
              <input name="email" value={form.email} onChange={set} placeholder="email@example.com" type="email" />
            </div>
            <div className="form-group span-2">
              <label>Usually works with</label>
              <div className="checkbox-row" style={{ flexWrap: 'wrap' }}>
                {(eventTypes || []).map((t) => (
                  <label key={t} className="checkbox-label" dir="rtl">
                    <input
                      type="checkbox"
                      checked={form.eventTypes.includes(t)}
                      onChange={() => toggleEventType(t)}
                    />
                    {t}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group span-2">
              <label>Notes</label>
              <textarea dir="auto" name="notes" value={form.notes} onChange={set} rows={2} placeholder="Any notes..." />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">{member ? 'Save' : 'Add'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CrewManager;
