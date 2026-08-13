const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp, removeTestData } = require('./helpers/testApp');

const contexts = [];

function fixture() {
  const context = createTestApp();
  contexts.push(context);
  return context;
}

async function adminAgent(app) {
  const agent = request.agent(app);
  await agent.post('/login').send({ username: 'fixture-admin', password: 'fixture-admin-password' }).expect(302);
  return agent;
}

afterEach(() => {
  while (contexts.length) removeTestData(contexts.pop().dataDir);
});

describe('show payload safety', () => {
  it('preserves base64 custom-field payloads when a slimmed show is saved back', async () => {
    const { app, dataDir, artistId } = fixture();
    const admin = await adminAgent(app);
    const query = { artistId };
    const originalData = 'data:image/png;base64,c3ludGhldGljLWZpeHR1cmU=';

    const created = await admin.post('/api/shows').query(query).send({
      name: 'Payload fixture',
      customFields: { stagePlan: { name: 'stage-plan.png', data: originalData } },
    }).expect(201);

    const slim = await admin.get('/api/shows').query(query).expect(200);
    const slimShow = slim.body.find((show) => show.id === created.body.id);
    expect(slimShow.customFields.stagePlan).toMatchObject({ data: null, _hasData: true });

    await admin.put(`/api/shows/${created.body.id}`).query(query).send({
      ...slimShow,
      notes: 'Saved from the slim list response',
    }).expect(200);

    const stored = JSON.parse(fs.readFileSync(path.join(dataDir, 'artists', artistId, 'shows.json'), 'utf8'));
    expect(stored[0].customFields.stagePlan.data).toBe(originalData);
    expect(stored[0].notes).toBe('Saved from the slim list response');
  });
});
