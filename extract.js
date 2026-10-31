// Injected into each tab after lib/Readability.js and lib/turndown.js.
// Reads window.__wwOpts = { modes: ['cleaned'] | ['full'] | both }.
// Writes window.__wwResult = { title, url, cleaned, full, error }.
(function () {
  'use strict';
  const opts = window.__wwOpts || { modes: ['cleaned'] };
  const modes = opts.modes || ['cleaned'];
  const out = { title: document.title || '', url: location.href, cleaned: null, full: null, error: null };

  try {
    const td = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-'
    });
    td.remove(['script', 'style', 'noscript', 'template', 'iframe']);

    // Images and links stay as Markdown links; make relative URLs absolute.
    const absolutise = (root) => {
      root.querySelectorAll('a[href]').forEach((a) => {
        try { a.setAttribute('href', new URL(a.getAttribute('href'), location.href).href); } catch (e) { /* keep */ }
      });
      root.querySelectorAll('img[src]').forEach((img) => {
        try { img.setAttribute('src', new URL(img.getAttribute('src'), location.href).href); } catch (e) { /* keep */ }
      });
    };

    if (modes.indexOf('cleaned') !== -1) {
      const article = new Readability(document.cloneNode(true)).parse();
      if (!article || !article.content) {
        throw new Error('Could not find main content on this page');
      }
      const wrap = document.createElement('div');
      wrap.innerHTML = article.content;
      absolutise(wrap);
      out.cleaned = td.turndown(wrap);
    }

    if (modes.indexOf('full') !== -1) {
      const body = document.body ? document.body.cloneNode(true) : document.createElement('div');
      absolutise(body);
      out.full = td.turndown(body);
    }
  } catch (err) {
    out.error = String((err && err.message) || err);
  }

  window.__wwResult = out;
})();
