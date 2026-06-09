const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { readJsonCached, writeJsonAndCache } = require('../cache');
const { dataPath, cacheKey } = require('../utils/userData');
const { notifyAssigned } = require('./notifications');

const readTasks  = (userId) =>
  readJsonCached(cacheKey(userId, 'tasks'), dataPath(userId, 'tasks.json'), []);
const writeTasks = (userId, tasks) =>
  writeJsonAndCache(cacheKey(userId, 'tasks'), dataPath(userId, 'tasks.json'), tasks);

// GET /api/tasks
router.get('/', async (req, res, next) => {
  try {
    res.json(await readTasks(req.userId));
  } catch (err) { next(err); }
});

// POST /api/tasks
router.post('/', async (req, res, next) => {
  try {
    const { text, notes, dueDate, dueTime, assignedTo, showId, showIds, assigneeId, assigneeName, reminder } = req.body || {};
    if (!text?.trim()) return res.status(400).json({ error: 'text required' });
    const tasks = await readTasks(req.userId);
    // normalise show references — prefer the new showIds array
    const resolvedShowIds = Array.isArray(showIds) && showIds.length
      ? showIds
      : showId ? [showId] : [];
    const task = {
      id:              uuidv4(),
      text:            text.trim(),
      notes:           notes?.trim() || null,
      completed:       false,
      showId:          resolvedShowIds[0]  || null,   // legacy compat
      showIds:         resolvedShowIds,
      dueDate:         dueDate      || null,
      dueTime:         dueTime      || null,
      assignedTo:      assignedTo   || null,
      assigneeId:      assigneeId   || null,
      assigneeName:    assigneeName || null,
      reminder:        reminder     || null,
      createdAt:       new Date().toISOString(),
      pushNotifiedAt:  null,
    };
    await writeTasks(req.userId, [...tasks, task]);
    res.status(201).json(task);
    // Fire-and-forget: notify on assignment at creation time.
    if (task.assigneeId) notifyAssigned(req.userId, task).catch(() => {});
  } catch (err) { next(err); }
});

// PUT /api/tasks/:id  (full or partial update)
router.put('/:id', async (req, res, next) => {
  try {
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
