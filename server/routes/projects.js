// Projects — administration workspaces only.
//
// workDays, purchases, expenses and debriefs are nested inside the project
// rather than kept in separate files. Volume is 10–15 projects a month, so
// aggregating by iteration is cheap, and nesting removes the class of drift that
// separate stores produced elsewhere in this codebase.
//
// Every mutation goes through updateJsonAndCache, which holds a per-file lock
// across the read-modify-write. Nested edits are the exact shape that loses
// updates otherwise: two edits to different work days of the same project would
// each write back a whole projects array.

const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');

const { readJsonCached, updateJsonAndCache } = require('../cache');
const { dataPath, cacheKey } = require('../utils/userData');
const { requireAdministrationWorkspace } = require('../utils/adminGuard');
const {
  validateProject, validateWorkDay, validatePurchase, validateReturn, validateExpense,
  validateWorkDayAssistant, deriveProject, ValidationError,
} = require('../utils/adminValidate');

router.use(requireAdministrationWorkspace);

const KEY  = (uid) => cacheKey(uid, 'projects');
const PATH = (uid) => dataPath(uid, 'projects.json');
const readProjects = (uid) => readJsonCached(KEY(uid), PATH(uid), []);
const readClients  = (uid) => readJsonCached(cacheKey(uid, 'clients'), dataPath(uid, 'clients.json'), []);

const bad = (res, err, next) => {
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
  next(err);
};

// Mutate one project in place under the file lock. Returns the updated project,
// or null when the project (or a nested record) wasn't found.
async function editProject(req, projectId, mutate) {
  let result = null;
  await updateJsonAndCache(KEY(req.userId), PATH(req.userId), (list) => {
    const idx = list.findIndex((p) => p.id === projectId);
    if (idx === -1) return undefined;
    const draft = mutate({ ...list[idx] });
    if (!draft) return undefined;            // nested record missing → no write
    result = draft;
    const next = [...list];
    next[idx] = draft;
    return next;
  }, []);
  return result;
}

// Payment terms come from the client, live — never copied onto the project.
async function withDerived(req, project) {
  const clients = await readClients(req.userId);
  const terms = clients.find((c) => c.id === project.clientId)?.paymentTerms ?? null;
  return deriveProject(project, { paymentTerms: terms });
}

// ── Projects ────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const [projects, clients] = await Promise.all([readProjects(req.userId), readClients(req.userId)]);
    const termsById = Object.fromEntries(clients.map((c) => [c.id, c.paymentTerms]));
    res.json(projects.map((p) => deriveProject(p, { paymentTerms: termsById[p.clientId] ?? null })));
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const project = (await readProjects(req.userId)).find((p) => p.id === req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(await withDerived(req, project));
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const fields = validateProject(req.body);
    // Snapshot the client's name for display so deleting the client later can't
    // blank a historical project.
    if (fields.clientId && !fields.clientNameSnapshot) {
      const client = (await readClients(req.userId)).find((c) => c.id === fields.clientId);
      if (client) fields.clientNameSnapshot = client.name;
    }
    const project = {
      id: uuidv4(),
      ...fields,
      contractReceivedAt: null, contractFileUrl: null,
      invoiceSentAt: null, paymentDueAt: null, paidAt: null,
      workDays: [], purchases: [], expenses: [], debriefs: [],
      driveFolderId: null,
      createdAt: new Date().toISOString(),
    };
    await updateJsonAndCache(KEY(req.userId), PATH(req.userId), (l) => [...l, project], []);
    res.status(201).json(await withDerived(req, project));
  } catch (err) { bad(res, err, next); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const clients = await readClients(req.userId);
    const updated = await editProject(req, req.params.id, (p) => {
      const fields = validateProject(req.body, p);
      const draft  = { ...p, ...fields };

      // Status transitions with side effects. paymentDueAt is stamped from the
      // client's terms at the moment of invoicing — later term changes must not
      // silently move an existing due date.
      if (fields.status === 'invoiced' && p.status !== 'invoiced') {
        draft.invoiceSentAt = new Date().toISOString();
        const terms = clients.find((c) => c.id === draft.clientId)?.paymentTerms ?? 30;
        const due = new Date(draft.invoiceSentAt);
        due.setDate(due.getDate() + terms);
        draft.paymentDueAt = due.toISOString().slice(0, 10);
      }
      if (fields.status === 'paid' && p.status !== 'paid') {
        draft.paidAt = new Date().toISOString();
      }
      return draft;
    });
    if (!updated) return res.status(404).json({ error: 'Project not found' });
    res.json(await withDerived(req, updated));
  } catch (err) { bad(res, err, next); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    let found = false;
    await updateJsonAndCache(KEY(req.userId), PATH(req.userId), (list) => {
      found = list.some((p) => p.id === req.params.id);
      return found ? list.filter((p) => p.id !== req.params.id) : undefined;
    }, []);
    if (!found) return res.status(404).json({ error: 'Project not found' });
    res.status(204).send();
  } catch (err) { next(err); }
});

