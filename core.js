// Pure logic shared by the service worker, the options page and the unit tests.
// No chrome.* calls in this file.
(function (root) {
  'use strict';

  const DEFAULT_SETTINGS = Object.freeze({
    clipboard: true,
    download: false,
    format: 'markdown', // 'markdown' | 'pdf'
    content: 'cleaned', // 'cleaned' | 'full' (markdown only) | 'print' (pdf only: browser print-to-PDF)
    destination: 'DD-Captures',
    includeLinks: false, // false keeps link text, drops the URL (Markdown, clipboard, text PDF)
    includeImages: false, // false turns images into [Image: alt]; no pictures in text PDF
    sourceUrl: 'trimmed' // 'trimmed' (no query or fragment) | 'full' | 'none'
  });

  const RESTRICTED_PREFIXES = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'devtools://',
    'view-source:',
    'chrome-search://',
    'https://chrome.google.com/webstore',
    'https://chromewebstore.google.com/',
    'file://'
  ];

  class SkipError extends Error {
    constructor(reason) {
      super(reason);
      this.name = 'SkipError';
    }
  }

  // Decide what to do for a click. Returns { nothing, clipboard, download }.
  function decideBehaviour(clipboard, download) {
    const c = !!clipboard;
    const d = !!download;
    return { nothing: !c && !d, clipboard: c, download: d };
  }

  // highlighted: tabs from chrome.tabs.query({highlighted:true, currentWindow:true})
  // active: the active tab in the current window
  function pickTabs(highlighted, active) {
    const list = Array.isArray(highlighted) ? highlighted.slice() : [];
    if (list.length <= 1) return active ? [active] : list;
    return list.sort((a, b) => a.index - b.index);
  }

  function isRestrictedUrl(url) {
    if (!url) return true;
    const lower = String(url).toLowerCase();
    if (lower.endsWith('.pdf') && lower.startsWith('file://')) return true;
    return RESTRICTED_PREFIXES.some((p) => lower.startsWith(p));
  }

  // Remove Windows-invalid characters, control chars, collapse whitespace,
  // trim trailing dots/spaces, cap length.
  function sanitiseTitle(title, maxLen) {
    const limit = maxLen || 80;
    let s = String(title || '')
      .replace(/\s+/g, ' ')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
      .trim();
    if (s.length > limit) s = s.slice(0, limit).trim();
    s = s.replace(/[. ]+$/g, '').replace(/^[. ]+/g, '');
    return s || 'untitled';
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  // yyyymmdd_HHMMss in local time
  function timestamp(date) {
    const d = date instanceof Date ? date : new Date(date);
    return (
      d.getFullYear() +
      pad2(d.getMonth() + 1) +
      pad2(d.getDate()) +
      '_' +
      pad2(d.getHours()) +
      pad2(d.getMinutes()) +
      pad2(d.getSeconds())
    );
  }

  // Returns a base name not yet in `taken`, adding _2, _3 ... on collision.
  // Adds the result to `taken`.
  function uniqueBase(base, taken) {
    let candidate = base;
    let n = 2;
    while (taken.has(candidate.toLowerCase())) {
      candidate = base + '_' + n;
      n++;
    }
    taken.add(candidate.toLowerCase());
    return candidate;
  }

  // Destination must be a relative subfolder of Downloads.
  function sanitiseDestination(input) {
    const parts = String(input || '')
      .replace(/\\/g, '/')
      .split('/')
      .map((p) => p.trim().replace(/[<>:"|?*\u0000-\u001f]/g, ''))
      .filter((p) => p && p !== '.' && p !== '..');
    const joined = parts.join('/');
    return joined || DEFAULT_SETTINGS.destination;
  }

  function sanitiseSettings(raw) {
    const s = Object.assign({}, DEFAULT_SETTINGS, raw || {});
    s.clipboard = !!s.clipboard;
    s.download = !!s.download;
    s.includeLinks = !!s.includeLinks;
    s.includeImages = !!s.includeImages;
    // Legacy value from an earlier build: format 'print' became PDF + content 'print'.
    if (s.format === 'print') {
      s.format = 'pdf';
      s.content = 'print';
    }
    if (s.format !== 'markdown' && s.format !== 'pdf') s.format = DEFAULT_SETTINGS.format;
    // PDF has no Full: Markdown Full covers debugging, Page print covers the whole page.
    // A saved PDF + Full falls back to Cleaned.
    const printOk = s.content === 'print' && s.format === 'pdf';
    const fullOk = s.content === 'full' && s.format === 'markdown';
    if (s.content !== 'cleaned' && !fullOk && !printOk) s.content = DEFAULT_SETTINGS.content;
    // An explicit empty string means "save straight into Downloads".
    s.destination = s.destination === '' ? '' : sanitiseDestination(s.destination);
    if (!['trimmed', 'full', 'none'].includes(s.sourceUrl)) s.sourceUrl = DEFAULT_SETTINGS.sourceUrl;
    return s;
  }

  // The page address as written into output. Queries and fragments can hold tokens.
  function formatSourceUrl(url, mode) {
    if (mode === 'none') return '';
    if (mode === 'full') return String(url || '');
    return String(url || '').split(/[?#]/)[0];
  }

  // Loopback, link-local, private ranges and intranet-style names. Works on the name
  // only: a public name that resolves to a private address is not detected.
  function isPrivateHost(hostname) {
    const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (h.includes(':')) {
      return h === '::1' || h === '::' || h.startsWith('::ffff:') || /^f[cd]/.test(h) || /^fe[89ab]/.test(h);
    }
    if (!h.includes('.')) return true;
    if (/(^|\.)(localhost|local|internal|intranet|lan|home\.arpa)$/.test(h)) return true;
    const m = h.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
    if (!m) return false;
    const a = Number(m[1]);
    const b = Number(m[2]);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  // A public page may not point the extension at a private-network image.
  // A page already on a private network may use images from that network.
  function isImageUrlAllowed(imageUrl, pageUrl) {
    try {
      const img = new URL(imageUrl);
      if (img.protocol !== 'http:' && img.protocol !== 'https:') return false;
      return !isPrivateHost(img.hostname) || isPrivateHost(new URL(pageUrl).hostname);
    } catch (e) {
      return false;
    }
  }

  // Reads a fetch Response, stopping as soon as it passes maxBytes.
  async function readBodyLimited(response, maxBytes) {
    if (Number(response.headers.get('content-length')) > maxBytes) {
      await response.body?.cancel().catch(() => {});
      throw new Error('image too large');
    }
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error('image too large');
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }

  // Drops URLs from Markdown to reduce noise. Images first (so linked images work),
  // then links. Fenced code blocks are left untouched.
  const IMG_MD = /!\[([^\]]*)\]\(\s*[^)\s]*(?:\s+"[^"]*")?\s*\)/g;
  const LINK_MD = /(?<!!)\[((?:[^\[\]]|\[[^\[\]]*\])*)\]\(\s*[^)\s]*(?:\s+"[^"]*")?\s*\)/g;

  function stripUrls(md, opts) {
    const keepLinks = !opts || opts.includeLinks !== false;
    const keepImages = !opts || opts.includeImages !== false;
    if (keepLinks && keepImages) return String(md || '');
    return String(md || '')
      .split(/(^```[\s\S]*?^```[^\n]*$)/m)
      .map((part, i) => {
        if (i % 2 === 1) return part; // fenced block
        let t = part;
        if (!keepImages) t = t.replace(IMG_MD, (_, alt) => (alt.trim() ? '[Image: ' + alt.trim() + ']' : ''));
        if (!keepLinks) t = t.replace(LINK_MD, (_, text) => text);
        return t;
      })
      .join('');
  }

  // One page as Markdown: H1 title, source URL (if any), body.
  function buildPageMarkdown(page) {
    const title = String(page.title || '').trim() || 'Untitled';
    const source = page.url ? page.url + '\n\n' : '';
    return '# ' + title + '\n\n' + source + String(page.markdown || '').trim() + '\n';
  }

  // Several pages in one Markdown file, separated by a horizontal rule.
  function buildMarkdownFile(pages) {
    return pages.map(buildPageMarkdown).join('\n---\n\n');
  }

  // Combined clipboard text: each page preceded by a source divider.
  function buildClipboardText(pages) {
    return pages
      .map((p) => {
        const title = String(p.title || '').trim() || 'Untitled';
        const source = p.url ? title + ' \u2014 ' + p.url : title;
        return '---\nSource: ' + source + '\n---\n' + String(p.markdown || '').trim() + '\n';
      })
      .join('\n');
  }

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  // result: { pagesSaved, filesSaved, pagesCopied, skipped: [{title, reason}], failures: [string] }
  function buildSummary(result) {
    const parts = [];
    if (result.pagesSaved > 0) {
      parts.push('Saved ' + plural(result.pagesSaved, 'page') + ' (' + plural(result.filesSaved, 'file') + ')');
    }
    if (result.pagesCopied > 0) parts.push('copied ' + plural(result.pagesCopied, 'page') + ' to clipboard');
    let text = parts.length ? parts.join(', ') : 'Nothing was saved';
    text += '.';
    if (result.skipped && result.skipped.length) {
      text += ' ' + result.skipped.length + ' skipped:';
      for (const s of result.skipped.slice(0, 5)) {
        text += '\n- ' + (s.title || s.url || 'tab') + ': ' + s.reason;
      }
    }
    if (result.failures && result.failures.length) {
      text += '\n' + result.failures.slice(0, 3).join('\n');
    }
    return text;
  }

  function bytesToBase64(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function base64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function utf8Bytes(text) {
    return new TextEncoder().encode(text);
  }

  const api = {
    DEFAULT_SETTINGS,
    SkipError,
    decideBehaviour,
    pickTabs,
    isRestrictedUrl,
    sanitiseTitle,
    timestamp,
    uniqueBase,
    sanitiseDestination,
    sanitiseSettings,
    formatSourceUrl,
    isPrivateHost,
    isImageUrlAllowed,
    readBodyLimited,
    stripUrls,
    buildPageMarkdown,
    buildMarkdownFile,
    buildClipboardText,
    buildSummary,
    bytesToBase64,
    base64ToBytes,
    utf8Bytes
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.WW = api;
  }
})(typeof self !== 'undefined' ? self : globalThis);
