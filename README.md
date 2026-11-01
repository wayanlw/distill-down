# Distill Down

<img src="icons/icon128.png" alt="Distill Down logo" width="96" align="right">

**Tabs in, clean text out.**

Highlight some tabs, click the toolbar icon, and Distill Down strips each page to its main content. The result is combined Markdown on your clipboard, saved as Markdown or PDF files, or both. Paste it into any AI tool.

- **Clean by default.** Navigation, footers and clutter are removed, so the AI reads the article rather than the page chrome.
- **One click, many tabs.** Select several tabs and they become one combined document.
- **Just the part you need.** Select at least 8 words in the active tab and only that selection is captured.
- **Private.** Pages are converted in your browser. Distill Down makes no network calls to any AI service. The one exception to "no network" is a PDF with images, which downloads those images from their hosts. See [PRIVACY.md](PRIVACY.md).
- **Your choice of output.** Clipboard, Markdown file, cleaned PDF, or a full page-print PDF. Links and image URLs are optional.

Defaults: clipboard on, download off, Markdown, Cleaned, no link or image URLs, source address without query or fragment. Change them in the extension's options page; "Restore defaults" resets them.

Limits: Cleaned PDF prints characters outside Western European text as "?"; use Page print for those pages. "Cleaned" removes clutter but is not a security filter: a page can carry instructions aimed at an AI, including text hidden from view, so treat pasted web content as untrusted.

## Run

1. Open `chrome://extensions`, turn on Developer mode, choose "Load unpacked" and select this folder.
2. Reload the extension after changing code.
3. If Chrome shows a save dialog for each file, turn off "Ask where to save each file before downloading" in the browser's download settings.

## Brand and store assets

- `brand/`: logo sources and the brand guide (`BRAND.md`).
- `store/`: Chrome Web Store listing copy.
- `npm run icons` renders `icons/` from `brand/logo.svg` and `brand/logo-small.svg`.

## Test

```
npm test        # unit tests
npm run e2e     # Playwright; opens a visible Chromium window and overwrites the system clipboard
```

Requirements and decisions: `SPEC.md` and `.handoff/DECISIONS.md`.
