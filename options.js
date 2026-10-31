// Options page. Settings live in chrome.storage.sync, falling back to local.
const $ = (id) => document.getElementById(id);

function readForm() {
  return {
    clipboard: $('clipboard').checked,
    download: $('download').checked,
    format: $('format').value,
    content: $('content').value,
    destination: $('destination').value,
    includeLinks: $('includeLinks').checked,
    includeImages: $('includeImages').checked
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
  // Page print exists only for PDF; Full only for Markdown.
  const printOpt = $('content').querySelector('option[value="print"]');
  printOpt.disabled = printOpt.hidden = s.format !== 'pdf';
  const fullOpt = $('content').querySelector('option[value="full"]');
  fullOpt.disabled = fullOpt.hidden = s.format !== 'markdown';
  const sub = $('downloadSub');
  sub.classList.toggle('off', !s.download);
  for (const el of sub.querySelectorAll('select, input')) el.disabled = !s.download;
}

async function load() {
  let raw = {};
  try {
    raw = await chrome.storage.sync.get(null);
  } catch (e) {
    raw = await chrome.storage.local.get(null);
  }
  applyForm(WW.sanitiseSettings(raw));
}

async function save() {
  const s = WW.sanitiseSettings(readForm());
  try {
    await chrome.storage.sync.set(s);
  } catch (e) {
    await chrome.storage.local.set(s);
  }
  applyForm(s);
  $('status').textContent = 'Saved';
  setTimeout(() => ($('status').textContent = ''), 1500);
}

// Every change saves at once; the Save button stays as a manual fallback.
for (const el of document.querySelectorAll('input, select')) {
  if (el.id !== 'content') el.addEventListener('change', save);
}

// Page print needs the optional "debugger" permission. Ask for it here, on the click
// that chooses Page print (permissions.request needs a user gesture). Declined: go back to Cleaned.
$('content').addEventListener('change', async () => {
  let denied = false;
  if ($('content').value === 'print') {
    let granted = false;
    try {
      granted = await chrome.permissions.request({ permissions: ['debugger'] });
    } catch (e) {
      granted = false;
    }
    if (!granted) {
      $('content').value = 'cleaned';
      denied = true;
    }
  }
  await save();
  if (denied) $('status').textContent = 'Page print needs the debugger permission';
});
$('save').addEventListener('click', save);
$('reset').addEventListener('click', async () => {
  applyForm(WW.sanitiseSettings({}));
  await save();
});
load();
