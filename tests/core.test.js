const test = require('node:test');
const assert = require('node:assert/strict');
const WW = require('../core.js');

test('behaviour matrix', () => {
  assert.deepEqual(WW.decideBehaviour(true, true), { nothing: false, clipboard: true, download: true });
  assert.deepEqual(WW.decideBehaviour(true, false), { nothing: false, clipboard: true, download: false });
  assert.deepEqual(WW.decideBehaviour(false, true), { nothing: false, clipboard: false, download: true });
  assert.deepEqual(WW.decideBehaviour(false, false), { nothing: true, clipboard: false, download: false });
});

test('tab selection: one highlighted or none uses active tab', () => {
  const active = { id: 9, index: 4 };
  assert.deepEqual(WW.pickTabs([], active), [active]);
  assert.deepEqual(WW.pickTabs([{ id: 1, index: 0 }], active), [active]);
});

test('tab selection: multiple highlighted sorted by tab-strip index', () => {
  const tabs = [{ id: 3, index: 5 }, { id: 1, index: 0 }, { id: 2, index: 2 }];
  assert.deepEqual(WW.pickTabs(tabs, { id: 9, index: 9 }).map((t) => t.id), [1, 2, 3]);
});

test('restricted URLs', () => {
  assert.ok(WW.isRestrictedUrl('chrome://settings'));
  assert.ok(WW.isRestrictedUrl('https://chromewebstore.google.com/detail/x'));
  assert.ok(WW.isRestrictedUrl('https://chrome.google.com/webstore/detail/x'));
  assert.ok(WW.isRestrictedUrl('chrome-extension://abc/options.html'));
  assert.ok(WW.isRestrictedUrl(undefined));
  assert.equal(WW.isRestrictedUrl('https://www.linkedin.com/feed/'), false);
});

test('title sanitising: invalid chars, trailing dots, length cap', () => {
  assert.equal(WW.sanitiseTitle('a<b>c:d"e/f\\g|h?i*j'), 'abcdefghij');
  assert.equal(WW.sanitiseTitle('Hello world...  '), 'Hello world');
  assert.equal(WW.sanitiseTitle('   '), 'untitled');
  assert.equal(WW.sanitiseTitle('x'.repeat(200)).length, 80);
  assert.equal(WW.sanitiseTitle('Tab\there\nnew'), 'Tab here new');
});

test('timestamp format yyyymmdd_HHMMss in local time', () => {
  assert.equal(WW.timestamp(new Date(2026, 9, 31, 14, 6, 5)), '20261031_140605');
});

test('collision suffix _2, _3 (case-insensitive)', () => {
  const taken = new Set();
  assert.equal(WW.uniqueBase('a', taken), 'a');
  assert.equal(WW.uniqueBase('a', taken), 'a_2');
  assert.equal(WW.uniqueBase('A', taken), 'A_3');
  assert.equal(WW.uniqueBase('b', taken), 'b');
});

test('destination sanitising keeps it inside Downloads', () => {
  assert.equal(WW.sanitiseDestination('AI-Captures'), 'AI-Captures');
  assert.equal(WW.sanitiseDestination('/etc/../x\\y'), 'etc/x/y');
  assert.equal(WW.sanitiseDestination('..'), 'AI-Captures');
  assert.equal(WW.sanitiseDestination(''), 'AI-Captures');
  assert.equal(WW.sanitiseSettings({ destination: '' }).destination, '');
  assert.deepEqual(
    (({ format, content }) => ({ format, content }))(WW.sanitiseSettings({ format: 'pdf', content: 'print' })),
    { format: 'pdf', content: 'print' }
  );
  // Print is PDF-only; legacy format 'print' migrates.
  assert.equal(WW.sanitiseSettings({ format: 'markdown', content: 'print' }).content, 'cleaned');
  assert.equal(WW.sanitiseSettings({ format: 'print' }).content, 'print');
  assert.equal(WW.sanitiseSettings({ format: 'print' }).format, 'pdf');
  assert.equal(WW.sanitiseSettings({ format: 'bogus' }).format, 'markdown');
  // Full is Markdown-only; a saved PDF + Full falls back to Cleaned.
  assert.equal(WW.sanitiseSettings({ format: 'markdown', content: 'full' }).content, 'full');
  assert.equal(WW.sanitiseSettings({ format: 'pdf', content: 'full' }).content, 'cleaned');
});

