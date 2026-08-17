const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ValidationError,
  validateProductionProject,
  validateMilestone,
  validateCommunicationContact,
  validateFollowUp,
  validateCommunicationLogEntry,
  deriveProductionProject,
  buildProductionProjectAgenda,
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

test('optional project fields normalize safely and may be cleared without rewriting old records', () => {
  const legacy = deriveProductionProject({ ...PROJECT });
  assert.equal(legacy.category, null);
  assert.equal(legacy.startDate, null);
  assert.equal('category' in PROJECT, false);
  assert.equal('startDate' in PROJECT, false);

  const created = validateProductionProject({
    name: '  Live album  ', category: '  אלבום הופעה  ',
    startDate: '2026-08-01', deadline: '2026-08-31',
  });
  assert.equal(created.category, 'אלבום הופעה');
  assert.equal(created.startDate, '2026-08-01');
  assert.equal(created.deadline, '2026-08-31');

  const cleared = validateProductionProject({ category: '', startDate: null, deadline: null }, created);
  assert.equal(cleared.category, null);
  assert.equal(cleared.startDate, null);
  assert.equal(cleared.deadline, null);
  assert.throws(() => validateProductionProject({ name: 'Live album', category: 'x'.repeat(201) }), ValidationError);
});

test('project start date cannot be after its deadline when both are present', () => {
  assert.throws(() => validateProductionProject({
    name: 'Live album', startDate: '2026-09-01', deadline: '2026-08-31',
  }), (error) => error instanceof ValidationError
    && error.message === 'startDate must be on or before deadline');
  assert.doesNotThrow(() => validateProductionProject({
    name: 'Live album', startDate: '2026-08-31', deadline: '2026-08-31',
  }));
  assert.doesNotThrow(() => validateProductionProject({ name: 'Live album', startDate: '2026-08-31' }));
});

test('milestone due date is optional, validated, normalized, and clearable', () => {
  const now = '2026-08-01T10:00:00.000Z';
  const created = validateMilestone({ title: 'Mix', dueDate: '2026-08-20' }, null, now);
  assert.equal(created.dueDate, '2026-08-20');
  assert.equal(validateMilestone({ completed: true }, created, now).dueDate, '2026-08-20');
  assert.equal(validateMilestone({ dueDate: null }, created, now).dueDate, null);
  assert.throws(() => validateMilestone({ title: 'Mix', dueDate: '2026-02-30' }), ValidationError);

  const legacy = deriveProductionProject({
    ...PROJECT, milestones: [{ id: 'legacy', title: 'Legacy', completed: false }],
  });
  assert.equal(legacy.milestones[0].dueDate, null);
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

test('legacy communication entries normalize missing contact to null without mutation', () => {
  const legacyEntry = { id: 'legacy', occurredAt: '2026-08-01T09:00:00.000Z', note: 'Legacy note' };
  const result = deriveProductionProject({ ...PROJECT, communicationLog: [legacyEntry] });
  assert.equal(result.communicationLog[0].contact, null);
  assert.equal(result.communicationLog[0].channel, null);
  assert.equal(result.communicationLog[0].followUp, null);
  assert.equal('contact' in legacyEntry, false);
});

test('external communication contact is normalized and optional', () => {
  assert.deepEqual(validateCommunicationContact({ externalName: '  חברת הגברה  ' }), {
    kind: 'external', teamMemberId: null, nameSnapshot: 'חברת הגברה',
  });
  assert.equal(validateCommunicationContact({ externalName: '   ' }), null);
  assert.equal(validateCommunicationContact(null), null);
  assert.throws(() => validateCommunicationContact({ externalName: 'x'.repeat(201) }), ValidationError);
});

test('team-member contact snapshot is server-owned and survives later membership changes', () => {
  const teamMembers = [{ id: 'member-1', label: 'Current readable name' }];
  const contact = validateCommunicationContact({
    teamMemberId: 'member-1', nameSnapshot: 'Spoofed client name',
  }, null, { teamMembers });
  assert.deepEqual(contact, {
    kind: 'team_member', teamMemberId: 'member-1', nameSnapshot: 'Current readable name',
  });

  const existing = { occurredAt: '2026-08-01T09:00:00.000Z', note: 'Original', contact };
  const edited = validateCommunicationLogEntry(
    { note: 'Edited later' }, existing, {}, '2026-08-02T09:00:00.000Z', { teamMembers: [] },
  );
  assert.deepEqual(edited.contact, contact);
  assert.throws(() => validateCommunicationContact(
    { teamMemberId: 'member-1' }, null, { teamMembers: [] },
  ), ValidationError);
});

test('communication channel and optional follow-up validate without creating a task-shaped record', () => {
  const entry = validateCommunicationLogEntry({
    occurredAt: '2026-08-13T09:00:00.000Z',
    note: 'Call the mastering engineer',
    channel: '  WhatsApp  ',
    followUp: { dueDate: '2026-08-20' },
  });
  assert.equal(entry.channel, 'WhatsApp');
  assert.deepEqual(entry.followUp, { dueDate: '2026-08-20', status: 'open' });
  assert.equal('assigneeId' in entry.followUp, false);
  assert.equal('taskId' in entry.followUp, false);

  assert.deepEqual(validateFollowUp({ status: 'done' }, entry.followUp), {
    dueDate: '2026-08-20', status: 'done',
  });
  assert.equal(validateFollowUp(null, entry.followUp), null);
  assert.throws(() => validateFollowUp({ dueDate: '2026-08-20', status: 'waiting' }), ValidationError);
  assert.throws(() => validateFollowUp({ status: 'open' }), ValidationError);
});

test('agenda contains only active overdue and next-14-day project items', () => {
  const project = {
    ...PROJECT,
    milestones: [
      { id: 'm-open', title: 'Open milestone', dueDate: '2026-08-20', completed: false },
      { id: 'm-done', title: 'Done milestone', dueDate: '2026-08-18', completed: true },
      { id: 'm-later', title: 'Later milestone', dueDate: '2026-09-10', completed: false },
    ],
    communicationLog: [
      { id: 'c-open', occurredAt: '2026-08-10T10:00:00.000Z', note: 'Open follow-up', followUp: { dueDate: '2026-08-25', status: 'open' } },
      { id: 'c-done', occurredAt: '2026-08-10T09:00:00.000Z', note: 'Done follow-up', followUp: { dueDate: '2026-08-14', status: 'done' } },
    ],
  };
  const items = buildProductionProjectAgenda([
    project,
    { ...project, id: 'terminal', status: 'completed' },
  ], { today: '2026-08-13', endDate: '2026-08-27' });

  assert.deepEqual(items.map((item) => item.kind), ['project_deadline', 'milestone', 'follow_up']);
  assert.deepEqual(items.map((item) => item.dueDate), ['2026-08-10', '2026-08-20', '2026-08-25']);
  assert.equal(items[0].isOverdue, true);
  assert.equal(items[1].isOverdue, false);
  assert.ok(items.every((item) => item.projectId === PROJECT.id));
  assert.throws(() => buildProductionProjectAgenda([project], {
    today: '2026-08-20', endDate: '2026-08-19',
  }), ValidationError);
});
