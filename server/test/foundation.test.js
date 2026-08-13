const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { createTestApp, removeTestData } = require('./helpers/testApp');

const contexts = [];

function fixture() {
  const context = createTestApp();
  contexts.push(context);
  return context;
}

async function signIn(app, username, password) {
  const agent = request.agent(app);
  await agent.post('/login').send({ username, password }).expect(302);
  return agent;
}

afterEach(() => {
  while (contexts.length) removeTestData(contexts.pop().dataDir);
});

describe('test foundation', () => {
  it('imports an app without listening and keeps unauthenticated API requests out', async () => {
    const { app } = fixture();
    expect(app.locals.startBackgroundServices).toBeTypeOf('function');
    await request(app).get('/api/me').expect(401);
    await request(app).get('/healthz').expect(200, { ok: true });
  });

  it('enforces authentication and admin-only boundaries', async () => {
    const { app } = fixture();
    const admin = await signIn(app, 'fixture-admin', 'fixture-admin-password');
    await admin.get('/api/me').expect(200).expect(({ body }) => {
      expect(body.role).toBe('admin');
      expect(body.username).toBe('fixture-admin');
    });

    const member = await signIn(app, 'fixture-member', 'fixture-member-password');
    await member.get('/api/admin/backup-status').expect(403);
  });

  it('rejects malformed and unauthorised artist scope before routes reach data', async () => {
    const { app, artistId } = fixture();
    const member = await signIn(app, 'fixture-member', 'fixture-member-password');
    await member.get('/api/shows').query({ artistId: '../outside-data' }).expect(400);
    await member.get('/api/shows').query({ artistId }).expect(403);

    const admin = await signIn(app, 'fixture-admin', 'fixture-admin-password');
    await admin.get('/api/shows').query({ artistId }).expect(200, []);
  });

  it('requires a marked temporary directory and derives scoped data paths safely', () => {
    const { dataDir, artistId } = fixture();
    const { DATA_DIR, dataPath, assertSafeTestDataDir } = require('../utils/userData');
    expect(DATA_DIR).toBe(dataDir);
    expect(dataPath(`admin__art__${artistId}`, 'shows.json'))
      .toBe(path.join(dataDir, 'artists', artistId, 'shows.json'));
    expect(() => assertSafeTestDataDir('/data')).toThrow('protected DATA_DIR');
    expect(() => assertSafeTestDataDir(path.join(os.tmpdir(), 'unmarked-test-data'))).toThrow('isolation marker');
  });

  it('persists fixture-backed shows and tasks only inside the scoped test data', async () => {
    const { app, dataDir, artistId } = fixture();
    const admin = await signIn(app, 'fixture-admin', 'fixture-admin-password');
    const query = { artistId };

    const showResponse = await admin.post('/api/shows').query(query).send({
      name: 'Fixture Show', date: '2026-08-20', eventType: 'Concert',
    }).expect(201);
    const show = showResponse.body;

    const taskResponse = await admin.post('/api/tasks').query(query).send({
      text: 'Confirm fixture schedule', showId: show.id, dueDate: '2026-08-19',
    }).expect(201);
    expect(taskResponse.body.showIds).toEqual([show.id]);
    const task = taskResponse.body;

    await admin.put(`/api/tasks/${task.id}`).query(query).send({
      completed: true, showIds: [show.id], notes: 'Fixture task update',
    }).expect(200).expect(({ body }) => {
      expect(body).toMatchObject({ id: task.id, completed: true, showIds: [show.id] });
    });

    await admin.put(`/api/shows/${show.id}`).query(query).send({ notes: 'Stored in fixture only' }).expect(200);
    await admin.get('/api/shows').query(query).expect(200).expect(({ body }) => {
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({ id: show.id, notes: 'Stored in fixture only' });
    });

    const scopedRoot = path.join(dataDir, 'artists', artistId);
    const storedShows = JSON.parse(fs.readFileSync(path.join(scopedRoot, 'shows.json'), 'utf8'));
    const storedTasks = JSON.parse(fs.readFileSync(path.join(scopedRoot, 'tasks.json'), 'utf8'));
    expect(storedShows).toHaveLength(1);
    expect(storedTasks).toEqual([expect.objectContaining({
      id: task.id, completed: true, showId: show.id, showIds: [show.id],
    })]);

    await admin.delete(`/api/tasks/${task.id}`).query(query).expect(204);
    expect(JSON.parse(fs.readFileSync(path.join(scopedRoot, 'tasks.json'), 'utf8'))).toEqual([]);
    expect(fs.existsSync(path.join(dataDir, 'shows.json'))).toBe(false);
  });
});