test('settings sanitising applies defaults and rejects bad values', () => {
  const s = WW.sanitiseSettings({ format: 'docx', content: 'x', clipboard: 1 });
  assert.equal(s.format, 'markdown');
  assert.equal(s.content, 'cleaned');
  assert.equal(s.clipboard, true);
  assert.equal(s.download, false);
  assert.equal(s.destination, 'AI-Captures');
});

test('defaults suit AI use: clipboard on, download off, no link or image URLs', () => {
  const s = WW.sanitiseSettings({});
  assert.deepEqual(
    { c: s.clipboard, d: s.download, f: s.format, t: s.content, l: s.includeLinks, i: s.includeImages },
    { c: true, d: false, f: 'markdown', t: 'cleaned', l: false, i: false }
  );
});

test('combined clipboard text has source dividers per page', () => {
  const text = WW.buildClipboardText([
    { title: 'One', url: 'https://a.test/1', markdown: 'alpha' },
    { title: 'Two', url: 'https://b.test/2', markdown: 'beta' }
  ]);
  assert.equal(
    text,
    '---\nSource: One \u2014 https://a.test/1\n---\nalpha\n\n---\nSource: Two \u2014 https://b.test/2\n---\nbeta\n'
  );
});

test('markdown file: H1 title, URL, pages separated by rule', () => {
  const md = WW.buildMarkdownFile([
    { title: 'One', url: 'https://a.test/1', markdown: 'alpha' },
    { title: '', url: 'https://b.test/2', markdown: 'beta' }
  ]);
  assert.equal(md, '# One\n\nhttps://a.test/1\n\nalpha\n\n---\n\n# Untitled\n\nhttps://b.test/2\n\nbeta\n');
});

test('summary text', () => {
  assert.equal(
    WW.buildSummary({ pagesSaved: 2, filesSaved: 1, pagesCopied: 0, skipped: [], failures: [] }),
    'Saved 2 pages (1 file).'
  );
  const s = WW.buildSummary({
    pagesSaved: 2, filesSaved: 2, pagesCopied: 2,
    skipped: [{ title: 'Settings', reason: 'restricted page (cannot read content)' }], failures: []
  });
  assert.match(s, /^Saved 2 pages \(2 files\), copied 2 pages to clipboard\./);
  assert.match(s, /1 skipped:\n- Settings: restricted page/);
});

test('stripUrls drops link and image URLs but keeps text and code blocks', () => {
  const md = 'See [Docs](https://x.com/d "t") and ![Chart](https://x.com/c.png).\n[![Logo](https://x.com/l.png)](https://x.com)\n![](https://x.com/n.png)\n```\n[a](b) ![c](d)\n```\n';
  assert.equal(WW.stripUrls(md, {}), md);
  const noImg = WW.stripUrls(md, { includeImages: false });
  assert.ok(noImg.includes('[Docs](https://x.com/d "t")'));
  assert.ok(noImg.includes('[Image: Chart]'));
  assert.ok(!noImg.includes('c.png') && !noImg.includes('n.png'));
  const noLink = WW.stripUrls(md, { includeLinks: false });
  assert.ok(noLink.includes('See Docs and ![Chart](https://x.com/c.png).'));
  assert.ok(noLink.includes('\n![Logo](https://x.com/l.png)\n') || noLink.includes('[![Logo](https://x.com/l.png)]'));
  const none = WW.stripUrls(md, { includeLinks: false, includeImages: false });
  assert.ok(none.includes('See Docs and [Image: Chart].'));
  assert.ok(none.includes('[Image: Logo]'));
  assert.ok(none.includes('[a](b) ![c](d)')); // fenced code untouched
  assert.ok(!none.includes('https://'));
  assert.equal(WW.sanitiseSettings({ includeLinks: true }).includeLinks, true);
  assert.equal(WW.sanitiseSettings({ includeImages: false }).includeImages, false);
});
