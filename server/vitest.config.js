const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    include: [
      'test/backupSafety.test.js',
      'test/foundation.test.js',
      'test/releaseReport.test.js',
      'test/showDataSafety.test.js',
      'test/writeSafety.test.js',
      'test/productionProjectDirectory.test.js',
      'test/clientBindings.test.js',
      'test/clientBootstrap.test.js',
    ],
    fileParallelism: false,
    clearMocks: true,
    globals: true,
  },
});
