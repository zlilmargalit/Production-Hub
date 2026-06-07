const express = require('express');
const router = express.Router();
const { readJsonCached, writeJsonAndCache } = require('../cache');
const { dataPath, cacheKey } = require('../utils/userData');

const read  = (uid) => readJsonCached(cacheKey(uid, 'eventTypes'), dataPath(uid, 'event-types.json'), []);
const write = (uid, d) => writeJsonAndCache(cacheKey(uid, 'eventTypes'), dataPath(uid, 'event-types.json'), d);

const readChecklists  = (uid) => readJsonCached(cacheKey(uid, 'etChecklists'), dataPath(uid, 'event-type-checklists.json'), {});
const writeChecklists = (uid, d) => writeJsonAndCache(cacheKey(uid, 'etChecklists'), dataPath(uid, 'event-type-checklists.json'), d);

router.get('/', async (req, res, next) => {
  try {
    res.json(await read(req.userId));
  } catch (err) { next(err); }
});

router.put('/', async (req, res, next) => {
  try {
    const types = req.body;
    if (!Array.isArray(types)) return res.status(400).json({ error: 'Expected array' });
    await write(req.userId, types);
    res.json(types);
  } catch (err) { next(err); }
});

// GET /api/event-types/checklists
// Returns { [typeName]: { before: [{id,text}], venue: [{id,text}] } }
router.get('/checklists', async (req, res, next) => {
  try {
    res.json(await readChecklists(req.userId));
  } catch (err) { next(err); }
});

// PUT /api/event-types/checklists/:typeName
router.put('/checklists/:typeName', async (req, res, next) => {
  try {
    const { typeName } = req.params;
    const { before = [], venue = [] } = req.body;
    const all = await readChecklists(req.userId);
    all[decodeURIComponent(typeName)] = { before, venue };
    await writeChecklists(req.userId, all);
    res.json(all[decodeURIComponent(typeName)]);
  } catch (err) { next(err); }
});

module.exports = router;
