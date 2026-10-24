/* 디지몬 그리기
 *
 * sprites/<id>.png 시트가 있으면 그걸 쓴다 (tools/import-sheets.py 로 만든 12프레임 시트).
 * 없는 종은 id 를 씨앗으로 만든 임시 도트로 그린다. 시트가 생기면 저절로 바뀐다.
 * 시트는 처음 그릴 때 불러온다 (200장을 한꺼번에 받지 않도록).
 *
 * 시트의 프레임 순서 (왼쪽을 보는 그림). 디지타마 시트만 8프레임이다:
 *   0-1 서 있기  2-3 걷기  4-5 달리기  6-7 훈련  8 기쁨  9 잠  10 공격  11 먹기
 *
 *   Sprite.measure(id)                  → { w, h } 배율 1 일 때 크기(px)
 *   Sprite.draw(ctx, id, x, y, scale, { flip, dark, silhouette, frame, anim })
 *   Sprite.egg(ctx, lineId, x, y, scale, frame) → 디지타마 (frame: 0-7, 없으면 흔들기)
 *   Sprite.canvas(id, px, opts)         → 도감·아이콘용 작은 캔버스
 *   Sprite.onload(fn)                   → 시트 그림이 하나 불러와질 때마다 부른다 (다시 그리기용)
 */
