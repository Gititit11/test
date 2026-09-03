#!/usr/bin/env node
/* 마중물 앱 아이콘을 만든다.
 *
 * 물방울 모양은 인트로(index.html 의 .intro-mark)와 같은 좌표를 쓴다.
 * 아이콘과 인트로가 다른 물방울이면 앱을 켤 때 어색해서다.
 * 인트로 좌표를 고치면 여기 DROP 도 같이 고치고 이 스크립트를 다시 돌린다.
 *
 *   node majungmul/tools/build-icons.js
 *
 * 렌더는 Chromium(Playwright)으로 한다. ImageMagick 류가 없어도 되고,
 * 브라우저가 그리는 그대로 나오므로 실제 표시와 어긋나지 않는다.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, '..', 'icons');

/* 인트로와 똑같은 좌표계 (viewBox 80 x 100). 물방울은 x 16~64, y 6~80 을 채운다. */
const DROP = 'M40 6 C 40 6, 64 38, 64 56 a 24 24 0 0 1 -48 0 C 16 38, 40 6, 40 6 Z';
const BOX = { x0: 16, x1: 64, y0: 6, y1: 80 };

const BG = '#0b1016';

/* 내용을 캔버스 가운데에 놓는 변환. height 는 물방울이 차지할 세로 길이(px). */
function fit(height, canvas) {
  const s = height / (BOX.y1 - BOX.y0);
  const cx = (BOX.x0 + BOX.x1) / 2, cy = (BOX.y0 + BOX.y1) / 2;
  return { s, tx: canvas / 2 - cx * s, ty: canvas / 2 - cy * s };
}

/* opts: { canvas, height, bg, fill, shine } */
function svg(opts) {
  const c = opts.canvas, f = fit(opts.height, c);
  const defs =
    '<defs>' +
      '<linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">' +
        '<stop offset="0" stop-color="#6fd6ff"/><stop offset="0.55" stop-color="#38b6ff"/>' +
        '<stop offset="1" stop-color="#1b6fd1"/>' +
      '</linearGradient>' +
    '</defs>';
  const bg = opts.bg ? `<rect width="${c}" height="${c}" rx="${opts.radius || 0}" fill="${opts.bg}"/>` : '';
  // 물방울 안쪽 왼쪽 위의 하이라이트 — 유리에 빛이 닿은 자리
  const shine = opts.shine
    ? '<ellipse cx="31" cy="52" rx="7" ry="10" fill="#ffffff" opacity="0.28" transform="rotate(-18 31 52)"/>'
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${c} ${c}" width="${c}" height="${c}">
  ${defs}
  ${bg}
  <g transform="translate(${f.tx} ${f.ty}) scale(${f.s})">
    <path d="${DROP}" fill="${opts.fill}"/>
    ${shine}
  </g>
</svg>`;
}

const FILES = [
  { name: 'icon-192.png', canvas: 192, height: 132, bg: BG, fill: 'url(#g)', shine: true },
  { name: 'icon-512.png', canvas: 512, height: 352, bg: BG, fill: 'url(#g)', shine: true },
  // 마스커블은 어느 모양으로 잘려도 남도록 가운데 80% 안에만 그린다
  { name: 'icon-maskable-512.png', canvas: 512, height: 250, bg: BG, fill: 'url(#g)', shine: true },
  { name: 'apple-touch-icon.png', canvas: 180, height: 124, bg: BG, fill: 'url(#g)', shine: true },
  // 안드로이드 상태바 배지는 단색 실루엣만 쓴다
  { name: 'badge.png', canvas: 96, height: 78, bg: null, fill: '#ffffff', shine: false }
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const f of FILES) {
    const markup = svg(f);
    if (f.name === 'icon-512.png') fs.writeFileSync(path.join(OUT, 'icon.svg'), markup);
    if (f.name === 'icon-maskable-512.png') fs.writeFileSync(path.join(OUT, 'icon-maskable.svg'), markup);
    await page.setViewportSize({ width: f.canvas, height: f.canvas });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}</style>${markup}`,
      { waitUntil: 'load' }
    );
    await page.screenshot({ path: path.join(OUT, f.name), omitBackground: true });
    console.log(f.name, f.canvas + 'px');
  }
  await browser.close();
})();
