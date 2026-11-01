// Pre-publishing review fixes, in a real browser.
const fs = require('fs');
const { test, expect } = require('./fixtures');

const CLIP_SENTINEL = 'CLIPBOARD-BEFORE-THE-CLICK';

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
  await ext.setSettings({ clipboard: false, download: true });
  const p = await ext.open('/one');
  await ext.worker.evaluate(() => { self.__failDownloads = true; });
  const note = await ext.run(p);
  expect(note).toContain('Nothing was saved');
  expect(note).toContain('download interrupted');
});
