'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { scanSource } = require('./i18n-check');

const values = (source) => scanSource(source).map((hit) => hit.value);

test('real user-facing literals remain failures', () => {
  const hits = values(`
    function Example() {
      setToast(api.error || 'Saved successfully');
      return (
        <section>
          <h2>Visible heading</h2>
          <input placeholder="Visible placeholder" title="Visible title" aria-label="Visible aria label" />
          <span>טקסט גלוי</span>
        </section>
      );
    }
  `);
  assert.ok(hits.includes('Saved successfully'));
  assert.ok(hits.includes('Visible heading'));
  assert.ok(hits.includes('Visible placeholder'));
  assert.ok(hits.includes('Visible title'));
  assert.ok(hits.includes('Visible aria label'));
  assert.ok(hits.includes('טקסט גלוי'));
});

test('known technical and domain shapes are ignored structurally', () => {
  const hits = values(`
    const QUICK_LOG_ARTISTS = [
      { id: 'assaf', name: 'Assaf Amdursky', color: '#3852B4' },
      { id: 'hila', name: 'Hila Ruach', color: '#F08D39' },
    ];
    const past = shows.filter((s) => !isArchived(s) && s.date && s.date < now).length;
    const teamPast = shows.filter((s) => !s.invoice && !s.archived && s.date && s.date < today);
    const note = <p>{t('prefix')} <code className="ltr">AUTH_PASSWORD</code> {t('suffix')}</p>;
    const backup = <span>{t('prefix')} <code className="ltr">INTEGRATIONS_DATA</code> {t('suffix')}</span>;
    const backupToast = <span className="ltr">INTEGRATIONS_DATA</span>;
    const spotify = <code className="ltr">SPOTIFY_CLIENT_ID</code>;
    setSaveMsg('settings.saveError');
    setToast(\`${'${parts.join(\', \')}'}${'${warn}'}\`);
  `);
  assert.deepEqual(hits, []);
});

test('the structural exclusions do not become a broad copy baseline', () => {
  const hits = values(`
    const section = { name: 'Visible settings name' };
    const card = { id: 'save', label: 'Save changes', color: '#ffffff' };
    const heading = <h2>AUTH_PASSWORD</h2>;
  `);
  assert.ok(hits.includes('Visible settings name'));
  assert.ok(hits.includes('Save changes'));
  assert.ok(hits.includes('AUTH_PASSWORD'));
});
