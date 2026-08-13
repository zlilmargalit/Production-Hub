import { useState } from 'react';
import { useT } from '../../i18n';

const uuidv4 = () => crypto.randomUUID();

const FILE_TYPES = [
  { key: 'stagePlot', labelKey: 'backline.file.stagePlot' },
  { key: 'inputList', labelKey: 'backline.file.inputList' },
  { key: 'rider',     labelKey: 'backline.file.rider' },
  { key: 'other',     labelKey: 'backline.file.other' },
];

export default function TechFiles({ show, onUpdateShow }) {
  const { t } = useT();
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
  const typeLabel  = (key) => {
    const fileType = FILE_TYPES.find((item) => item.key === key);
    return fileType ? t(fileType.labelKey) : key;
  };

  return (
    <div>
      {files.length > 0 ? (
        <div className="bk-files-grid">
          {files.map((f) => (
            <div key={f.id} className="bk-file-card">
              <span className="bk-file-type-tag">{typeLabel(f.type)}</span>
              <span className="bk-file-label">{f.label}</span>
              <div className="bk-file-actions">
                <a className="bk-file-link" href={f.url} target="_blank" rel="noopener noreferrer">{t('common.open')}</a>
                <button className="bk-icon-btn bk-icon-btn--danger" onClick={() => removeFile(f.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: 'var(--text-3)', fontSize: '0.875rem', marginBottom: 16 }}>
          {t('backline.noFiles')}
        </p>
      )}
      <div className="bk-add-form" style={{ flexWrap: 'wrap' }}>
        <select
          className="gtask-select"
          value={type}
          onChange={(e) => setType(e.target.value)}
          style={{ flexShrink: 0 }}
        >
          {FILE_TYPES.map((fileType) => <option key={fileType.key} value={fileType.key}>{t(fileType.labelKey)}</option>)}
        </select>
        <input
          className="bk-add-input"
          placeholder={t('backline.fileLabel')}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ minWidth: 140 }}
        />
        <input
          className="bk-add-input"
          placeholder={t('backline.url')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addFile(); }}
          style={{ minWidth: 180 }}
        />
        <button className="btn-ghost" onClick={addFile} disabled={!url.trim() || !label.trim()}>
          {t('common.add')}
        </button>
      </div>
    </div>
  );
}
