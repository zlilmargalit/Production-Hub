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

export default function SetlistCalculator({ defaultArtistName = '' }) {
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

  return (
    <div className="slc-page">
      <div className="slc-header">
        <h2 className="slc-title">Setlist Duration Calculator</h2>
        <p className="slc-sub">
          Paste your setlist — one song per line. To override the artist for a single
          track, write <code>Artist Name - Song Name</code>.
        </p>
      </div>

      <div className="slc-form">
        {/* Default artist */}
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

        {/* Setlist textarea */}
        <div className="slc-field">
          <label className="slc-label">Setlist</label>
          <textarea
            ref={textareaRef}
            className="slc-textarea"
            value={setlistText}
            onChange={(e) => setSetlistText(e.target.value)}
            placeholder={`Creep\nFake Plastic Trees\nOther Artist - Their Song\nKarma Police`}
            rows={12}
            dir="auto"
            spellCheck={false}
          />
          <span className="slc-line-count">
            {setlistText.split('\n').filter((l) => l.trim()).length} songs
          </span>
        </div>

        <button
          className="slc-btn"
          onClick={calculate}
          disabled={loading}
        >
          {loading ? 'Searching Spotify…' : '▶ Calculate Duration'}
        </button>

        {error && <p className="slc-error">{error}</p>}
      </div>

      {/* ── Results ── */}
      {tracks && (
        <div className="slc-results">
          <div className="slc-summary">
            <span className="slc-total-label">Total Setlist Duration</span>
            <span className="slc-total-time">{fmtMsTotal(totalMs)}</span>
            <span className="slc-summary-meta">
              {tracks.length} songs · {foundCount} found on Spotify
              {missedCount > 0 && ` · ${missedCount - manualCount} missing`}
              {manualCount > 0 && ` · ${manualCount} manual`}
            </span>
          </div>

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
                      <a
                        href={t.spotifyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="slc-link"
                        title="Open on Spotify"
                      >
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

          <div className="slc-footer-note">
            Not found on Spotify? Type the duration manually (M:SS) and the total updates live.
          </div>
        </div>
      )}
    </div>
  );
}
