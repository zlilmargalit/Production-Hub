const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp, removeTestData } = require('./helpers/testApp');

const contexts = [];
const fixture = () => { const context = createTestApp(); contexts.push(context); return context; };
const signIn = async (app, username, password) => {
  const agent = request.agent(app);
  await agent.post('/login').send({ username, password }).expect(302);
  return agent;
};

afterEach(() => { while (contexts.length) removeTestData(contexts.pop().dataDir); });

describe('Production Project member directory', () => {
  it('returns only minimal same-artist eligible users to an owner and never to a shared member', async () => {
    const { app, dataDir, artistId, memberId } = fixture();
    fs.writeFileSync(path.join(dataDir, 'team-settings.json'), JSON.stringify({
      userArtistAccess: { [memberId]: { [artistId]: { role: 'producer' } } }, userPermissions: {},
    }));
    const admin = await signIn(app, 'fixture-admin', 'fixture-admin-password');
    await admin.get('/api/production-projects/members').query({ artistId }).expect(200)
      .expect(({ body }) => expect(body).toEqual([{ id: memberId, label: 'fixture-member', accessRole: 'producer' }]));

    const project = await admin.post('/api/production-projects').query({ artistId })
      .send({ name: 'Private project', status: 'planned' }).expect(201);
    await admin.put(`/api/production-projects/${project.body.id}/team`).query({ artistId })
      .send({ teamMemberIds: [memberId] }).expect(200);

    const member = await signIn(app, 'fixture-member', 'fixture-member-password');
    await member.get('/api/production-projects/members').query({ artistId }).expect(403);
    await member.get(`/api/production-projects/${project.body.id}/team-members`).query({ artistId }).expect(200)
      .expect(({ body }) => expect(body).toEqual([{ id: memberId, label: 'fixture-member', accessRole: 'producer' }]));
  });

  it('filters the read-only agenda to projects visible to the authenticated member', async () => {
    const { app, dataDir, artistId, memberId } = fixture();
    fs.writeFileSync(path.join(dataDir, 'team-settings.json'), JSON.stringify({
      userArtistAccess: { [memberId]: { [artistId]: { role: 'producer' } } }, userPermissions: {},
    }));
    const admin = await signIn(app, 'fixture-admin', 'fixture-admin-password');
    const visibleProject = await admin.post('/api/production-projects').query({ artistId })
      .send({ name: 'Visible deadline', deadline: '2026-08-20', status: 'planned' }).expect(201);
    await admin.put(`/api/production-projects/${visibleProject.body.id}/team`).query({ artistId })
      .send({ teamMemberIds: [memberId] }).expect(200);
    await admin.post('/api/production-projects').query({ artistId })
      .send({ name: 'Private deadline', deadline: '2026-08-21', status: 'planned' }).expect(201);

    const member = await signIn(app, 'fixture-member', 'fixture-member-password');
    await member.get('/api/production-projects/agenda').query({
      artistId,
      from: '2026-08-17',
      to: '2026-08-31',
    }).expect(200).expect(({ body }) => {
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({
        projectId: visibleProject.body.id,
        projectName: 'Visible deadline',
        kind: 'project_deadline',
        dueDate: '2026-08-20',
      });
    });
  });
});
