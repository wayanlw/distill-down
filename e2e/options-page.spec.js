// Regression: the settings page must load and save through the real UI.
// It once crashed silently (core.js not loaded), so settings were never saved
// and the extension always used the defaults.
const fs = require('fs');
const { test, expect } = require('./fixtures');

test('settings saved in the options page change what a click does', async ({ ext }) => {
  const page = await ext.context.newPage();
  const extId = ext.worker.url().split('/')[2];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${extId}/options.html`);

  await page.check('#clipboard');
  await page.uncheck('#download');
  await page.click('#save');
  await expect(page.locator('#status')).toHaveText('Saved');
  expect(errors).toEqual([]);

  const p = await ext.open('/image');
  const note = await ext.run(p);
  expect(note).toMatch(/copied/i);
  expect(await ext.downloads()).toHaveLength(0);

  await page.check('#download');
  await page.uncheck('#clipboard');
  await page.click('#save');
  await expect(page.locator('#status')).toHaveText('Saved');

  await ext.run(p);
  const [file] = await ext.waitForDownloads(1);
  expect(file.requested).toMatch(/\.md$/);
  expect(fs.readFileSync(file.filename, 'utf8')).toContain('# WW Image Page');
});

test('Restore defaults resets the form and the stored settings', async ({ ext }) => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.worker.url().split('/')[2]}/options.html`);
  await page.check('#download');
  await page.check('#includeLinks');
  await page.check('#fullSourceUrl');
  await page.click('#save');
  await expect(page.locator('#status')).toHaveText('Saved');
  expect(await ext.worker.evaluate(() => chrome.storage.local.get('fullSourceUrl'))).toEqual({ fullSourceUrl: true });
  await page.click('#reset');
  await expect(page.locator('#status')).toHaveText('Saved');

  await expect(page.locator('#clipboard')).toBeChecked();
  await expect(page.locator('#download')).not.toBeChecked();
  await expect(page.locator('#includeLinks')).not.toBeChecked();
  await expect(page.locator('#includeImages')).not.toBeChecked();
  await expect(page.locator('#fullSourceUrl')).not.toBeChecked();
  const stored = await ext.worker.evaluate(() => chrome.storage.local.get(null));
  expect(stored).toMatchObject({ clipboard: true, download: false, includeLinks: false, includeImages: false, fullSourceUrl: false });
});
