const express = require('express');
const router = express.Router();
const { readJsonCached, writeJsonAndCache } = require('../cache');
const { dataPath, cacheKey } = require('../utils/userData');

const read  = (uid) => readJsonCached(cacheKey(uid, 'roles'), dataPath(uid, 'roles.json'), []);
const write = (uid, d) => writeJsonAndCache(cacheKey(uid, 'roles'), dataPath(uid, 'roles.json'), d);

router.get('/', async (req, res, next) => {
  try {
    res.json(await read(req.userId));
  } catch (err) { next(err); }
});

router.put('/', async (req, res, next) => {
  try {
    const roles = req.body;
    if (!Array.isArray(roles)) return res.status(400).json({ error: 'Expected array' });
    await write(req.userId, roles);
    res.json(roles);
  } catch (err) { next(err); }
});

module.exports = router;
