// Automates SPEC §12 manual tests 1-5, plus test 6 against a local page with
// navigation (the live LinkedIn page needs a login and the network).
const fs = require('fs');
const { test, expect, MARKERS } = require('./fixtures');

test('1. single tab, Markdown download only', async ({ ext }) => {
  await ext.setSettings({ clipboard: false, download: true, format: 'markdown', content: 'cleaned' });
  const p = await ext.open('/one');
  const note = await ext.run(p);
  expect(note).toMatch(/^Saved 1 page \(1 file\)\./);

  const [file] = await ext.waitForDownloads(1);
  expect(file.requested).toMatch(/^DD-Captures\/\d{8}_\d{6}_WW Page One\.md$/);
  const text = fs.readFileSync(file.filename, 'utf8');
  expect(text).toContain('# WW Page One');
  expect(text).toContain(MARKERS.one);
});

test('2. single tab, clipboard only', async ({ ext }) => {
  await ext.setSettings({ clipboard: true, download: false });
  const p = await ext.open('/one');
  await ext.setClipboard(p, 'SENTINEL');
  const note = await ext.run(p);
  expect(note).toBe('copied 1 page to clipboard.');

  const clip = await ext.readClipboard(p);
  expect(clip).toMatch(/^---\nSource: WW Page One — http:\/\/127\.0\.0\.1:\d+\/one\n---\n/);
  expect(clip).toContain(MARKERS.one);
  expect(await ext.downloads()).toEqual([]);
});

test('3. both on, PDF format', async ({ ext }) => {
  await ext.setSettings({ clipboard: true, download: true, format: 'pdf', content: 'cleaned' });
  const p = await ext.open('/one');
  await ext.setClipboard(p, 'SENTINEL');
  const note = await ext.run(p);
  expect(note).toMatch(/^Saved 1 page \(1 file\), copied 1 page to clipboard\./);

  const [file] = await ext.waitForDownloads(1);
  expect(file.requested).toMatch(/^DD-Captures\/\d{8}_\d{6}_WW Page One\.pdf$/);
  const bytes = fs.readFileSync(file.filename);
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(await ext.readClipboard(p)).toContain(MARKERS.one);
});

test('4. both off, notification shown', async ({ ext }) => {
  await ext.setSettings({ clipboard: false, download: false });
  const p = await ext.open('/one');
  const note = await ext.run(p);
  expect(note).toBe('Nothing is enabled. Turn on clipboard or download in settings.');
  expect(await ext.downloads()).toEqual([]);
});

test('5. three highlighted tabs, one restricted, summary is correct', async ({ ext }) => {
  await ext.setSettings({ clipboard: true, download: true, format: 'markdown', content: 'cleaned' });
  const one = await ext.open('/one');
  const two = await ext.open('/two');
  const blank = await ext.context.newPage(); // about:blank is a restricted page
  await ext.setClipboard(one, 'SENTINEL');

  await ext.worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const pick = (test) => tabs.find(test).index;
    const indices = [
      pick((t) => t.url.endsWith('/one')),
      pick((t) => t.url.endsWith('/two')),
      pick((t) => t.url === 'about:blank')
    ];
    await chrome.tabs.highlight({ tabs: indices });
  });
  expect(blank.url()).toBe('about:blank');

  const note = await ext.run(one, { focus: false });
  expect(note).toMatch(/^Saved 2 pages \(1 file\), copied 2 pages to clipboard\. 1 skipped:/);
  expect(note).toContain('restricted page');

  const clip = await ext.readClipboard(one);
  expect(clip).toContain(MARKERS.one);
  expect(clip).toContain(MARKERS.two);
  expect(clip.indexOf(MARKERS.one)).toBeLessThan(clip.indexOf(MARKERS.two));

  const [file] = await ext.waitForDownloads(1);
  expect(file.requested).toMatch(/_2-pages\.md$/);
});

test('6. navigation and footer absent from Cleaned, present in Full', async ({ ext }) => {
  await ext.setSettings({ clipboard: false, download: true, format: 'markdown', content: 'cleaned' });
  const p = await ext.open('/nav');
  await ext.run(p);
  const [cleaned] = await ext.waitForDownloads(1);
  const cleanedText = fs.readFileSync(cleaned.filename, 'utf8');
  expect(cleanedText).toContain(MARKERS.nav);
  expect(cleanedText).not.toContain('NAVTEXT-MENU-ITEM');
  expect(cleanedText).not.toContain('FOOTERTEXT-COPYRIGHT');

  await ext.setSettings({ clipboard: false, download: true, format: 'markdown', content: 'full' });
  await ext.run(p);
  const files = await ext.waitForDownloads(2);
  const fullText = fs.readFileSync(files[files.length - 1].filename, 'utf8');
  expect(fullText).toContain('NAVTEXT-MENU-ITEM');
  expect(fullText).toContain('FOOTERTEXT-COPYRIGHT');
});
