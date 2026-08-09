const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');

const { dataPath, cacheKey, ensureArtistDir } = require('../utils/userData');
const { readJsonCached, writeJsonAndCache }    = require('../cache');

// A workspace is an artist record with a workType. Records saved before this
// field existed have no value, so every read normalises to 'production' — no
// migration, no rewriting of existing files.
const WORK_TYPES = ['production', 'administration', 'calendar', 'custom'];
const DEFAULT_WORK_TYPE = 'production';
function normalizeWorkType(v) {
  const t = String(v || '').trim().toLowerCase();
  return WORK_TYPES.includes(t) ? t : DEFAULT_WORK_TYPE;
}
// Enums are normalised on write and defaulted on read, so a free-text value can
// never reach storage (see the crew.json `role` drift this codebase already has).
const withWorkType = (a) => ({ ...a, workType: normalizeWorkType(a.workType) });

// ── Helpers ──────────────────────────────────────────────────────────────────
const readArtists  = (uid) =>
  readJsonCached(cacheKey(uid, 'artists'), dataPath(uid, 'artists.json'), []);
const writeArtists = (uid, data) =>
  writeJsonAndCache(cacheKey(uid, 'artists'), dataPath(uid, 'artists.json'), data);

// ── GET / — list all artists for the current user ────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    res.json((await readArtists(req.userId)).map(withWorkType));
  } catch (err) { next(err); }
});

// ── POST / — create a new artist ─────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const name = (req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });

    // Reject an unrecognised workType rather than silently coercing it — on
    // create the caller stated an intent, and a typo should surface.
    if (req.body?.workType !== undefined &&
        !WORK_TYPES.includes(String(req.body.workType).trim().toLowerCase())) {
      return res.status(400).json({ error: `workType must be one of: ${WORK_TYPES.join(', ')}` });
    }
    const artists   = await readArtists(req.userId);
    const newArtist = {
      id: uuidv4(),
      name,
      workType: normalizeWorkType(req.body?.workType),
      color: typeof req.body?.color === 'string' ? req.body.color : undefined,
      createdAt: new Date().toISOString(),
    };
    if (newArtist.color === undefined) delete newArtist.color;
    artists.push(newArtist);
    await writeArtists(req.userId, artists);
    await ensureArtistDir(req.userId, newArtist.id);   // create isolated data dirs

    res.status(201).json(newArtist);
  } catch (err) { next(err); }
});

// ── PUT /:id — rename an artist ───────────────────────────────────────────────
router.put('/:id', async (req, res, next) => {
  try {
    const name = (req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const artists = await readArtists(req.userId);
    const idx     = artists.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Artist not found' });

    artists[idx] = { ...artists[idx], name };
    await writeArtists(req.userId, artists);
    res.json(artists[idx]);
  } catch (err) { next(err); }
});

// ── DELETE /:id — remove an artist from the list ─────────────────────────────
// Data files are kept on disk for safety; only the list entry is removed.
router.delete('/:id', async (req, res, next) => {
  try {
    const artists  = await readArtists(req.userId);
    const filtered = artists.filter((a) => a.id !== req.params.id);
    if (filtered.length === artists.length)
      return res.status(404).json({ error: 'Artist not found' });

    await writeArtists(req.userId, filtered);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
