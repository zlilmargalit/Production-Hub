import { useState, useEffect } from 'react';

function TechnicalManager({ show, onUpdate }) {
  const [setlist,  setSetlist]  = useState(show.setlistNotes || '');
  const [newItem,  setNewItem]  = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [coord, setCoord] = useState({
    sound:                show.soundCoordinated        || false,
    lighting:             show.lightingCoordinated     || false,
    soundRentalNeeds:     show.soundRentalNeeds        || '',
    soundRentalSupplier:  show.soundRentalSupplier     || '',
    lightingRentalNeeds:  show.lightingRentalNeeds     || '',
    lightingRentalSupplier: show.lightingRentalSupplier || '',
  });

  const checklist = show.equipmentChecklist || [];

  // technicalSpec is either null/undefined, a legacy string, or { name, data, isPdf }
  const specFile = show.technicalSpec && typeof show.technicalSpec === 'object'
    ? show.technicalSpec
    : null;

  useEffect(() => {
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
    show.id, show.setlistNotes,
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

  // Split free text into one checklist item per non-empty line.
  const textToItems = (text) =>
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((label) => ({ id: crypto.randomUUID(), label, checked: false }));

  const addItemsFromText = (text) => {
    const items = textToItems(text);
    if (!items.length) return false;
    save({ equipmentChecklist: [...checklist, ...items] });
    return true;
  };

  const addChecklistItem = () => {
    const label = newItem.trim();
    if (!label) return;
    const updated = [...checklist, { id: crypto.randomUUID(), label, checked: false }];
    save({ equipmentChecklist: updated });
    setNewItem('');
  };

  // Paste of multi-line text into the single-item input → create several items.
  const handleInputPaste = (e) => {
    const text = e.clipboardData?.getData('text') || '';
    if (/\r?\n/.test(text.trim())) {
      e.preventDefault();
      addItemsFromText(text);
      setNewItem('');
    }
  };

  const addPasteList = () => {
    if (addItemsFromText(pasteText)) {
      setPasteText('');
      setPasteOpen(false);
    }
  };

  const toggleChecklist = (id) => {
    const updated = checklist.map((i) => i.id === id ? { ...i, checked: !i.checked } : i);
    save({ equipmentChecklist: updated });
  };

  const removeChecklist = (id) => {
    save({ equipmentChecklist: checklist.filter((i) => i.id !== id) });
  };

  const handleSpecFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      save({
        technicalSpec: {
          name: file.name,
          data: ev.target.result,
          isPdf: file.type === 'application/pdf',
        },
      });
    };
    reader.readAsDataURL(file);
    // reset so re-selecting the same file still fires onChange
    e.target.value = '';
  };

  return (
    <div className="tech-panel">
      {/* Header */}
      <div className="hub-header">
        <div className="hub-header-text">
          <div className="hub-eyebrow">Stage &amp; Tech</div>
          <div className="hub-heading">Technical</div>
        </div>
      </div>

      <div className="tech-grid">
        {/* Technical Spec — file attachment (compact wide row) */}
        <div className="tech-block tech-block--wide tech-block--file-row">
          <div className="tech-block-header">
            <h4 className="tech-block-title">Technical Spec</h4>
          </div>
          {specFile ? (
            <div className="tech-spec-attached">
              <a href={specFile.data} download={specFile.name} className="tech-spec-link">
                {specFile.name}
              </a>
              <button
                type="button"
                className="tech-spec-remove"
                onClick={() => save({ technicalSpec: null })}
                title="Remove"
              >
                ✕
              </button>
            </div>
          ) : (
            <label className="tech-spec-upload">
              <input
                type="file"
                accept="application/pdf,.pdf,image/*"
                style={{ display: 'none' }}
                onChange={handleSpecFile}
              />
              <span className="tech-spec-upload-btn">Attach file</span>
              <span className="tech-spec-upload-hint">PDF or image</span>
            </label>
          )}
        </div>

        {/* Setlist */}
        <div className="tech-block">
          <div className="tech-block-header">
            <h4 className="tech-block-title">Setlist</h4>
          </div>
          <textarea
            className="tech-textarea"
            dir="auto"
            value={setlist}
            onChange={(e) => setSetlist(e.target.value)}
            onBlur={() => save({ setlistNotes: setlist })}
            placeholder="Song list, show order..."
            rows={5}
          />
        </div>

        {/* Equipment Checklist */}
        <div className="tech-block tech-block--checklist">
          <div className="tech-block-header">
            <h4 className="tech-block-title">Equipment Checklist</h4>
          </div>
          <div className="tech-checklist">
            {checklist.length === 0 && (
              <p className="tech-checklist-empty">No items yet</p>
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
              onPaste={handleInputPaste}
              placeholder="Add item..."
            />
            <button
              className="btn-primary btn-sm"
              onClick={addChecklistItem}
              disabled={!newItem.trim()}
            >+</button>
          </div>
          <button
            type="button"
            className="tech-checklist-paste-toggle"
            onClick={() => setPasteOpen((v) => !v)}
          >
            {pasteOpen ? 'Cancel' : 'Paste list'}
          </button>
          {pasteOpen && (
            <div className="tech-checklist-paste">
              <textarea
                className="tech-checklist-paste-input"
                dir="auto"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste a list — one item per line"
                rows={5}
              />
              <button
                className="btn-primary btn-sm"
                onClick={addPasteList}
                disabled={!textToItems(pasteText).length}
              >
                Add {textToItems(pasteText).length || ''} items
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Technical Coordination */}
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
