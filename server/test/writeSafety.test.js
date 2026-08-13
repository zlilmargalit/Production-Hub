const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { createTestApp, removeTestData } = require('./helpers/testApp');

const contexts = [];

function fixture() {
  const context = createTestApp();
  contexts.push(context);
  return context;
}

afterEach(() => {
  while (contexts.length) removeTestData(contexts.pop().dataDir);
});

describe('JSON write safety', () => {
  it('serializes parallel mutations and leaves a valid JSON file after a failed mutation', async () => {
    const { dataDir } = fixture();
    const { updateJsonAndCache } = require('../cache');
    const file = path.join(dataDir, 'parallel.json');
    fs.writeFileSync(file, '[]');

    const failed = updateJsonAndCache('parallel', file, async () => {
      throw new Error('synthetic mutation failure');
    });
    const writes = Array.from({ length: 16 }, (_, index) =>
      updateJsonAndCache('parallel', file, async (current) => {
        await new Promise((resolve) => setTimeout(resolve, index % 3));
        return [...current, index];
      })
    );

    await expect(failed).rejects.toThrow('synthetic mutation failure');
    await Promise.all(writes);

    const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(stored).toHaveLength(16);
    expect(new Set(stored)).toEqual(new Set(Array.from({ length: 16 }, (_, index) => index)));
  });

  it('captures the previous JSON value as a compressed version snapshot', async () => {
    const { dataDir } = fixture();
    const { writeJsonAndCache } = require('../cache');
    const file = path.join(dataDir, 'shows.json');
    const previous = [{ id: 'before-write', name: 'Fixture show' }];
    fs.writeFileSync(file, JSON.stringify(previous));

    await writeJsonAndCache('fixture-shows', file, [{ id: 'after-write', name: 'Updated fixture show' }]);

    const versionsDir = path.join(dataDir, '_versions', 'shows.json');
    const versions = fs.readdirSync(versionsDir).filter((name) => name.endsWith('.json.gz'));
    expect(versions).toHaveLength(1);
    const snapshot = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(versionsDir, versions[0]))).toString('utf8'));
    expect(snapshot).toEqual(previous);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual([{ id: 'after-write', name: 'Updated fixture show' }]);
  });
});
