// PDF writer (no dependencies). A4, Helvetica (non-embedded), word-wrapped Markdown.
// v0.2 (D-018): content streams are FlateDecode-compressed; images are embedded as
// JPEG (DCTDecode) when the caller supplies them in `images`; otherwise the image
// falls back to the "[image: alt] url" text line.
// Limitation: characters outside Windows-1252 (WinAnsi) are replaced with '?'.
(function (root) {
  'use strict';

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN = 50;
  const FONT_SIZE = 10;
  const LEADING = 13;
  const IMG_GAP = 6;
  const USABLE_W = PAGE_W - 2 * MARGIN;
  const MAX_CHARS = Math.floor(USABLE_W / (FONT_SIZE * 0.5));
  const MAX_IMG_H = 480; // points
  const PX_TO_PT = 0.75;
  const MAX_IMAGES = 40;

  const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g;
  const FENCE_RE = /^(`{3,})[^\n]*\n[\s\S]*?^\1`*[ \t]*$/gm;

  // Unicode characters that WinAnsiEncoding holds in bytes 0x80-0x9F.
  const WINANSI = new Map(
    [
      [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86],
      [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
      [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95],
      [0x2013, 0x96], [0x2014, 0x97], [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
      [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f]
    ].map(([u, b]) => [u, String.fromCharCode(b)])
  );

  // Absolute http(s) image URLs in document order, deduplicated, capped.
  // Image syntax inside a code block is sample text, not an image.
  function collectImageUrls(md) {
    const seen = new Set();
    const urls = [];
    for (const m of String(md || '').replace(FENCE_RE, '').matchAll(IMAGE_RE)) {
      const u = m[2];
      if (/^https?:\/\//i.test(u) && !seen.has(u)) {
        seen.add(u);
        urls.push(u);
      }
    }
    return urls.slice(0, MAX_IMAGES);
  }

  // Strip Markdown syntax to readable plain text lines.
  function markdownToPlainLines(md) {
    return String(md || '')
      .replace(/\r/g, '')
      .split('\n')
      .map((line) =>
        line
          .replace(IMAGE_RE, (_, alt, url) => '[image: ' + (alt || 'image') + '] ' + url)
          .replace(/\[([^\]]+)\]\(([^)]*)\)/g, (_, text, url) => text + ' (' + url + ')')
          .replace(/^#{1,6}\s+/, '')
          .replace(/^>\s?/, '')
          .replace(/^(\s*)[-*+]\s+/, '$1- ')
          .replace(/[*_`]{1,3}/g, '')
          .replace(/\t/g, '    ')
      );
  }

  function wrapLine(line) {
    if (line.length <= MAX_CHARS) return [line];
    const out = [];
    let rest = line;
    while (rest.length > MAX_CHARS) {
      let cut = rest.lastIndexOf(' ', MAX_CHARS);
      if (cut < MAX_CHARS * 0.5) cut = MAX_CHARS;
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut).replace(/^ /, '');
    }
    out.push(rest);
    return out;
  }

  function toPdfString(text) {
    let s = '';
    for (const ch of text) {
      const code = ch.codePointAt(0);
      if (code === 0x09) s += ' ';
      else if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) s += ch;
      else s += WINANSI.get(code) || '?';
    }
    return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  // images: Map<url, { jpeg: Uint8Array, width: px, height: px }>. Missing entries fall back to text.
  // Returns blocks: { type: 'text', text } | { type: 'image', img }
  function markdownToBlocks(md, images) {
    const has = (u) => !!(images && images.has(u));
    const blocks = [];
    const pushText = (line) => {
      for (const w of wrapLine(line)) blocks.push({ type: 'text', text: w });
    };
    for (const raw of String(md || '').replace(/\r/g, '').split('\n')) {
      const matches = [...raw.matchAll(IMAGE_RE)];
      if (!matches.some((m) => has(m[2]))) {
        for (const l of markdownToPlainLines(raw)) pushText(l);
        continue;
      }
      const textPart = raw.replace(IMAGE_RE, (full, alt, url) => (has(url) ? '' : full)).trim();
      if (textPart) for (const l of markdownToPlainLines(textPart)) pushText(l);
      for (const m of matches) {
        if (!has(m[2])) {
          pushText('[image: ' + (m[1] || 'image') + '] ' + m[2]);
          continue;
        }
        if (m[1]) pushText('[image: ' + m[1] + ']');
        blocks.push({ type: 'image', img: images.get(m[2]) });
      }
    }
    return blocks;
  }

  // Display size in points: fit usable width, cap height.
  function imageSize(img) {
    let w = Math.min(USABLE_W, img.width * PX_TO_PT);
    let h = (w * img.height) / img.width;
    if (h > MAX_IMG_H) {
      h = MAX_IMG_H;
      w = (h * img.width) / img.height;
    }
    return { w, h };
  }

  function latin1(s) {
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
    return b;
  }

  function concat(parts) {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }

  async function deflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // Lay out blocks into pages. Each page: { ops: [string], imgs: [img] }.
  function layout(blocks) {
    const pages = [];
    let page = null;
    let y = 0;
    const newPage = () => {
      page = { ops: [], imgs: [] };
      pages.push(page);
      y = PAGE_H - MARGIN;
    };
    newPage();
    for (const b of blocks) {
      if (b.type === 'text') {
        if (y - LEADING < MARGIN) newPage();
        page.ops.push(
          'BT /F1 ' + FONT_SIZE + ' Tf ' + MARGIN + ' ' + (y - FONT_SIZE).toFixed(2) + ' Td (' + toPdfString(b.text) + ') Tj ET'
        );
        y -= LEADING;
      } else {
        const { w, h } = imageSize(b.img);
        if (y - h < MARGIN && page.ops.length) newPage();
        page.imgs.push(b.img);
        const name = 'Im' + page.imgs.length;
        page.ops.push(
          'q ' + w.toFixed(2) + ' 0 0 ' + h.toFixed(2) + ' ' + MARGIN + ' ' + (y - h).toFixed(2) + ' cm /' + name + ' Do Q'
        );
        y -= h + IMG_GAP;
      }
    }
    return pages;
  }

  // Returns a Promise<Uint8Array> of a PDF document.
  async function buildPdf(title, url, markdown, images) {
    const header = [{ type: 'text', text: String(title || 'Untitled') }];
    if (url) header.push({ type: 'text', text: String(url) });
    header.push({ type: 'text', text: '' });
    const pages = layout(header.concat(markdownToBlocks(markdown, images)));

    // Object numbers: 1 catalog, 2 pages, 3 font, then (page, content) pairs, then images.
    let next = 4;
    const pageNums = [];
    const contentNums = [];
    for (let i = 0; i < pages.length; i++) {
      pageNums.push(next++);
      contentNums.push(next++);
    }
    const imgNums = new Map();
    for (const p of pages) {
      for (const img of p.imgs) {
        if (!imgNums.has(img)) imgNums.set(img, next++);
      }
    }
    const total = next - 1;
    const objs = [];

    objs[1] = latin1('<< /Type /Catalog /Pages 2 0 R >>');
    objs[2] = latin1(
      '<< /Type /Pages /Kids [' + pageNums.map((n) => n + ' 0 R').join(' ') + '] /Count ' + pages.length + ' >>'
    );
    objs[3] = latin1('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      let xobj = '';
      if (p.imgs.length) {
        xobj =
          ' /XObject << ' +
          p.imgs.map((img, k) => '/Im' + (k + 1) + ' ' + imgNums.get(img) + ' 0 R').join(' ') +
          ' >>';
      }
      objs[pageNums[i]] = latin1(
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PAGE_W + ' ' + PAGE_H + '] ' +
          '/Resources << /Font << /F1 3 0 R >>' + xobj + ' >> /Contents ' + contentNums[i] + ' 0 R >>'
      );
      const raw = latin1(p.ops.join('\n') || '');
      const comp = await deflate(raw);
      objs[contentNums[i]] = concat([
        latin1('<< /Length ' + comp.length + ' /Filter /FlateDecode >>\nstream\n'),
        comp,
        latin1('\nendstream')
      ]);
    }

    for (const [img, num] of imgNums) {
      objs[num] = concat([
        latin1(
          '<< /Type /XObject /Subtype /Image /Width ' + img.width + ' /Height ' + img.height +
            ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + img.jpeg.length + ' >>\nstream\n'
        ),
        img.jpeg,
        latin1('\nendstream')
      ]);
    }

    const chunks = [];
    let pos = 0;
    const push = (b) => {
      chunks.push(b);
      pos += b.length;
    };
    const offsets = [];
    push(latin1('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n'));
    for (let n = 1; n <= total; n++) {
      offsets[n] = pos;
      push(latin1(n + ' 0 obj\n'));
      push(objs[n]);
      push(latin1('\nendobj\n'));
    }
    const xrefPos = pos;
    let xref = 'xref\n0 ' + (total + 1) + '\n0000000000 65535 f \n';
    for (let n = 1; n <= total; n++) xref += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
    xref += 'trailer\n<< /Size ' + (total + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF\n';
    push(latin1(xref));
    return concat(chunks);
  }

  const api = {
    buildPdf,
    collectImageUrls,
    markdownToPlainLines,
    markdownToBlocks,
    wrapLine,
    toPdfString,
    MAX_CHARS,
    MAX_IMAGES
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.WWPdf = api;
  }
})(typeof self !== 'undefined' ? self : globalThis);
