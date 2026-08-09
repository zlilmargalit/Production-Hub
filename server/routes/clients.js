// Clients — administration workspaces only.
//
// Storage follows the existing conventions: ?artistId= scoping via req.userId,
// dataPath/cacheKey for paths, and writeJsonAndCache so a write can never leave
// the cache serving stale data.

const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');

const { readJsonCached, writeJsonAndCache, updateJsonAndCache } = require('../cache');
const { dataPath, cacheKey } = require('../utils/userData');
const { requireAdministrationWorkspace } = require('../utils/adminGuard');
const { validateClient, ValidationError } = require('../utils/adminValidate');

router.use(requireAdministrationWorkspace);

const KEY  = (uid) => cacheKey(uid, 'clients');
const PATH = (uid) => dataPath(uid, 'clients.json');
const readClients = (uid) => readJsonCached(KEY(uid), PATH(uid), []);

router.get('/', async (req, res, next) => {
  try { res.json(await readClients(req.userId)); }
  catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const client = (await readClients(req.userId)).find((c) => c.id === req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const fields = validateClient(req.body);
    const client = { id: uuidv4(), ...fields, createdAt: new Date().toISOString() };
    // Read-modify-write under one lock so a concurrent create can't be lost.
    await updateJsonAndCache(KEY(req.userId), PATH(req.userId),
      (list) => [...list, client], []);
    res.status(201).json(client);
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    let updated = null;
    await updateJsonAndCache(KEY(req.userId), PATH(req.userId), (list) => {
      const idx = list.findIndex((c) => c.id === req.params.id);
      if (idx === -1) return undefined;                    // abort without writing
      updated = { ...list[idx], ...validateClient(req.body, list[idx]) };
      const next = [...list];
      next[idx] = updated;
      return next;
    }, []);
    if (!updated) return res.status(404).json({ error: 'Client not found' });
    res.json(updated);
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

// Deleting a client does NOT touch projects: each project keeps
// clientNameSnapshot so historical records stay readable. Live invoice details
// simply stop resolving, which is the intended behaviour.
router.delete('/:id', async (req, res, next) => {
  try {
    let found = false;
    await updateJsonAndCache(KEY(req.userId), PATH(req.userId), (list) => {
      found = list.some((c) => c.id === req.params.id);
      return found ? list.filter((c) => c.id !== req.params.id) : undefined;
    }, []);
    if (!found) return res.status(404).json({ error: 'Client not found' });
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
