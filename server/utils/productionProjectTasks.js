const { tasksVisibleToRequester } = require('./taskAuthorization');

class TaskLinkError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'TaskLinkError';
    this.status = status;
  }
}

function tasksForProductionProject(tasks, projectId, req) {
  const linked = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => task.productionProjectId === projectId);
  return tasksVisibleToRequester(linked, req);
}

function attachTask(tasks, taskId, projectId) {
  const list = Array.isArray(tasks) ? tasks : [];
  const index = list.findIndex((task) => task.id === taskId);
  if (index === -1) throw new TaskLinkError(404, 'Task not found');
  const current = list[index];
  if (current.productionProjectId && current.productionProjectId !== projectId) {
    throw new TaskLinkError(409, 'Task is already linked to another Production Project');
  }
  const task = { ...current, productionProjectId: projectId };
  const next = [...list];
  next[index] = task;
  return { tasks: next, task };
}

function detachTask(tasks, taskId, projectId) {
  const list = Array.isArray(tasks) ? tasks : [];
  const index = list.findIndex((task) => task.id === taskId);
  if (index === -1) throw new TaskLinkError(404, 'Task not found');
  if (list[index].productionProjectId !== projectId) {
    throw new TaskLinkError(404, 'Task is not linked to this Production Project');
  }
  const task = { ...list[index], productionProjectId: null };
  const next = [...list];
  next[index] = task;
  return { tasks: next, task };
}

function detachProjectTasks(tasks, projectId) {
  return (Array.isArray(tasks) ? tasks : []).map((task) => (
    task.productionProjectId === projectId
      ? { ...task, productionProjectId: null }
      : task
  ));
}

module.exports = {
  TaskLinkError,
  tasksForProductionProject,
  attachTask,
  detachTask,
  detachProjectTasks,
};
