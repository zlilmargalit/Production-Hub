const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ValidationError,
  validateMilestone,
  validateCommunicationLogEntry,
  deriveProductionProject,
} = require('../utils/productionProjects');

const PROJECT = {
  id: 'project-1',
  name: 'Live album',
  deadline: '2026-08-10',
  status: 'in_progress',
  milestones: [],
  communicationLog: [],
};

test('no milestones has no misleading progress percentage', () => {
  const result = deriveProductionProject(PROJECT, { today: '2026-08-13' });
  assert.equal(result.milestoneTotal, 0);
  assert.equal(result.completedMilestoneCount, 0);
  assert.equal(result.progressPercent, null);
  assert.equal('progressPercent' in PROJECT, false);
});

test('milestone completion, reopening, editing, and deleting derive progress correctly', () => {
  const createdAt = '2026-08-01T10:00:00.000Z';
  const first = { id: 'm1', ...validateMilestone({ title: 'Mix', completed: true }, null, createdAt) };
  const second = { id: 'm2', ...validateMilestone({ title: 'Artwork' }, null, createdAt) };
  const project = { ...PROJECT, milestones: [first, second] };

  assert.equal(deriveProductionProject(project).progressPercent, 50);
  assert.equal(first.completedAt, createdAt);

  const reopened = { ...first, ...validateMilestone({ completed: false }, first, '2026-08-02T10:00:00.000Z') };
  assert.equal(reopened.completedAt, null);
  assert.equal(deriveProductionProject({ ...project, milestones: [reopened, second] }).progressPercent, 0);

  const edited = {
    ...reopened,
    ...validateMilestone({ title: 'Final mix', completed: true }, reopened, '2026-08-03T10:00:00.000Z'),
  };
  assert.equal(edited.completedAt, '2026-08-03T10:00:00.000Z');
  assert.equal(deriveProductionProject({ ...project, milestones: [edited, second] }).progressPercent, 50);

  assert.equal(deriveProductionProject({ ...project, milestones: [edited] }).progressPercent, 100);
  assert.equal(deriveProductionProject({ ...project, milestones: [] }).progressPercent, null);
});

test('completed milestone title edits preserve the completion timestamp', () => {
  const milestone = {
    id: 'm1', title: 'Old title', completed: true,
    completedAt: '2026-08-02T10:00:00.000Z', createdAt: '2026-08-01T10:00:00.000Z',
  };
  const edited = validateMilestone({ title: 'New title' }, milestone, '2026-08-04T10:00:00.000Z');
  assert.equal(edited.completedAt, '2026-08-02T10:00:00.000Z');
});

test('overdue excludes terminal projects and validates real deadline dates', () => {
  assert.equal(deriveProductionProject(PROJECT, { today: '2026-08-13' }).isOverdue, true);
  assert.equal(deriveProductionProject({ ...PROJECT, status: 'completed' }, { today: '2026-08-13' }).isOverdue, false);
  assert.equal(deriveProductionProject({ ...PROJECT, status: 'cancelled' }, { today: '2026-08-13' }).isOverdue, false);

  assert.throws(
    () => require('../utils/productionProjects').validateProductionProject({ name: 'X', deadline: '2026-02-30' }),
    ValidationError,
  );
});

test('communication log sorts newest first and editing preserves authorship', () => {
  const older = {
    id: 'old',
    ...validateCommunicationLogEntry(
      { occurredAt: '2026-08-01T09:00:00.000Z', note: 'First note' },
      null,
      { id: 'user-1', name: 'Producer' },
      '2026-08-01T09:01:00.000Z',
    ),
  };
  const newer = {
    id: 'new',
    ...validateCommunicationLogEntry(
      { occurredAt: '2026-08-03T09:00:00.000Z', note: 'Second note' },
      null,
      { id: 'user-2', name: 'Editor' },
      '2026-08-03T09:01:00.000Z',
    ),
  };
  const result = deriveProductionProject({ ...PROJECT, communicationLog: [older, newer] });
  assert.deepEqual(result.communicationLog.map((entry) => entry.id), ['new', 'old']);

  const edited = validateCommunicationLogEntry(
    { note: 'Edited note' }, older, { id: 'another-user', name: 'Another user' }, '2026-08-04T00:00:00.000Z'
  );
  assert.equal(edited.authorId, 'user-1');
  assert.equal(edited.authorNameSnapshot, 'Producer');
  assert.equal(edited.note, 'Edited note');
});
