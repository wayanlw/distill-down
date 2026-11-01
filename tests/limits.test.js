// Source address setting and store metadata.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const WW = require('../core.js');

test('source address: query and fragment removed by default, full on request', () => {
  const url = 'https://x.test/reset?token=abc#frag';
  assert.equal(WW.DEFAULT_SETTINGS.fullSourceUrl, false);
  assert.equal(WW.formatSourceUrl(url, false), 'https://x.test/reset');
  assert.equal(WW.formatSourceUrl('https://x.test/a#t=1?b', false), 'https://x.test/a');
  assert.equal(WW.formatSourceUrl(url, true), url);
  assert.equal(WW.sanitiseSettings({}).fullSourceUrl, false);
  assert.equal(WW.sanitiseSettings({ fullSourceUrl: true }).fullSourceUrl, true);
});

test('no source address leaves no URL in Markdown or clipboard text', () => {
  const page = { title: 'T', url: '', markdown: 'Body' };
  assert.equal(WW.buildPageMarkdown(page), '# T\n\nBody\n');
  assert.equal(WW.buildClipboardText([page]), '---\nSource: T\n---\nBody\n');
});

test('manifest description fits the store limit and matches the listing', () => {
  const root = path.join(__dirname, '..');
  const { description } = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.ok(description.length <= 132, 'length ' + description.length);
  assert.ok(fs.readFileSync(path.join(root, 'store', 'LISTING.md'), 'utf8').includes(description));
});
