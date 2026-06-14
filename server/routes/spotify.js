// Spotify Setlist Duration Calculator
// Uses the Client Credentials flow — no user login required.
// Credentials read from SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET env vars.

const express = require('express');
const router  = express.Router();

// ── In-memory token cache ────────────────────────────────────────────────────
let _token     = null;   // { value: string, expiresAt: number }

async function getToken() {
  const now = Date.now();
  if (_token && _token.expiresAt > now + 30_000) return _token.value;

  const id     = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error('SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set in environment');

  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Spotify auth failed (${resp.status}): ${txt}`);
  }

  const data    = await resp.json();
  _token        = { value: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return _token.value;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const AVOID_WORDS = /\b(live|remix|karaoke|instrumental|acoustic|cover|tribute|version)\b/i;

function userMentioned(word, originalText) {
  return new RegExp(`\\b${word}\\b`, 'i').test(originalText);
}

function fmtMs(ms) {
  if (!ms) return '0:00';
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtMsTotal(ms) {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Fuzzy title / artist matching ─────────────────────────────────────────────
// Normalise a title for comparison: lowercase, strip Hebrew niqqud/cantillation,
// drop punctuation (incl. geresh/gershayim), collapse whitespace.
function normalizeTitle(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')                      // Hebrew diacritics
    .replace(/[’'״׳"`.,!?:;()\[\]{}\-–—_/\\]/g, ' ')      // punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

// 0..1 similarity between two titles (1 = identical after normalisation).
function similarity(a, b) {
  const x = normalizeTitle(a), y = normalizeTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.9;
  const dist = levenshtein(x, y);
  return 1 - dist / Math.max(x.length, y.length);
}

const TITLE_THRESHOLD = 0.72;   // reject candidates whose title is too different
const ALBUM_RANK = { album: 3, single: 2, compilation: 1 };

