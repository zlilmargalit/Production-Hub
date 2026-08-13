const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { readJsonCached, writeJsonAndCache } = require('../cache');
const { dataPath, cacheKey } = require('../utils/userData');
const { notifyAssigned } = require('./notifications');
const { canMutateScopedTasks, tasksVisibleToRequester } = require('../utils/taskAuthorization');
const { TaskValidationError, createTaskRecord, attemptsProjectLink } = require('../utils/taskRecords');

const readTasks  = (userId) =>
  readJsonCached(cacheKey(userId, 'tasks'), dataPath(userId, 'tasks.json'), []);
const writeTasks = (userId, tasks) =>
  writeJsonAndCache(cacheKey(userId, 'tasks'), dataPath(userId, 'tasks.json'), tasks);

// GET /api/tasks
router.get('/', async (req, res, next) => {
  try {
    res.json(tasksVisibleToRequester(await readTasks(req.userId), req));
  } catch (err) { next(err); }
});

// The artist-scope middleware permits shared members to enter an artist's
// storage only for content explicitly authorised to them. Generic task writes
// have no task-specific grant, so they stay owner/admin-only. A member may
// still complete their own assigned task through /api/tasks/assigned/:artistId/:id.
router.use((req, res, next) => {
  if (!canMutateScopedTasks(req)) {
    return res.status(403).json({ error: 'Shared members cannot create, edit, or delete workspace tasks' });
  }
  next();
});

// POST /api/tasks
router.post('/', async (req, res, next) => {
  try {
    if (attemptsProjectLink(req.body)) {
      return res.status(400).json({ error: 'Use a Production Project task endpoint to set productionProjectId' });
    }
    const tasks = await readTasks(req.userId);
    const task = createTaskRecord(req.body, { id: uuidv4() });
    await writeTasks(req.userId, [...tasks, task]);
    res.status(201).json(task);
    // Fire-and-forget: notify on assignment at creation time.
    if (task.assigneeId) notifyAssigned(req.userId, task).catch(() => {});
  } catch (err) {
    if (err instanceof TaskValidationError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

// PUT /api/tasks/:id  (full or partial update)
router.put('/:id', async (req, res, next) => {
  try {
    if (attemptsProjectLink(req.body)) {
      return res.status(400).json({ error: 'Use a Production Project task endpoint to change productionProjectId' });
    }
    const tasks = await readTasks(req.userId);
    const idx = tasks.findIndex((t) => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });
    const prev = tasks[idx];
    const updated = { ...prev, ...req.body, id: prev.id };
    await writeTasks(req.userId, tasks.map((t, i) => (i === idx ? updated : t)));
    res.json(updated);
    // Fire-and-forget: notify when a task becomes newly assigned to someone.
    if (updated.assigneeId && updated.assigneeId !== prev.assigneeId) {
      notifyAssigned(req.userId, updated).catch(() => {});
    }
  } catch (err) { next(err); }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const tasks = await readTasks(req.userId);
    const filtered = tasks.filter((t) => t.id !== req.params.id);
    if (filtered.length === tasks.length) return res.status(404).json({ error: 'Task not found' });
    await writeTasks(req.userId, filtered);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
