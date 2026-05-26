const express = require('express');
const router = express.Router();
const { readJsonCached, writeJsonAndCache } = require('../cache');
const { dataPath, cacheKey } = require('../utils/userData');

const read  = (uid) => readJsonCached(cacheKey(uid, 'eventTypes'), dataPath(uid, 'event-types.json'), []);
const write = (uid, d) => writeJsonAndCache(cacheKey(uid, 'eventTypes'), dataPath(uid, 'event-types.json'), d);

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

module.exports = router;
