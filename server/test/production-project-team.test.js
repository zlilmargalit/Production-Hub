const test = require('node:test');
const assert = require('node:assert/strict');

const { canAccessProductionProjects } = require('../utils/productionProjectsAccess');
const { validateCommunicationLogEntry } = require('../utils/productionProjects');
const {
  ProjectTeamError,
  validateProjectTeamMemberIds,
  canReadProductionProject,
  projectsVisibleToRequester,
  replaceProjectTeam,
  eligibleWorkspaceMembers,
} = require('../utils/productionProjectTeam');

const USERS = [
  { id: 'member-a', username: 'Member A' },
  { id: 'member-b', username: 'Member B' },
  { id: 'other-artist', username: 'Other Artist Member' },
  { id: 'no-access', username: 'No Access' },
];

const SETTINGS = {
  visibleRubrics: ['schedule'],
  userArtistAccess: {
    'member-a': { 'artist-a': { role: 'producer' } },
    'member-b': ['artist-a'],
    'other-artist': { 'artist-b': { role: 'viewer' } },
  },
  userPermissions: {},
};

const PROJECT = {
  id: 'project-1',
  name: 'Live album',
  teamMemberIds: ['member-a'],
  communicationLog: [{
    id: 'entry-1',
    occurredAt: '2026-08-10T10:00:00.000Z',
    note: 'Original note',
    authorId: 'member-a',
    authorNameSnapshot: 'Member A',
    createdAt: '2026-08-10T10:01:00.000Z',
  }],
};

test('owner/admin may add only authenticated users with access to the same artist', () => {
  assert.equal(canAccessProductionProjects({ teamMemberView: false, userRole: 'admin' }), true);
  assert.deepEqual(validateProjectTeamMemberIds(['member-a', 'member-b', 'member-a'], {
    artistId: 'artist-a', users: USERS, settings: SETTINGS,
  }), ['member-a', 'member-b']);
});

test('workspace member directory uses the same artist-grant eligibility as team validation', () => {
  const members = eligibleWorkspaceMembers('artist-a', { users: USERS, settings: SETTINGS });
  assert.deepEqual(members, [
    { id: 'member-a', label: 'Member A', accessRole: 'producer' },
    { id: 'member-b', label: 'Member B', accessRole: 'viewer' },
  ]);
  assert.deepEqual(eligibleWorkspaceMembers('artist-b', { users: USERS, settings: SETTINGS }), [
    { id: 'other-artist', label: 'Other Artist Member', accessRole: 'viewer' },
  ]);
});

test('unknown, cross-artist, and unpermitted membership attempts are denied', () => {
  assert.throws(() => validateProjectTeamMemberIds(['missing'], {
    artistId: 'artist-a', users: USERS, settings: SETTINGS,
  }), (error) => error instanceof ProjectTeamError && error.status === 404);

  assert.throws(() => validateProjectTeamMemberIds(['other-artist'], {
    artistId: 'artist-a', users: USERS, settings: SETTINGS,
  }), (error) => error instanceof ProjectTeamError && error.status === 403);

  assert.throws(() => validateProjectTeamMemberIds(['no-access'], {
    artistId: 'artist-a', users: USERS, settings: SETTINGS,
  }), (error) => error instanceof ProjectTeamError && error.status === 403);
});

test('only explicit project members may read a shared project', () => {
  const memberReq = { teamMemberView: true, authUserId: 'member-a' };
  const outsiderReq = { teamMemberView: true, authUserId: 'member-b' };
  assert.equal(canReadProductionProject(memberReq, PROJECT), true);
  assert.equal(canReadProductionProject(outsiderReq, PROJECT), false);
  assert.equal(canReadProductionProject({ teamMemberView: false }, PROJECT), true);
  assert.deepEqual(projectsVisibleToRequester([PROJECT], outsiderReq), []);
});

test('a project member can append a communication entry with an immutable author snapshot', () => {
  const entry = {
    id: 'entry-2',
    ...validateCommunicationLogEntry({
      occurredAt: '2026-08-13T11:00:00.000Z',
      note: 'Member update',
    }, null, { id: 'member-a', name: 'Member A' }, '2026-08-13T11:01:00.000Z'),
  };
  const updated = { ...PROJECT, communicationLog: [...PROJECT.communicationLog, entry] };
  assert.equal(canReadProductionProject({ teamMemberView: true, authUserId: 'member-a' }, updated), true);
  assert.equal(updated.communicationLog[1].authorId, 'member-a');
  assert.equal(updated.communicationLog[1].authorNameSnapshot, 'Member A');
});

test('removing a team member preserves communication history and author snapshots', () => {
  const updated = replaceProjectTeam(PROJECT, [], '2026-08-13T12:00:00.000Z');
  assert.deepEqual(updated.teamMemberIds, []);
  assert.deepEqual(updated.communicationLog, PROJECT.communicationLog);
  assert.equal(updated.communicationLog[0].authorNameSnapshot, 'Member A');
  assert.equal(canReadProductionProject({ teamMemberView: true, authUserId: 'member-a' }, updated), false);
});

test('shared project members cannot cross the structural owner boundary', () => {
  assert.equal(canAccessProductionProjects({ teamMemberView: true, authUserId: 'member-a' }), false);
});
