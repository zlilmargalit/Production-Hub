import { useState, useEffect, useRef } from 'react';

// Parse MM:SS or M:SS string → milliseconds
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

export default function SetlistCalculator({ defaultArtistName = '', artistName = '' }) {
  const [artistInput, setArtistInput]     = useState(defaultArtistName);
  const [setlistText, setSetlistText]     = useState('');
  const [tracks, setTracks]               = useState(null);   // null = not yet run
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);
  const [manualTimes, setManualTimes]     = useState({});     // index → "M:SS" string
  const textareaRef = useRef(null);

  // Sync default artist when workspace switches
  useEffect(() => {
    setArtistInput(defaultArtistName);
  }, [defaultArtistName]);

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

  // Recompute total including manual overrides
  const totalMs = (tracks || []).reduce((sum, t, i) => {
    if (t.isFound) return sum + t.durationMs;
    const manual = parseManualTime(manualTimes[i] || '');
    return sum + manual;
  }, 0);

  const foundCount  = (tracks || []).filter((t) => t.isFound).length;
  const missedCount = (tracks || []).length - foundCount;
  const manualCount = Object.values(manualTimes).filter((v) => v.trim()).length;

  // ── Export to Drive ────────────────────────────────────────────────────────
  const [exporting,    setExporting]    = useState(false);
  const [exportResult, setExportResult] = useState(null); // { url } | { error }

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
          totalDuration:  fmtMsTotal(totalMs),
          artistName:     artistName || artistInput.trim(),
          defaultArtist:  artistInput.trim(),
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
                    {exporting
                      ? 'Uploading…'
                      : (
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
                    <a
                      className="slc-export-link"
                      href={exportResult.url}
                      target="_blank"
                      rel="noreferrer"
                    >
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
