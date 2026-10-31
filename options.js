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
    sourceUrl: $('sourceUrl').value
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
  $('sourceUrl').value = s.sourceUrl;
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
