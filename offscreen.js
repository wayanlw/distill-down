// Offscreen document: clipboard writes and blob URL creation (service workers have neither).
function copyText(text) {
  const ta = document.getElementById('buf');
  ta.value = text;
  ta.select();
  const ok = document.execCommand('copy');
  ta.value = '';
  if (!ok) throw new Error('execCommand copy failed');
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen') return false;
  try {
    if (msg.type === 'copy') {
      copyText(msg.text);
      sendResponse({ ok: true });
    } else if (msg.type === 'blobUrl') {
      const blob = new Blob([base64ToBytes(msg.data)], { type: msg.mime });
      const url = URL.createObjectURL(blob);
      setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
      sendResponse({ ok: true, url });
    } else {
      sendResponse({ ok: false, error: 'unknown message ' + msg.type });
    }
  } catch (err) {
    sendResponse({ ok: false, error: String((err && err.message) || err) });
  }
  return false;
});
