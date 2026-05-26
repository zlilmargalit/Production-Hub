const express = require('express');
const router = express.Router();
const path = require('path');
const { readJsonCached, writeJsonAndCache } = require('../cache');

const FILE = path.join(__dirname, '../data/field-templates.json');
const CACHE_KEY = 'fieldTemplates';

const read = () => readJsonCached(CACHE_KEY, FILE, {});
const write = (d) => writeJsonAndCache(CACHE_KEY, FILE, d);

// GET /api/field-templates
router.get('/', async (req, res, next) => {
  try {
    res.json(await read());
  } catch (err) { next(err); }
});

// PUT /api/field-templates/:eventType  — body is array of field definitions
router.put('/:eventType', async (req, res, next) => {
  try {
    const et = decodeURIComponent(req.params.eventType);
    const d = await read();
    d[et] = req.body; // array of { id, label, type }
    await write(d);
    res.json(d[et]);
  } catch (err) { next(err); }
});

module.exports = router;
