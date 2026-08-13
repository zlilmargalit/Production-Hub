const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const AdmZip = require('adm-zip');
const { createTestApp, removeTestData } = require('./helpers/testApp');

const contexts = [];
const restoreTargets = [];

function fixture() {
  const context = createTestApp();
  contexts.push(context);
  return context;
}

afterEach(() => {
  while (contexts.length) removeTestData(contexts.pop().dataDir);
  while (restoreTargets.length) fs.rmSync(restoreTargets.pop(), { recursive: true, force: true });
});

describe('backup safety', () => {
  it('classifies mocked Drive failures as external degradation and fresh dual-target backups as healthy', async () => {
    const { dataDir } = fixture();
    const { runBackup, status } = require('../backup');
    const notifications = [];

    const healthy = await runBackup({
      trigger: 'test',
      upload: async () => 'mock-drive-file',
      notify: async (result) => notifications.push(result),
    });
    expect(healthy).toMatchObject({ local: 'ok', drive: 'ok', ok: true, driveFileId: 'mock-drive-file' });
    expect(status().health).toEqual({ state: 'healthy', category: null });

    const timeout = Object.assign(new Error('synthetic Drive timeout'), { code: 'ETIMEDOUT' });
    const degraded = await runBackup({
      trigger: 'test',
      upload: async () => { throw timeout; },
      notify: async (result) => notifications.push(result),
    });
    expect(degraded).toMatchObject({ local: 'ok', drive: 'failed', ok: true, driveError: 'synthetic Drive timeout' });
    expect(status().health).toEqual({ state: 'degraded', category: 'external' });
    expect(notifications).toEqual([expect.objectContaining({ drive: 'failed' })]);
    expect(fs.existsSync(path.join(dataDir, '_backups', 'status.json'))).toBe(true);
  });

  it('classifies a stale result separately from local data and application failures', () => {
    const { dataDir } = fixture();
    const { status, classifyStatus } = require('../backup');
    const statusFile = path.join(dataDir, '_backups', 'status.json');
    fs.mkdirSync(path.dirname(statusFile), { recursive: true });
    fs.writeFileSync(statusFile, JSON.stringify({
      ok: true, local: 'ok', drive: 'ok', finishedAt: '2020-01-01T00:00:00.000Z',
    }));

    expect(status().health).toEqual({ state: 'stale', category: 'data' });
    expect(classifyStatus({ stale: false, last: { ok: true, local: 'failed', drive: 'ok' } }))
      .toEqual({ state: 'degraded', category: 'data' });
    expect(classifyStatus({ stale: false, last: { error: 'synthetic archive failure' } }))
      .toEqual({ state: 'failed', category: 'application' });
  });

  it('restores a fixture archive only into a fresh temporary target and excludes credentials', () => {
    const { dataDir } = fixture();
    fs.writeFileSync(path.join(dataDir, 'shows.json'), JSON.stringify([{ id: 'restore-sentinel' }]));
    for (const secret of ['gmail-token.json', 'gmail-credentials.json', 'service-account.json', 'demo.json']) {
      fs.writeFileSync(path.join(dataDir, secret), 'must-not-be-archived');
    }

    const { buildArchive } = require('../backup');
    const archivePath = path.join(dataDir, 'fixture-backup.zip');
    fs.writeFileSync(archivePath, buildArchive());
    const entryNames = new AdmZip(archivePath).getEntries().map((entry) => entry.entryName);
    expect(entryNames).toContain('shows.json');
    for (const secret of ['gmail-token.json', 'gmail-credentials.json', 'service-account.json', 'demo.json']) {
      expect(entryNames).not.toContain(secret);
    }

    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'production-hub-test-restore-'));
    fs.writeFileSync(path.join(target, '.production-hub-test-data'), 'isolated restore target\n');
    restoreTargets.push(target);
    const restore = spawnSync(process.execPath, [
      path.join(__dirname, '../scripts/restore-backup.js'), archivePath, '--target', target, '--force',
    ], { encoding: 'utf8' });
    expect(restore.status, restore.stderr).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(target, 'shows.json'), 'utf8'))).toEqual([{ id: 'restore-sentinel' }]);
    expect(fs.existsSync(path.join(target, 'gmail-token.json'))).toBe(false);
    expect(fs.existsSync(path.join(target, 'service-account.json'))).toBe(false);
  });
});
