// Options page. Settings live in chrome.storage.sync, falling back to local.
const $ = (id) => document.getElementById(id);

function readForm() {
  return {
    clipboard: $('clipboard').checked,
    download: $('download').checked,
    format: $('format').value,
    content: $('content').value,
    destination: $('destination').value
  };
}

function applyForm(s) {
  $('clipboard').checked = s.clipboard;
  $('download').checked = s.download;
  $('format').value = s.format;
  $('content').value = s.content;
  $('destination').value = s.destination;
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

$('download').addEventListener('change', () => applyForm(readForm()));
$('save').addEventListener('click', save);
load();
