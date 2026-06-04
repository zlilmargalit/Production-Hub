import { useState, useEffect } from 'react';
import ConfirmModal from './ConfirmModal';
import { etColorIdx } from '../utils/etColor';
import SegmentedControl from './ui/SegmentedControl';
import IconButton from './ui/IconButton';
const uuidv4 = () => crypto.randomUUID();

// ── Per-group color helpers ─────────────────────────────────────────────────
const GROUP_PALETTE = ['#3852B4', '#C26C1F', '#4E7265', '#7C3A5E', '#1F2D6E', '#B07729'];
const groupColorFor = (role) => {
  const k = (role || '').toLowerCase();
  if (k.includes('backline') || k.includes('בקלי')) return '#3852B4';
  if (k.includes('production') || k.includes('הפקה')) return '#C26C1F';
  if (k.includes('musician') || k.includes('נגן')) return '#4E7265';
  if (k.includes('sound') || k.includes('סאונד')) return '#C38B86';
  if (k.includes('lighting') || k.includes('תאורה')) return '#7C3A5E';
  return GROUP_PALETTE[(role || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % GROUP_PALETTE.length];
};
const initialsFor = (name) => (name || '').split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

function PhoneIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.5 1.18 2 2 0 012.44 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.18 6.18l.87-.87a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 15.29z"/>
    </svg>
  );
}
function MailIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  );
}


const BLANK_MEMBER = {
  name: '',
  role: '',
  phone: '',
  email: '',
  notes: '',
  eventTypes: [],
};

const CREW_ROLES = [
  'Production',
  'Sound',
  'Lighting',
  'Backline',
  'Musician',
];

// Map stored role values (including legacy Hebrew) to display labels
const ROLE_DISPLAY = {
  // Hebrew legacy values
  'בקליין':    'Backline',
  'בקליינים':  'Backline',
  'הפקה':      'Production',
  'תאורה':     'Lighting',
  'סאונד':     'Sound',
  'נגן':       'Musician',
  'נגנים':     'Musician',
  // English aliases
  'Backliners': 'Backline',
  'Musicians':  'Musician',
};

function buildCrewText(crewIds, crew) {
  return crewIds
    .map((id) => crew.find((m) => m.id === id))
    .filter(Boolean)
    .map((m) => `${m.role} – ${m.name}`)
    .join(' | ');
}

