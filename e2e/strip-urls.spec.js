// includeLinks / includeImages only change Markdown and clipboard text.
const { test, expect } = require('./fixtures');

test('clipboard drops the image URL when includeImages is off', async ({ ext }) => {
  await ext.setSettings({ clipboard: true, download: false, includeImages: false });
  const p = await ext.open('/image');
  await ext.run(p);
  const text = await ext.readClipboard(p);
  expect(text).toContain('[Image: Big gradient]');
  expect(text).not.toContain('big.png');
});

test('clipboard keeps the image URL when includeImages is on', async ({ ext }) => {
  await ext.setSettings({ clipboard: true, download: false, includeImages: true });
  const p = await ext.open('/image');
  await ext.run(p);
  expect(await ext.readClipboard(p)).toContain('big.png');
});

const fs = require('fs');

test('PDF embeds no picture when includeImages is off', async ({ ext }) => {
  await ext.setSettings({ clipboard: false, download: true, format: 'pdf', content: 'cleaned', includeImages: false });
  const p = await ext.open('/image');
  await ext.run(p);
  const [file] = await ext.waitForDownloads(1);
  const pdf = fs.readFileSync(file.filename).toString('latin1');
  expect(pdf.startsWith('%PDF-')).toBe(true);
  expect(pdf).not.toContain('/Subtype /Image');
});
