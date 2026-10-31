// Generates simple solid-colour PNG icons (no dependencies). Run: node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// Dark blue rounded square with a white "W"-like bar pattern.
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const inset = Math.round(size * 0.2);
  const bar = Math.max(1, Math.round(size * 0.1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const inBox = x >= inset && x < size - inset && y >= inset && y < size - inset;
      const onBar = inBox && (x - inset) % (bar * 2) < bar;
      const inner = inBox && !onBar;
      if (onBar) { raw[o] = 255; raw[o + 1] = 255; raw[o + 2] = 255; }
      else if (inner) { raw[o] = 37; raw[o + 1] = 99; raw[o + 2] = 235; }
      else { raw[o] = 30; raw[o + 1] = 41; raw[o + 2] = 59; }
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const dir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(dir, { recursive: true });
for (const s of [16, 48, 128]) fs.writeFileSync(path.join(dir, 'icon' + s + '.png'), png(s));
console.log('icons written to', dir);
