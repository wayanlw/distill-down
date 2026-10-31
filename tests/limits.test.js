// Source address setting, private-network checks and the image size limit.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const WW = require('../core.js');

test('source address: trimmed by default, full and none on request', () => {
  const url = 'https://x.test/reset?token=abc#frag';
  assert.equal(WW.DEFAULT_SETTINGS.sourceUrl, 'trimmed');
  assert.equal(WW.formatSourceUrl(url, 'trimmed'), 'https://x.test/reset');
  assert.equal(WW.formatSourceUrl('https://x.test/a#t=1?b', 'trimmed'), 'https://x.test/a');
  assert.equal(WW.formatSourceUrl(url, 'full'), url);
  assert.equal(WW.formatSourceUrl(url, 'none'), '');
  assert.equal(WW.sanitiseSettings({ sourceUrl: 'bad' }).sourceUrl, 'trimmed');
});

test('no source address leaves no URL in Markdown or clipboard text', () => {
  const page = { title: 'T', url: '', markdown: 'Body' };
  assert.equal(WW.buildPageMarkdown(page), '# T\n\nBody\n');
  assert.equal(WW.buildClipboardText([page]), '---\nSource: T\n---\nBody\n');
});

test('private hosts are recognised', () => {
  for (const h of ['localhost', 'a.localhost', 'router', 'nas.local', '127.0.0.1', '10.1.2.3', '172.16.0.1',
    '172.31.255.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '[::1]', '[fd00::1]', '[fe80::1]', '[::ffff:7f00:1]']) {
    assert.equal(WW.isPrivateHost(h), true, h);
  }
  for (const h of ['example.com', '8.8.8.8', '172.32.0.1', '192.169.0.1', '[2606:4700::1111]']) {
    assert.equal(WW.isPrivateHost(h), false, h);
  }
});

test('image URLs: a public page cannot reach private hosts; a private page can', () => {
  const pub = 'https://news.test/a';
  assert.equal(WW.isImageUrlAllowed('https://cdn.test/a.png', pub), true);
  assert.equal(WW.isImageUrlAllowed('http://192.168.1.1/a.png', pub), false);
  // URL parsing normalises disguised addresses before the check.
  assert.equal(WW.isImageUrlAllowed('http://2130706433/a.png', pub), false);
  assert.equal(WW.isImageUrlAllowed('http://192.168.1.1/a.png', 'http://192.168.1.5/page'), true);
  assert.equal(WW.isImageUrlAllowed('https://cdn.test/a.png', 'http://192.168.1.5/page'), true);
  assert.equal(WW.isImageUrlAllowed('file:///c:/a.png', pub), false);
  assert.equal(WW.isImageUrlAllowed('not a url', pub), false);
});

test('readBodyLimited returns a body within the limit', async () => {
  const bytes = await WW.readBodyLimited(new Response(new Uint8Array([1, 2, 3])), 3);
  assert.deepEqual(Array.from(bytes), [1, 2, 3]);
});

test('readBodyLimited rejects on a declared size over the limit', async () => {
  const r = new Response(new Uint8Array(1), { headers: { 'content-length': '999' } });
  await assert.rejects(WW.readBodyLimited(r, 10), /too large/);
});

test('readBodyLimited stops a body that never ends and cancels it', async () => {
  let cancelled = false;
  const endless = new ReadableStream({
    pull(c) { c.enqueue(new Uint8Array(1024)); },
    cancel() { cancelled = true; }
  });
  await assert.rejects(WW.readBodyLimited(new Response(endless), 4096), /too large/);
  assert.equal(cancelled, true);
});

test('manifest description fits the store limit and matches the listing', () => {
  const root = path.join(__dirname, '..');
  const { description } = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.ok(description.length <= 132, 'length ' + description.length);
  assert.ok(fs.readFileSync(path.join(root, 'store', 'LISTING.md'), 'utf8').includes(description));
});
