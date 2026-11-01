// Runs the real extract.js with the bundled Readability and Turndown inside jsdom,
// against saved HTML fixtures. Verifies Cleaned removes nav/ads, Full keeps everything,
// and images/links are absolute Markdown.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function runExtract(html, url, modes) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.__wwOpts = { modes };
  w.eval(read('lib/Readability.js'));
  w.eval(read('lib/turndown.js'));
  w.eval(read('extract.js'));
  return w.__wwResult;
}

function runWithSelection(html, select, modes = ['cleaned']) {
  const dom = new JSDOM(html, { url: 'https://site.test/post/1', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  select(w);
  w.__wwOpts = { modes, useSelection: true };
  w.eval(read('lib/Readability.js'));
  w.eval(read('lib/turndown.js'));
  w.eval(read('extract.js'));
  return w.__wwResult;
}

const selectAll = (selector) => (w) => w.getSelection().selectAllChildren(w.document.querySelector(selector));

const selectionPage = `<!doctype html><html><head><title>Article One</title></head><body><article>
  <p id="long">Eight words are exactly enough to count here <a href="/related">with a link</a> and <strong>bold</strong> text.</p>
  <p id="eight">One two three four five six seven eight</p>
  <p id="seven">One two three four five six seven</p>
  <pre id="code"><code>const first = 1; const second = 2; const third = 3; const fourth = 4;</code></pre>
  <p id="rest">OTHER-PARAGRAPH-TEXT</p>
  <p id="script">One two three<script>four five six seven eight nine</script></p>
</article></body></html>`;

test('selection: converted to Markdown instead of the page', () => {
  const r = runWithSelection(selectionPage, selectAll('#long'));
  assert.equal(r.selection, true);
  assert.match(r.cleaned, /\[with a link\]\(https:\/\/site\.test\/related\)/);
  assert.match(r.cleaned, /\*\*bold\*\*/);
  assert.doesNotMatch(r.cleaned, /OTHER-PARAGRAPH-TEXT/);
});

test('selection: applies to Full as well', () => {
  const r = runWithSelection(selectionPage, selectAll('#long'), ['full']);
  assert.equal(r.selection, true);
  assert.doesNotMatch(r.full, /OTHER-PARAGRAPH-TEXT/);
});

test('selection: eight words count, seven capture the whole page', () => {
  assert.equal(runWithSelection(selectionPage, selectAll('#eight')).selection, true);
  assert.equal(runWithSelection(selectionPage, selectAll('#seven')).selection, false);
});

test('selection: script text does not count towards the words', () => {
  assert.equal(runWithSelection(selectionPage, selectAll('#script')).selection, false);
});

test('selection: inside a code block stays a code block', () => {
  const r = runWithSelection(selectionPage, selectAll('#code code'));
  assert.match(r.cleaned, /^```/);
});

test('selection: ignored unless requested', () => {
  const dom = new JSDOM(fixture, { url: 'https://site.test/post/1', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  selectAll('article p')(w);
  w.__wwOpts = { modes: ['cleaned'] };
  w.eval(read('lib/Readability.js'));
  w.eval(read('lib/turndown.js'));
  w.eval(read('extract.js'));
  assert.equal(w.__wwResult.selection, false);
  assert.match(w.__wwResult.cleaned, /Main Heading/);
});

const fixture = `<!doctype html><html><head><title>Article One</title></head><body>
<nav class="site-nav"><a href="/home">HOME-NAV-LINK</a></nav>
<aside class="ads">BUY-NOW-AD</aside>
<article>
  <h1>Main Heading</h1>
  <p>This is the main article paragraph with enough words to be considered content by the readability algorithm. It keeps going so that the scoring picks it up as the primary block of text on the page, with commas, clauses, and more sentences to make it substantial.</p>
  <p>Second paragraph of the article, also long enough, containing a <a href="/related">relative link</a> and an image <img src="img/pic.png" alt="a picture">.</p>
  <p>Third paragraph adds more prose so the article body clearly dominates the page layout for scoring purposes and nothing else competes with it.</p>
</article>
<footer>FOOTER-TEXT</footer>
</body></html>`;

test('cleaned mode: main content in Markdown, nav/ads removed, links absolute', () => {
  const r = runExtract(fixture, 'https://site.test/post/1', ['cleaned']);
  assert.equal(r.error, null);
  assert.equal(r.title, 'Article One');
  assert.match(r.cleaned, /Main Heading/);
  assert.match(r.cleaned, /\]\(https:\/\/site\.test\/related\)/);
  assert.match(r.cleaned, /!\[a picture\]\(https:\/\/site\.test\/post\/img\/pic\.png\)/);
  assert.doesNotMatch(r.cleaned, /HOME-NAV-LINK/);
  assert.doesNotMatch(r.cleaned, /BUY-NOW-AD/);
  assert.equal(r.full, null);
});

test('full mode: entire body kept, nav and footer included', () => {
  const r = runExtract(fixture, 'https://site.test/post/1', ['full']);
  assert.equal(r.error, null);
  assert.match(r.full, /HOME-NAV-LINK/);
  assert.match(r.full, /FOOTER-TEXT/);
  assert.match(r.full, /Main Heading/);
  assert.equal(r.cleaned, null);
});

test('both modes returned in one pass', () => {
  const r = runExtract(fixture, 'https://site.test/post/1', ['cleaned', 'full']);
  assert.match(r.cleaned, /Main Heading/);
  assert.match(r.full, /FOOTER-TEXT/);
});

test('cleaned failing does not lose full: partial result, no error', () => {
  const html = '<html><head><title>Empty</title></head><body><p>SHORT-TEXT</p></body></html>';
  const dom = new JSDOM(html, { url: 'https://e.test/', runScripts: 'outside-only' });
  const w = dom.window;
  w.__wwOpts = { modes: ['cleaned', 'full'] };
  w.eval(read('lib/turndown.js'));
  // Readability finding nothing is simulated so this test does not depend on its scoring.
  w.eval('window.Readability = function () { this.parse = () => null; };');
  w.eval(read('extract.js'));
  const r = w.__wwResult;
  assert.equal(r.error, null);
  assert.equal(r.cleaned, null);
  assert.match(r.full, /SHORT-TEXT/);
});

test('page with no article content reports an error instead of throwing', () => {
  const r = runExtract('<html><head><title>Empty</title></head><body></body></html>', 'https://e.test/', ['cleaned']);
  assert.ok(r.error, 'expected an error message');
});
