const express = require('express');
const router = express.Router();
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { readJsonCached, writeJsonAndCache, invalidate } = require('../cache');

const DATA_FILE = path.join(__dirname, '../data/crew.json');
const CACHE_KEY = 'crew';

const readCrew = () => readJsonCached(CACHE_KEY, DATA_FILE, []);
const writeCrew = (crew) => writeJsonAndCache(CACHE_KEY, DATA_FILE, crew);

router.get('/', async (req, res, next) => {
  try {
    res.json(await readCrew());
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const crew = await readCrew();
    const member = { id: uuidv4(), ...req.body };
    crew.push(member);
    await writeCrew(crew);
    res.status(201).json(member);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const crew = await readCrew();
    const idx = crew.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    crew[idx] = { ...crew[idx], ...req.body };
    await writeCrew(crew);
    res.json(crew[idx]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const crew = await readCrew();
    await writeCrew(crew.filter((m) => m.id !== req.params.id));
    // crew changes affect rendered show pages (technical-crew text uses names/roles)
    invalidate('shows');
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
