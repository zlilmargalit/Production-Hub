const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { readJsonCached, writeJsonAndCache } = require('../cache');
const { dataPath, cacheKey } = require('../utils/userData');

const readEntries  = (userId) =>
  readJsonCached(cacheKey(userId, 'timelog'), dataPath(userId, 'timelog.json'), []);
const writeEntries = (userId, entries) =>
  writeJsonAndCache(cacheKey(userId, 'timelog'), dataPath(userId, 'timelog.json'), entries);

// Normalise an entry coming from the client into the stored shape.
function normalise(body) {
  const artist = ['assaf', 'hila', 'general'].includes(body.artist) ? body.artist : 'general';
  const hours  = Number(body.hours);
  return {
    artist,
    date:   typeof body.date === 'string' ? body.date.trim() : '',
    desc:   typeof body.desc === 'string' ? body.desc.trim() : '',
    hours:  Number.isFinite(hours) ? hours : 0,
    billed: !!body.billed,
  };
}

// GET /api/timelog
router.get('/', async (req, res, next) => {
  try {
    res.json(await readEntries(req.userId));
  } catch (err) { next(err); }
});

// POST /api/timelog
router.post('/', async (req, res, next) => {
  try {
    const fields = normalise(req.body || {});
    if (!fields.date)            return res.status(400).json({ error: 'date required' });
    if (!fields.desc)            return res.status(400).json({ error: 'desc required' });
    if (!(fields.hours > 0))     return res.status(400).json({ error: 'hours must be > 0' });
    const entries = await readEntries(req.userId);
    const entry = {
      id:        uuidv4(),
      ...fields,
      createdAt: new Date().toISOString(),
    };
    await writeEntries(req.userId, [...entries, entry]);
    res.status(201).json(entry);
  } catch (err) { next(err); }
});

// PUT /api/timelog/:id  (partial update — e.g. toggling billed)
router.put('/:id', async (req, res, next) => {
  try {
    const entries = await readEntries(req.userId);
    const idx = entries.findIndex((e) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Entry not found' });
    const updated = { ...entries[idx], ...req.body, id: entries[idx].id };
    await writeEntries(req.userId, entries.map((e, i) => (i === idx ? updated : e)));
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/timelog/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const entries = await readEntries(req.userId);
    const filtered = entries.filter((e) => e.id !== req.params.id);
    if (filtered.length === entries.length) return res.status(404).json({ error: 'Entry not found' });
    await writeEntries(req.userId, filtered);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
