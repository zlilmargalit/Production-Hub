// Production Projects — non-show work in a Production workspace.
//
// This is intentionally a separate domain from Administration Projects. Its
// file, statuses, fields, and authorization policy must never flow through the
// administration router or projects.json.

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const { readJsonCached, updateJsonAndCache } = require('../cache');
const { dataPath, cacheKey } = require('../utils/userData');
const { notifyAssigned } = require('./notifications');
const { TaskValidationError, createTaskRecord } = require('../utils/taskRecords');
const {
  TaskLinkError,
  tasksForProductionProject,
  attachTask,
  detachTask,
  detachProjectTasks,
} = require('../utils/productionProjectTasks');
const {
  ProjectTeamError,
  canReadProductionProject,
  projectsVisibleToRequester,
  replaceProjectTeam,
  validateTeamFromCurrentAccess,
  eligibleWorkspaceMembers,
} = require('../utils/productionProjectTeam');
const {
  ValidationError,
  validateProductionProject,
  validateMilestone,
  validateCommunicationLogEntry,
  deriveProductionProject,
} = require('../utils/productionProjects');
const {
  requireProductionWorkspace,
  requireProductionProjectOwner,
} = require('../utils/productionProjectsGuard');

const router = express.Router();

router.use(requireProductionWorkspace);

const KEY = (userId) => cacheKey(userId, 'production-projects');
const PATH = (userId) => dataPath(userId, 'production-projects.json');
const readProjects = (userId) => readJsonCached(KEY(userId), PATH(userId), []);
const TASK_KEY = (userId) => cacheKey(userId, 'tasks');
const TASK_PATH = (userId) => dataPath(userId, 'tasks.json');
const readTasks = (userId) => readJsonCached(TASK_KEY(userId), TASK_PATH(userId), []);

function respondError(res, error, next) {
  if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
  if (error instanceof TaskValidationError) return res.status(400).json({ error: error.message });
  if (error instanceof TaskLinkError) return res.status(error.status).json({ error: error.message });
  if (error instanceof ProjectTeamError) return res.status(error.status).json({ error: error.message });
  next(error);
}

async function findProject(req, projectId) {
  return (await readProjects(req.userId)).find((project) => project.id === projectId) || null;
}

async function editProject(req, projectId, mutate) {
  let result = null;
  await updateJsonAndCache(KEY(req.userId), PATH(req.userId), (projects) => {
    const index = projects.findIndex((project) => project.id === projectId);
    if (index === -1) return undefined;
    const draft = mutate({ ...projects[index] });
    if (!draft) return undefined;
    result = draft;
    const next = [...projects];
    next[index] = draft;
    return next;
  }, []);
  return result;
}

// A shared member who can enter this artist workspace may see only linked
// tasks assigned to their authenticated account. All project/task association
// mutations below remain owner/admin-only. Completion still uses the dedicated
// /api/tasks/assigned/:artistId/:id endpoint and its boolean-only patch.
router.get('/:id/tasks', async (req, res, next) => {
  try {
    if (!await findProject(req, req.params.id)) {
      return res.status(404).json({ error: 'Production project not found' });
    }
    const tasks = await readTasks(req.userId);
    const visible = tasksForProductionProject(tasks, req.params.id, req);
    res.json(req.teamMemberView
      ? visible.map((task) => ({ ...task, assignedToMe: true, fromArtistId: req.workspace.id }))
      : visible);
  } catch (error) { next(error); }
});

// Owners see every project; shared users see only projects whose explicit team
// includes their authenticated user id.
router.get('/', async (req, res, next) => {
  try {
    const projects = await readProjects(req.userId);
    res.json(projectsVisibleToRequester(projects, req)
      .map((project) => deriveProductionProject(project)));
  } catch (error) { next(error); }
});

// Owner-only directory for the team picker. It is intentionally limited to
// users that the PUT /:id/team validator would accept in this workspace.
router.get('/members', requireProductionProjectOwner, async (req, res, next) => {
  try {
    res.json(eligibleWorkspaceMembers(req.workspace.id));
  } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const project = (await readProjects(req.userId)).find((item) => item.id === req.params.id);
    if (!project) return res.status(404).json({ error: 'Production project not found' });
    if (!canReadProductionProject(req, project)) {
      return res.status(403).json({ error: 'You are not a member of this Production Project' });
    }
    res.json(deriveProductionProject(project));
  } catch (error) { next(error); }
});

