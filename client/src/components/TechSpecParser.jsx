import { useState } from 'react';

function TechSpecParser({ shows, onUpdateShow, artistId }) {
  const [uploading,      setUploading]      = useState(false);
  const [editItems,      setEditItems]      = useState(null); // null = no file yet
  const [newItemText,    setNewItemText]    = useState('');
  const [selectedShowId, setSelectedShowId] = useState('');
  const [importDone,     setImportDone]     = useState(false);
  const [error,          setError]          = useState(null);

  const qs = artistId ? `?artistId=${encodeURIComponent(artistId)}` : '';

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setEditItems(null);
    setImportDone(false);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const res = await fetch(`/api/tools/tech-spec-parse${qs}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileData: ev.target.result, fileName: file.name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not parse PDF');
        const items = (data.items || []).map((label) => ({
          id: crypto.randomUUID(),
          label,
        }));
        setEditItems(items);
      } catch (err) {
        setError(err.message);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeItem = (id) => setEditItems((prev) => prev.filter((i) => i.id !== id));

  const addManualItem = () => {
    const text = newItemText.trim();
    if (!text) return;
    setEditItems((prev) => [...prev, { id: crypto.randomUUID(), label: text }]);
    setNewItemText('');
  };

  const handleImport = () => {
    if (!selectedShowId || !editItems?.length) return;
    const show = shows.find((s) => s.id === selectedShowId);
    if (!show) return;

    const existing = show.equipmentChecklist || [];
    const toAdd = editItems.map((i) => ({
      id: crypto.randomUUID(),
      label: i.label,
      checked: false,
    }));

    onUpdateShow(show.id, { ...show, equipmentChecklist: [...existing, ...toAdd] });
    setImportDone(true);
  };

  const reset = () => {
    setEditItems(null);
    setSelectedShowId('');
    setImportDone(false);
    setError(null);
  };

  const activeShows = (shows || []).filter((s) => !s.archived);

  return (
    <div className="tsp-page">
      <div className="tsp-header">
        <h2 className="tsp-title">Tech Spec Parser</h2>
        <p className="tsp-desc">
          Upload a technical rider PDF. The tool extracts the equipment list so you can
          review, edit, and add it directly to a show's checklist.
        </p>
      </div>

      {/* Step 1 — Upload */}
      <div className="tsp-step">
        <span className="tsp-step-num">1</span>
        <div className="tsp-step-body">
          <div className="tsp-step-label">Upload tech rider</div>
          <label className={`tsp-drop-zone${uploading ? ' tsp-drop-zone--busy' : ''}`}>
            <input
              type="file"
              accept="application/pdf,.pdf"
              style={{ display: 'none' }}
              onChange={handleFile}
              disabled={uploading}
            />
            {uploading ? (
              <span className="tsp-drop-text">Parsing PDF…</span>
            ) : (
              <>
                <span className="tsp-drop-plus">+</span>
                <span className="tsp-drop-text">Click to upload PDF</span>
              </>
            )}
          </label>
          {error && <p className="tsp-error">{error}</p>}
        </div>
      </div>

      {/* Step 2 — Review items */}
      {editItems !== null && (
        <div className="tsp-step">
          <span className="tsp-step-num">2</span>
          <div className="tsp-step-body">
            <div className="tsp-step-label">
              Review &amp; edit extracted items
              {editItems.length > 0 && <span className="tsp-count">{editItems.length}</span>}
            </div>

            {editItems.length === 0 ? (
              <p className="tsp-empty">No equipment items detected. Add them manually below.</p>
            ) : (
              <div className="tsp-items">
                {editItems.map((item) => (
                  <div key={item.id} className="tsp-item">
                    <span className="tsp-item-label" dir="auto">{item.label}</span>
                    <button
                      className="tsp-item-del"
                      onClick={() => removeItem(item.id)}
                      title="Remove"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}

            <div className="tsp-add-row">
              <input
                className="tsp-add-input"
                dir="auto"
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addManualItem()}
                placeholder="Add item manually..."
              />
              <button
                className="btn-primary btn-sm"
                onClick={addManualItem}
                disabled={!newItemText.trim()}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — Add to show */}
      {editItems !== null && editItems.length > 0 && (
        <div className="tsp-step">
          <span className="tsp-step-num">3</span>
          <div className="tsp-step-body">
            <div className="tsp-step-label">Add to show checklist</div>
            <div className="tsp-import-row">
              <select
                className="tsp-show-select"
                value={selectedShowId}
                onChange={(e) => { setSelectedShowId(e.target.value); setImportDone(false); }}
                disabled={importDone}
              >
                <option value="">Select a show…</option>
                {activeShows.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.date
                      ? ` — ${new Date(s.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`
                      : ''}
                  </option>
                ))}
              </select>
              <button
                className="btn-primary"
                onClick={handleImport}
                disabled={!selectedShowId || importDone}
              >
                {importDone ? 'Added' : `Add ${editItems.length} item${editItems.length !== 1 ? 's' : ''}`}
              </button>
            </div>
            {importDone && (
              <div className="tsp-success-row">
                <span className="tsp-success">Items added to checklist.</span>
                <button className="btn-ghost btn-sm" onClick={reset}>Parse another</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TechSpecParser;
