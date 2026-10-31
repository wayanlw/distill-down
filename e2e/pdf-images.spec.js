// D-018: PDF images are fetched, downscaled to at most 1000 px wide and embedded as JPEG.
// A failed image fetch falls back to text and does not fail the page.
const fs = require('fs');
const { test, expect, IMAGE_WIDTH } = require('./fixtures');

const PDF_SETTINGS = { clipboard: false, download: true, format: 'pdf', content: 'cleaned', includeImages: true };

test('image is embedded as a JPEG no wider than 1000 px', async ({ ext }) => {
  await ext.setSettings(PDF_SETTINGS);
  const p = await ext.open('/image');
  const note = await ext.run(p);
  expect(note).toMatch(/^Saved 1 page \(1 file\)\./);

  const [file] = await ext.waitForDownloads(1);
  const pdf = fs.readFileSync(file.filename).toString('latin1');
  expect(pdf.startsWith('%PDF-')).toBe(true);
  expect(pdf).toContain('/Subtype /Image');
  expect(pdf).toContain('/Filter /DCTDecode');

  const width = Number(/\/Subtype \/Image \/Width (\d+)/.exec(pdf)[1]);
  expect(IMAGE_WIDTH).toBeGreaterThan(1000);
  expect(width).toBe(1000);
});

test('Cleaned PDF embeds a lazy-loaded image from data-src', async ({ ext }) => {
  await ext.setSettings({ clipboard: false, download: true, format: 'pdf', content: 'cleaned', includeImages: true });
  const p = await ext.open('/lazyimage');
  await ext.run(p);
  const [file] = await ext.waitForDownloads(1);
  const pdf = fs.readFileSync(file.filename).toString('latin1');
  expect(pdf).toContain('/Filter /DCTDecode');
  expect(Number(/\/Subtype \/Image \/Width (\d+)/.exec(pdf)[1])).toBe(1000);
});

test('a missing image falls back to text and the PDF is still saved', async ({ ext }) => {
  await ext.setSettings(PDF_SETTINGS);
  const p = await ext.open('/brokenimage');
  const note = await ext.run(p);
  expect(note).toMatch(/^Saved 1 page \(1 file\)\./);

  const [file] = await ext.waitForDownloads(1);
  const pdf = fs.readFileSync(file.filename).toString('latin1');
  expect(pdf.startsWith('%PDF-')).toBe(true);
  expect(pdf).not.toContain('/Subtype /Image');
});
