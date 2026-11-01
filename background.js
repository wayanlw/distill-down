// Service worker: toolbar click -> select tabs -> extract -> clipboard / download -> notify.
importScripts('core.js', 'pdf.js');

const WW = self.WW;
const WWPdf = self.WWPdf;
const NOTIFY_ICON = 'icons/icon128.png';
const IMAGE_TIMEOUT_MS = 10000;
const IMAGES_BUDGET_MS = 60000; // per page; no new image fetches start after this
const IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const IMAGE_MAX_PIXELS = 40 * 1000 * 1000;
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000; // long enough for a "save as" dialog

let running = false;

chrome.action.onClicked.addListener((tab) => {
  run(tab).catch((err) => {
    console.error('[ww] unexpected failure', err);
    notify('Failed: ' + String((err && err.message) || err));
  });
});

function notify(message) {
  const id = 'ww-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: NOTIFY_ICON,
    title: 'Distill Down',
    message: String(message)
  });
}

async function loadSettings() {
  return WW.sanitiseSettings(await chrome.storage.local.get(null));
}

async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument();
  if (!has) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD', 'BLOBS'],
      justification: 'Write combined Markdown to the clipboard and create blob URLs for downloads'
    });
  }
}

function offscreenMessage(msg) {
  return ensureOffscreen().then(() => chrome.runtime.sendMessage(Object.assign({ target: 'offscreen' }, msg)));
}

async function copyToClipboard(text) {
  const res = await offscreenMessage({ type: 'copy', text });
  if (!res || !res.ok) throw new Error((res && res.error) || 'clipboard write failed');
}

async function downloadBytes(bytes, mime, filename) {
  const res = await offscreenMessage({
    type: 'blobUrl',
    data: WW.bytesToBase64(bytes),
    mime
  });
  if (!res || !res.ok) throw new Error((res && res.error) || 'could not create file');
  const id = await chrome.downloads.download({
    url: res.url,
    filename,
    saveAs: false,
    conflictAction: 'uniquify'
  });
  await waitForDownload(id);
}

// Resolves when Chrome reports the file finished; rejects if it was interrupted or cancelled.
function waitForDownload(id) {
  return new Promise((resolve, reject) => {
    const settle = (state, error) => {
      if (state === 'complete') {
        cleanup();
        resolve();
      } else if (state === 'interrupted') {
        cleanup();
        reject(new Error('download interrupted' + (error ? ' (' + error + ')' : '')));
      }
    };
    const listener = (delta) => {
      if (delta.id === id && delta.state) settle(delta.state.current, delta.error && delta.error.current);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('download did not finish in time'));
    }, DOWNLOAD_TIMEOUT_MS);
    const cleanup = () => {
      clearTimeout(timer);
      chrome.downloads.onChanged.removeListener(listener);
    };
    chrome.downloads.onChanged.addListener(listener);
    // It may have finished before the listener was added.
    chrome.downloads.search({ id }).then(([item]) => {
      if (item) settle(item.state, item.error);
    }, () => {});
  });
}

// Rejects if the promise takes longer than ms.
function withTimeout(promise, ms, message) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

// Decodes run one at a time. createImageBitmap cannot be cancelled, so a decode that
// times out has its offscreen document closed before the next one starts.
let encodeChain = Promise.resolve();

function encodeImage(bytes, mime) {
  const job = encodeChain.then(async () => {
    try {
      return await withTimeout(
        offscreenMessage({ type: 'encodeImage', data: WW.bytesToBase64(bytes), mime }),
        IMAGE_TIMEOUT_MS,
        'image decode timed out'
      );
    } catch (err) {
      await chrome.offscreen.closeDocument().catch(() => {});
      throw err;
    }
  });
  encodeChain = job.catch(() => {});
  return job;
}

