const fs = require('fs');
const os = require('os');
const path = require('path');

const SERVER_ROOT = path.resolve(__dirname, '../..');
const ARTIST_ID = 'fixture-artist';
const MEMBER_ID = 'fixture-member';

function writeJson(dataDir, relativePath, value) {
  const destination = path.join(dataDir, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(value, null, 2));
}

function clearServerModules() {
  for (const id of Object.keys(require.cache)) {
    if (id.startsWith(SERVER_ROOT + path.sep)) delete require.cache[id];
  }
}

function createTestApp() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'production-hub-test-'));
  fs.writeFileSync(path.join(dataDir, '.production-hub-test-data'), 'isolated fixture data\n');

  process.env.NODE_ENV = 'test';
  process.env.DATA_DIR = dataDir;
  process.env.PRODUCTION_HUB_TEST_DATA = dataDir;
  process.env.AUTH_USER = 'fixture-admin';
  process.env.AUTH_PASSWORD = 'fixture-admin-password';

  clearServerModules();
  const { hashPassword } = require('../../auth');
  writeJson(dataDir, 'users.json', [{
    id: MEMBER_ID,
    username: 'fixture-member',
    passwordHash: hashPassword('fixture-member-password'),
    role: 'user',
  }]);
  writeJson(dataDir, 'artists.json', [{
    id: ARTIST_ID,
    name: 'Fixture Artist',
    workType: 'production',
    createdAt: '2026-01-01T00:00:00.000Z',
  }]);
  writeJson(dataDir, 'team-settings.json', {
    visibleRubrics: ['schedule'],
    userArtistAccess: {},
    userPermissions: {},
  });
  for (const file of ['shows.json', 'tasks.json', 'crew.json', 'event-types.json']) {
    writeJson(dataDir, path.join('artists', ARTIST_ID, file), []);
  }
  for (const file of ['templates.json', 'field-templates.json', 'event-type-checklists.json']) {
    writeJson(dataDir, path.join('artists', ARTIST_ID, file), {});
  }

  const { createApp } = require('../../index');
  return { app: createApp(), dataDir, artistId: ARTIST_ID, memberId: MEMBER_ID };
}

function removeTestData(dataDir) {
  fs.rmSync(dataDir, { recursive: true, force: true });
}

module.exports = { createTestApp, removeTestData };
