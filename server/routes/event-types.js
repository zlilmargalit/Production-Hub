const express = require('express');
const router = express.Router();
const path = require('path');
const { readJsonCached, writeJsonAndCache } = require('../cache');

const DATA_FILE = path.join(__dirname, '../data/event-types.json');
const CACHE_KEY = 'eventTypes';

const read = () => readJsonCached(CACHE_KEY, DATA_FILE, []);
const write = (d) => writeJsonAndCache(CACHE_KEY, DATA_FILE, d);

router.get('/', async (req, res, next) => {
  try {
    res.json(await read());
  } catch (err) { next(err); }
});

// Full replace (client sends the ordered array)
router.put('/', async (req, res, next) => {
  try {
    const types = req.body;
    if (!Array.isArray(types)) return res.status(400).json({ error: 'Expected array' });
    await write(types);
    res.json(types);
  } catch (err) { next(err); }
});

module.exports = router;
