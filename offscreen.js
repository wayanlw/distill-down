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

const IMG_MAX_W = 1000;
const JPEG_QUALITY = 0.6;

function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// Decode, downscale to IMG_MAX_W wide, flatten onto white, re-encode as JPEG.
async function encodeImage(b64, mime) {
  const blob = new Blob([base64ToBytes(b64)], { type: mime || '' });
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, IMG_MAX_W / bmp.width);
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
  const bytes = new Uint8Array(await out.arrayBuffer());
  return { data: bytesToBase64(bytes), width: w, height: h };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen') return false;
  if (msg.type === 'encodeImage') {
    encodeImage(msg.data, msg.mime)
      .then((r) => sendResponse(Object.assign({ ok: true }, r)))
      .catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
    return true; // async response
  }
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
