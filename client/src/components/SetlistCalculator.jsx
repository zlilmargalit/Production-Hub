import { useState, useEffect, useRef, useCallback } from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseManualTime(str) {
  if (!str || !str.trim()) return 0;
  const parts = str.trim().split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return 0;
}

function fmtMsTotal(ms) {
  if (!ms || ms <= 0) return '0:00:00';
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SetlistCalculator({
  defaultArtistName = '',
  artistName = '',
  artistId = null,
  shows = [],
}) {
  const [artistInput, setArtistInput] = useState(defaultArtistName);
  const [setlistText, setSetlistText] = useState('');
  const [tracks, setTracks]           = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [manualTimes, setManualTimes] = useState({});
  const textareaRef = useRef(null);

  // Saved setlists
  const [savedSetlists, setSavedSetlists] = useState([]);
  const [activeId, setActiveId]           = useState(null);  // currently loaded setlist id
  const [saveName, setSaveName]           = useState('');
  const [linkedShowId, setLinkedShowId]   = useState('');
  const [saving, setSaving]               = useState(false);
  const [saveMsg, setSaveMsg]             = useState(null);  // { ok } | { err }

  // Sync default artist when workspace switches
  useEffect(() => { setArtistInput(defaultArtistName); }, [defaultArtistName]);

  // Load saved setlists
  const loadSaved = useCallback(async () => {
    const qs = artistId ? `?artistId=${encodeURIComponent(artistId)}` : '';
    const r = await fetch(`/api/setlists${qs}`);
    if (r.ok) setSavedSetlists(await r.json());
  }, [artistId]);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  // ── Spotify calculate ──────────────────────────────────────────────────────
  const calculate = async () => {
    const trimmed = setlistText.trim();
    if (!trimmed) { setError('Paste at least one song.'); return; }
    setLoading(true);
    setError(null);
    setTracks(null);
    setManualTimes({});
    try {
      const res  = await fetch('/api/spotify/setlist-duration', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ setlistText: trimmed, defaultArtist: artistInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setTracks(data.tracks);
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totalMs = (tracks || []).reduce((sum, t, i) => {
    if (t.isFound) return sum + t.durationMs;
    const manual = parseManualTime(manualTimes[i] || '');
    return sum + manual;
  }, 0);

  const foundCount  = (tracks || []).filter((t) => t.isFound).length;
  const missedCount = (tracks || []).length - foundCount;
  const manualCount = Object.values(manualTimes).filter((v) => v.trim()).length;

  // ── Save / Update ──────────────────────────────────────────────────────────
  const doSave = async () => {
    const name = saveName.trim();
    if (!name) { setSaveMsg({ err: 'Enter a name first.' }); return; }
    if (!setlistText.trim()) { setSaveMsg({ err: 'Nothing to save.' }); return; }
    setSaving(true);
    setSaveMsg(null);
    try {
      let r, data;
      if (activeId) {
        r    = await fetch(`/api/setlists/${activeId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, showId: linkedShowId || null, setlistText, tracks: tracks || [] }),
        });
        data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Failed');
        setSavedSetlists(prev => prev.map(s => s.id === activeId ? data : s));
      } else {
        r    = await fetch('/api/setlists', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, artistId, showId: linkedShowId || null, setlistText, tracks: tracks || [] }),
        });
        data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Failed');
        setSavedSetlists(prev => [...prev, data]);
        setActiveId(data.id);
      }
      setSaveMsg({ ok: true });
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (err) {
      setSaveMsg({ err: err.message });
    } finally {
      setSaving(false);
    }
  };

  // ── Load a saved setlist ───────────────────────────────────────────────────
  const loadSetlist = (sl) => {
    setActiveId(sl.id);
    setSaveName(sl.name);
    setSetlistText(sl.setlistText || '');
    setLinkedShowId(sl.showId || '');
    setTracks(sl.tracks?.length ? sl.tracks : null);
    setManualTimes({});
    setError(null);
    setArtistInput(defaultArtistName);
  };

  // ── New (clear) ────────────────────────────────────────────────────────────
  const newSetlist = () => {
    setActiveId(null);
    setSaveName('');
    setSetlistText('');
    setLinkedShowId('');
    setTracks(null);
    setManualTimes({});
    setError(null);
  };

  // ── Delete saved ───────────────────────────────────────────────────────────
  const deleteSetlist = async (id) => {
    if (!window.confirm('Delete this setlist?')) return;
    await fetch(`/api/setlists/${id}`, { method: 'DELETE' });
    setSavedSetlists(prev => prev.filter(s => s.id !== id));
    if (activeId === id) newSetlist();
  };

  // ── Export to Drive ────────────────────────────────────────────────────────
  const [exporting,    setExporting]    = useState(false);
  const [exportResult, setExportResult] = useState(null);

  const exportToDrive = async () => {
    if (!tracks?.length) return;
    setExporting(true);
    setExportResult(null);
    try {
      const res = await fetch('/api/drive/export-setlist', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tracks,
          totalDuration: fmtMsTotal(totalMs),
          artistName:    artistName || artistInput.trim(),
          defaultArtist: artistInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Export failed');
      setExportResult({ url: data.url });
    } catch (err) {
      setExportResult({ error: err.message });
    } finally {
      setExporting(false);
    }
  };

  // ── Linked show name ───────────────────────────────────────────────────────
  const linkedShow = shows.find(s => s.id === linkedShowId);

  return (
    <div className="tools-page">

      {/* ── Tools Sidebar ── */}
      <aside className="tools-sidebar">
        <div className="tools-sidebar-eyebrow">Tools</div>
        <nav>
          <button className="tools-nav-item tools-nav-item--active">
            <svg className="tools-nav-icon" viewBox="0 0 16 16" fill="none"
                 stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 4h12M2 8h12M2 12h7" />
            </svg>
            Setlist Calculator
          </button>
        </nav>

        {/* ── Saved setlists list ── */}
        <div className="slc-saved-section">
          <div className="slc-saved-header">
            <span className="slc-saved-eyebrow">Saved Setlists</span>
            <button className="slc-saved-new" onClick={newSetlist} title="New setlist">＋</button>
          </div>
          {savedSetlists.length === 0 ? (
            <p className="slc-saved-empty">None yet — save one below.</p>
          ) : (
            <ul className="slc-saved-list">
              {savedSetlists.map(sl => {
                const linked = shows.find(s => s.id === sl.showId);
                return (
                  <li
                    key={sl.id}
                    className={`slc-saved-item${activeId === sl.id ? ' active' : ''}`}
                    onClick={() => loadSetlist(sl)}
                  >
                    <div className="slc-saved-name">{sl.name}</div>
                    {linked && (
                      <div className="slc-saved-show">{linked.name}</div>
                    )}
                    <div className="slc-saved-meta">{fmtDate(sl.updatedAt)}</div>
                    <button
                      className="slc-saved-del"
                      onClick={(e) => { e.stopPropagation(); deleteSetlist(sl.id); }}
                      title="Delete"
                    >✕</button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="tools-sidebar-footer">More tools coming soon</div>
      </aside>

      {/* ── Main Content ── */}
      <main className="tools-main">
        <header className="tools-tool-header">
          <h2 className="tools-tool-title">Setlist Calculator</h2>
          <p className="tools-tool-desc">
            Paste your setlist — Spotify fills in durations, you get the total show length.
          </p>
        </header>

        <div className="slc-dashboard">

          {/* Left: Input Panel */}
          <div className="slc-input-panel">

            <div className="slc-field">
              <label className="slc-label">Default Artist</label>
              <input
                className="slc-input"
                type="text"
                value={artistInput}
                onChange={(e) => setArtistInput(e.target.value)}
                placeholder="e.g. Radiohead"
              />
            </div>

            <div className="slc-format-guide">
              <div className="slc-format-eyebrow">Cover / Guest Override Format</div>
              <div className="slc-format-chip">
                <span className="slc-format-seg slc-format-seg--song">Song Name</span>
                <span className="slc-format-seg slc-format-seg--dash"> - </span>
                <span className="slc-format-seg slc-format-seg--artist">Artist Name</span>
              </div>
              <p className="slc-format-hint">
                Write a line in this format to override the default artist for that track only.
              </p>
            </div>

            <div className="slc-field">
              <label className="slc-label">
                Setlist
                {setlistText.split('\n').filter((l) => l.trim()).length > 0 && (
                  <span className="slc-song-count">
                    {setlistText.split('\n').filter((l) => l.trim()).length} songs
                  </span>
                )}
              </label>
              <textarea
                ref={textareaRef}
                className="slc-textarea"
                value={setlistText}
                onChange={(e) => setSetlistText(e.target.value)}
                placeholder={`Creep\nFake Plastic Trees\nTeva - Hila Ruach\nKarma Police`}
                rows={13}
                dir="auto"
                spellCheck={false}
              />
            </div>

            {error && <p className="slc-error">{error}</p>}

            <div className="slc-btn-row">
              <button className="slc-btn" onClick={calculate} disabled={loading}>
                {loading ? 'Searching Spotify…' : '▶  Calculate Duration'}
              </button>
            </div>

            {/* ── Save bar ── */}
            <div className="slc-save-bar">
              <input
                className="slc-input slc-save-name-input"
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Setlist name…"
                onKeyDown={(e) => { if (e.key === 'Enter') doSave(); }}
              />
              {shows.length > 0 && (
                <select
                  className="slc-input slc-show-select"
                  value={linkedShowId}
                  onChange={(e) => setLinkedShowId(e.target.value)}
                >
                  <option value="">— Link to show —</option>
                  {shows.filter(s => !s.archived).map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.date ? ` · ${s.date}` : ''}
                    </option>
                  ))}
                </select>
              )}
              <button
                className="slc-save-btn"
                onClick={doSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : activeId ? 'Update' : 'Save'}
              </button>
              {saveMsg?.ok  && <span className="slc-save-ok">Saved</span>}
              {saveMsg?.err && <span className="slc-save-err">{saveMsg.err}</span>}
            </div>

            {activeId && (
              <button className="slc-new-btn" onClick={newSetlist}>
                ＋ New setlist
              </button>
            )}

          </div>{/* /input panel */}

          {/* Right: Results Panel */}
          <div className="slc-results-panel">

            {!tracks && !loading && (
              <div className="slc-panel-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="1" width="38" height="38" style={{ opacity: 0.22 }}>
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" strokeLinecap="round" strokeWidth="1.5" />
                </svg>
                <p>Results will appear here</p>
                <span>after you calculate</span>
              </div>
            )}

            {loading && (
              <div className="slc-panel-empty">
                <div className="slc-page-spinner"></div>
                <p>Searching Spotify…</p>
              </div>
            )}

            {tracks && (
              <>
                <div className="slc-summary">
                  <span className="slc-total-label">Total Setlist Duration</span>
                  <span className="slc-total-time">{fmtMsTotal(totalMs)}</span>
                  <span className="slc-summary-meta">
                    {tracks.length} songs · {foundCount} found on Spotify
                    {missedCount > 0 && ` · ${missedCount - manualCount} missing`}
                    {manualCount > 0 && ` · ${manualCount} manual`}
                  </span>
                  {linkedShow && (
                    <span className="slc-summary-show">
                      Linked: {linkedShow.name}
                    </span>
                  )}
                </div>

                <div className="slc-table-scroll">
                  <table className="slc-table">
                    <thead>
                      <tr>
                        <th className="slc-th slc-th--num">#</th>
                        <th className="slc-th">Song</th>
                        <th className="slc-th">Artist</th>
                        <th className="slc-th slc-th--dur">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tracks.map((t, i) => (
                        <tr key={i} className={`slc-row${t.isFound ? '' : ' slc-row--miss'}`}>
                          <td className="slc-td slc-td--num">{i + 1}</td>
                          <td className="slc-td slc-td--song">
                            <span className={`slc-dot ${t.isFound ? 'slc-dot--ok' : 'slc-dot--miss'}`} />
                            {t.isFound && t.spotifyUrl ? (
                              <a href={t.spotifyUrl} target="_blank" rel="noreferrer"
                                 className="slc-link" title="Open on Spotify">
                                {t.songName}
                              </a>
                            ) : (
                              <span>{t.songName}</span>
                            )}
                          </td>
                          <td className="slc-td slc-td--artist">{t.artist}</td>
                          <td className="slc-td slc-td--dur">
                            {t.isFound ? (
                              <span className="slc-dur">{t.durationFormatted}</span>
                            ) : (
                              <div className="slc-manual-wrap">
                                <input
                                  className="slc-manual-input"
                                  type="text"
                                  placeholder="M:SS"
                                  value={manualTimes[i] || ''}
                                  onChange={(e) =>
                                    setManualTimes((prev) => ({ ...prev, [i]: e.target.value }))
                                  }
                                  title="Enter duration manually (M:SS)"
                                />
                                {manualTimes[i] && parseManualTime(manualTimes[i]) > 0 && (
                                  <span className="slc-dur slc-dur--manual">
                                    {fmtMsTotal(parseManualTime(manualTimes[i])).replace(/^0:/, '')}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {missedCount > 0 && (
                  <p className="slc-footer-note">
                    Not found on Spotify? Enter M:SS manually — the total updates live.
                  </p>
                )}

                <div className="slc-export-bar">
                  <button
                    className="slc-export-btn"
                    onClick={exportToDrive}
                    disabled={exporting}
                  >
                    {exporting ? 'Uploading…' : (
                      <>
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
                             strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                             width="13" height="13">
                          <path d="M3 13h10M8 2v8M5 7l3 3 3-3" />
                        </svg>
                        Export to Drive
                      </>
                    )}
                  </button>
                  {exportResult?.url && (
                    <a className="slc-export-link" href={exportResult.url}
                       target="_blank" rel="noreferrer">
                      Open in Drive ↗
                    </a>
                  )}
                  {exportResult?.error && (
                    <span className="slc-export-error">{exportResult.error}</span>
                  )}
                </div>
              </>
            )}

          </div>{/* /results panel */}
        </div>{/* /dashboard */}
      </main>
    </div>
  );
}