// Raw Spotify search for a free-text or field-scoped query. Retries once on 429.
// Spotify rejects limit > 10 for this endpoint, so keep it at 10.
async function spotifySearch(query, token, retried = false) {
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10&market=US`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (resp.status === 429) {
    if (retried) return [];
    const wait = parseInt(resp.headers.get('retry-after') || '2', 10) * 1000;
    await new Promise((r) => setTimeout(r, Math.min(wait, 8000)));
    const fresh = await getToken();
    return spotifySearch(query, fresh, true);
  }
  if (!resp.ok) return [];
  const data = await resp.json();
  return data?.tracks?.items || [];
}

// Drop live/remix/karaoke/etc. unless the user explicitly typed that word.
function applyAvoidFilter(items, originalText) {
  const filtered = items.filter((t) => {
    const name = t.name.toLowerCase();
    const albumName = (t.album?.name || '').toLowerCase();
    for (const word of ['live', 'remix', 'karaoke', 'instrumental', 'acoustic', 'cover', 'tribute']) {
      if (AVOID_WORDS.test(name) || AVOID_WORDS.test(albumName)) {
        if (!userMentioned(word, originalText)) return false;
      }
    }
    return true;
  });
  return filtered.length > 0 ? filtered : items;
}

const EXACT_SIM = 0.97;   // treat as the same title (post-normalisation)

// Resolve one line to a track via a cascade of progressively looser queries,
// collecting every close title match. Earlier tiers are artist-scoped (where
// Spotify already constrained the artist); later tiers relax to title-only so a
// song whose typed "artist" is just the performer/collaborator still resolves.
// We stop as soon as an exact-title match appears, then rank globally so an exact
// title always beats a fuzzy near-match (e.g. "ריקי" wins over "ריקדי") and an
// artist-scoped hit beats a looser one when titles tie.
async function searchTrack(song, artist, originalText, token) {
  const hasArtist = artist && artist.toLowerCase() !== 'unknown';

  const tiers = [];
  if (hasArtist) {
    tiers.push(`track:"${song}" artist:"${artist}"`); // artist-scoped (exact)
    tiers.push(`${song} ${artist}`);                  // free text, artist as a hint
  }
  tiers.push(`track:"${song}"`);                      // title-scoped
  tiers.push(song);                                   // bare title (last resort)

  const collected = [];   // { t, sim, tier }
  for (let ti = 0; ti < tiers.length; ti++) {
    const items = applyAvoidFilter(await spotifySearch(tiers[ti], token), originalText);
    for (const t of items) {
      const sim = similarity(t.name, song);
      if (sim >= TITLE_THRESHOLD) collected.push({ t, sim, tier: ti });
    }
    // Once any exact-title candidate exists, looser tiers can't beat it — stop.
    if (collected.some((c) => c.sim >= EXACT_SIM)) break;
  }

  if (collected.length === 0) return null;

  collected.sort((a, b) => {
    const s = Math.round(b.sim * 100) - Math.round(a.sim * 100);   // exact title first
    if (s !== 0) return s;
    if (a.tier !== b.tier) return a.tier - b.tier;                  // prefer artist-scoped tier
    return (ALBUM_RANK[b.t.album?.album_type] ?? 0) - (ALBUM_RANK[a.t.album?.album_type] ?? 0);
  });

  const best = collected[0].t;
  return {
    songName:          best.name,
    artist:            best.artists.map((a) => a.name).join(', '),
    durationMs:        best.duration_ms,
    durationFormatted: fmtMs(best.duration_ms),
    spotifyUrl:        best.external_urls?.spotify || null,
    albumType:         best.album?.album_type || '',
  };
}

// A line made only of dots/ellipsis (e.g. "...", "…", "·") is a section break the
// user types between songs — never a song. It is skipped from search and counts.
const SEPARATOR_RE = /^[.…·•\s]+$/;
function isSeparatorLine(line) {
  return SEPARATOR_RE.test(line) && /[.…·•]/.test(line);
}

// ── Duration annotation parser ───────────────────────────────────────────────
// Matches: (9 דק׳)  (9 min)  (4:30)  (9:00)  (1:04:30)  (9 minutes)  (9 דקות)
// Also plain numbers with units: (9 דק) (9 minute)
const DURATION_ANNOTATION_RE = /\(\s*(\d{1,3}(?::\d{2}){0,2})\s*(?:min(?:utes?)?|דק[׳'ות]*)?\s*\)/i;

function parseAnnotation(line) {
  const m = line.match(DURATION_ANNOTATION_RE);
  if (!m) return null;
  const raw = m[1]; // "9" | "4:30" | "1:04:30"
  const parts = raw.split(':').map(Number);
  let ms;
  if (parts.length === 1) ms = parts[0] * 60_000;           // whole minutes
  else if (parts.length === 2) ms = (parts[0] * 60 + parts[1]) * 1000; // MM:SS
  else ms = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;       // HH:MM:SS
  return { ms, fullMatch: m[0] };
}

// ── POST /api/spotify/setlist-duration ───────────────────────────────────────
router.post('/setlist-duration', async (req, res) => {
  const { setlistText = '', defaultArtist = '' } = req.body || {};

  const lines = setlistText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return res.status(400).json({ error: 'setlistText is empty' });
  }
  if (lines.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 songs per request' });
  }

  let token;
  try {
    token = await getToken();
  } catch (err) {
    console.error('[spotify] auth error:', err.message);
    return res.status(503).json({ error: err.message });
  }

  const tracks = [];
  let totalDurationMs = 0;

  for (const line of lines) {
    // ── Section break ("..." / "…") — keep as a divider, never a song ────────
    if (isSeparatorLine(line)) {
      tracks.push({
        originalText:      line,
        songName:          line,
        artist:            '',
        durationMs:        0,
        durationFormatted: null,
        spotifyUrl:        null,
        isFound:           false,
        isSeparator:       true,
      });
      continue;
    }

    // ── Check for inline duration annotation first ──────────────────────────
    const annotation = parseAnnotation(line);
    // Strip the annotation from the line before further parsing
    const cleanLine = annotation ? line.replace(annotation.fullMatch, '').trim() : line;

    // Detect "Song - Artist" override: only split on first " - "
    const dashIdx = cleanLine.indexOf(' - ');
    let artist, song;
    if (dashIdx !== -1) {
      song   = cleanLine.slice(0, dashIdx).trim();
      artist = cleanLine.slice(dashIdx + 3).trim();
    } else {
      artist = defaultArtist.trim() || 'unknown';
      song   = cleanLine.trim();
    }

    // If the line carries an explicit duration, use it directly (skip Spotify)
    if (annotation) {
      totalDurationMs += annotation.ms;
      tracks.push({
        originalText:      line,
        songName:          song,
        artist:            artist,
        durationMs:        annotation.ms,
        durationFormatted: fmtMs(annotation.ms),
        spotifyUrl:        null,
        isFound:           true,
        isAnnotated:       true,   // caller can show a different indicator
      });
      continue;
    }

    let result = null;
    try {
      result = await searchTrack(song, artist, line, token);
    } catch (err) {
      console.error('[spotify] search error for', line, err.message);
    }

    if (result) {
      totalDurationMs += result.durationMs;
      tracks.push({
        originalText:      line,
        songName:          result.songName,
        artist:            result.artist,
        durationMs:        result.durationMs,
        durationFormatted: result.durationFormatted,
        spotifyUrl:        result.spotifyUrl,
        isFound:           true,
      });
    } else {
      tracks.push({
        originalText:      line,
        songName:          song,
        artist:            artist,
        durationMs:        0,
        durationFormatted: null,
        spotifyUrl:        null,
        isFound:           false,
      });
    }
  }

  res.json({
    tracks,
    totalDurationMs,
    totalDurationFormatted: fmtMsTotal(totalDurationMs),
  });
});

module.exports = router;
