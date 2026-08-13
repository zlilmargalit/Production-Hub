const fs = require('fs');
const path = require('path');
const { parse } = require('../../client/node_modules/@babel/parser');
const traverse = require('../../client/node_modules/@babel/traverse').default;

const CLIENT_SRC = path.resolve(__dirname, '../../client/src');
const ALLOWED_BROWSER_GLOBALS = new Set([
  'AbortController', 'Array', 'Blob', 'Boolean', 'clearTimeout', 'console',
  'crypto', 'Date', 'document', 'Error', 'fetch', 'FileReader', 'FormData',
  'Image', 'IntersectionObserver', 'Intl', 'JSON', 'localStorage', 'Map',
  'Math', 'navigator', 'Notification', 'Number', 'Object', 'process',
  'Promise', 'RegExp', 'setTimeout', 'Set', 'String', 'undefined', 'URL',
  'URLSearchParams', 'window',
]);

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(js|jsx)$/.test(entry.name) ? [full] : [];
  });
}

test('client source has no unbound runtime identifiers', () => {
  const failures = [];
  for (const file of sourceFiles(CLIENT_SRC)) {
    const source = fs.readFileSync(file, 'utf8');
    const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
    traverse(ast, {
      ReferencedIdentifier(bindingPath) {
        const name = bindingPath.node.name;
        if (ALLOWED_BROWSER_GLOBALS.has(name) || bindingPath.scope.hasBinding(name)) return;
        failures.push(`${path.relative(CLIENT_SRC, file)}:${bindingPath.node.loc.start.line} ${name}`);
      },
    });
  }
  if (failures.length) {
    throw new Error(`Unbound client identifiers:\n${failures.join('\n')}`);
  }
});