// Fetch each image (host permission allows cross-origin), encode as JPEG in the
// offscreen document. Failures are left out of the map and fall back to text in pdf.js.
// Image URLs are chosen by the page, so time, size and destination are all limited.
async function resolveImages(urls, pageUrl) {
  const map = new Map();
  const deadline = Date.now() + IMAGES_BUDGET_MS;
  for (let i = 0; i < urls.length && Date.now() < deadline; i += 4) {
    await Promise.all(
      urls.slice(i, i + 4).map(async (u) => {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), IMAGE_TIMEOUT_MS);
        try {
          if (!WW.isImageUrlAllowed(u, pageUrl)) throw new Error('private-network image from a public page');
          // Redirects are refused: a followed redirect would reach its destination before it could be checked.
          const r = await fetch(u, { signal: ctl.signal, credentials: 'omit', redirect: 'error' });
          const type = r.headers.get('content-type') || '';
          // Some CDNs serve images as octet-stream; the decoder decides.
          if (!r.ok || !(type.startsWith('image/') || type.startsWith('application/octet-stream'))) {
            ctl.abort();
            return;
          }
          // The timer keeps running here, so a body that never ends is cut off too.
          const buf = await WW.readBodyLimited(r, IMAGE_MAX_BYTES);
          clearTimeout(timer);
          if (!WW.imageWithinPixelLimit(buf, IMAGE_MAX_PIXELS)) throw new Error('image too large or format not readable');
          const res = await encodeImage(buf, type);
          if (res && res.ok) {
            map.set(u, { jpeg: WW.base64ToBytes(res.data), width: res.width, height: res.height });
          }
        } catch (err) {
          clearTimeout(timer);
          console.warn('[ww] image fallback to text', u, err && err.message);
        }
      })
    );
  }
  return map;
}

// Injects extraction into one tab and returns { title, url, cleaned, full, selection }.
async function extractTab(tab, modes, useSelection) {
  if (WW.isRestrictedUrl(tab.url)) throw new WW.SkipError('restricted page (cannot read content)');
  const target = { tabId: tab.id };
  try {
    await chrome.scripting.executeScript({ target, func: (o) => { window.__wwOpts = o; }, args: [{ modes, useSelection }] });
    await chrome.scripting.executeScript({
      target,
      files: ['lib/Readability.js', 'lib/turndown.js', 'extract.js']
    });
    const [frame] = await chrome.scripting.executeScript({
      target,
      func: () => {
        const r = window.__wwResult;
        window.__wwResult = undefined;
        return r;
      }
    });
    const res = frame && frame.result;
    if (!res) throw new Error('no result from page');
    if (res.error) throw new WW.SkipError(res.error);
    return res;
  } catch (err) {
    if (err instanceof WW.SkipError) throw err;
    throw new WW.SkipError('page not accessible: ' + String((err && err.message) || err));
  }
}

