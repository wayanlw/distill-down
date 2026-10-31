const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const PDF = require('../pdf.js');

const ascii = (bytes) => Buffer.from(bytes).toString('latin1');

// Decompress every FlateDecode stream and return the concatenated content text.
function inflatedContent(bytes) {
  const s = ascii(bytes);
  const re = /stream\n([\s\S]*?)\nendstream/g;
  let out = '';
  let m;
  while ((m = re.exec(s))) {
    try {
      out += zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1') + '\n';
    } catch (e) {
      // image streams are not zlib; skip
    }
  }
  return out;
}

// Fake JPEG payload: only the structure matters for these tests.
const fakeImg = (w, h) => ({ jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: w, height: h });

test('PDF has header, catalog, EOF, and xref offsets point at real objects', async () => {
  const bytes = await PDF.buildPdf('Title here', 'https://x.test/a', '# Heading\n\nSome **bold** text.\n\n- item');
  const s = ascii(bytes);
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));

  const xrefPos = Number(s.match(/startxref\n(\d+)\n/)[1]);
  assert.equal(s.slice(xrefPos, xrefPos + 4), 'xref');

  const entries = s.slice(xrefPos).split('\n').filter((l) => / n $/.test(l) || / f $/.test(l));
  for (let n = 1; n < entries.length; n++) {
    const off = Number(entries[n].slice(0, 10));
    assert.equal(s.slice(off, off + String(n).length + 6), n + ' 0 obj', 'object ' + n + ' offset');
  }
});

test('content streams are FlateDecode-compressed and decompress to the text', async () => {
  const bytes = await PDF.buildPdf('Compress me', 'https://x.test', 'Hello compressed world');
  const s = ascii(bytes);
  assert.match(s, /\/Filter \/FlateDecode/);
  assert.match(inflatedContent(bytes), /\(Hello compressed world\) Tj/);
});

test('compression shrinks repetitive long text well below raw size', async () => {
  const md = Array.from({ length: 400 }, () => 'The quick brown fox jumps over the lazy dog.').join('\n');
  const bytes = await PDF.buildPdf('Big', 'https://x.test', md);
  const rawApprox = inflatedContent(bytes).length;
  assert.ok(bytes.length < rawApprox * 0.2, 'compressed ' + bytes.length + ' vs raw ' + rawApprox);
});

test('long text wraps and paginates', async () => {
  const long = Array.from({ length: 300 }, (_, i) => 'Line number ' + i + ' with some words in it.').join('\n');
  const s = ascii(await PDF.buildPdf('T', 'https://x.test', long));
  const pages = (s.match(/\/Type \/Page /g) || []).length;
  assert.ok(pages >= 2, 'expected multiple pages, got ' + pages);
});

test('image with a supplied JPEG is embedded as DCTDecode XObject and drawn', async () => {
  const md = 'Before.\n\n![diagram](https://i.test/d.png)\n\nAfter.';
  const images = new Map([['https://i.test/d.png', fakeImg(800, 400)]]);
  const bytes = await PDF.buildPdf('Img', 'https://x.test', md, images);
  const s = ascii(bytes);
  assert.match(s, /\/Subtype \/Image \/Width 800 \/Height 400/);
  assert.match(s, /\/Filter \/DCTDecode/);
  assert.match(s, /\/XObject << \/Im1 \d+ 0 R >>/);
  assert.match(inflatedContent(bytes), /\/Im1 Do/);
});

test('image not in the map falls back to the text placeholder', async () => {
  const md = '![pic](https://i.test/missing.png)';
  const bytes = await PDF.buildPdf('Fallback', 'https://x.test', md, new Map());
  assert.doesNotMatch(ascii(bytes), /DCTDecode/);
  assert.match(inflatedContent(bytes), /\[image: pic\] https:\/\/i\.test\/missing\.png/);
});

test('image block with alt text keeps a caption line', async () => {
  const images = new Map([['https://i.test/a.jpg', fakeImg(100, 100)]]);
  const bytes = await PDF.buildPdf('Cap', 'https://x.test', '![Chart A](https://i.test/a.jpg)', images);
  assert.match(inflatedContent(bytes), /\[image: Chart A\]/);
});

test('images taller than the page area start a new page', async () => {
  const images = new Map();
  const md = [];
  for (let i = 0; i < 4; i++) {
    images.set('https://i.test/' + i + '.png', fakeImg(1000, 1400)); // displays at 480pt high
    md.push('![p](https://i.test/' + i + '.png)');
  }
  const bytes = await PDF.buildPdf('Many', 'https://x.test', md.join('\n\n'), images);
  const pages = (ascii(bytes).match(/\/Type \/Page /g) || []).length;
  assert.ok(pages >= 3, 'expected pagination with images, got ' + pages);
});

test('collectImageUrls: absolute http(s) only, deduplicated, document order', () => {
  const md = '![a](https://a.test/1.png) ![b](data:image/png;base64,xx) ![c](https://a.test/1.png) ![d](http://b.test/2.jpg)';
  assert.deepEqual(PDF.collectImageUrls(md), ['https://a.test/1.png', 'http://b.test/2.jpg']);
});

test('markdown syntax is stripped and links are kept readable', () => {
  const lines = PDF.markdownToPlainLines('## Head\n[site](https://s.test) ![pic](https://i.test/p.png)');
  assert.equal(lines[0], 'Head');
  assert.equal(lines[1], 'site (https://s.test) [image: pic] https://i.test/p.png');
});

test('non-Latin-1 characters become ? and PDF specials are escaped', () => {
  assert.equal(PDF.toPdfString('a(b)c\\d 中'), 'a\\(b\\)c\\\\d ?');
});
