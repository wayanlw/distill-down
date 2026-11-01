// Options page. Settings live in chrome.storage.local.
const $ = (id) => document.getElementById(id);

function readForm() {
  return {
    clipboard: $('clipboard').checked,
    download: $('download').checked,
    content: $('content').value,
    destination: $('destination').value,
    includeLinks: $('includeLinks').checked,
    includeImages: $('includeImages').checked,
    fullSourceUrl: $('fullSourceUrl').checked,
    wrapClipboard: $('wrapClipboard').checked,
    wrapTag: tagFromField()
  };
}

// The last tag name that was saved. An invalid entry is never saved; this one stays in use.
let savedTag = 'input';

function tagFromField() {
  const v = $('wrapTag').value.trim();
  if (v === '') return 'input';
  return WW.isValidTagName(v) ? v : savedTag;
}

function showTagHint() {
  const v = $('wrapTag').value.trim();
  const bad = v !== '' && !WW.isValidTagName(v);
  $('wrapTagHint').textContent = bad
    ? 'Not saved. Use letters, digits, - or _, starting with a letter or _ (up to 40). Still using <' + savedTag + '>.'
    : 'The clipboard text is wrapped as <' + tagFromField() + '> ... </' + tagFromField() + '>. Empty uses "input".';
  $('wrapTagHint').classList.toggle('error', bad);
  $('wrapTag').setAttribute('aria-invalid', String(bad));
}

// setTag is false while the user is typing, so a half-typed or invalid name is not overwritten.
function applyForm(s, setTag = true) {
  $('clipboard').checked = s.clipboard;
  $('download').checked = s.download;
  $('content').value = s.content;
  $('destination').value = s.destination;
  $('includeLinks').checked = s.includeLinks;
  $('includeImages').checked = s.includeImages;
  $('fullSourceUrl').checked = s.fullSourceUrl;
  $('wrapClipboard').checked = s.wrapClipboard;
  savedTag = s.wrapTag;
  if (setTag) $('wrapTag').value = s.wrapTag;
  const wrapSub = $('wrapSub');
  wrapSub.classList.toggle('off', !s.wrapClipboard);
  $('wrapTag').disabled = !s.wrapClipboard;
  showTagHint();
  const sub = $('downloadSub');
  sub.classList.toggle('off', !s.download);
  for (const el of sub.querySelectorAll('select, input')) el.disabled = !s.download;
}

async function load() {
  applyForm(WW.sanitiseSettings(await chrome.storage.local.get(null)));
}

async function save() {
  const s = WW.sanitiseSettings(readForm());
  try {
    await chrome.storage.local.set(s);
  } catch (e) {
    $('status').textContent = 'Could not save settings';
    return;
  }
  applyForm(s, false);
  $('status').textContent = 'Saved';
  setTimeout(() => ($('status').textContent = ''), 1500);
}

// Every change saves at once; the Save button stays as a manual fallback.
for (const el of document.querySelectorAll('input, select')) {
  el.addEventListener('change', save);
}
$('wrapTag').addEventListener('input', showTagHint);
$('save').addEventListener('click', save);
$('reset').addEventListener('click', async () => {
  applyForm(WW.sanitiseSettings({}));
  await save();
});
load();
