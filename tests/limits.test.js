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
    '172.31.255.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '[::1]', '[fd00::1]', '[fe80::1]', '[::ffff:7f00:1]',
    'localhost.', 'a.localhost.', 'router.', 'nas.local.', 'nas.internal.', '[::7f00:1]', '[64:ff9b::7f00:1]', '[fec0::1]',
    '[2002:7f00:1::]', '198.18.0.1', '192.0.0.1', '224.0.0.1']) {
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

test('a trailing dot does not get past the image URL check', () => {
  assert.equal(WW.isImageUrlAllowed('http://localhost./x.png', 'https://news.test/a'), false);
});

// Headers only: readImageSize must not need the rest of the file.
const png = (w, h) => {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return new Uint8Array(b);
};
const gif = (w, h) => {
  const b = Buffer.alloc(10);
  b.write('GIF89a', 0, 'latin1');
  b.writeUInt16LE(w, 6);
  b.writeUInt16LE(h, 8);
  return new Uint8Array(b);
};
const jpeg = (w, h) => {
  // SOI, an APP0 segment to skip, then SOF2 (progressive).
  const b = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc2, 0x00, 0x11, 0x08, 0, 0, 0, 0, 0x03]);
  b.writeUInt16BE(h, 13);
  b.writeUInt16BE(w, 15);
  return new Uint8Array(b);
};
const webp = (chunk, fill) => {
  const b = Buffer.alloc(32);
  b.write('RIFF', 0, 'latin1');
  b.write('WEBP', 8, 'latin1');
  b.write(chunk, 12, 'latin1');
  fill(b);
  return new Uint8Array(b);
};
const avif = (...sizes) => {
  const boxes = sizes.map(([w, h]) => {
    const b = Buffer.alloc(20);
    b.writeUInt32BE(20, 0);
    b.write('ispe', 4, 'latin1');
    b.writeUInt32BE(w, 12);
    b.writeUInt32BE(h, 16);
    return b;
  });
  const ftyp = Buffer.alloc(16);
  ftyp.writeUInt32BE(16, 0);
  ftyp.write('ftypavif', 4, 'latin1');
  return new Uint8Array(Buffer.concat([ftyp, ...boxes]));
};

test('readImageSize reads each format from its header', () => {
  const size = { width: 300, height: 200 };
  assert.deepEqual(WW.readImageSize(png(300, 200)), size);
  assert.deepEqual(WW.readImageSize(gif(300, 200)), size);
  assert.deepEqual(WW.readImageSize(jpeg(300, 200)), size);
  assert.deepEqual(WW.readImageSize(webp('VP8 ', (b) => { b.writeUInt16LE(300, 26); b.writeUInt16LE(200, 28); })), size);
  assert.deepEqual(WW.readImageSize(webp('VP8X', (b) => { b.writeUIntLE(299, 24, 3); b.writeUIntLE(199, 27, 3); })), size);
  assert.deepEqual(
    WW.readImageSize(webp('VP8L', (b) => { b.writeUInt32LE(((300 - 1) | ((200 - 1) << 14)) >>> 0, 21); })),
    size
  );
  assert.deepEqual(WW.readImageSize(avif([10, 10], [300, 200])), size);
});

test('readImageSize returns null for unknown or truncated data', () => {
  assert.equal(WW.readImageSize(new Uint8Array([1, 2, 3, 4])), null);
  assert.equal(WW.readImageSize(png(10, 10).subarray(0, 20)), null);
  assert.equal(WW.readImageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04])), null);
  assert.equal(WW.readImageSize(png(0, 10)), null);
});

test('pixel limit: decided from the bytes, before any decoding', () => {
  const limit = 40 * 1000 * 1000;
  assert.equal(WW.imageWithinPixelLimit(png(1000, 1000), limit), true);
  assert.equal(WW.imageWithinPixelLimit(png(30000, 30000), limit), false);
  assert.equal(WW.imageWithinPixelLimit(new Uint8Array(Buffer.from('  <svg></svg>')), limit), false);
  assert.equal(WW.imageWithinPixelLimit(new Uint8Array(Buffer.from('<svg width="100000" height="100000"></svg>')), limit), false);
  assert.equal(WW.imageWithinPixelLimit(new Uint8Array(Buffer.from('BM unsupported')), limit), false);
  assert.equal(WW.imageWithinPixelLimit(new Uint8Array(0), limit), false);
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
