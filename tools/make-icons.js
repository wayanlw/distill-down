// Renders the brand logo (brand/*.svg) to the extension icons with headless Chromium.
// Run: npm run icons   (needs the Playwright Chromium that `npm run e2e` already uses)
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const root = path.join(__dirname, '..');
// 16 px uses the bolder two-bar mark; the fine detail of the full mark blurs at that size.
const jobs = [
  { size: 16, svg: 'logo-small.svg' },
  { size: 48, svg: 'logo.svg' },
  { size: 128, svg: 'logo.svg' }
];

(async () => {
  const browser = await chromium.launch();
  const dir = path.join(root, 'icons');
  fs.mkdirSync(dir, { recursive: true });
  for (const { size, svg } of jobs) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const b64 = fs.readFileSync(path.join(root, 'brand', svg)).toString('base64');
    await page.setContent(
      `<body style="margin:0;background:transparent"><img width="${size}" height="${size}" src="data:image/svg+xml;base64,${b64}"></body>`
    );
    await page.waitForFunction(() => document.images[0].complete);
    await page.screenshot({ path: path.join(dir, `icon${size}.png`), omitBackground: true });
    await page.close();
  }
  await browser.close();
  console.log('icons written to', dir);
})();
