// Format "print": the browser's own print-to-PDF of the live page.
const fs = require('fs');
const { test, expect } = require('./fixtures');

test('print format saves a real browser PDF of the page', async ({ ext }) => {
  await ext.setSettings({ clipboard: false, download: true, format: 'pdf', content: 'print' });
  const p = await ext.open('/image');
  const note = await ext.run(p);
  expect(note).toMatch(/^Saved 1 page \(1 file\)\./);

  const [file] = await ext.waitForDownloads(1);
  expect(file.requested).toMatch(/\.pdf$/);
  const pdf = fs.readFileSync(file.filename).toString('latin1');
  expect(pdf.startsWith('%PDF-')).toBe(true);
  expect(pdf).toMatch(/Skia\/PDF|Chromium/);
});

test('Page print without the debugger permission is skipped with a clear message', async ({ ext }) => {
  await ext.setSettings({ clipboard: false, download: true, format: 'pdf', content: 'print' });
  await ext.worker.evaluate(() => {
    chrome.permissions.contains = async () => false;
  });
  const p = await ext.open('/image');
  const note = await ext.run(p);
  expect(note).toMatch(/debugger permission/);
  expect(await ext.downloads()).toHaveLength(0);
});

test('choosing Page print in the options page keeps it when permission is granted', async ({ ext }) => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.worker.url().split('/')[2]}/options.html`);
  await page.check('#download');
  await page.selectOption('#format', 'pdf');
  await page.selectOption('#content', 'print');
  await expect(page.locator('#status')).toHaveText('Saved');
  await expect(page.locator('#content')).toHaveValue('print');
});

test('declining the permission puts the options page back on Cleaned', async ({ ext }) => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.worker.url().split('/')[2]}/options.html`);
  await page.evaluate(() => {
    chrome.permissions.request = async () => false;
  });
  await page.check('#download');
  await page.selectOption('#format', 'pdf');
  await page.selectOption('#content', 'print');
  await expect(page.locator('#content')).toHaveValue('cleaned');
  await expect(page.locator('#status')).toHaveText('Page print needs the debugger permission');
});
