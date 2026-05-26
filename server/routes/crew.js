const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { readJsonCached, writeJsonAndCache, invalidate } = require('../cache');
const { dataPath, cacheKey } = require('../utils/userData');

const readCrew  = (uid) => readJsonCached(cacheKey(uid, 'crew'),  dataPath(uid, 'crew.json'),  []);
const writeCrew = (uid, crew) => writeJsonAndCache(cacheKey(uid, 'crew'), dataPath(uid, 'crew.json'), crew);

router.get('/', async (req, res, next) => {
  try {
    res.json(await readCrew(req.userId));
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const crew = await readCrew(req.userId);
    const member = { id: uuidv4(), ...req.body };
    crew.push(member);
    await writeCrew(req.userId, crew);
    res.status(201).json(member);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const crew = await readCrew(req.userId);
    const idx = crew.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    crew[idx] = { ...crew[idx], ...req.body };
    await writeCrew(req.userId, crew);
    res.json(crew[idx]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const crew = await readCrew(req.userId);
    await writeCrew(req.userId, crew.filter((m) => m.id !== req.params.id));
    invalidate(cacheKey(req.userId, 'shows'));
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
