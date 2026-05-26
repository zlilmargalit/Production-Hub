const express = require('express');
const router = express.Router();
const path = require('path');
const { readJsonCached, writeJsonAndCache } = require('../cache');

const DATA_FILE = path.join(__dirname, '../data/templates.json');
const CREW_FILE = path.join(__dirname, '../data/crew.json');
const CACHE_KEY = 'templates';

const readTemplates = () => readJsonCached(CACHE_KEY, DATA_FILE, {});
const writeTemplates = (t) => writeJsonAndCache(CACHE_KEY, DATA_FILE, t);
const readCrew = () => readJsonCached('crew', CREW_FILE, []);

router.get('/', async (req, res, next) => {
  try {
    res.json(await readTemplates());
  } catch (err) { next(err); }
});

router.put('/:eventType', async (req, res, next) => {
  try {
    const templates = await readTemplates();
    const eventType = decodeURIComponent(req.params.eventType);
    templates[eventType] = req.body.crewIds || [];
    await writeTemplates(templates);
    res.json({ eventType, crewIds: templates[eventType] });
  } catch (err) { next(err); }
});

// Returns the formatted technicalCrew string for an event type
router.get('/:eventType/text', async (req, res, next) => {
  try {
    const [templates, crew] = await Promise.all([readTemplates(), readCrew()]);
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
