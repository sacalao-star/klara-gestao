'use strict';
/**
 * Gera ícones estilo SaaS moderno (.svg, .png 192/512 + maskable, e .ico multi-tamanho 16/32/48/256)
 * para os 3 módulos do ecossistema Klara Gestão.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT_DIR = path.resolve(__dirname, '..', 'assets', 'icons');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ---- SVGs Vetoriais Estilo SaaS Moderno ----
const SVGS = {
  'klara-rh': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="rhBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#60a5fa"/>
      <stop offset="52%" stop-color="#818cf8"/>
      <stop offset="100%" stop-color="#c084fc"/>
    </linearGradient>
    <linearGradient id="rhGlass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.10"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="118" fill="url(#rhBg)"/>
  <circle cx="136" cy="112" r="140" fill="#ffffff" opacity="0.14"/>
  <rect x="78" y="86" width="356" height="340" rx="76" fill="url(#rhGlass)" stroke="#ffffff" stroke-opacity="0.45" stroke-width="4"/>
  <circle cx="210" cy="196" r="40" fill="#ffffff"/>
  <path d="M138 326 C138 274 170 250 210 250 C250 250 282 274 282 326" fill="none" stroke="#ffffff" stroke-width="26" stroke-linecap="round"/>
  <circle cx="318" cy="212" r="30" fill="#ffffff" opacity="0.88"/>
  <path d="M276 322 C282 284 304 266 332 266 C356 266 376 282 380 318" fill="none" stroke="#ffffff" stroke-width="22" stroke-linecap="round" opacity="0.88"/>
  <circle cx="358" cy="148" r="18" fill="#fde047"/>
</svg>`,

  'klara-apontamento': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="apBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f766e"/>
      <stop offset="55%" stop-color="#0891b2"/>
      <stop offset="100%" stop-color="#06b6d4"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="118" fill="url(#apBg)"/>
  <circle cx="390" cy="120" r="120" fill="#ffffff" opacity="0.12"/>
  <circle cx="256" cy="242" r="138" fill="#ffffff" fill-opacity="0.15" stroke="#ffffff" stroke-width="18"/>
  <path d="M256 164 V246 L312 282" fill="none" stroke="#ffffff" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="256" cy="246" r="16" fill="#fde047"/>
  <path d="M256 382 L226 426 H286 Z" fill="#fde047"/>
  <circle cx="366" cy="138" r="24" fill="#34d399" stroke="#0f766e" stroke-width="8"/>
</svg>`,

  'klara-colaborador': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="colBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e3a8a"/>
      <stop offset="55%" stop-color="#0f766e"/>
      <stop offset="100%" stop-color="#10b981"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="118" fill="url(#colBg)"/>
  <rect x="212" y="64" width="88" height="32" rx="16" fill="#fde047"/>
  <rect x="114" y="112" width="284" height="316" rx="44" fill="#ffffff" fill-opacity="0.16" stroke="#ffffff" stroke-opacity="0.7" stroke-width="10"/>
  <circle cx="256" cy="216" r="44" fill="#ffffff"/>
  <path d="M174 350 C174 296 210 272 256 272 C302 272 338 296 338 350" fill="none" stroke="#ffffff" stroke-width="26" stroke-linecap="round"/>
  <circle cx="364" cy="368" r="32" fill="#34d399" stroke="#1e3a8a" stroke-width="8"/>
  <path d="M350 368 L360 378 L379 357" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`
};

for (const [name, svg] of Object.entries(SVGS)) {
  fs.writeFileSync(path.join(OUT_DIR, `${name}.svg`), svg, 'utf8');
}

// ---- PNG & ICO Encoders ----
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, makeChunk('IHDR', ihdr), makeChunk('IDAT', compressed), makeChunk('IEND', Buffer.alloc(0))]);
}

function encodeIco(pngEntries) {
  // ICO header: 6 bytes (reserved=0, type=1, count)
  const count = pngEntries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  let offset = 6 + count * 16;
  for (const { size, png } of pngEntries) {
    const dir = Buffer.alloc(16);
    dir[0] = size >= 256 ? 0 : size;
    dir[1] = size >= 256 ? 0 : size;
    dir[2] = 0;
    dir[3] = 0;
    dir.writeUInt16LE(1, 4);  // color planes
    dir.writeUInt16LE(32, 6); // bpp
    dir.writeUInt32LE(png.length, 8);
    dir.writeUInt32LE(offset, 12);
    dirEntries.push(dir);
    offset += png.length;
  }
  return Buffer.concat([header, ...dirEntries, ...pngEntries.map(e => e.png)]);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function sdRoundedBox(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));
}

function grad3(c1, c2, c3, t) {
  if (t < 0.5) {
    const k = t * 2;
    return [mix(c1[0], c2[0], k), mix(c1[1], c2[1], k), mix(c1[2], c2[2], k)];
  }
  const k = (t - 0.5) * 2;
  return [mix(c2[0], c3[0], k), mix(c2[1], c3[1], k), mix(c2[2], c3[2], k)];
}

function samplePixel(variant, nx, ny, maskable) {
  const padScale = maskable ? 0.80 : 1.0;
  const gradT = (nx + ny) / 1024;

  let rgb;
  if (variant === 'klara-rh') {
    // Azul claro (#60a5fa) -> Índigo suave (#818cf8) -> Lilás (#c084fc)
    rgb = grad3([96, 165, 250], [129, 140, 248], [192, 132, 252], gradT);
  } else if (variant === 'klara-apontamento') {
    // Azul-petróleo (#0f766e) -> Ciano (#0891b2) -> Ciano vibrante (#06b6d4)
    rgb = grad3([15, 118, 110], [8, 145, 178], [6, 182, 212], gradT);
  } else {
    // Índigo (#1e3a8a) -> Teal (#0f766e) -> Esmeralda (#10b981)
    rgb = grad3([30, 58, 138], [15, 118, 110], [16, 185, 129], gradT);
  }

  let r = rgb[0], g = rgb[1], b = rgb[2], a = 1;
  if (!maskable) {
    const dBg = sdRoundedBox(nx, ny, 256, 256, 256, 256, 118);
    if (dBg > 1.5) return [0, 0, 0, 0];
    a = Math.max(0, Math.min(1, 0.5 - dBg * 0.5));
  }

  // Soft SaaS top-left glow
  const glow = Math.max(0, 1 - Math.hypot(nx - 140, ny - 115) / 220) * 0.16;
  r = mix(r, 255, glow);
  g = mix(g, 255, glow);
  b = mix(b, 255, glow);

  const px = (nx - 256) / padScale + 256;
  const py = (ny - 256) / padScale + 256;

  const over = (cr, cg, cb, ca) => {
    if (ca <= 0) return;
    const k = Math.min(1, ca);
    r = mix(r, cr, k);
    g = mix(g, cg, k);
    b = mix(b, cb, k);
  };

  if (variant === 'klara-rh') {
    // Glass card
    const dGlass = sdRoundedBox(px, py, 256, 256, 178, 170, 76);
    if (dGlass < 0) over(255, 255, 255, 0.16);
    if (Math.abs(dGlass) < 3) over(255, 255, 255, 0.42);

    // Secondary person (right)
    const dHead2 = Math.hypot(px - 318, py - 212) - 30;
    if (dHead2 < 2) over(255, 255, 255, Math.max(0, Math.min(1, 1 - dHead2)) * 0.88);
    // Arc for secondary shoulders
    const dArc2 = Math.abs(Math.hypot((px - 328) * 0.9, py - 326) - 52) - 11;
    if (py <= 328 && px >= 265 && dArc2 < 2) over(255, 255, 255, Math.max(0, Math.min(1, 1 - dArc2)) * 0.88);

    // Primary person (left)
    const dHead1 = Math.hypot(px - 210, py - 196) - 40;
    if (dHead1 < 2) over(255, 255, 255, Math.max(0, Math.min(1, 1 - dHead1)));
    const dArc1 = Math.abs(Math.hypot((px - 210) * 0.88, py - 328) - 66) - 13;
    if (py <= 332 && dArc1 < 2) over(255, 255, 255, Math.max(0, Math.min(1, 1 - dArc1)));

    // Gold spark accent
    const dGold = Math.hypot(px - 358, py - 148) - 18;
    if (dGold < 2) over(253, 224, 71, Math.max(0, Math.min(1, 1 - dGold)));
  } else if (variant === 'klara-apontamento') {
    const dClockFill = Math.hypot(px - 256, py - 242) - 138;
    if (dClockFill < 0) over(255, 255, 255, 0.15);
    const dRing = Math.abs(dClockFill) - 9;
    if (dRing < 2) over(255, 255, 255, Math.max(0, Math.min(1, 1 - dRing)));

    // Clock hands
    const dH1 = distToSegment(px, py, 256, 164, 256, 246) - 13;
    const dH2 = distToSegment(px, py, 256, 246, 312, 282) - 13;
    const dHands = Math.min(dH1, dH2);
    if (dHands < 2) over(255, 255, 255, Math.max(0, Math.min(1, 1 - dHands)));

    const dCenter = Math.hypot(px - 256, py - 246) - 16;
    if (dCenter < 2) over(253, 224, 71, Math.max(0, Math.min(1, 1 - dCenter)));

    // Bottom GPS indicator
    const dPin = Math.hypot(px - 256, py - 410) - 18;
    if (dPin < 2) over(253, 224, 71, Math.max(0, Math.min(1, 1 - dPin)));

    // Active emerald badge
    const dBadge = Math.hypot(px - 366, py - 138) - 24;
    if (dBadge < 2) over(52, 211, 153, Math.max(0, Math.min(1, 1 - dBadge)));
  } else {
    // Badge card
    const dCard = sdRoundedBox(px, py, 256, 270, 142, 158, 44);
    if (dCard < 0) over(255, 255, 255, 0.16);
    if (Math.abs(dCard) < 6) over(255, 255, 255, 0.68);

    // Gold clip
    const dClip = sdRoundedBox(px, py, 256, 80, 44, 16, 14);
    if (dClip < 2) over(253, 224, 71, Math.max(0, Math.min(1, 1 - dClip)));

    // User avatar inside badge
    const dHead = Math.hypot(px - 256, py - 216) - 44;
    if (dHead < 2) over(255, 255, 255, Math.max(0, Math.min(1, 1 - dHead)));
    const dArc = Math.abs(Math.hypot((px - 256) * 0.88, py - 350) - 74) - 13;
    if (py <= 354 && dArc < 2) over(255, 255, 255, Math.max(0, Math.min(1, 1 - dArc)));

    // Emerald verified badge
    const dBadge = Math.hypot(px - 364, py - 368) - 32;
    if (dBadge < 2) over(52, 211, 153, Math.max(0, Math.min(1, 1 - dBadge)));
    const dCheck1 = distToSegment(px, py, 350, 368, 360, 378) - 4.5;
    const dCheck2 = distToSegment(px, py, 360, 378, 379, 357) - 4.5;
    if (Math.min(dCheck1, dCheck2) < 1.5) over(255, 255, 255, 1);
  }

  return [r, g, b, Math.round(a * 255)];
}

function renderIconPng(variant, size, maskable = false) {
  const buf = Buffer.alloc(size * size * 4);
  const scale = size / 512;
  // 2x2 supersampling for crisp small icons (16, 32, 48, 192)
  const sub = size <= 192 ? 2 : 1;
  const invSub2 = 1 / (sub * sub);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sr = 0, sg = 0, sb = 0, sa = 0;
      for (let sy = 0; sy < sub; sy++) {
        for (let sx = 0; sx < sub; sx++) {
          const nx = (x + (sx + 0.5) / sub) / scale;
          const ny = (y + (sy + 0.5) / sub) / scale;
          const [pr, pg, pb, pa] = samplePixel(variant, nx, ny, maskable);
          sr += pr * pa;
          sg += pg * pa;
          sb += pb * pa;
          sa += pa;
        }
      }
      const idx = (y * size + x) * 4;
      const avgA = Math.round(sa * invSub2);
      buf[idx + 3] = avgA;
      if (sa > 0) {
        buf[idx] = Math.round(sr / sa);
        buf[idx + 1] = Math.round(sg / sa);
        buf[idx + 2] = Math.round(sb / sa);
      }
    }
  }
  return encodePng(size, size, buf);
}

for (const variant of Object.keys(SVGS)) {
  fs.writeFileSync(path.join(OUT_DIR, `${variant}-192.png`), renderIconPng(variant, 192, false));
  fs.writeFileSync(path.join(OUT_DIR, `${variant}-512.png`), renderIconPng(variant, 512, false));
  fs.writeFileSync(path.join(OUT_DIR, `${variant}-maskable-192.png`), renderIconPng(variant, 192, true));
  fs.writeFileSync(path.join(OUT_DIR, `${variant}-maskable-512.png`), renderIconPng(variant, 512, true));

  const icoEntries = [16, 32, 48, 256].map(s => ({
    size: s,
    png: renderIconPng(variant, s, false)
  }));
  fs.writeFileSync(path.join(OUT_DIR, `${variant}.ico`), encodeIco(icoEntries));
}

console.log('Icones SaaS (SVG, PNG e ICO multi-tamanho) gerados em:', OUT_DIR);
