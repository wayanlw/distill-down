// Pre-publishing review fixes, in a real browser.
const fs = require('fs');
const { test, expect } = require('./fixtures');

const CLIP_SENTINEL = 'CLIPBOARD-BEFORE-THE-CLICK';

test('Full still saves when Cleaned fails, and the clipboard is not changed', async ({ ext }) => {
  await ext.setSettings({ clipboard: true, download: true, content: 'full' });
  const p = await ext.open('/nocontent');
  await ext.setClipboard(p, CLIP_SENTINEL);

  const note = await ext.run(p);

  expect(note).toContain('Saved 1 page');
  expect(note).toContain('Clipboard not changed');
  expect(note).not.toMatch(/copied/i);
  expect(await ext.readClipboard(p)).toBe(CLIP_SENTINEL);
  const [file] = await ext.waitForDownloads(1);
  expect(fs.readFileSync(file.filename, 'utf8')).toContain('BUTTON-ONLY-TEXT');
});

test('clipboard only, no Cleaned text: failure shown and clipboard not changed', async ({ ext }) => {
  await ext.setSettings({ clipboard: true, download: false });
  const p = await ext.open('/nocontent');
  await ext.setClipboard(p, CLIP_SENTINEL);

  const note = await ext.run(p);

  expect(note).toContain('Nothing could be processed');
  expect(await ext.readClipboard(p)).toBe(CLIP_SENTINEL);
});

test('source address: query removed by default, full on request', async ({ ext }) => {
  const p = await ext.open('/one?token=SECRET123');

  await ext.setSettings({ clipboard: true, download: false });
  await ext.run(p);
  const text = await ext.readClipboard(p);
  expect(text).toContain('/one\n');
  expect(text).not.toContain('SECRET123');

  await ext.setSettings({ clipboard: true, download: false, fullSourceUrl: true });
  await ext.run(p);
  expect(await ext.readClipboard(p)).toContain('SECRET123');
});

test('an interrupted download is reported as a failure, not as saved', async ({ ext }) => {
  await ext.setSettings({ clipboard: false, download: true, content: 'cleaned' });
  const p = await ext.open('/one');
  await ext.worker.evaluate(() => { self.__failDownloads = true; });
  const note = await ext.run(p);
  expect(note).toContain('Nothing was saved');
  expect(note).toContain('download interrupted');
});
