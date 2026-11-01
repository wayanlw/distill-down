<p align="center">
  <img src="brand/banner.svg" alt="Distill Down. Tabs in, clean text out." width="100%">
</p>

<p align="center">
  A Chrome extension that boils web pages down to clean Markdown for your AI tools.<br>
  Converted in your browser. No account, no analytics, no AI service calls.
</p>

<p align="center">
  <a href="LICENSE">MIT licensed</a> ·
  <a href="PRIVACY.md">Privacy</a> ·
  Manifest V3
</p>

---

## What it does

Highlight some tabs, click the toolbar icon, and Distill Down strips each page to its main content: no menus, footers or clutter. The result is combined Markdown on your clipboard, saved as Markdown or PDF files, or both. Paste it into any AI tool.

| | |
|---|---|
| **Clean by default** | Only the article or main content, so the AI reads what matters and your token budget is not spent on navigation. |
| **One click, many tabs** | Select several tabs and they become one combined document. |
| **Just the part you need** | Select at least 8 words in the active tab and only that selection is captured. The output title gains "(selection)". |
| **Your choice of output** | Clipboard, Markdown file, or Cleaned PDF with pictures. |
| **Links and images are optional** | Leave them out for tight text, or keep link and image addresses when sources matter. |
| **Source address is safe by default** | Query strings and fragments are removed, since they can hold tokens. One toggle brings the full address back. |

## Private by design

Pages are converted in your browser. Distill Down reads only the tabs you highlight, only when you click, and sends nothing to the developer or to any AI service. The one network use is optional: a Cleaned PDF with images downloads those images from the sites that host them, without cookies. See [PRIVACY.md](PRIVACY.md).

## Install

Distill Down is not on the Chrome Web Store yet. To run it from source:

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Choose **Load unpacked** and select the repository folder.
4. Pin the extension, highlight some tabs, and click its icon.

If Chrome shows a save dialog for each file, turn off "Ask where to save each file before downloading" in the browser's download settings.

## Settings

Open the extension's options page to turn clipboard and download on or off, choose Markdown or PDF, pick a folder inside Downloads, and set the link, image and source address options. Changes save immediately. **Restore defaults** resets everything.

Defaults: clipboard on, download off, Markdown, Cleaned, no link or image URLs, source address without query or fragment.

## Good to know

- **Cleaned is not a security filter.** A page can carry instructions aimed at an AI, including text hidden from view. Treat pasted web content as untrusted.
- **Cleaned PDF** prints characters outside Western European text as "?". Use Markdown for other scripts or mathematical notation. SVG images are not included in Cleaned PDFs.
- **Dynamic pages** are captured as they appear when you click.

## Develop

```
npm install
npm test        # unit tests
npm run e2e     # Playwright; opens a visible Chromium window and overwrites the system clipboard
npm run icons   # renders icons/ from brand/logo.svg and brand/logo-small.svg
```

The code is plain JavaScript with no build step. Project layout:

| Path | Purpose |
|---|---|
| `manifest.json`, `background.js` | Extension entry point and the toolbar click flow |
| `extract.js`, `core.js` | Page extraction, cleaning and Markdown conversion |
| `pdf.js`, `offscreen.js` | Text PDF and image handling |
| `options.html`, `options.js` | Settings page |
| `lib/` | Bundled [Readability](https://github.com/mozilla/readability) and [Turndown](https://github.com/mixmark-io/turndown) |
| `brand/`, `icons/`, `store/` | Logo sources, generated icons, Web Store copy |
| `tests/`, `e2e/` | Unit tests (`node:test`) and Playwright end-to-end tests |

## License

[MIT](LICENSE). Bundled libraries and their licenses are listed in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
