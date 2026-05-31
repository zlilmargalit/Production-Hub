import { useState } from 'react';

const uuidv4 = () => crypto.randomUUID();

const fmtMs = (ms) => {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

export default function TechnicalSetlist({ show, onUpdateShow }) {
  const [editingId, setEditingId] = useState(null);
  const [editNote,  setEditNote]  = useState('');
  const [newSong,   setNewSong]   = useState('');

  const setlist = show.setlist || [];
  const patch = (next) => onUpdateShow(show.id, { ...show, setlist: next });

  const startEdit = (item) => { setEditingId(item.id); setEditNote(item.techNote || ''); };
  const saveNote  = (id) => {
    patch(setlist.map((s) => s.id === id ? { ...s, techNote: editNote.trim() } : s));
    setEditingId(null);
  };
  const addSong    = () => {
    const name = newSong.trim();
    if (!name) return;
    patch([...setlist, { id: uuidv4(), name, durationMs: null, techNote: '' }]);
    setNewSong('');
  };
  const removeSong = (id) => patch(setlist.filter((s) => s.id !== id));

  return (
    <div>
      {setlist.length === 0 ? (
        <p className="bk-setlist-import-hint">
          No setlist added. Add songs manually below.
        </p>
      ) : (
        <div className="bk-setlist-list">
          {setlist.map((song, idx) => (
            <div key={song.id} className="bk-setlist-row">
              <span className="bk-setlist-num">{idx + 1}.</span>
              <div className="bk-setlist-song">
                <span className="bk-setlist-name">{song.name}</span>
                {editingId === song.id ? (
                  <input
                    className="bk-add-input"
                    style={{ marginTop: 4 }}
                    autoFocus
                    placeholder="Tech note (e.g. Drop D tuning)…"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    onBlur={() => saveNote(song.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveNote(song.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                  />
                ) : (
                  song.techNote && <span className="bk-setlist-note">{song.techNote}</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {song.durationMs && <span className="bk-setlist-duration">{fmtMs(song.durationMs)}</span>}
                <button className="bk-icon-btn" title="Edit tech note" onClick={() => startEdit(song)}>✎</button>
                <button className="bk-icon-btn bk-icon-btn--danger" title="Remove" onClick={() => removeSong(song.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="bk-add-form">
        <input
          className="bk-add-input"
          placeholder="Add song…"
          dir="auto"
          value={newSong}
          onChange={(e) => setNewSong(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addSong(); }}
        />
        <button className="btn-ghost" onClick={addSong} disabled={!newSong.trim()}>Add</button>
      </div>
    </div>
  );
}
