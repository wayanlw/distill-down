// Injected into each tab after lib/Readability.js and lib/turndown.js.
// Reads window.__wwOpts = { useSelection }.
// Writes window.__wwResult = { title, url, cleaned, selection, error }.
(function () {
  'use strict';
  const MIN_SELECTION_WORDS = 8;
  const opts = window.__wwOpts || {};
  const out = { title: document.title || '', url: location.href, cleaned: null, selection: false, error: null };

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

    const pathTo = (node) => {
      const path = [];
      for (let n = node; n !== document; n = n.parentNode) {
        if (!n.parentNode) return null; // inside a shadow root
        path.unshift(Array.prototype.indexOf.call(n.parentNode.childNodes, n));
      }
      return path;
    };
    const follow = (root, path) => path.reduce((n, i) => n.childNodes[i], root);
    const countWords = (text) => {
      const words = new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text);
      return Array.from(words).filter((w) => w.isWordLike).length;
    };

    // The selection as Markdown, or null to capture the whole page. The range is rebuilt
    // on a cloned document because cloning it on the live page would load its images.
    // Text selected inside a form field has no range contents, so it counts as no selection.
    const readSelection = () => {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
      const live = sel.getRangeAt(0);
      const start = pathTo(live.startContainer);
      const end = pathTo(live.endContainer);
      if (!start || !end) return null;
      const copy = document.cloneNode(true);
      const range = copy.createRange();
      range.setStart(follow(copy, start), live.startOffset);
      range.setEnd(follow(copy, end), live.endOffset);

      const wrap = inert.createElement('div');
      const contents = inert.importNode(range.cloneContents(), true);
      const common = range.commonAncestorContainer;
      const parent = common.nodeType === 1 ? common : common.parentElement;
      if (parent && parent.closest('pre')) {
        // A selection inside a code block loses the block; put it back.
        const pre = inert.createElement('pre');
        const code = inert.createElement('code');
        code.appendChild(contents);
        pre.appendChild(code);
        wrap.appendChild(pre);
      } else {
        wrap.appendChild(contents);
      }
      wrap.querySelectorAll('script, style, noscript, template').forEach((n) => n.remove());
      if (countWords(wrap.textContent) < MIN_SELECTION_WORDS) return null;
      absolutise(wrap);
      return td.turndown(wrap) || null;
    };

    let selected = null;
    if (opts.useSelection) {
      // A selection that cannot be read must not lose the page.
      try { selected = readSelection(); } catch (e) { selected = null; }
    }
    if (selected) {
      out.selection = true;
      out.cleaned = selected;
    }

    if (!selected) {
      const article = new Readability(document.cloneNode(true)).parse();
      if (!article || !article.content) throw new Error('Could not find main content on this page');
      const wrap = inert.createElement('div');
      wrap.innerHTML = article.content;
      absolutise(wrap);
      out.cleaned = td.turndown(wrap);
      if (!out.cleaned) throw new Error('Could not find main content on this page');
    }
  } catch (err) {
    out.error = String((err && err.message) || err);
  }

  document.querySelectorAll('img[data-ww-src]').forEach((img) => img.removeAttribute('data-ww-src'));
  window.__wwResult = out;
})();
