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