// Shared project members may need names for the existing team, but must never
// be able to enumerate the workspace roster. Owners get the same narrow data
// too, which keeps detail rendering on one contract.
router.get('/:id/team-members', async (req, res, next) => {
  try {
    const project = await findProject(req, req.params.id);
    if (!project) return res.status(404).json({ error: 'Production project not found' });
    if (!canReadProductionProject(req, project)) {
      return res.status(403).json({ error: 'You are not a member of this Production Project' });
    }
    const allowed = new Set(project.teamMemberIds || []);
    res.json(eligibleWorkspaceMembers(req.workspace.id).filter((member) => allowed.has(member.id)));
  } catch (error) { next(error); }
});

// Project members may append an immutable-history entry. Editing or deleting
// an entry remains below the owner-only guard.
router.post('/:id/communication-log', async (req, res, next) => {
  try {
    const now = new Date().toISOString();
    let entry = null;
    let forbidden = false;
    const updated = await editProject(req, req.params.id, (project) => {
      if (!canReadProductionProject(req, project)) {
        forbidden = true;
        return null;
      }
      entry = {
        id: uuidv4(),
        ...validateCommunicationLogEntry(req.body, null, {
          id: req.authUserId || req.userId,
          name: req.username || null,
        }, now),
      };
      return {
        ...project,
        communicationLog: [...(project.communicationLog || []), entry],
        updatedAt: now,
      };
    });
    if (forbidden) return res.status(403).json({ error: 'You are not a member of this Production Project' });
    if (!updated) return res.status(404).json({ error: 'Production project not found' });
    res.status(201).json(entry);
  } catch (error) { respondError(res, error, next); }
});

router.use(requireProductionProjectOwner);

router.post('/', async (req, res, next) => {
  try {
    const now = new Date().toISOString();
    const project = {
      id: uuidv4(),
      ...validateProductionProject(req.body),
      milestones: [],
      teamMemberIds: [],
      communicationLog: [],
      createdAt: now,
      updatedAt: now,
    };
    await updateJsonAndCache(KEY(req.userId), PATH(req.userId), (projects) => [...projects, project], []);
    res.status(201).json(deriveProductionProject(project));
  } catch (error) { respondError(res, error, next); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const updated = await editProject(req, req.params.id, (project) => ({
      ...project,
      ...validateProductionProject(req.body, project),
      updatedAt: new Date().toISOString(),
    }));
    if (!updated) return res.status(404).json({ error: 'Production project not found' });
    res.json(deriveProductionProject(updated));
  } catch (error) { respondError(res, error, next); }
});

// Replace the project team in one operation. Every id must resolve to an
// authenticated user whose current artist grant matches this scoped workspace.
router.put('/:id/team', async (req, res, next) => {
  try {
    if (!await findProject(req, req.params.id)) {
      return res.status(404).json({ error: 'Production project not found' });
    }
    const teamMemberIds = validateTeamFromCurrentAccess(
      req.body?.teamMemberIds,
      req.workspace.id,
    );
    const updated = await editProject(req, req.params.id, (project) => (
      replaceProjectTeam(project, teamMemberIds, new Date().toISOString())
    ));
    if (!updated) return res.status(404).json({ error: 'Production project not found' });
    res.json(deriveProductionProject(updated));
  } catch (error) { respondError(res, error, next); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!await findProject(req, req.params.id)) {
      return res.status(404).json({ error: 'Production project not found' });
    }

    // Detach first: if the subsequent project-file write fails, every task is
    // still preserved and retrying the delete is safe. The task file mutation
    // is locked and atomic through updateJsonAndCache.
    await updateJsonAndCache(TASK_KEY(req.userId), TASK_PATH(req.userId),
      (tasks) => detachProjectTasks(tasks, req.params.id), []);

    let found = false;
    await updateJsonAndCache(KEY(req.userId), PATH(req.userId), (projects) => {
      found = projects.some((project) => project.id === req.params.id);
      return found ? projects.filter((project) => project.id !== req.params.id) : undefined;
    }, []);
    if (!found) return res.status(404).json({ error: 'Production project not found' });
    res.status(204).send();
  } catch (error) { next(error); }
});

// Create a canonical task already associated with this Production Project.
router.post('/:id/tasks', async (req, res, next) => {
  try {
    if (!await findProject(req, req.params.id)) {
      return res.status(404).json({ error: 'Production project not found' });
    }
    const task = createTaskRecord(req.body, {
      id: uuidv4(),
      productionProjectId: req.params.id,
    });
    await updateJsonAndCache(TASK_KEY(req.userId), TASK_PATH(req.userId),
      (tasks) => [...tasks, task], []);
    res.status(201).json(task);
    if (task.assigneeId) notifyAssigned(req.userId, task).catch(() => {});
  } catch (error) { respondError(res, error, next); }
});

