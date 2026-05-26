const express = require('express');
const router = express.Router();
const { readJsonCached, writeJsonAndCache } = require('../cache');
const { dataPath, cacheKey } = require('../utils/userData');

const read  = (uid) => readJsonCached(cacheKey(uid, 'fieldTemplates'), dataPath(uid, 'field-templates.json'), {});
const write = (uid, d) => writeJsonAndCache(cacheKey(uid, 'fieldTemplates'), dataPath(uid, 'field-templates.json'), d);

router.get('/', async (req, res, next) => {
  try {
    res.json(await read(req.userId));
  } catch (err) { next(err); }
});

router.put('/:eventType', async (req, res, next) => {
  try {
    const et = decodeURIComponent(req.params.eventType);
    const d  = await read(req.userId);
    d[et]    = req.body;
    await write(req.userId, d);
    res.json(d[et]);
  } catch (err) { next(err); }
});

module.exports = router;
