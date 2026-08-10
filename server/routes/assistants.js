// Assistants — administration workspaces only.
//
// The roster of people who get booked onto work days. Deliberately its own file
// rather than reusing crew.json: crew members carry roles, event types and
// technical-crew semantics that mean nothing here, and sharing the store would
// put a stylist's assistants in a musician's crew picker.
//
// Deleting from the roster does NOT touch bookings. Each booking on a work day
// carries its own nameSnapshot and amount, so a removed assistant leaves the
// record of the days they worked — and anything still owed to them — intact.

const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');

const { readJsonCached, updateJsonAndCache } = require('../cache');
const { dataPath, cacheKey } = require('../utils/userData');
const { requireAdministrationWorkspace } = require('../utils/adminGuard');
const { validateAssistant, ValidationError } = require('../utils/adminValidate');

router.use(requireAdministrationWorkspace);

const KEY  = (uid) => cacheKey(uid, 'assistants');
const PATH = (uid) => dataPath(uid, 'assistants.json');
const readAssistants = (uid) => readJsonCached(KEY(uid), PATH(uid), []);

const bad = (res, err, next) => {
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
  next(err);
};

router.get('/', async (req, res, next) => {
  try { res.json(await readAssistants(req.userId)); }
  catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const assistant = {
      id: uuidv4(),
      ...validateAssistant(req.body),
      createdAt: new Date().toISOString(),
    };
    await updateJsonAndCache(KEY(req.userId), PATH(req.userId), (l) => [...l, assistant], []);
    res.status(201).json(assistant);
  } catch (err) { bad(res, err, next); }
});

router.put('/:id', async (req, res, next) => {
  try {
    let updated = null;
    await updateJsonAndCache(KEY(req.userId), PATH(req.userId), (list) => {
      const idx = list.findIndex((a) => a.id === req.params.id);
      if (idx === -1) return undefined;                  // abort without writing
      updated = { ...list[idx], ...validateAssistant(req.body, list[idx]) };
      const next = [...list];
      next[idx] = updated;
      return next;
    }, []);
    if (!updated) return res.status(404).json({ error: 'Assistant not found' });
    res.json(updated);
  } catch (err) { bad(res, err, next); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    let found = false;
    await updateJsonAndCache(KEY(req.userId), PATH(req.userId), (list) => {
      found = list.some((a) => a.id === req.params.id);
      return found ? list.filter((a) => a.id !== req.params.id) : undefined;
    }, []);
    if (!found) return res.status(404).json({ error: 'Assistant not found' });
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