function CrewManager({ crew, setCrew, templates, setTemplates, fieldTemplates, onSaveFieldTemplate, eventTypes, onSaveEventTypes, tasks = [], demoMode = false, artistId }) {
  const [tab, setTab] = useState('members');
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);
  const [customRoles, setCustomRoles] = useState([]);

  const openAdd = () => { setEditing(null); setShowForm(true); };
  const openEdit = (m) => { setEditing(m); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditing(null); };

  const qs = artistId ? `?artistId=${encodeURIComponent(artistId)}` : '';

  useEffect(() => {
    if (demoMode) return;
    fetch(`/api/roles${qs}`).then((r) => r.json()).then(setCustomRoles).catch(() => {});
  }, [qs, demoMode]);

  const saveCustomRoles = async (roles) => {
    setCustomRoles(roles);
    if (!demoMode) {
      await fetch(`/api/roles${qs}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roles),
      });
    }
  };

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
      const res = await fetch(`/api/crew/${editing.id}${qs}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const updated = await res.json();
      setCrew((prev) => prev.map((m) => (m.id === editing.id ? updated : m)));
    } else {
      const res = await fetch(`/api/crew${qs}`, {
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
        if (!demoMode) await fetch(`/api/crew/${id}${qs}`, { method: 'DELETE' });
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
      await fetch(`/api/templates/${encodeURIComponent(eventType)}${qs}`, {
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
        <SegmentedControl
          items={[
            { id: 'members', label: 'Members', count: crew.length },
            { id: 'templates', label: 'Event Types', count: (eventTypes || []).length },
          ]}
          activeId={tab}
          onChange={setTab}
        />
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
            {Object.entries(byRole).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([role, members]) => {
              const groupColor = groupColorFor(role);
              return (
                <div key={role} className="crew-group" style={{ '--role-color': groupColor }}>
                  <h3 className="crew-group-title">
                    <button
                      className="crew-group-toggle"
                      onClick={() => toggleRole(role)}
                      title={collapsedRoles.has(role) ? 'Expand' : 'Collapse'}
                    >
                      {collapsedRoles.has(role) ? '+' : '−'}
                    </button>
                    <span className="crew-group-label">{ROLE_DISPLAY[role] || role}</span>
                    <span className="crew-group-count">{members.length}</span>
                  </h3>
                  {!collapsedRoles.has(role) && (
                    <div className="crew-list">
                      {members.map((m) => {
                        const activeTasks = tasks.filter((t) => !t.completed && t.assignedTo === m.id).length;
                        return (
                          <div key={m.id} className="crew-card">
                            {/* Top row: avatar + name block */}
                            <div className="crew-card-top">
                              <div className="crew-avatar" style={{ background: groupColor }}>
                                {initialsFor(m.name)}
                              </div>
                              <div className="crew-name-block">
                                <div className="crew-member-name" dir="auto">
                                  {m.name}
                                  {activeTasks > 0 && (
                                    <span className="crew-task-badge" title={`${activeTasks} active task${activeTasks > 1 ? 's' : ''}`}>{activeTasks}</span>
                                  )}
                                </div>
                                <div className="crew-group-eyebrow" style={{ color: groupColor }}>
                                  {ROLE_DISPLAY[role] || role}
                                </div>
                              </div>
                            </div>

                            {/* Contact rows */}
                            {(m.phone || m.email) && (
                              <div className="crew-contacts">
                                {m.phone && (
                                  <div className="crew-contact-row">
                                    <span className="crew-contact-icon"><PhoneIcon /></span>
                                    <a href={`tel:${m.phone}`} className="crew-contact-value">{m.phone}</a>
                                  </div>
                                )}
                                {m.email && (
                                  <div className="crew-contact-row">
                                    <span className="crew-contact-icon"><MailIcon /></span>
                                    <a href={`mailto:${m.email}`} className="crew-contact-value">{m.email}</a>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Event-type tags */}
                            {(m.eventTypes || []).length > 0 && (
                              <div className="crew-tags-block">
                                {m.eventTypes.map((t) => (
                                  <span key={t} className="crew-tag" dir="auto">{t}</span>
                                ))}
                              </div>
                            )}

                            {/* Notes (if present) */}
                            {m.notes && <p className="crew-card-notes" dir="auto">{m.notes}</p>}

                            {/* Actions (revealed on hover) */}
                            <div className="crew-card-actions">
                              <IconButton onClick={() => openEdit(m)} title="Edit">✎</IconButton>
                              <IconButton danger onClick={() => deleteMember(m.id)} title="Delete">✕</IconButton>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
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
        <CrewForm member={editing} eventTypes={eventTypes || []} customRoles={customRoles} onSaveCustomRoles={saveCustomRoles} onSubmit={saveMember} onClose={closeForm} />
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
            .filter((m) => m && m.role === 'Musicians')
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
                  <IconButton danger onClick={() => deleteEventType(et)} title="Delete event type">✕</IconButton>
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

function CrewForm({ member, eventTypes, customRoles = [], onSaveCustomRoles, onSubmit, onClose }) {
  const [form, setForm] = useState(
    member
      ? { name: member.name || '', role: member.role || '', phone: member.phone || '', email: member.email || '', notes: member.notes || '', eventTypes: member.eventTypes || [] }
      : { ...BLANK_MEMBER }
  );
  const [addingRole, setAddingRole] = useState(false);
  const [newRoleInput, setNewRoleInput] = useState('');

  const allRoles = [...CREW_ROLES, ...customRoles];

  const set = (e) => {
    if (e.target.name === 'role' && e.target.value === '__add_new__') {
      setAddingRole(true);
      return;
    }
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const confirmNewRole = () => {
    const trimmed = newRoleInput.trim();
    if (!trimmed || allRoles.includes(trimmed)) {
      setAddingRole(false);
      setNewRoleInput('');
      return;
    }
    const updated = [...customRoles, trimmed];
    onSaveCustomRoles(updated);
    setForm((f) => ({ ...f, role: trimmed }));
    setAddingRole(false);
    setNewRoleInput('');
  };

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
          <IconButton onClick={onClose}>✕</IconButton>
        </div>
        <form onSubmit={handleSubmit} className="show-form">
          <div className="form-grid">
            <div className="form-group span-2">
              <label>Name *</label>
              <input dir="auto" name="name" value={form.name} onChange={set} required placeholder="Full name" />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select name="role" value={form.role} onChange={set}>
                <option value="">-- Select role --</option>
                {allRoles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
                <option value="__add_new__">＋ Add new role...</option>
              </select>
              {addingRole && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <input
                    autoFocus
                    value={newRoleInput}
                    onChange={(e) => setNewRoleInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmNewRole(); } if (e.key === 'Escape') { setAddingRole(false); setNewRoleInput(''); } }}
                    placeholder="New role name"
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="btn-primary btn-sm" onClick={confirmNewRole}>Add</button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => { setAddingRole(false); setNewRoleInput(''); }}>Cancel</button>
                </div>
              )}
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
