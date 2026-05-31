import { useState } from 'react';
import BacklineChecklist from './backliner/BacklineChecklist';
import TechnicalSetlist  from './backliner/TechnicalSetlist';
import TechFiles         from './backliner/TechFiles';

const TABS = [
  { key: 'checklist', label: 'Checklist' },
  { key: 'setlist',   label: 'Setlist' },
  { key: 'files',     label: 'Files' },
];

export default function ShowBacklinePanel({ show, onUpdateShow }) {
  const [tab, setTab] = useState('checklist');

  return (
    <div className="bk-inline-panel">
      <div className="bk-inline-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`bk-inline-tab-btn${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="bk-inline-body">
        {tab === 'checklist' && <BacklineChecklist show={show} onUpdateShow={onUpdateShow} />}
        {tab === 'setlist'   && <TechnicalSetlist  show={show} onUpdateShow={onUpdateShow} />}
        {tab === 'files'     && <TechFiles         show={show} onUpdateShow={onUpdateShow} />}
      </div>
    </div>
  );
}
