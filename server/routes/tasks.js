const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { readJsonCached, writeJsonAndCache } = require('../cache');
const { dataPath, cacheKey } = require('../utils/userData');

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
    const { text, dueDate, assignedTo, showId } = req.body || {};
    if (!text?.trim()) return res.status(400).json({ error: 'text required' });
    const tasks = await readTasks(req.userId);
    const task = {
      id:               uuidv4(),
      text:             text.trim(),
      completed:        false,
      showId:           showId    || null,
      dueDate:          dueDate   || null,
      assignedTo:       assignedTo || null,
      createdAt:        new Date().toISOString(),
      pushNotifiedAt:   null,
    };
    await writeTasks(req.userId, [...tasks, task]);
    res.status(201).json(task);
  } catch (err) { next(err); }
});

// PUT /api/tasks/:id  (full or partial update)
router.put('/:id', async (req, res, next) => {
  try {
    const tasks = await readTasks(req.userId);
    const idx = tasks.findIndex((t) => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });
    const updated = { ...tasks[idx], ...req.body, id: tasks[idx].id };
    await writeTasks(req.userId, tasks.map((t, i) => (i === idx ? updated : t)));
    res.json(updated);
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
