// Smoke test: load the unpacked extension, run one save on a local page,
// and check the Cleaned Markdown reached the clipboard.
// Requires the temporary background.js harness (see temp-test.md).
const http = require('http');
const path = require('path');
const { test, expect, chromium } = require('@playwright/test');

const EXTENSION_DIR = path.resolve(__dirname, '..');
const MARKER = 'WW smoke marker sentence for the clipboard check.';

const PAGE_HTML = `<!doctype html>
<html><head><title>WW Smoke Test</title></head>
<body><article><h1>WW Smoke Test</h1><p>${MARKER}</p>
${'<p>Filler paragraph so the article is long enough for Readability to treat it as the main content of the page, with commas, clauses, and several sentences.</p>'.repeat(8)}
</article></body></html>`;

let server;
let baseUrl;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE_HTML);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/article.html`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('saves the page to the clipboard', async () => {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`
    ]
  });

  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    const extensionId = worker.url().split('/')[2];

    // Clipboard only, so the test does not write files to Downloads.
    await worker.evaluate(() => chrome.storage.sync.set({ clipboard: true, download: false }));

    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl.replace(/\/article.*$/, '') });

    const page = await context.newPage();
    await page.goto(baseUrl);
    await page.bringToFront();

    // Extension page can call chrome.runtime; a normal web page cannot.
    const controller = await context.newPage();
    await controller.goto(`chrome-extension://${extensionId}/options.html`);
    // Focus the article tab so the offscreen clipboard write has a focused document to copy from.
    await page.bringToFront();
    const reply = await controller.evaluate(
      (url) => chrome.runtime.sendMessage({ type: 'ww-test-run', url }),
      baseUrl
    );
    expect(reply.ok, reply.error || reply.notification).toBe(true);
    console.log('notification:', reply.notification);

    await page.bringToFront();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 15000 })
      .toContain(MARKER);
  } finally {
    await context.close();
  }
});
