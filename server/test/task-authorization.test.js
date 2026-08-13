const test = require('node:test');
const assert = require('node:assert/strict');

const { decideArtistAccess } = require('../utils/artistAccess');
const {
  canMutateScopedTasks,
  tasksVisibleToRequester,
  validateAssignedTaskCompletion,
} = require('../utils/taskAuthorization');

const ARTIST_A = { id: 'artist-a', name: 'Artist A' };
const TASKS = [
  { id: 'mine', text: 'My task', assigneeId: 'member-1' },
  { id: 'theirs', text: 'Other task', assigneeId: 'member-2' },
  { id: 'unassigned', text: 'Unassigned', assigneeId: null },
];

test('admin or workspace owner receives full artist access', () => {
  const access = decideArtistAccess({ artistId: 'artist-a', ownedArtists: [ARTIST_A] });
  assert.deepEqual(access, { allowed: true, owned: true });
  assert.equal(canMutateScopedTasks({ teamMemberView: false }), true);
  assert.deepEqual(tasksVisibleToRequester(TASKS, { teamMemberView: false }), TASKS);
});

test('permitted shared member sees only tasks assigned to that member', () => {
  const access = decideArtistAccess({
    artistId: 'artist-a',
    sharedAccess: { 'artist-a': { role: 'producer', editRubrics: ['schedule'] } },
  });
  assert.equal(access.allowed, true);
  assert.equal(access.owned, false);
  assert.deepEqual(
    tasksVisibleToRequester(TASKS, { teamMemberView: true, authUserId: 'member-1' }).map((task) => task.id),
    ['mine'],
  );
});

test('non-permitted member and cross-artist request are denied', () => {
  const sharedAccess = { 'artist-a': { role: 'viewer' } };
  assert.deepEqual(decideArtistAccess({ artistId: 'artist-b', sharedAccess }), { allowed: false });
  assert.deepEqual(decideArtistAccess({ artistId: 'artist-a', sharedAccess: {} }), { allowed: false });
});

test('shared members cannot use generic task mutations', () => {
  assert.equal(canMutateScopedTasks({ teamMemberView: true, authUserId: 'member-1' }), false);
  assert.deepEqual(validateAssignedTaskCompletion({ completed: true }), { ok: true, completed: true });
  assert.equal(validateAssignedTaskCompletion({ completed: true, text: 'forged' }).ok, false);
  assert.equal(validateAssignedTaskCompletion({ completed: 'true' }).ok, false);
});