async function run(activeTab) {
  if (running) {
    notify('Already processing, please wait');
    return;
  }
  running = true;
  try {
    const settings = await loadSettings();
    const behaviour = WW.decideBehaviour(settings.clipboard, settings.download);
    if (behaviour.nothing) {
      notify('Nothing is enabled. Turn on clipboard or download in settings.');
      return;
    }

    const highlighted = await chrome.tabs.query({ highlighted: true, currentWindow: true });
    const tabs = WW.pickTabs(highlighted, activeTab);

    const modes = [];
    if (behaviour.clipboard) modes.push('cleaned');
    if (behaviour.download && !modes.includes(settings.content)) modes.push(settings.content);

    const skipped = [];
    const failures = [];
    const extracted = [];
    let selectionFound = false;
    for (const tab of tabs) {
      try {
        // Only the active tab: other highlighted tabs are always captured whole.
        const res = await extractTab(tab, modes, !!activeTab && tab.id === activeTab.id);
        selectionFound = selectionFound || res.selection;
        extracted.push({
          title: res.selection ? (res.title || 'Untitled') + ' (selection)' : res.title,
          url: res.url,
          cleaned: res.cleaned,
          content: settings.content === 'full' ? res.full : res.cleaned
        });
      } catch (err) {
        const reason = err instanceof WW.SkipError ? err.message : String(err && err.message);
        console.error('[ww] skipped', tab.url, reason);
        skipped.push({ title: tab.title || tab.url, url: tab.url, reason });
      }
    }

    if (extracted.length === 0) {
      notify(buildFailText(skipped));
      return;
    }

    let pagesCopied = 0;
    let pagesSaved = 0;
    let filesSaved = 0;

    // Clipboard: always Cleaned, always combined Markdown.
    if (behaviour.clipboard) {
      try {
        const clipPages = extracted.filter((p) => p.cleaned);
        // No Cleaned text: leave whatever the user has on the clipboard alone.
        if (clipPages.length === 0) {
          failures.push('Clipboard not changed: no main content found.');
        } else {
          await copyToClipboard(
            WW.buildClipboardText(clipPages.map((p) => ({
              title: p.title,
              url: WW.formatSourceUrl(p.url, settings.fullSourceUrl),
              markdown: WW.stripUrls(p.cleaned, settings)
            })))
          );
          pagesCopied = clipPages.length;
          if (clipPages.length < extracted.length) {
            const missing = extracted.length - clipPages.length;
            failures.push('Clipboard left out ' + missing + ' of ' + extracted.length + ' pages: no main content found.');
          }
        }
      } catch (err) {
        console.error('[ww] clipboard failed', err);
        failures.push('Clipboard failed: ' + err.message);
      }
    }

    // Download: independent of clipboard result.
    if (behaviour.download) {
      const stamp = WW.timestamp(new Date());
      const taken = new Set();
      const dest = settings.destination ? settings.destination + '/' : '';
      const pages = extracted.filter((p) => p.content);
      if (pages.length < extracted.length) {
        for (const p of extracted.filter((x) => !x.content)) {
          skipped.push({ title: p.title, url: p.url, reason: 'no content extracted for ' + settings.content + ' mode' });
        }
      }

      if (settings.format === 'markdown') {
        if (pages.length > 0) {
          try {
            const base =
              pages.length === 1
                ? stamp + '_' + WW.sanitiseTitle(pages[0].title)
                : stamp + '_' + pages.length + '-pages';
            const name = WW.uniqueBase(base, taken) + '.md';
            const text = WW.buildMarkdownFile(pages.map((p) => ({
              title: p.title,
              url: WW.formatSourceUrl(p.url, settings.fullSourceUrl),
              markdown: WW.stripUrls(p.content, settings)
            })));
            await downloadBytes(WW.utf8Bytes(text), 'text/markdown', dest + name);
            pagesSaved += pages.length;
            filesSaved += 1;
          } catch (err) {
            console.error('[ww] markdown download failed', err);
            failures.push('Download failed: ' + err.message);
          }
        }
      } else {
        for (const p of pages) {
          try {
            const name = WW.uniqueBase(stamp + '_' + WW.sanitiseTitle(p.title), taken) + '.pdf';
            // Images off: they become "[Image: alt]" text, so none are fetched or embedded.
            const md = WW.stripUrls(p.content, settings);
            const images = settings.includeImages ? await resolveImages(WWPdf.collectImageUrls(md), p.url) : new Map();
            const bytes = await WWPdf.buildPdf(p.title, WW.formatSourceUrl(p.url, settings.fullSourceUrl), md, images);
            await downloadBytes(bytes, 'application/pdf', dest + name);
            pagesSaved += 1;
            filesSaved += 1;
          } catch (err) {
            console.error('[ww] pdf failed', p.url, err);
            skipped.push({ title: p.title, url: p.url, reason: 'PDF failed: ' + err.message });
          }
        }
      }
    }

    const notes = [];
    if (selectionFound) notes.push('Selection only from the active tab.');

    notify(
      WW.buildSummary({
        pagesSaved,
        filesSaved,
        pagesCopied,
        notes,
        skipped,
        failures
      })
    );
  } finally {
    running = false;
  }
}

function buildFailText(skipped) {
  const first = skipped[0];
  if (!first) return 'Nothing could be processed.';
  return 'Nothing could be processed. ' + first.reason + (skipped.length > 1 ? ' (' + skipped.length + ' tabs failed)' : '');
}
