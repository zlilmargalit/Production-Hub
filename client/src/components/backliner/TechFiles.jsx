import { useState } from 'react';

const uuidv4 = () => crypto.randomUUID();

const FILE_TYPES = [
  { key: 'stagePlot', label: 'Stage Plot' },
  { key: 'inputList', label: 'Input List' },
  { key: 'rider',     label: 'Rider' },
  { key: 'other',     label: 'Other' },
];

export default function TechFiles({ show, onUpdateShow }) {
  const [url,   setUrl]   = useState('');
  const [label, setLabel] = useState('');
  const [type,  setType]  = useState('stagePlot');

  const files = show.techFiles || [];
  const patch = (next) => onUpdateShow(show.id, { ...show, techFiles: next });

  const addFile = () => {
    const u = url.trim();
    const l = label.trim();
    if (!u || !l) return;
    patch([...files, { id: uuidv4(), type, label: l, url: u, addedAt: new Date().toISOString() }]);
    setUrl(''); setLabel('');
  };

  const removeFile = (id) => patch(files.filter((f) => f.id !== id));
  const typeLabel  = (key) => FILE_TYPES.find((t) => t.key === key)?.label || key;

  return (
    <div>
      {files.length > 0 ? (
        <div className="bk-files-grid">
          {files.map((f) => (
            <div key={f.id} className="bk-file-card">
              <span className="bk-file-type-tag">{typeLabel(f.type)}</span>
              <span className="bk-file-label">{f.label}</span>
              <div className="bk-file-actions">
                <a className="bk-file-link" href={f.url} target="_blank" rel="noopener noreferrer">Open</a>
                <button className="bk-icon-btn bk-icon-btn--danger" onClick={() => removeFile(f.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: 'var(--text-3)', fontSize: '0.875rem', marginBottom: 16 }}>
          No files linked. Paste a Google Drive, Dropbox, or any URL below.
        </p>
      )}
      <div className="bk-add-form" style={{ flexWrap: 'wrap' }}>
        <select
          className="gtask-select"
          value={type}
          onChange={(e) => setType(e.target.value)}
          style={{ flexShrink: 0 }}
        >
          {FILE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <input
          className="bk-add-input"
          placeholder="Label (e.g. Stage Plot v2)…"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ minWidth: 140 }}
        />
        <input
          className="bk-add-input"
          placeholder="URL…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addFile(); }}
          style={{ minWidth: 180 }}
        />
        <button className="btn-ghost" onClick={addFile} disabled={!url.trim() || !label.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}
