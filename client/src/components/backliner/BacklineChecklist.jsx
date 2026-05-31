import { useState, useCallback } from 'react';

const uuidv4 = () => crypto.randomUUID();

export default function BacklineChecklist({ show, onUpdateShow }) {
  const [newText,  setNewText]  = useState({ loadIn: '', loadOut: '' });
  const [isRental, setIsRental] = useState({ loadIn: false, loadOut: false });

  const checklist = show.checklist || { loadIn: [], loadOut: [] };

  const patchChecklist = useCallback(async (next) => {
    await onUpdateShow(show.id, { ...show, checklist: next });
  }, [show, onUpdateShow]);

  const toggleItem = (phase, id) => {
    patchChecklist({
      ...checklist,
      [phase]: checklist[phase].map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item
      ),
    });
  };

  const removeItem = (phase, id) => {
    patchChecklist({ ...checklist, [phase]: checklist[phase].filter((i) => i.id !== id) });
  };

  const addItem = (phase) => {
    const text = newText[phase].trim();
    if (!text) return;
    const item = { id: uuidv4(), text, checked: false, rental: isRental[phase], rentalFrom: '' };
    patchChecklist({ ...checklist, [phase]: [...checklist[phase], item] });
    setNewText((prev) => ({ ...prev, [phase]: '' }));
    setIsRental((prev) => ({ ...prev, [phase]: false }));
  };

  const total = checklist.loadIn.length + checklist.loadOut.length;
  const done  = [...checklist.loadIn, ...checklist.loadOut].filter((i) => i.checked).length;
  const pct   = total ? Math.round((done / total) * 100) : 0;

  const Col = ({ phase, label }) => (
    <div>
      <p className="bk-checklist-col-title">{label}</p>
      {checklist[phase].map((item) => (
        <div key={item.id} className="bk-checklist-item">
          <input
            type="checkbox"
            className="bk-checklist-check"
            checked={item.checked}
            onChange={() => toggleItem(phase, item.id)}
          />
          <span className={`bk-checklist-text${item.checked ? ' bk-checklist-text--done' : ''}`}>
            {item.text}
          </span>
          {item.rental && <span className="bk-rental-tag">Rental</span>}
          <span className="bk-item-actions">
            <button
              className="bk-icon-btn bk-icon-btn--danger"
              title="Remove"
              onClick={() => removeItem(phase, item.id)}
            >
              ✕
            </button>
          </span>
        </div>
      ))}
      <div className="bk-add-row">
        <input
          className="bk-add-input"
          placeholder="Add item…"
          dir="auto"
          value={newText[phase]}
          onChange={(e) => setNewText((prev) => ({ ...prev, [phase]: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') addItem(phase); }}
        />
        <button
          className={`bk-rental-toggle${isRental[phase] ? ' on' : ''}`}
          onClick={() => setIsRental((prev) => ({ ...prev, [phase]: !prev[phase] }))}
        >
          Rental
        </button>
        <button className="btn-ghost" onClick={() => addItem(phase)} disabled={!newText[phase].trim()}>
          Add
        </button>
      </div>
    </div>
  );

  return (
    <div>
      {total > 0 && (
        <div className="bk-checklist-progress">
          <span>{done}/{total}</span>
          <div className="bk-progress-bar">
            <div className="bk-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span>{pct}%</span>
        </div>
      )}
      <div className="bk-checklist-cols">
        <Col phase="loadIn"  label="Load In"  />
        <Col phase="loadOut" label="Load Out" />
      </div>
    </div>
  );
}
