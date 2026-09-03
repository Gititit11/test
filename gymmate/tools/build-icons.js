#!/usr/bin/env node
/* 앱 아이콘을 만든다.
 *
 * 아령 모양은 인트로(css/styles.css 의 .intro-mark, index.html 의 SVG)와
 * 같은 좌표를 쓴다. 아이콘과 인트로가 다른 아령이면 앱을 켤 때 어색해서다.
 * 인트로 좌표를 고치면 여기 PLATES 도 같이 고치고 이 스크립트를 다시 돌린다.
 *
 *   node tools/build-icons.js
 *
 * 렌더는 Chromium(Playwright) 으로 한다. ImageMagick 류가 없어도 되고,
 * 브라우저가 그리는 그대로 나오므로 실제 표시와 어긋나지 않는다.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, '..', 'icons');

/* 인트로와 똑같은 좌표계 (viewBox 200 x 104).
 * 내용은 x 22~178, y 24~80 을 채운다. */
const VB = { w: 200, h: 104, x0: 22, x1: 178, y0: 24, y1: 80 };
const PLATES = [
  { cls: 'bar',   x: 22,  y: 47, w: 156, h: 10, rx: 5 },
  { cls: 'in',    x: 52,  y: 24, w: 15,  h: 56, rx: 6 },
  { cls: 'out',   x: 36,  y: 33, w: 12,  h: 38, rx: 5 },
  { cls: 'in',    x: 133, y: 24, w: 15,  h: 56, rx: 6 },
  { cls: 'out',   x: 152, y: 33, w: 12,  h: 38, rx: 5 }
];

const BG = '#0f1115';

// 인트로에서 쓰는 색 그대로
const FLAT = { bar: '#5c6579', in: '#4d7cff', out: '#3a5fd4' };

/* 내용을 512 캔버스 가운데에 놓는 변환을 구한다.
 * width 는 아령이 캔버스에서 차지할 가로 폭(px). */
function fit(width, canvas) {
  const s = width / (VB.x1 - VB.x0);
  const cx = (VB.x0 + VB.x1) / 2, cy = (VB.y0 + VB.y1) / 2;
  return { s: s, tx: canvas / 2 - cx * s, ty: canvas / 2 - cy * s };
}

function rects(fillOf) {
  return PLATES.map(function (p) {
    return '<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w +
      '" height="' + p.h + '" rx="' + p.rx + '" fill="' + fillOf(p.cls) + '"/>';
  }).join('\n      ');
}

/* opts: { canvas, width, radius, gradient } */
function svg(opts) {
  const c = opts.canvas, f = fit(opts.width, c);
  const grad = opts.gradient
    ? '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#6c93ff"/><stop offset="1" stop-color="#35c98a"/>' +
      '</linearGradient></defs>\n  '
    : '';
  const fillOf = opts.gradient ? function () { return 'url(#g)'; } : function (k) { return FLAT[k]; };
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + c + ' ' + c +
    '" width="' + c + '" height="' + c + '">\n  ' + grad +
    '<rect width="' + c + '" height="' + c + '"' +
      (opts.radius ? ' rx="' + opts.radius + '"' : '') + ' fill="' + BG + '"/>\n' +
    '  <g transform="translate(' + f.tx.toFixed(2) + ' ' + f.ty.toFixed(2) +
      ') scale(' + f.s.toFixed(4) + ')">\n      ' + rects(fillOf) + '\n  </g>\n</svg>\n';
}

/* 마스커블은 기기가 원형·물방울 등으로 잘라내므로 안전 영역(가운데 지름 80%)
 * 안에 내용이 들어가야 한다. 가로로 긴 아령은 대각선 길이로 확인해야 한다. */
function safeZoneOk(width, canvas) {
  const f = fit(width, canvas);
  const halfW = width / 2;
  const halfH = (VB.y1 - VB.y0) * f.s / 2;
  return Math.hypot(halfW, halfH) <= canvas * 0.4;
}

const VARIANTS = {
  flat: false,
  grad: true
};

async function main() {
  const useGradient = process.argv.indexOf('--gradient') !== -1;
  const preview = process.argv.indexOf('--preview') !== -1;

  const maskWidth = 330;
  if (!safeZoneOk(maskWidth, 512)) throw new Error('마스커블 안전 영역을 벗어난다');

  const files = [
    { name: 'icon.svg',  spec: { canvas: 512, width: 372, radius: 112, gradient: useGradient }, svgOnly: true },
    { name: 'icon-maskable.svg', spec: { canvas: 512, width: maskWidth, radius: 0, gradient: useGradient }, svgOnly: true },
    { name: 'icon-512.png', spec: { canvas: 512, width: 372, radius: 112, gradient: useGradient }, size: 512 },
    { name: 'icon-192.png', spec: { canvas: 512, width: 372, radius: 112, gradient: useGradient }, size: 192 },
    { name: 'icon-maskable-512.png', spec: { canvas: 512, width: maskWidth, radius: 0, gradient: useGradient }, size: 512 },
    // 아이폰은 자체 마스크를 씌우므로 모서리를 미리 깎지 않는다 (두 번 깎이면 구석이 어둡다)
    { name: 'apple-touch-icon.png', spec: { canvas: 512, width: 372, radius: 0, gradient: useGradient }, size: 180 }
  ];

  const browser = await chromium.launch();
  for (const f of files) {
    const markup = svg(f.spec);
    if (f.svgOnly) {
      if (!preview) fs.writeFileSync(path.join(OUT, f.name), markup);
      console.log('  ' + f.name);
      continue;
    }
    const page = await browser.newPage({ viewport: { width: f.size, height: f.size }, deviceScaleFactor: 1 });
    await page.setContent('<style>html,body{margin:0;padding:0;background:transparent}' +
      'svg{display:block;width:' + f.size + 'px;height:' + f.size + 'px}</style>' + markup);
    const out = preview
      ? path.join(process.env.PREVIEW_DIR || '/tmp', (useGradient ? 'grad-' : 'flat-') + f.name)
      : path.join(OUT, f.name);
    await page.screenshot({ path: out, omitBackground: true });
    await page.close();
    console.log('  ' + out.replace(process.cwd() + '/', '') + '  ' + f.size + 'x' + f.size);
  }
  await browser.close();
}

main().catch(function (e) { console.error(e); process.exit(1); });
