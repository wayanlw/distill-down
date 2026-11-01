// Clipboard wrapper tag: <tag> ... </tag> around the whole clipboard text.
const { test, expect, MARKERS } = require('./fixtures');

const CLIP_SENTINEL = 'CLIPBOARD-BEFORE-THE-CLICK';

test('the clipboard is wrapped in the default tag when the option is on', async ({ ext }) => {
  await ext.setSettings({ clipboard: true, download: false, wrapClipboard: true });
  const p = await ext.open('/one');
  await ext.run(p);
  const text = await ext.readClipboard(p);
  expect(text).toMatch(/^<input>\n---\nSource: WW Page One — http:\/\/127\.0\.0\.1:\d+\/one\n---\n/);
  expect(text).toContain(MARKERS.one);
  expect(text.endsWith('\n</input>\n')).toBe(true);
});

test('a custom tag wraps several tabs once, around everything', async ({ ext }) => {
  await ext.setSettings({ clipboard: true, download: false, wrapClipboard: true, wrapTag: 'context' });
  const one = await ext.open('/one');
  const two = await ext.open('/two');
  await ext.worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const index = (end) => tabs.find((t) => t.url.endsWith(end)).index;
    await chrome.tabs.highlight({ tabs: [index('/one'), index('/two')] });
  });
  await ext.run(one, { focus: false });
  const text = await ext.readClipboard(one);
  expect(text).toContain(MARKERS.one);
  expect(text).toContain(MARKERS.two);
  expect(text.startsWith('<context>\n')).toBe(true);
  expect(text.endsWith('\n</context>\n')).toBe(true);
  expect(text.match(/<context>/g)).toHaveLength(1);
});

test('without the option the clipboard is not wrapped', async ({ ext }) => {
  await ext.setSettings({ clipboard: true, download: false, wrapClipboard: false });
  const p = await ext.open('/one');
  await ext.run(p);
  expect((await ext.readClipboard(p)).startsWith('---\nSource:')).toBe(true);
});

test('a closing tag in the page text is escaped so the wrapper stays whole', async ({ ext }) => {
  await ext.setSettings({ clipboard: true, download: false, wrapClipboard: true, wrapTag: 'input' });
  const p = await ext.open('/closingtag');
  await ext.run(p);
  const text = await ext.readClipboard(p);
  expect(text).toContain('<\\/input>');
  expect(text.match(/<\/input>/g)).toHaveLength(1);
  expect(text.endsWith('\n</input>\n')).toBe(true);
});

test('no Cleaned text: nothing is wrapped and the clipboard is not changed', async ({ ext }) => {
  await ext.setSettings({ clipboard: true, download: false, wrapClipboard: true });
  const p = await ext.open('/nocontent');
  await ext.setClipboard(p, CLIP_SENTINEL);
  const note = await ext.run(p);
  expect(note).toContain('Nothing could be processed');
  expect(await ext.readClipboard(p)).toBe(CLIP_SENTINEL);
});

test('the file download is never wrapped', async ({ ext }) => {
  await ext.setSettings({ clipboard: false, download: true, wrapClipboard: true });
  const p = await ext.open('/one');
  await ext.run(p);
  const [file] = await ext.waitForDownloads(1);
  const text = require('fs').readFileSync(file.filename, 'utf8');
  expect(text).not.toContain('<input>');
});

async function optionsPage(ext) {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.worker.url().split('/')[2]}/options.html`);
  return page;
}

test('options: the tag field appears with the toggle and defaults to input', async ({ ext }) => {
  const page = await optionsPage(ext);
  await expect(page.locator('#wrapClipboard')).not.toBeChecked();
  await expect(page.locator('#wrapTag')).toBeDisabled();
  await page.check('#wrapClipboard');
  await expect(page.locator('#status')).toHaveText('Saved');
  await expect(page.locator('#wrapTag')).toBeEnabled();
  await expect(page.locator('#wrapTag')).toHaveValue('input');
});

test('options: a valid tag is saved, an invalid one is blocked with a hint', async ({ ext }) => {
  const page = await optionsPage(ext);
  await page.check('#wrapClipboard');
  await page.fill('#wrapTag', 'context');
  await page.press('#wrapTag', 'Tab');
  await expect(page.locator('#status')).toHaveText('Saved');
  expect(await ext.worker.evaluate(() => chrome.storage.local.get('wrapTag'))).toEqual({ wrapTag: 'context' });

  await page.fill('#wrapTag', 'bad tag!');
  await page.press('#wrapTag', 'Tab');
  await expect(page.locator('#wrapTagHint')).toContainText('Not saved');
  await expect(page.locator('#wrapTagHint')).toContainText('<context>');
  await expect(page.locator('#wrapTag')).toHaveValue('bad tag!');
  expect(await ext.worker.evaluate(() => chrome.storage.local.get('wrapTag'))).toEqual({ wrapTag: 'context' });

  await page.fill('#wrapTag', 'ok-tag');
  await page.press('#wrapTag', 'Tab');
  await expect(page.locator('#wrapTagHint')).not.toContainText('Not saved');
  expect(await ext.worker.evaluate(() => chrome.storage.local.get('wrapTag'))).toEqual({ wrapTag: 'ok-tag' });
});

test('options: an empty tag falls back to input', async ({ ext }) => {
  const page = await optionsPage(ext);
  await page.check('#wrapClipboard');
  await page.fill('#wrapTag', 'context');
  await page.press('#wrapTag', 'Tab');
  await page.fill('#wrapTag', '');
  await page.press('#wrapTag', 'Tab');
  await expect(page.locator('#wrapTagHint')).not.toContainText('Not saved');
  expect(await ext.worker.evaluate(() => chrome.storage.local.get('wrapTag'))).toEqual({ wrapTag: 'input' });
});