// Options page. Settings live in chrome.storage.local.
const $ = (id) => document.getElementById(id);

function readForm() {
  return {
    clipboard: $('clipboard').checked,
    download: $('download').checked,
    format: $('format').value,
    content: $('content').value,
    destination: $('destination').value,
    includeLinks: $('includeLinks').checked,
    includeImages: $('includeImages').checked,
    fullSourceUrl: $('fullSourceUrl').checked
  };
}

function applyForm(s) {
  $('clipboard').checked = s.clipboard;
  $('download').checked = s.download;
  $('format').value = s.format;
  $('content').value = s.content;
  $('destination').value = s.destination;
  $('includeLinks').checked = s.includeLinks;
  $('includeImages').checked = s.includeImages;
  $('fullSourceUrl').checked = s.fullSourceUrl;
  // Full exists only for Markdown.
  const fullOpt = $('content').querySelector('option[value="full"]');
  fullOpt.disabled = fullOpt.hidden = s.format !== 'markdown';
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
  applyForm(s);
  $('status').textContent = 'Saved';
  setTimeout(() => ($('status').textContent = ''), 1500);
}

// Every change saves at once; the Save button stays as a manual fallback.
for (const el of document.querySelectorAll('input, select')) {
  el.addEventListener('change', save);
}
$('save').addEventListener('click', save);
$('reset').addEventListener('click', async () => {
  applyForm(WW.sanitiseSettings({}));
  await save();
});
load();
