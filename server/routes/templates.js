const express = require('express');
const router = express.Router();
const { readJsonCached, writeJsonAndCache } = require('../cache');
const { dataPath, cacheKey } = require('../utils/userData');

const readTemplates  = (uid) => readJsonCached(cacheKey(uid, 'templates'), dataPath(uid, 'templates.json'), {});
const writeTemplates = (uid, t) => writeJsonAndCache(cacheKey(uid, 'templates'), dataPath(uid, 'templates.json'), t);
const readCrew       = (uid) => readJsonCached(cacheKey(uid, 'crew'), dataPath(uid, 'crew.json'), []);

router.get('/', async (req, res, next) => {
  try {
    res.json(await readTemplates(req.userId));
  } catch (err) { next(err); }
});

router.put('/:eventType', async (req, res, next) => {
  try {
    const templates = await readTemplates(req.userId);
    const eventType = decodeURIComponent(req.params.eventType);
    templates[eventType] = req.body.crewIds || [];
    await writeTemplates(req.userId, templates);
    res.json({ eventType, crewIds: templates[eventType] });
  } catch (err) { next(err); }
});

router.get('/:eventType/text', async (req, res, next) => {
  try {
    const [templates, crew] = await Promise.all([readTemplates(req.userId), readCrew(req.userId)]);
    const eventType = decodeURIComponent(req.params.eventType);
    const ids = templates[eventType] || [];
    const text = ids
      .map((id) => crew.find((m) => m.id === id))
      .filter(Boolean)
      .map((m) => `${m.role} – ${m.name}`)
      .join(' | ');
    res.json({ text, crewIds: ids });
  } catch (err) { next(err); }
});

module.exports = router;
