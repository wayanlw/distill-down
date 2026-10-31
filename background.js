// Service worker: toolbar click -> select tabs -> extract -> clipboard / download -> notify.
importScripts('core.js', 'pdf.js');

const WW = self.WW;
const WWPdf = self.WWPdf;
const NOTIFY_ICON = 'icons/icon128.png';

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
    title: 'ww-chrome-ai-addon',
    message: String(message)
  });
}

async function loadSettings() {
  try {
    const got = await chrome.storage.sync.get(null);
    return WW.sanitiseSettings(got);
  } catch (e) {
    const got = await chrome.storage.local.get(null);
    return WW.sanitiseSettings(got);
  }
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
  await chrome.downloads.download({
    url: res.url,
    filename,
    saveAs: false,
    conflictAction: 'uniquify'
  });
}

// Fetch each image (host permission allows cross-origin), encode as JPEG in the
// offscreen document. Failures are left out of the map and fall back to text in pdf.js.
async function resolveImages(urls) {
  const map = new Map();
  for (let i = 0; i < urls.length; i += 4) {
    await Promise.all(
      urls.slice(i, i + 4).map(async (u) => {
        try {
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), 10000);
          const r = await fetch(u, { signal: ctl.signal, credentials: 'omit' });
          clearTimeout(timer);
          const type = r.headers.get('content-type') || '';
          // Some CDNs serve images as octet-stream; the decoder decides.
          if (!r.ok || !(type.startsWith('image/') || type.startsWith('application/octet-stream'))) return;
          const buf = new Uint8Array(await r.arrayBuffer());
          const res = await offscreenMessage({ type: 'encodeImage', data: WW.bytesToBase64(buf), mime: type });
          if (res && res.ok) {
            map.set(u, { jpeg: WW.base64ToBytes(res.data), width: res.width, height: res.height });
          }
        } catch (err) {
          console.warn('[ww] image fallback to text', u, err && err.message);
        }
      })
    );
  }
  return map;
}

// Injects extraction into one tab and returns { title, url, cleaned, full }.
async function extractTab(tab, modes) {
  if (WW.isRestrictedUrl(tab.url)) throw new WW.SkipError('restricted page (cannot read content)');
  const target = { tabId: tab.id };
  try {
    await chrome.scripting.executeScript({ target, func: (o) => { window.__wwOpts = o; }, args: [{ modes }] });
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

// Browser print-to-PDF of the live page via the DevTools protocol.
// Chrome shows a "debugging this browser" banner while attached.
async function printTabToPdf(tab) {
  if (WW.isRestrictedUrl(tab.url)) throw new WW.SkipError('restricted page (cannot print)');
  const target = { tabId: tab.id };
  try {
    await chrome.debugger.attach(target, '1.3');
  } catch (err) {
    throw new WW.SkipError('cannot print this page: ' + String((err && err.message) || err));
  }
  try {
    const res = await chrome.debugger.sendCommand(target, 'Page.printToPDF', { printBackground: true });
    return WW.base64ToBytes(res.data);
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
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

    // Page print needs no extraction; it prints the live page.
    const printMode = behaviour.download && settings.format === 'pdf' && settings.content === 'print';
    const needExtract = behaviour.clipboard || (behaviour.download && !printMode);

    const modes = [];
    if (behaviour.clipboard) modes.push('cleaned');
    if (behaviour.download && !printMode && !modes.includes(settings.content)) modes.push(settings.content);

    const skipped = [];
    const failures = [];
    const extracted = [];
    for (const tab of needExtract ? tabs : []) {
      try {
        const res = await extractTab(tab, modes);
        extracted.push({
          title: res.title,
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

    if (needExtract && extracted.length === 0 && !printMode) {
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
        await copyToClipboard(
          WW.buildClipboardText(clipPages.map((p) => ({ title: p.title, url: p.url, markdown: WW.stripUrls(p.cleaned, settings) })))
        );
        pagesCopied = clipPages.length;
      } catch (err) {
        console.error('[ww] clipboard failed', err);
        failures.push('Clipboard failed: ' + err.message);
      }
    }

    // Page print: one PDF per tab, independent of extraction.
    if (printMode) {
      const stamp = WW.timestamp(new Date());
      const taken = new Set();
      const dest = settings.destination ? settings.destination + '/' : '';
      for (const tab of tabs) {
        try {
          const bytes = await printTabToPdf(tab);
          const name = WW.uniqueBase(stamp + '_' + WW.sanitiseTitle(tab.title || tab.url), taken) + '.pdf';
          await downloadBytes(bytes, 'application/pdf', dest + name);
          pagesSaved += 1;
          filesSaved += 1;
        } catch (err) {
          const reason = err instanceof WW.SkipError ? err.message : 'print failed: ' + String(err && err.message);
          console.error('[ww] print failed', tab.url, reason);
          skipped.push({ title: tab.title || tab.url, url: tab.url, reason });
        }
      }
    }

    // Download: independent of clipboard result.
    if (behaviour.download && !printMode) {
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
            const text = WW.buildMarkdownFile(pages.map((p) => ({ title: p.title, url: p.url, markdown: WW.stripUrls(p.content, settings) })));
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
            const images = await resolveImages(WWPdf.collectImageUrls(p.content));
            const bytes = await WWPdf.buildPdf(p.title, p.url, p.content, images);
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

    notify(
      WW.buildSummary({
        pagesSaved,
        filesSaved,
        pagesCopied,
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
