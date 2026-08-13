import { useState, useEffect } from 'react';
import ConfirmModal from './ConfirmModal';
import { etColorIdx } from '../utils/etColor';
import SegmentedControl from './ui/SegmentedControl';
import IconButton from './ui/IconButton';
import PageBar from './ui/PageBar';
import { phoneChars, isEmail } from '../utils/fieldInput';
import { useT } from '../i18n';
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

function CrewManager({ crew, setCrew, templates, setTemplates, fieldTemplates, onSaveFieldTemplate, eventTypes, onSaveEventTypes, eventTypeChecklists = {}, onSaveEventTypeChecklist, tasks = [], demoMode = false, artistId }) {
  const { t, tx } = useT();
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
      title: t('crew.deleteMember'),
      message: member ? tx('crew.deleteMemberNamed', { name: member.name }) : t('crew.deleteMemberUnnamed'),
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

  // Group by the DISPLAY label, not the raw stored value: "הפקה" and "Production"
  // are the same role and must land in one group (they previously rendered as two
  // identical "PRODUCTION" headings). Case/whitespace variants merge too.
  const byRole = crew.reduce((acc, m) => {
    const raw   = (m.role || '').trim();
    const label = ROLE_DISPLAY[raw]
      || ROLE_DISPLAY[Object.keys(ROLE_DISPLAY).find((k) => k.toLowerCase() === raw.toLowerCase())]
      || (raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Other');
    if (!acc[label]) acc[label] = [];
    acc[label].push(m);
    return acc;
  }, {});

  return (
    <div>
      <PageBar
        title={tab === 'members' ? t('crew.title') : t('crew.eventTypes')}
        count={tab === 'members' ? crew.length : (eventTypes || []).length}
        countLabel={tab === 'members' ? t('crew.membersCount') : t('crew.typesCount')}
        metrics={tab === 'members' ? [
          { value: crew.length, label: t('crew.total') },
          { value: crew.filter(m => (m.role||'').toLowerCase().includes('sound') || (m.role||'').toLowerCase().includes('סאונד')).length, label: t('crew.sound') },
          { value: crew.filter(m => (m.role||'').toLowerCase().includes('backline') || (m.role||'').toLowerCase().includes('בקלי')).length, label: t('crew.backline') },
        ] : [
          { value: (eventTypes || []).length, label: t('crew.typesCount') },
        ]}
        actions={tab === 'members' && (
          <button className="btn-primary" onClick={openAdd}>+ {t('crew.addMember')}</button>
        )}
      >
        <div className="crew-header-inner">
          <SegmentedControl
            items={[
              { id: 'members', label: t('crew.members'), count: crew.length },
              { id: 'templates', label: t('crew.eventTypes'), count: (eventTypes || []).length },
            ]}
            activeId={tab}
            onChange={setTab}
          />
        </div>
      </PageBar>

      {tab === 'members' ? (
        crew.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">—</div>
            <p>{t('crew.empty')}</p>
            <p className="empty-sub">{t('crew.emptyHint')}</p>
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
                      title={collapsedRoles.has(role) ? t('card.expand') : t('card.collapse')}
                    >
                      {collapsedRoles.has(role) ? '+' : '−'}
                    </button>
                    <span className="crew-group-label">{role}</span>
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
                                    <span className="crew-task-badge" title={t(activeTasks === 1 ? 'crew.activeTask.one' : 'crew.activeTask.many')}>{activeTasks}</span>
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
                                    {/* dir="ltr", not "auto": a phone number opens with a
                                        digit, which is bidi-neutral, so first-strong
                                        detection inherits RTL and turns the number inside
                                        out. The direction here is a fact, not a guess. */}
                                    <a href={`tel:${m.phone}`} dir="ltr" className="crew-contact-value ltr">{m.phone}</a>
                                  </div>
                                )}
                                {m.email && (
                                  <div className="crew-contact-row">
                                    <span className="crew-contact-icon"><MailIcon /></span>
                                    <a href={`mailto:${m.email}`} dir="ltr" className="crew-contact-value ltr">{m.email}</a>
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
                              <IconButton onClick={() => openEdit(m)} title={t('card.edit')}>✎</IconButton>
                              <IconButton danger onClick={() => deleteMember(m.id)} title={t('card.delete')}>✕</IconButton>
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
          eventTypeChecklists={eventTypeChecklists}
          onSaveEventTypeChecklist={onSaveEventTypeChecklist}
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
  { value: 'text',     labelKey: 'crew.fieldType.text' },
  { value: 'textarea', labelKey: 'crew.fieldType.textarea' },
  { value: 'checkbox', labelKey: 'crew.fieldType.checkbox' },
  { value: 'image',    labelKey: 'crew.fieldType.image' },
  { value: 'file',     labelKey: 'crew.fieldType.file' },
];

function TemplatesTab({ crew, templates, fieldTemplates, eventTypes, onSave, onSaveFieldTemplate, onSaveEventTypes, eventTypeChecklists = {}, onSaveEventTypeChecklist }) {
  const { t, tx } = useT();
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
      title: t('crew.deleteEventType'),
      message: tx('crew.deleteEventTypeMessage', { type: et }),
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

  // ── Checklist editing state ──
  const [editingClType, setEditingClType] = useState(null);
  const [localClBefore, setLocalClBefore] = useState([]);
  const [localClVenue, setLocalClVenue] = useState([]);
  const [newClBeforeText, setNewClBeforeText] = useState('');
  const [newClVenueText, setNewClVenueText] = useState('');

  const startClEdit = (et) => {
    setEditingClType(et);
    const cl = eventTypeChecklists[et] || {};
    setLocalClBefore([...(cl.before || [])]);
    setLocalClVenue([...(cl.venue || [])]);
    setNewClBeforeText('');
    setNewClVenueText('');
  };
  const addClItem = (phase) => {
    const text = (phase === 'before' ? newClBeforeText : newClVenueText).trim();
    if (!text) return;
    const item = { id: uuidv4(), text };
    if (phase === 'before') { setLocalClBefore((p) => [...p, item]); setNewClBeforeText(''); }
    else                    { setLocalClVenue((p)  => [...p, item]); setNewClVenueText(''); }
  };
  const removeClItem = (phase, id) => {
    if (phase === 'before') setLocalClBefore((p) => p.filter((i) => i.id !== id));
    else                    setLocalClVenue((p)  => p.filter((i) => i.id !== id));
  };
  const saveCl = () => {
    if (onSaveEventTypeChecklist) onSaveEventTypeChecklist(editingClType, { before: localClBefore, venue: localClVenue });
    setEditingClType(null);
  };

  return (
    <div className="templates-page">
      <p className="templates-desc">
        {t('crew.templatesDescription')}
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

          const isEditingCl = editingClType === et;
          const clDefs = eventTypeChecklists[et] || {};
          const clCount = (clDefs.before || []).length + (clDefs.venue || []).length;

          return (
            <div key={et} className={`template-card ${isEditingCrew || isEditingFields || isEditingCl ? 'editing' : ''}`} data-et-idx={etColorIdx(et)}>
              {/* Single compact header — buttons LEFT, event type name RIGHT (RTL) */}
              <div className="template-card-header">
                <div className="template-header-actions">
                  <button
                    className={`btn-secondary btn-sm${isEditingCrew ? ' template-btn-active' : ''}`}
                    onClick={() => isEditingCrew ? setEditingCrewType(null) : startCrewEdit(et)}
                  >
                    {t('crew.templateCrew')}{ids.length > 0 ? ` (${ids.length})` : ''}
                  </button>
                  <button
                    className={`btn-secondary btn-sm${isEditingFields ? ' template-btn-active' : ''}`}
                    onClick={() => isEditingFields ? setEditingFieldsType(null) : startFieldsEdit(et)}
                  >
                    {t('crew.fields')}{fieldDefs.length > 0 ? ` (${fieldDefs.length})` : ''}
                  </button>
                  <button
                    className={`btn-secondary btn-sm${isEditingCl ? ' template-btn-active' : ''}`}
                    onClick={() => isEditingCl ? setEditingClType(null) : startClEdit(et)}
                  >
                    {t('crew.checklist')}{clCount > 0 ? ` (${clCount})` : ''}
                  </button>
                  <IconButton danger onClick={() => deleteEventType(et)} title={t('crew.deleteEventType')}>✕</IconButton>
                </div>
                <span className="template-type" dir="auto">{et}</span>
              </div>

              {/* ── Crew editor — toggle independently ── */}
              {isEditingCrew && (
                <div className="template-editor">
                  <div className="template-crew-picker">
                    {crew.map((m) => (
                      <label key={m.id} className="crew-pick-row">
                        <input type="checkbox" checked={localIds.includes(m.id)} onChange={() => toggleId(m.id)} />
                        <span className="crew-pick-name" dir="auto">{m.name}</span>
                        <span className="crew-pick-role">{m.role}</span>
                      </label>
                    ))}
                  </div>
                  {localIds.length > 0 && (
                    <div className="template-order">
                      <p className="crew-section-label">{t('crew.dragOrder')}</p>
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
                            {/* One dir="auto" on the whole compound is not enough — it
                                picks a direction from the first strong character and
                                then lets bidi reorder the other-direction part around
                                the neutral dash. Isolate each part instead. */}
                            <span className="template-order-text">
                              <span dir="auto">{m.role}</span>
                              {' – '}
                              <span dir="auto">{m.name}</span>
                            </span>
                          </div>
                        );
                      })}
                      <div className="template-preview">
                        <span className="crew-section-label">{t('crew.preview')}</span>
                        <span className="template-preview-text" dir="auto">{buildCrewText(localIds, crew)}</span>
                      </div>
                    </div>
                  )}
                  <div className="template-actions">
                    <button className="btn-secondary" onClick={() => setEditingCrewType(null)}>{t('common.cancel')}</button>
                    <button className="btn-primary" onClick={saveCrew}>{t('crew.saveCrew')}</button>
                  </div>
                </div>
              )}

              {/* ── Fields editor — toggle independently ── */}
              {isEditingFields && (
                <div className="template-editor" style={isEditingCrew ? { marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)' } : {}}>
                  <div className="field-add-row">
                    <input
                      dir="auto"
                      className="task-input"
                      value={newFieldLabel}
                      onChange={(e) => setNewFieldLabel(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addField()}
                      placeholder={t('crew.fieldName')}
                    />
                    <select
                      className="field-type-select"
                      value={newFieldType}
                      onChange={(e) => setNewFieldType(e.target.value)}
                    >
                      {FIELD_TYPES.map((fieldType) => (
                        <option key={fieldType.value} value={fieldType.value}>{t(fieldType.labelKey)}</option>
                      ))}
                    </select>
                    <button className="btn-primary btn-sm" onClick={addField}>+ {t('common.add')}</button>
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
                          <span className="field-def-label" dir="auto">{f.label}</span>
                          <span className="field-def-type">{FIELD_TYPES.find((fieldType) => fieldType.value === f.type) ? t(FIELD_TYPES.find((fieldType) => fieldType.value === f.type).labelKey) : f.type}</span>
                          <div className="field-def-actions">
                            <button className="btn-icon btn-danger" onClick={() => removeField(f.id)}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="template-actions">
                    <button className="btn-secondary" onClick={() => setEditingFieldsType(null)}>{t('common.cancel')}</button>
                    <button className="btn-primary" onClick={saveFields}>{t('crew.saveFields')}</button>
                  </div>
                </div>
              )}

              {/* ── Checklist editor — toggle independently ── */}
              {isEditingCl && (
                <div className="template-editor" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
                  <p className="crew-section-label" style={{ marginBottom: 8 }}>
                    {t('crew.checklistDescription')}
                  </p>
                  {/* Before phase */}
                  <p className="crew-section-label">{t('crew.beforeLeave')}</p>
                  <div className="fields-list" style={{ marginBottom: 8 }}>
                    {localClBefore.map((item) => (
                      <div key={item.id} className="field-def-row">
                        <span className="field-def-label" dir="auto">{item.text}</span>
                        <div className="field-def-actions">
                          <button className="btn-icon btn-danger" onClick={() => removeClItem('before', item.id)}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="field-add-row" style={{ marginBottom: 14 }}>
                    <input
                      dir="auto"
                      className="task-input"
                      value={newClBeforeText}
                      onChange={(e) => setNewClBeforeText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addClItem('before')}
                      placeholder={t('crew.addTask')}
                    />
                    <button className="btn-primary btn-sm" onClick={() => addClItem('before')}>+ {t('common.add')}</button>
                  </div>
                  {/* Venue phase */}
                  <p className="crew-section-label">{t('crew.atVenue')}</p>
                  <div className="fields-list" style={{ marginBottom: 8 }}>
                    {localClVenue.map((item) => (
                      <div key={item.id} className="field-def-row">
                        <span className="field-def-label" dir="auto">{item.text}</span>
                        <div className="field-def-actions">
                          <button className="btn-icon btn-danger" onClick={() => removeClItem('venue', item.id)}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="field-add-row" style={{ marginBottom: 14 }}>
                    <input
                      dir="auto"
                      className="task-input"
                      value={newClVenueText}
                      onChange={(e) => setNewClVenueText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addClItem('venue')}
                      placeholder={t('crew.addTask')}
                    />
                    <button className="btn-primary btn-sm" onClick={() => addClItem('venue')}>+ {t('common.add')}</button>
                  </div>
                  <div className="template-actions">
                    <button className="btn-secondary" onClick={() => setEditingClType(null)}>{t('common.cancel')}</button>
                    <button className="btn-primary" onClick={saveCl}>{t('crew.saveChecklist')}</button>
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
          dir="auto"
          className="task-input"
          value={newTypeName}
          onChange={(e) => setNewTypeName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addEventType()}
          placeholder={t('crew.addEventType')}
        />
        <button className="btn-primary btn-sm" onClick={addEventType}>+ {t('common.add')}</button>
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
  const { t } = useT();
  const [form, setForm] = useState(
    member
      ? { name: member.name || '', role: member.role || '', phone: member.phone || '', email: member.email || '', notes: member.notes || '', eventTypes: member.eventTypes || [] }
      : { ...BLANK_MEMBER }
  );
  const [addingRole, setAddingRole] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [newRoleInput, setNewRoleInput] = useState('');

  const allRoles = [...CREW_ROLES, ...customRoles];

  const set = (e) => {
    const { name, value } = e.target;
    if (name === 'role' && value === '__add_new__') {
      setAddingRole(true);
      return;
    }
    // A phone number has no valid spelling with letters in it, so they are
    // filtered out as typed rather than rejected on save.
    setForm({ ...form, [name]: name === 'phone' ? phoneChars(value) : value });
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
    // Judged whole on submit, not per keystroke — half-typed is not yet wrong.
    if (!isEmail(form.email)) { setEmailError(true); return; }
    setEmailError(false);
    onSubmit(form);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{member ? t('crew.editMember') : t('crew.addMember')}</h2>
          <IconButton onClick={onClose}>✕</IconButton>
        </div>
        <form onSubmit={handleSubmit} className="show-form">
          <div className="form-grid">
            <div className="form-group span-2">
              <label>{t('admin.nameRequired')}</label>
              <input dir="auto" name="name" value={form.name} onChange={set} required placeholder={t('admin.fullName')} />
            </div>
            <div className="form-group">
              <label>{t('crew.role')}</label>
              <select name="role" value={form.role} onChange={set}>
                <option value="">{t('crew.selectRole')}</option>
                {allRoles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
                <option value="__add_new__">＋ {t('crew.addRole')}</option>
              </select>
              {addingRole && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <input
                    autoFocus
                    value={newRoleInput}
                    onChange={(e) => setNewRoleInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmNewRole(); } if (e.key === 'Escape') { setAddingRole(false); setNewRoleInput(''); } }}
                    placeholder={t('crew.newRole')}
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="btn-primary btn-sm" onClick={confirmNewRole}>{t('common.add')}</button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => { setAddingRole(false); setNewRoleInput(''); }}>{t('common.cancel')}</button>
                </div>
              )}
            </div>
            <div className="form-group">
              <label>{t('admin.phone')}</label>
              <input dir="auto" name="phone" value={form.phone} onChange={set}
                     placeholder="050-..." inputMode="tel" />
            </div>
            <div className="form-group span-2">
              <label>{t('admin.email')}</label>
              <input dir="auto" name="email" value={form.email} onChange={set}
                     placeholder="email@example.com" inputMode="email" />
              {emailError && (
                <span className="field-error">{t('client.error.email')}</span>
              )}
            </div>
            <div className="form-group span-2">
              <label>{t('crew.worksWith')}</label>
              <div className="checkbox-row" style={{ flexWrap: 'wrap' }}>
                {(eventTypes || []).map((t) => (
                  <label key={t} className="checkbox-label" dir="auto">
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
              <label>{t('admin.notes')}</label>
              <textarea dir="auto" name="notes" value={form.notes} onChange={set} rows={2} placeholder={t('crew.notesPlaceholder')} />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{member ? t('crew.save') : t('common.add')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CrewManager;
