import { useState, useEffect } from 'react';

function TechnicalManager({ show, onUpdate }) {
  const [spec,     setSpec]     = useState(show.technicalSpec     || '');
  const [stages,   setStages]   = useState(show.stages            || '');
  const [setlist,  setSetlist]  = useState(show.setlistNotes      || '');
  const [newItem,  setNewItem]  = useState('');
  const [coord, setCoord] = useState({
    sound:                show.soundCoordinated        || false,
    lighting:             show.lightingCoordinated     || false,
    soundRentalNeeds:     show.soundRentalNeeds        || '',
    soundRentalSupplier:  show.soundRentalSupplier     || '',
    lightingRentalNeeds:  show.lightingRentalNeeds     || '',
    lightingRentalSupplier: show.lightingRentalSupplier || '',
  });

  const checklist = show.equipmentChecklist || [];

  // Re-sync if show data changes externally
  useEffect(() => {
    setSpec(show.technicalSpec  || '');
    setStages(show.stages       || '');
    setSetlist(show.setlistNotes || '');
    setCoord({
      sound:                show.soundCoordinated        || false,
      lighting:             show.lightingCoordinated     || false,
      soundRentalNeeds:     show.soundRentalNeeds        || '',
      soundRentalSupplier:  show.soundRentalSupplier     || '',
      lightingRentalNeeds:  show.lightingRentalNeeds     || '',
      lightingRentalSupplier: show.lightingRentalSupplier || '',
    });
  }, [
    show.id,
    show.technicalSpec, show.stages, show.setlistNotes,
    show.soundCoordinated, show.lightingCoordinated,
    show.soundRentalNeeds, show.soundRentalSupplier,
    show.lightingRentalNeeds, show.lightingRentalSupplier,
  ]);

  const save = (patch) => onUpdate(show.id, { ...show, ...patch });

  const saveCoord = (next) => {
    setCoord(next);
    save({
      soundCoordinated:        next.sound,
      lightingCoordinated:     next.lighting,
      soundRentalNeeds:        next.soundRentalNeeds,
      soundRentalSupplier:     next.soundRentalSupplier,
      lightingRentalNeeds:     next.lightingRentalNeeds,
      lightingRentalSupplier:  next.lightingRentalSupplier,
    });
  };

  const toggleCoord = (field) => {
    const next = { ...coord, [field]: !coord[field] };
    saveCoord(next);
  };

  const addChecklistItem = () => {
    const label = newItem.trim();
    if (!label) return;
    const updated = [...checklist, { id: crypto.randomUUID(), label, checked: false }];
    save({ equipmentChecklist: updated });
    setNewItem('');
  };

  const toggleChecklist = (id) => {
    const updated = checklist.map((i) => i.id === id ? { ...i, checked: !i.checked } : i);
    save({ equipmentChecklist: updated });
  };

  const removeChecklist = (id) => {
    save({ equipmentChecklist: checklist.filter((i) => i.id !== id) });
  };

  return (
    <div className="tech-panel">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="hub-header">
        <div className="hub-header-text">
          <div className="hub-eyebrow">Stage &amp; Tech</div>
          <div className="hub-heading">Technical</div>
        </div>
      </div>

      <div className="tech-grid">
        {/* ── Technical Spec ──────────────────────────────────── */}
        <div className="tech-block tech-block--wide">
          <div className="tech-block-header">
            <span className="tech-block-icon">⚙</span>
            <h4 className="tech-block-title">מפרט טכני</h4>
          </div>
          <textarea
            className="tech-textarea"
            dir="auto"
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            onBlur={() => save({ technicalSpec: spec })}
            placeholder="רשימת ציוד, דרישות טכניות, הגברה..."
            rows={5}
          />
        </div>

        {/* ── Stages / במות ───────────────────────────────────── */}
        <div className="tech-block">
          <div className="tech-block-header">
            <span className="tech-block-icon">◼</span>
            <h4 className="tech-block-title">במות</h4>
          </div>
          <textarea
            className="tech-textarea"
            dir="auto"
            value={stages}
            onChange={(e) => setStages(e.target.value)}
            onBlur={() => save({ stages })}
            placeholder="פרטי הבמה, מידות, גובה..."
            rows={5}
          />
        </div>

        {/* ── Setlist ─────────────────────────────────────────── */}
        <div className="tech-block">
          <div className="tech-block-header">
            <span className="tech-block-icon">♩</span>
            <h4 className="tech-block-title">סטליסט</h4>
          </div>
          <textarea
            className="tech-textarea"
            dir="auto"
            value={setlist}
            onChange={(e) => setSetlist(e.target.value)}
            onBlur={() => save({ setlistNotes: setlist })}
            placeholder="רשימת שירים, סדר הופעה..."
            rows={5}
          />
        </div>

        {/* ── Equipment Checklist ─────────────────────────────── */}
        <div className="tech-block tech-block--checklist">
          <div className="tech-block-header">
            <span className="tech-block-icon">✓</span>
            <h4 className="tech-block-title">צ'קליסט ציוד</h4>
          </div>
          <div className="tech-checklist">
            {checklist.length === 0 && (
              <p className="tech-checklist-empty">אין פריטים עדיין</p>
            )}
            {checklist.map((item) => (
              <div key={item.id} className={`tech-checklist-row${item.checked ? ' checked' : ''}`}>
                <label className="tech-checklist-label">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => toggleChecklist(item.id)}
                  />
                  <span dir="auto">{item.label}</span>
                </label>
                <button
                  className="tech-checklist-del"
                  onClick={() => removeChecklist(item.id)}
                  title="Remove"
                >✕</button>
              </div>
            ))}
          </div>
          <div className="tech-checklist-add">
            <input
              className="tech-checklist-input"
              dir="auto"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addChecklistItem()}
              placeholder="הוסף פריט..."
            />
            <button
              className="btn-primary btn-sm"
              onClick={addChecklistItem}
              disabled={!newItem.trim()}
            >+</button>
          </div>
        </div>
      </div>

      {/* ── Technical Coordination ──────────────────────────── */}
      <div className="fixed-task-section" style={{ marginTop: 0 }}>
        <h4 className="fixed-task-title">Technical Coordination</h4>
        <div className="hub-tech-rows">

          {/* Sound */}
          <div className="hub-tech-row">
            <label className={`hub-coord-toggle${coord.sound ? ' hub-coord-toggle--on' : ''}`}>
              <input
                type="checkbox"
                checked={coord.sound}
                onChange={() => toggleCoord('sound')}
              />
              <span className="hub-coord-dot" />
              <span>Sound</span>
            </label>
            <div className="fixed-input-group" style={{ flex: 2 }}>
              <label>Rental Needs</label>
              <input
                className="fixed-input"
                dir="auto"
                value={coord.soundRentalNeeds}
                onChange={(e) => setCoord((p) => ({ ...p, soundRentalNeeds: e.target.value }))}
                onBlur={() => saveCoord(coord)}
                placeholder="Equipment to rent..."
              />
            </div>
            <div className="fixed-input-group">
              <label>Supplier</label>
              <input
                className="fixed-input"
                dir="auto"
                value={coord.soundRentalSupplier}
                onChange={(e) => setCoord((p) => ({ ...p, soundRentalSupplier: e.target.value }))}
                onBlur={() => saveCoord(coord)}
                placeholder="Rental company"
              />
            </div>
          </div>

          {/* Lighting */}
          <div className="hub-tech-row">
            <label className={`hub-coord-toggle${coord.lighting ? ' hub-coord-toggle--on' : ''}`}>
              <input
                type="checkbox"
                checked={coord.lighting}
                onChange={() => toggleCoord('lighting')}
              />
              <span className="hub-coord-dot" />
              <span>Lighting</span>
            </label>
            <div className="fixed-input-group" style={{ flex: 2 }}>
              <label>Rental Needs</label>
              <input
                className="fixed-input"
                dir="auto"
                value={coord.lightingRentalNeeds}
                onChange={(e) => setCoord((p) => ({ ...p, lightingRentalNeeds: e.target.value }))}
                onBlur={() => saveCoord(coord)}
                placeholder="Equipment to rent..."
              />
            </div>
            <div className="fixed-input-group">
              <label>Supplier</label>
              <input
                className="fixed-input"
                dir="auto"
                value={coord.lightingRentalSupplier}
                onChange={(e) => setCoord((p) => ({ ...p, lightingRentalSupplier: e.target.value }))}
                onBlur={() => saveCoord(coord)}
                placeholder="Rental company"
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default TechnicalManager;
