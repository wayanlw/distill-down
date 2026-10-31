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

    // Lazy-loaded pages keep a placeholder in src. The live element knows the real
    // URL (currentSrc covers srcset and <picture>), so record it before cloning.
    const liveImgs = Array.from(document.querySelectorAll('img'));
    liveImgs.forEach((img) => {
      // Lazy attributes first: currentSrc and src may still be a data: placeholder.
      const real =
        img.getAttribute('data-src') ||
        img.getAttribute('data-lazy-src') ||
        img.getAttribute('data-original') ||
        img.currentSrc ||
        img.src;
      if (real) img.setAttribute('data-ww-src', real);
    });

    // Images and links stay as Markdown links; make relative URLs absolute.
    const absolutise = (root) => {
      root.querySelectorAll('a[href]').forEach((a) => {
        try { a.setAttribute('href', new URL(a.getAttribute('href'), location.href).href); } catch (e) { /* keep */ }
      });
      root.querySelectorAll('img').forEach((img) => {
        const raw = img.getAttribute('data-ww-src') || img.getAttribute('src');
        if (!raw) return;
        try { img.setAttribute('src', new URL(raw, location.href).href); } catch (e) { /* keep */ }
      });
    };

    // Output is built in an inert document. An <img> owned by the live page starts
    // loading as soon as it has a src, even if it is never attached.
    const inert = document.implementation.createHTMLDocument('');

    // Each mode runs on its own: one failing must not lose the other's result.
    const failures = [];
    if (modes.indexOf('cleaned') !== -1) {
      try {
        const article = new Readability(document.cloneNode(true)).parse();
        if (!article || !article.content) {
          throw new Error('Could not find main content on this page');
        }
        const wrap = inert.createElement('div');
        wrap.innerHTML = article.content;
        absolutise(wrap);
        out.cleaned = td.turndown(wrap);
        if (!out.cleaned) throw new Error('Could not find main content on this page');
      } catch (err) {
        failures.push(err);
      }
    }

    if (modes.indexOf('full') !== -1) {
      try {
        const body = document.body ? inert.importNode(document.body, true) : inert.createElement('div');
        absolutise(body);
        out.full = td.turndown(body);
      } catch (err) {
        failures.push(err);
      }
    }

    // An error means no requested mode produced a result.
    if (failures.length && failures.length === modes.length) throw failures[0];
  } catch (err) {
    out.error = String((err && err.message) || err);
  }

  document.querySelectorAll('img[data-ww-src]').forEach((img) => img.removeAttribute('data-ww-src'));
  window.__wwResult = out;
})();
