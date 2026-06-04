// Generates the PWA app icons as real PNGs (Chrome/Edge require 192px + 512px
// PNG icons before they'll offer "Install"; an SVG-only icon is silently
// rejected). Pure Node — no image deps. Run: node scripts/gen-pwa-icons.mjs
//
// Mark: FR brand Slate (#3A3A3A) tile with a centered Salt (#F5F0E8) dot.
// "any" icons get rounded corners; the maskable icon is full-bleed (the OS
// applies its own mask, and the dot stays well inside the safe zone).

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const SLATE = [0x3A, 0x3A, 0x3A, 0xFF];
const SALT = [0xF5, 0xF0, 0xE8, 0xFF];
const CLEAR = [0, 0, 0, 0];

function buildPng(size, { maskable }) {
  const r = maskable ? 0 : size * 0.16;     // corner radius
  const cx = (size - 1) / 2, cy = (size - 1) / 2;
  const dotR = size * 0.26;                  // centered logomark dot
  const raw = Buffer.alloc(size * (1 + size * 4));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // PNG row filter: none
    for (let x = 0; x < size; x++) {
      let inside = true;
      if (r > 0) {
        const minx = r, maxx = size - 1 - r, miny = r, maxy = size - 1 - r;
        let dx = 0, dy = 0;
        if (x < minx) dx = minx - x; else if (x > maxx) dx = x - maxx;
        if (y < miny) dy = miny - y; else if (y > maxy) dy = y - maxy;
        if (dx * dx + dy * dy > r * r) inside = false;
      }
      let col;
      if (!inside) col = CLEAR;
      else {
        const ddx = x - cx, ddy = y - cy;
        col = (ddx * ddx + ddy * ddy <= dotR * dotR) ? SALT : SLATE;
      }
      raw[p++] = col[0]; raw[p++] = col[1]; raw[p++] = col[2]; raw[p++] = col[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const out = new URL('../public/', import.meta.url);
writeFileSync(new URL('pwa-192x192.png', out), buildPng(192, { maskable: false }));
writeFileSync(new URL('pwa-512x512.png', out), buildPng(512, { maskable: false }));
writeFileSync(new URL('pwa-maskable-512x512.png', out), buildPng(512, { maskable: true }));
console.log('PWA icons generated: pwa-192x192.png, pwa-512x512.png, pwa-maskable-512x512.png');
