const test = require('node:test');
const assert = require('node:assert/strict');
const { dataPath, artistScopedId } = require('../utils/userData');
const {
  resolveProductionWorkspace,
  canAccessProductionProjects,
} = require('../utils/productionProjectsAccess');

test('production-project access requires a scoped Production workspace', () => {
  const artists = [
    { id: 'production-a', name: 'Artist A', workType: 'production' },
    { id: 'administration-a', name: 'Admin A', workType: 'administration' },
  ];

  const allowed = resolveProductionWorkspace(artistScopedId('admin', 'production-a'), artists);
  assert.equal(allowed.ok, true);
  assert.equal(allowed.artist.id, 'production-a');

  const administration = resolveProductionWorkspace(artistScopedId('admin', 'administration-a'), artists);
  assert.equal(administration.status, 400);
  assert.equal(administration.workType, 'administration');

  const unscoped = resolveProductionWorkspace('admin', artists);
  assert.equal(unscoped.status, 400);
});

test('production-project data paths remain distinct and structural team mutations are denied', () => {
  const first = dataPath(artistScopedId('admin', 'production-a'), 'production-projects.json');
  const second = dataPath(artistScopedId('admin', 'production-b'), 'production-projects.json');
  assert.notEqual(first, second);

  assert.equal(canAccessProductionProjects({ teamMemberView: true }), false);
  assert.equal(canAccessProductionProjects({ teamMemberView: false }), true);
});
