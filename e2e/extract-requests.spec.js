// Extraction must not make the page load images it had not loaded itself.
const { test, expect } = require('./fixtures');

for (const [name, settings] of [
  ['Clipboard', { clipboard: true, download: false, includeImages: false }],
  ['Markdown file', { clipboard: false, download: true, includeImages: false }]
]) {
  test(`${name} requests no lazy image`, async ({ ext, site }) => {
    site.requests.length = 0;
    await ext.setSettings(settings);
    const p = await ext.open('/lazyuntouched');
    await ext.run(p);
    await p.waitForTimeout(500);
    expect(site.requests.filter((r) => r.includes('never-displayed'))).toEqual([]);
  });
}