// ── Nested collections ──────────────────────────────────────────────────────
// One generic pair of handlers per collection keeps the add/edit/remove
// semantics identical across work days, purchases and expenses.
function mountCollection(name, key, validate) {
  router.post(`/:id/${name}`, async (req, res, next) => {
    try {
      let created = null;
      const updated = await editProject(req, req.params.id, (p) => {
        created = { id: uuidv4(), ...validate(req.body) };
        return { ...p, [key]: [...(p[key] || []), created] };
      });
      if (!updated) return res.status(404).json({ error: 'Project not found' });
      res.status(201).json(created);
    } catch (err) { bad(res, err, next); }
  });

  router.put(`/:id/${name}/:itemId`, async (req, res, next) => {
    try {
      let edited = null;
      const updated = await editProject(req, req.params.id, (p) => {
        const list = p[key] || [];
        const idx  = list.findIndex((x) => x.id === req.params.itemId);
        if (idx === -1) return null;
        edited = { ...list[idx], ...validate(req.body, list[idx]) };
        const next = [...list];
        next[idx] = edited;
        return { ...p, [key]: next };
      });
      if (!updated) return res.status(404).json({ error: 'Not found' });
      res.json(edited);
    } catch (err) { bad(res, err, next); }
  });

  router.delete(`/:id/${name}/:itemId`, async (req, res, next) => {
    try {
      let removed = false;
      const updated = await editProject(req, req.params.id, (p) => {
        const list = p[key] || [];
        removed = list.some((x) => x.id === req.params.itemId);
        if (!removed) return null;
        return { ...p, [key]: list.filter((x) => x.id !== req.params.itemId) };
      });
      if (!updated) return res.status(404).json({ error: 'Not found' });
      res.status(204).send();
    } catch (err) { next(err); }
  });
}

mountCollection('work-days', 'workDays',  validateWorkDay);
mountCollection('purchases', 'purchases', validatePurchase);
mountCollection('expenses',  'expenses',  validateExpense);

// ── Assistants booked on a work day ─────────────────────────────────────────
// Two levels of nesting, so mountCollection doesn't fit. Everything still goes
// through editProject, which holds the file lock across the read-modify-write —
// marking one assistant paid must not clobber a booking added on another day at
// the same moment.
function editDay(req, res, next, mutateDay, respond) {
  return (async () => {
    try {
      let payload = null;
      const updated = await editProject(req, req.params.id, (p) => {
        const days = p.workDays || [];
        const di   = days.findIndex((d) => d.id === req.params.dayId);
        if (di === -1) return null;
        const draft = mutateDay({ ...days[di], assistants: [...(days[di].assistants || [])] });
        if (!draft) return null;
        payload = draft.payload;
        const next = [...days];
        next[di] = draft.day;
        return { ...p, workDays: next };
      });
      if (!updated) return res.status(404).json({ error: 'Not found' });
      respond(payload);
    } catch (err) { bad(res, err, next); }
  })();
}

router.post('/:id/work-days/:dayId/assistants', (req, res, next) =>
  editDay(req, res, next,
    (day) => {
      const booking = { id: uuidv4(), ...validateWorkDayAssistant(req.body) };
      return { day: { ...day, assistants: [...day.assistants, booking] }, payload: booking };
    },
    (booking) => res.status(201).json(booking)));

router.put('/:id/work-days/:dayId/assistants/:bookingId', (req, res, next) =>
  editDay(req, res, next,
    (day) => {
      const i = day.assistants.findIndex((a) => a.id === req.params.bookingId);
      if (i === -1) return null;
      const edited = { ...day.assistants[i], ...validateWorkDayAssistant(req.body, day.assistants[i]) };
      const list = [...day.assistants];
      list[i] = edited;
      return { day: { ...day, assistants: list }, payload: edited };
    },
    (edited) => res.json(edited)));

router.delete('/:id/work-days/:dayId/assistants/:bookingId', (req, res, next) =>
  editDay(req, res, next,
    (day) => {
      if (!day.assistants.some((a) => a.id === req.params.bookingId)) return null;
      return {
        day: { ...day, assistants: day.assistants.filter((a) => a.id !== req.params.bookingId) },
        payload: null,
      };
    },
    () => res.status(204).send()));

// A return is appended to its purchase; returnedAmount and outstanding are
// derived from it on read and never stored.
router.post('/:id/purchases/:purchaseId/returns', async (req, res, next) => {
  try {
    let created = null;
    const updated = await editProject(req, req.params.id, (p) => {
      const list = p.purchases || [];
      const idx  = list.findIndex((x) => x.id === req.params.purchaseId);
      if (idx === -1) return null;
      created = { id: uuidv4(), ...validateReturn(req.body) };
      const purchase = { ...list[idx], returns: [...(list[idx].returns || []), created] };
      const next = [...list];
      next[idx] = purchase;
      return { ...p, purchases: next };
    });
    if (!updated) return res.status(404).json({ error: 'Purchase not found' });
    res.status(201).json(created);
  } catch (err) { bad(res, err, next); }
});

module.exports = router;
