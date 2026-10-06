#!/usr/bin/env node
// Gera icon.png (256×256) sem dependências: uma bola roxa na cor do app.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const N = 256;
const SS = 4; // subamostras por eixo, para suavizar as bordas
const C = N / 2;
const PURPLE = [107, 79, 216];
const PURPLE_HI = [142, 118, 240];
const WHITE = [244, 242, 250];
const SHADE = [214, 210, 226];
const INK = [23, 21, 28];

function colorAt(x, y) {
  const dx = x - C;
  const dy = y - C;
  const r = Math.hypot(dx, dy);
  if (r > 120) return null;
  if (r > 108) return INK;
  if (r <= 16) return WHITE;
  if (r <= 26) return INK;
  if (r <= 38) return WHITE;
  if (r <= 48 || Math.abs(dy) <= 11) return INK;
  if (dy < 0) return Math.hypot(dx + 44, dy + 52) < 30 ? PURPLE_HI : PURPLE;
  return Math.hypot(dx - 20, dy - 20) > 96 ? SHADE : WHITE;
}

const raw = Buffer.alloc(N * (N * 4 + 1));
for (let py = 0; py < N; py++) {
  const row = py * (N * 4 + 1);
  raw[row] = 0;
  for (let px = 0; px < N; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = colorAt(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS);
        if (!c) continue;
        r += c[0];
        g += c[1];
        b += c[2];
        a++;
      }
    }
    const o = row + 1 + px * 4;
    if (a) {
      raw[o] = Math.round(r / a);
      raw[o + 1] = Math.round(g / a);
      raw[o + 2] = Math.round(b / a);
    }
    raw[o + 3] = Math.round((a / (SS * SS)) * 255);
  }
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0);
ihdr.writeUInt32BE(N, 4);
ihdr[8] = 8; // bits por canal
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = path.join(__dirname, '..', 'icon.png');
fs.writeFileSync(out, png);
console.log('salvo em', out, png.length, 'bytes');