var Sprite = (function (D, SHEETS) {
  'use strict';

  var CELL = 3; // 임시 도트 한 칸 = 3px
  var ANIM = {
    idle: [0, 1], walk: [2, 3], run: [4, 5], train: [6, 7],
    happy: [8, 0], sleep: [9], attack: [10, 4], eat: [11, 0]
  };
  var imgs = {}, tinted = {}, listeners = [], notify = 0;
  function onload(fn) { listeners.push(fn); }
  function sheet(id) {
    var im = imgs[id];
    if (!im && typeof Image !== 'undefined') {
      im = imgs[id] = new Image();
      im.onload = function () {
        // 여러 장이 잇달아 들어오면 한 번만 다시 그리게 모은다
        clearTimeout(notify);
        notify = setTimeout(function () { listeners.forEach(function (f) { f(); }); }, 30);
      };
      im.src = 'sprites/' + id + '.png';
    }
    return im && im.complete && im.naturalWidth ? im : null;
  }
  function frameOf(id, anim, frame, index) {
    var S = SHEETS[id];
    if (index != null) return Math.min(index, S.n - 1);
    var list = (ANIM[anim] || ANIM.idle).filter(function (i) {
      return i < S.n && S.gray.indexOf(i) < 0;
    });
    if (!list.length) list = ANIM.idle;
    return list[(frame || 0) % list.length];
  }
  // 그 동작의 칸이 하나라도 있나 (회색 실루엣·빈 칸은 없는 것)
  function has(id, anim) {
    var S = SHEETS[id];
    return !!S && (ANIM[anim] || []).some(function (i) { return i < S.n && S.gray.indexOf(i) < 0; });
  }
  // 어둡게(진화 예고) · 실루엣(도감) 은 시트 전체를 한 번 칠해 둔다
  function tint(id, kind) {
    var key = id + ':' + kind;
    if (tinted[key]) return tinted[key];
    var im = sheet(id), c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    var x = c.getContext('2d');
    x.drawImage(im, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = kind === 'sil' ? '#2a3040' : 'rgba(20,10,30,.55)';
    x.fillRect(0, 0, c.width, c.height);
    return (tinted[key] = c);
  }

  var SIZE = { baby1: 7, baby2: 9, child: 11, adult: 13, perfect: 15, ultimate: 16 };
  var OUTLINE = '#1b1f17';
  var cache = {};

  function seedOf(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 0 빈칸, 1 몸, 2 그림자, 3 눈, 9 테두리
  function build(id) {
    if (cache[id]) return cache[id];
    var S = D.SPECIES[id], n = SIZE[S.stage], r = rng(seedOf(id));
    var half = Math.ceil(n / 2), body = [];
    var baby = S.stage === 'baby1' || S.stage === 'baby2';
    var y, x;
    for (y = 0; y < n; y++) {
      body.push([]);
      for (x = 0; x < half; x++) {
        var dx = (half - 1 - x) / half, dy = (y - n * 0.55) / (n / 2);
        var on;
        if (baby) on = dx * dx + dy * dy * 1.1 < 0.8 + r() * 0.25; // 유년기는 동글동글
        else on = r() < 0.92 - 0.75 * dx * dx - 0.55 * dy * dy;
        body[y].push(on ? 1 : 0);
      }
    }
    // 가운데 기둥은 채워 몸이 이어지게 한다
    for (y = Math.floor(n * 0.2); y < n - 1; y++) body[y][half - 1] = 1;
    var full = [];
    for (y = 0; y < n; y++) {
      full.push([]);
      for (x = 0; x < n; x++) full[y].push(body[y][x < half ? x : n - 1 - x]);
    }
    keepLargest(full, n);
    // 눈
    var ey = Math.max(1, Math.floor(n * (baby ? 0.42 : 0.3)));
    var ex = Math.max(0, half - 1 - Math.max(1, Math.round(n / 6)));
    full[ey][ex] = 3; full[ey][n - 1 - ex] = 3;
    if (n % 2 === 1 && ex === half - 1) full[ey][ex] = 3;
    // 아래쪽은 그림자
    for (y = Math.floor(n * 0.72); y < n; y++)
      for (x = 0; x < n; x++) if (full[y][x] === 1) full[y][x] = 2;
    // 테두리를 한 칸 둘러 그린다
    var m = n + 2, g = [];
    for (y = 0; y < m; y++) { g.push([]); for (x = 0; x < m; x++) g[y].push(0); }
    for (y = 0; y < n; y++) for (x = 0; x < n; x++) g[y + 1][x + 1] = full[y][x];
    for (y = 0; y < m; y++) for (x = 0; x < m; x++) {
      if (g[y][x]) continue;
      for (var k = 0; k < 4; k++) {
        var yy = y + [1, -1, 0, 0][k], xx = x + [0, 0, 1, -1][k];
        if (yy >= 0 && yy < m && xx >= 0 && xx < m && g[yy][xx] && g[yy][xx] !== 9) { g[y][x] = 9; break; }
      }
    }
    return (cache[id] = { n: m, g: g });
  }

  function keepLargest(g, n) {
    var seen = [], best = null, y, x;
    for (y = 0; y < n; y++) seen.push(new Array(n).fill(false));
    for (y = 0; y < n; y++) for (x = 0; x < n; x++) {
      if (!g[y][x] || seen[y][x]) continue;
      var comp = [], st = [[y, x]];
      seen[y][x] = true;
      while (st.length) {
        var p = st.pop(); comp.push(p);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var a = p[0] + d[0], b = p[1] + d[1];
          if (a >= 0 && a < n && b >= 0 && b < n && g[a][b] && !seen[a][b]) { seen[a][b] = true; st.push([a, b]); }
        });
      }
      if (!best || comp.length > best.length) best = comp;
    }
    var keep = {};
    (best || []).forEach(function (p) { keep[p[0] * n + p[1]] = 1; });
    for (y = 0; y < n; y++) for (x = 0; x < n; x++) if (!keep[y * n + x]) g[y][x] = 0;
  }

  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function rgb(a) { return 'rgb(' + a.map(function (v) { return Math.round(Math.max(0, Math.min(255, v))); }).join(',') + ')'; }
  function mix(a, b, t) { return [0, 1, 2].map(function (i) { return a[i] + (b[i] - a[i]) * t; }); }

  function palette(id, dark) {
    var base = hex(D.SPECIES[id].color);
    var lum = (0.299 * base[0] + 0.587 * base[1] + 0.114 * base[2]) / 255;
    var shade = mix(base, [0, 0, 0], 0.28);
    var eye = lum < 0.35 ? [255, 216, 74] : hex(OUTLINE);
    var p = { 1: base, 2: shade, 3: eye, 9: hex(OUTLINE) };
    if (dark) for (var k in p) p[k] = mix(p[k], [20, 10, 30], 0.55); // 잘못된 진화 예고
    for (var j in p) p[j] = rgb(p[j]);
    return p;
  }

  function measure(id) {
    if (SHEETS[id]) return { w: SHEETS[id].w, h: SHEETS[id].h };
    var n = build(id).n * CELL;
    return { w: n, h: n };
  }

  function draw(ctx, id, x0, y0, scale, o) {
    o = o || {};
    if (SHEETS[id]) { if (sheet(id)) drawSheet(ctx, id, x0, y0, scale, o); return; } // 불러오는 중엔 비워 둔다
    var cell = CELL * scale;
    var s = build(id), pal = palette(id, o.dark), n = s.n;
    for (var y = 0; y < n; y++) {
      // 걷는 느낌: 홀수 프레임엔 아래 두 줄을 한 칸 옆으로
      var shift = o.frame && y >= n - 3 ? (o.flip ? -1 : 1) : 0;
      for (var x = 0; x < n; x++) {
        var v = s.g[y][o.flip ? n - 1 - x : x];
        if (!v) continue;
        ctx.fillStyle = o.silhouette ? (v === 9 ? '#0d0f14' : '#2a3040') : pal[v];
        ctx.fillRect(x0 + (x + shift) * cell, y0 + y * cell, cell, cell);
      }
    }
  }

  function drawSheet(ctx, id, x0, y0, scale, o) {
    var S = SHEETS[id], f = frameOf(id, o.anim, o.frame, o.index);
    var src = o.silhouette ? tint(id, 'sil') : o.dark ? tint(id, 'dark') : sheet(id);
    var w = S.w * scale, h = S.h * scale;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (o.flip) {
      ctx.translate(x0 + w, y0); ctx.scale(-1, 1);
      ctx.drawImage(src, f * S.w, 0, S.w, S.h, 0, 0, w, h);
    } else {
      ctx.drawImage(src, f * S.w, 0, S.w, S.h, x0, y0, w, h);
    }
    ctx.restore();
  }

  /* 디지타마: sprites/egg_<라인>.png (8프레임: 흔들기 0-1 · 금 가기 2-6 · 깨짐 7)
   * frame 을 주면 그 프레임, 아니면 흔들기 두 장을 번갈아 그린다. */
  function egg(ctx, lineId, x0, y0, scale, frame) {
    var id = 'egg_' + lineId;
    draw(ctx, id, x0, y0, scale, frame == null ? { anim: 'idle', frame: 0 } : { index: frame });
  }

  // 정사각 캔버스 가운데 바닥에 맞춰 그린다
  function canvas(id, px, o) {
    var m = measure(id), c = document.createElement('canvas');
    c.width = c.height = Math.max(m.w, m.h);
    draw(c.getContext('2d'), id, Math.floor((c.width - m.w) / 2), c.height - m.h, 1, o);
    return c;
  }

  return { measure: measure, draw: draw, egg: egg, canvas: canvas, onload: onload, has: has, ANIM: ANIM };
})(typeof DigiData !== 'undefined' ? DigiData : require('./data.js'),
   typeof SHEETS !== 'undefined' ? SHEETS : require('./sheets.js'));

if (typeof module !== 'undefined' && module.exports) module.exports = Sprite;
