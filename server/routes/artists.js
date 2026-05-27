const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');

const { dataPath, cacheKey, ensureArtistDir } = require('../utils/userData');
const { readJsonCached, writeJsonAndCache }    = require('../cache');

// ── Helpers ──────────────────────────────────────────────────────────────────
const readArtists  = (uid) =>
  readJsonCached(cacheKey(uid, 'artists'), dataPath(uid, 'artists.json'), []);
const writeArtists = (uid, data) =>
  writeJsonAndCache(cacheKey(uid, 'artists'), dataPath(uid, 'artists.json'), data);

// ── GET / — list all artists for the current user ────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    res.json(await readArtists(req.userId));
  } catch (err) { next(err); }
});

// ── POST / — create a new artist ─────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const name = (req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const artists   = await readArtists(req.userId);
    const newArtist = { id: uuidv4(), name, createdAt: new Date().toISOString() };
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
