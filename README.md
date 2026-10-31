# ww-chrome-ai-addon

A Chrome extension (Manifest V3). One toolbar click saves the highlighted tabs as Markdown or PDF and/or copies them to the clipboard as combined Markdown, for use with AI tools. It makes no network calls to any AI service.

Defaults: clipboard on, download off, Markdown, Cleaned, no link or image URLs. Change them in the extension's options page; "Restore defaults" resets them.

## Run

1. Open `chrome://extensions`, turn on Developer mode, choose "Load unpacked" and select this folder.
2. Reload the extension after changing code.
3. If Chrome shows a save dialog for each file, turn off "Ask where to save each file before downloading" in the browser's download settings.

## Test

```
npm test        # unit tests
npm run e2e     # Playwright; opens a visible Chromium window and overwrites the system clipboard
```

Requirements and decisions: `SPEC.md` and `.handoff/DECISIONS.md`.
