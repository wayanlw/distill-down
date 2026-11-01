// Pre-publishing review fixes, in a real browser (SPEC v1.7).
const fs = require('fs');
const { test, expect } = require('./fixtures');

const CLIP_SENTINEL = 'CLIPBOARD-BEFORE-THE-CLICK';

test('Full still saves when Cleaned fails, and the clipboard is not changed', async ({ ext }) => {
  await ext.setSettings({ clipboard: true, download: true, format: 'markdown', content: 'full' });
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

test('images off: image syntax in a code block is not fetched', async ({ ext, site }) => {
  await ext.setSettings({ clipboard: false, download: true, format: 'pdf', content: 'cleaned', includeImages: false });
  const p = await ext.open('/codeimage');
  await ext.run(p);
  const [file] = await ext.waitForDownloads(1);
  expect(fs.readFileSync(file.filename).toString('latin1')).not.toContain('/Subtype /Image');
  expect(site.requests.filter((r) => r.includes('from=codeblock'))).toEqual([]);
});

test('images on: a body that never ends is cut off and the PDF still saves', async ({ ext }) => {
  await ext.setSettings({ clipboard: false, download: true, format: 'pdf', content: 'cleaned', includeImages: true });
  const p = await ext.open('/endlessimage');
  const started = Date.now();
  const note = await ext.run(p);
  expect(Date.now() - started).toBeLessThan(20000);
  expect(note).toContain('Saved 1 page');
  const [file] = await ext.waitForDownloads(1);
  expect(fs.readFileSync(file.filename).toString('latin1')).not.toContain('/Subtype /Image');
});

test('images on: an image over the byte limit is dropped and the PDF still saves', async ({ ext }) => {
  await ext.setSettings({ clipboard: false, download: true, format: 'pdf', content: 'cleaned', includeImages: true });
  const p = await ext.open('/hugeimage');
  const note = await ext.run(p);
  expect(note).toContain('Saved 1 page');
  const [file] = await ext.waitForDownloads(1);
  expect(fs.readFileSync(file.filename).toString('latin1')).not.toContain('/Subtype /Image');
});

const PDF_IMAGES = { clipboard: false, download: true, format: 'pdf', content: 'cleaned', includeImages: true };

test('a redirected image: the destination is never contacted and the PDF still saves', async ({ ext, site }) => {
  await ext.setSettings(PDF_IMAGES);
  const p = await ext.open('/redirectimage');
  const note = await ext.run(p);
  expect(note).toContain('Saved 1 page');
  expect(site.requests).toContain('/redirect.png');
  expect(site.requests.filter((r) => r.includes('from=redirect'))).toEqual([]);
  const [file] = await ext.waitForDownloads(1);
  expect(fs.readFileSync(file.filename).toString('latin1')).not.toContain('/Subtype /Image');
});

test('oversized dimensions are refused without ever reaching the decoder', async ({ ext }) => {
  await ext.setSettings(PDF_IMAGES);
  const p = await ext.open('/hugedimensions');
  const note = await ext.run(p);
  expect(note).toContain('Saved 1 page');
  expect(await ext.worker.evaluate(() => self.__encodeCount)).toBe(0);
});

test('an SVG image is refused before decoding and the PDF still saves', async ({ ext, site }) => {
  await ext.setSettings(PDF_IMAGES);
  const p = await ext.open('/svgimage');
  const note = await ext.run(p);
  expect(note).toContain('Saved 1 page');
  expect(site.requests).toContain('/vector.svg');
  expect(await ext.worker.evaluate(() => self.__encodeCount)).toBe(0);
  const [file] = await ext.waitForDownloads(1);
  expect(fs.readFileSync(file.filename).toString('latin1')).not.toContain('/Subtype /Image');
});

test('a stuck decode closes the offscreen document and the next image still embeds', async ({ ext }) => {
  await ext.setSettings(PDF_IMAGES);
  const p = await ext.open('/twoimages');
  await ext.worker.evaluate(() => { self.__hangEncodes = 1; });
  const note = await ext.run(p);
  expect(note).toContain('Saved 1 page');
  expect(await ext.worker.evaluate(() => self.__offscreenCloses)).toBe(1);
  expect(await ext.worker.evaluate(() => self.__encodeCount)).toBe(2);
  const [file] = await ext.waitForDownloads(1);
  const pdf = fs.readFileSync(file.filename).toString('latin1');
  expect(pdf.match(/\/Subtype \/Image/g)).toHaveLength(1);
});

test('source address: query removed by default, full and none on request', async ({ ext }) => {
  const p = await ext.open('/one?token=SECRET123');

  await ext.setSettings({ clipboard: true, download: false });
  await ext.run(p);
  let text = await ext.readClipboard(p);
  expect(text).toContain('/one\n');
  expect(text).not.toContain('SECRET123');

  await ext.setSettings({ clipboard: true, download: false, sourceUrl: 'full' });
  await ext.run(p);
  expect(await ext.readClipboard(p)).toContain('SECRET123');

  await ext.setSettings({ clipboard: true, download: false, sourceUrl: 'none' });
  await ext.run(p);
  text = await ext.readClipboard(p);
  expect(text).toMatch(/^---\nSource: WW Page One\n---\n/);
});

test('an interrupted download is reported as a failure, not as saved', async ({ ext }) => {
  await ext.setSettings({ clipboard: false, download: true, format: 'markdown', content: 'cleaned' });
  const p = await ext.open('/one');
  await ext.worker.evaluate(() => { self.__failDownloads = true; });
  const note = await ext.run(p);
  expect(note).toContain('Nothing was saved');
  expect(note).toContain('download interrupted');
});
