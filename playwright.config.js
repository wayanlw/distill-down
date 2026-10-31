const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 }
});
