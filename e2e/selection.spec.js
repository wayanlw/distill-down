// A selection in the active tab is captured instead of the whole page (SPEC section 6).
const fs = require('fs');
const { test, expect, MARKERS } = require('./fixtures');

const MARKDOWN = { clipboard: false, download: true, content: 'cleaned' };
const SECOND_PARAGRAPH = 'article p:nth-of-type(2)';

const select = (p, selector) => p.evaluate((s) => {
  window.getSelection().selectAllChildren(document.querySelector(s));
}, selector);

async function savedText(ext, count = 1) {
  const files = await ext.waitForDownloads(count);
  return fs.readFileSync(files[count - 1].filename, 'utf8');
}

test('a selection replaces the page, is marked in the title and reported', async ({ ext }) => {
  await ext.setSettings(MARKDOWN);
  const p = await ext.open('/one');
  await select(p, SECOND_PARAGRAPH);

  const note = await ext.run(p);

  expect(note).toContain('Selection only from the active tab.');
  const text = await savedText(ext);
  expect(text).toMatch(/^# WW Page One \(selection\)\n/);
  expect(text).toContain('Paragraph 0:');
  expect(text).not.toContain('Paragraph 1:');
  expect(text).not.toContain(MARKERS.one);
});

test('a selection under 8 words captures the whole page', async ({ ext }) => {
  await ext.setSettings(MARKDOWN);
  const p = await ext.open('/one');
  await p.evaluate(() => {
    const text = document.querySelector('article p:nth-of-type(2)').firstChild;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 'Paragraph 0'.length);
    window.getSelection().addRange(range);
  });

  const note = await ext.run(p);

  expect(note).not.toContain('Selection');
  const text = await savedText(ext);
  expect(text).toMatch(/^# WW Page One\n/);
  expect(text).toContain(MARKERS.one);
});

test('several tabs: only the active tab uses its selection', async ({ ext }) => {
  await ext.setSettings(MARKDOWN);
  const one = await ext.open('/one');
  const two = await ext.open('/two');
  await select(one, SECOND_PARAGRAPH);
  await select(two, SECOND_PARAGRAPH);
  await ext.worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const index = (end) => tabs.find((t) => t.url.endsWith(end)).index;
    await chrome.tabs.highlight({ tabs: [index('/one'), index('/two')] });
  });

  await ext.run(one, { focus: false });

  const text = await savedText(ext);
  expect(text).not.toContain(MARKERS.one);
  expect(text).toContain(MARKERS.two);
});

test('capturing a selection does not make the page load lazy images', async ({ ext, site }) => {
  await ext.setSettings(MARKDOWN);
  const p = await ext.open('/svgimage');
  await select(p, 'article');
  const before = site.requests.lastIndexOf('/svgimage'); // the log is shared across tests

  await ext.run(p);

  await savedText(ext);
  expect(site.requests.slice(before)).not.toContain('/vector.svg');
});

test('the clipboard gets the selection with a marked source line', async ({ ext }) => {
  await ext.setSettings({ clipboard: true, download: false });
  const p = await ext.open('/one');
  await select(p, SECOND_PARAGRAPH);

  await ext.run(p);

  const text = await ext.readClipboard(p);
  expect(text).toContain('Source: WW Page One (selection)');
  expect(text).not.toContain(MARKERS.one);
});
