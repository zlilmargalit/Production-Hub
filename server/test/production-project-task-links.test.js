const test = require('node:test');
const assert = require('node:assert/strict');

const { artistScopedId, dataPath } = require('../utils/userData');
const { decideArtistAccess } = require('../utils/artistAccess');
const { canMutateScopedTasks, validateAssignedTaskCompletion } = require('../utils/taskAuthorization');
const { createTaskRecord, attemptsProjectLink } = require('../utils/taskRecords');
const {
  TaskLinkError,
  tasksForProductionProject,
  attachTask,
  detachTask,
  detachProjectTasks,
} = require('../utils/productionProjectTasks');

const TASKS = [
  { id: 'task-a', text: 'A', assigneeId: 'member-1', productionProjectId: null },
  { id: 'task-b', text: 'B', assigneeId: 'member-2', productionProjectId: 'project-1' },
  { id: 'task-c', text: 'C', assigneeId: 'member-1', productionProjectId: 'project-1' },
];

test('owner/admin can create, attach, and detach a project task without duplicating the entity', () => {
  assert.equal(canMutateScopedTasks({ teamMemberView: false, userRole: 'admin' }), true);
  assert.equal(canMutateScopedTasks({ teamMemberView: false, userRole: 'user' }), true);
  const created = createTaskRecord({ text: 'Master live album' }, {
    id: 'new-task', now: '2026-08-13T10:00:00.000Z', productionProjectId: 'project-1',
  });
  assert.equal(created.productionProjectId, 'project-1');

  const attached = attachTask(TASKS, 'task-a', 'project-1');
  assert.equal(attached.task.productionProjectId, 'project-1');
  assert.equal(attached.tasks.length, TASKS.length);

  const detached = detachTask(attached.tasks, 'task-a', 'project-1');
  assert.equal(detached.task.productionProjectId, null);
  assert.equal(detached.tasks.find((task) => task.id === 'task-a').text, 'A');
});

test('shared-member visibility is limited to assigned linked tasks and completion remains boolean-only', () => {
  const visible = tasksForProductionProject(TASKS, 'project-1', {
    teamMemberView: true,
    authUserId: 'member-1',
  });
  assert.deepEqual(visible.map((task) => task.id), ['task-c']);
  assert.equal(canMutateScopedTasks({ teamMemberView: true }), false);
  assert.deepEqual(validateAssignedTaskCompletion({ completed: false }), { ok: true, completed: false });
  assert.equal(validateAssignedTaskCompletion({ completed: true, productionProjectId: 'project-2' }).ok, false);
});

test('unauthorized and cross-artist access cannot resolve the other artist task store', () => {
  const access = decideArtistAccess({
    artistId: 'artist-b',
    sharedAccess: { 'artist-a': { role: 'producer' } },
  });
  assert.deepEqual(access, { allowed: false });

  const artistAPath = dataPath(artistScopedId('admin', 'artist-a'), 'tasks.json');
  const artistBPath = dataPath(artistScopedId('admin', 'artist-b'), 'tasks.json');
  assert.notEqual(artistAPath, artistBPath);
  assert.throws(() => attachTask(TASKS, 'artist-b-task', 'project-1'), (error) => (
    error instanceof TaskLinkError && error.status === 404
  ));
});

test('a task cannot be linked to more than one Production Project', () => {
  assert.throws(() => attachTask(TASKS, 'task-b', 'project-2'), (error) => (
    error instanceof TaskLinkError && error.status === 409
  ));
  // Re-attaching to the same project is idempotent.
  assert.equal(attachTask(TASKS, 'task-b', 'project-1').task.productionProjectId, 'project-1');
});

test('deleting a project clears associations but preserves every task record', () => {
  const detached = detachProjectTasks(TASKS, 'project-1');
  assert.equal(detached.length, TASKS.length);
  assert.deepEqual(detached.map((task) => task.id), TASKS.map((task) => task.id));
  assert.equal(detached.find((task) => task.id === 'task-b').productionProjectId, null);
  assert.equal(detached.find((task) => task.id === 'task-c').productionProjectId, null);
  assert.equal(detached.find((task) => task.id === 'task-a').productionProjectId, null);
});

test('generic task CRUD cannot set or change the project association directly', () => {
  assert.equal(attemptsProjectLink({ text: 'Task', productionProjectId: 'project-1' }), true);
  assert.equal(attemptsProjectLink({ productionProjectId: null }), true);
  assert.equal(attemptsProjectLink({ text: 'Ordinary task' }), false);
});