// Attach an existing task. The task and project are both resolved through the
// same scoped req.userId, so a task from another artist cannot be addressed.
router.put('/:id/tasks/:taskId', async (req, res, next) => {
  try {
    if (!await findProject(req, req.params.id)) {
      return res.status(404).json({ error: 'Production project not found' });
    }
    let linked = null;
    await updateJsonAndCache(TASK_KEY(req.userId), TASK_PATH(req.userId), (tasks) => {
      const result = attachTask(tasks, req.params.taskId, req.params.id);
      linked = result.task;
      return result.tasks;
    }, []);
    res.json(linked);
  } catch (error) { respondError(res, error, next); }
});

// Detach without deleting the task record.
router.delete('/:id/tasks/:taskId', async (req, res, next) => {
  try {
    if (!await findProject(req, req.params.id)) {
      return res.status(404).json({ error: 'Production project not found' });
    }
    await updateJsonAndCache(TASK_KEY(req.userId), TASK_PATH(req.userId), (tasks) => (
      detachTask(tasks, req.params.taskId, req.params.id).tasks
    ), []);
    res.status(204).send();
  } catch (error) { respondError(res, error, next); }
});

router.post('/:id/milestones', async (req, res, next) => {
  try {
    const now = new Date().toISOString();
    let milestone = null;
    const updated = await editProject(req, req.params.id, (project) => {
      milestone = { id: uuidv4(), ...validateMilestone(req.body, null, now) };
      return {
        ...project,
        milestones: [...(project.milestones || []), milestone],
        updatedAt: now,
      };
    });
    if (!updated) return res.status(404).json({ error: 'Production project not found' });
    res.status(201).json(milestone);
  } catch (error) { respondError(res, error, next); }
});

router.put('/:id/milestones/:milestoneId', async (req, res, next) => {
  try {
    const now = new Date().toISOString();
    let milestone = null;
    const updated = await editProject(req, req.params.id, (project) => {
      const milestones = project.milestones || [];
      const index = milestones.findIndex((item) => item.id === req.params.milestoneId);
      if (index === -1) return null;
      milestone = { ...milestones[index], ...validateMilestone(req.body, milestones[index], now) };
      const next = [...milestones];
      next[index] = milestone;
      return { ...project, milestones: next, updatedAt: now };
    });
    if (!updated) return res.status(404).json({ error: 'Milestone not found' });
    res.json(milestone);
  } catch (error) { respondError(res, error, next); }
});

router.delete('/:id/milestones/:milestoneId', async (req, res, next) => {
  try {
    const updated = await editProject(req, req.params.id, (project) => {
      const milestones = project.milestones || [];
      if (!milestones.some((item) => item.id === req.params.milestoneId)) return null;
      return {
        ...project,
        milestones: milestones.filter((item) => item.id !== req.params.milestoneId),
        updatedAt: new Date().toISOString(),
      };
    });
    if (!updated) return res.status(404).json({ error: 'Milestone not found' });
    res.status(204).send();
  } catch (error) { next(error); }
});

router.put('/:id/communication-log/:entryId', async (req, res, next) => {
  try {
    const now = new Date().toISOString();
    let entry = null;
    const updated = await editProject(req, req.params.id, (project) => {
      const entries = project.communicationLog || [];
      const index = entries.findIndex((item) => item.id === req.params.entryId);
      if (index === -1) return null;
      entry = {
        ...entries[index],
        ...validateCommunicationLogEntry(req.body, entries[index], {}, now),
      };
      const next = [...entries];
      next[index] = entry;
      return { ...project, communicationLog: next, updatedAt: now };
    });
    if (!updated) return res.status(404).json({ error: 'Communication entry not found' });
    res.json(entry);
  } catch (error) { respondError(res, error, next); }
});

router.delete('/:id/communication-log/:entryId', async (req, res, next) => {
  try {
    const updated = await editProject(req, req.params.id, (project) => {
      const entries = project.communicationLog || [];
      if (!entries.some((item) => item.id === req.params.entryId)) return null;
      return {
        ...project,
        communicationLog: entries.filter((item) => item.id !== req.params.entryId),
        updatedAt: new Date().toISOString(),
      };
    });
    if (!updated) return res.status(404).json({ error: 'Communication entry not found' });
    res.status(204).send();
  } catch (error) { next(error); }
});

module.exports = router;
