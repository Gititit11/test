/* 도트 디지몬 그리기
 *
 * 공식 그림은 저작권이 있어서 쓰지 않는다. 대신 종 id 를 씨앗으로 좌우 대칭 도트
 * 몬스터를 만든다. 같은 종은 늘 같은 모양이고, 단계가 오를수록 커진다.
 *
 *   Sprite.draw(ctx, id, x, y, cell, { flip, dark, silhouette, frame })
 *   Sprite.size(id)  → 한 변의 칸 수 (테두리 포함)
 *   Sprite.egg(ctx, lineId, x, y, cell, wobble)
 *   Sprite.canvas(id, px, opts) → 도감·아이콘용 작은 캔버스
 */
var Sprite = (function (D) {
  'use strict';

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

  function size(id) { return build(id).n; }

  function draw(ctx, id, x0, y0, cell, o) {
    o = o || {};
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

  var EGG = [
    '..XXXX..', '.XAAAAX.', 'XAABBAAX', 'XABBBBAX', 'XAABBAAX',
    'XAAAAAAX', 'XABAABAX', 'XAAAAAAX', '.XAAAAX.', '..XXXX..'
  ];
  function egg(ctx, lineId, x0, y0, cell, wobble) {
    var L = D.LINES[lineId], c = hex(D.SPECIES[L.child].color);
    var pal = { X: OUTLINE, A: rgb(mix(c, [255, 255, 255], 0.55)), B: rgb(c) };
    EGG.forEach(function (row, y) {
      var dx = wobble && y < 5 ? wobble : 0;
      for (var x = 0; x < row.length; x++) {
        var ch = row[x];
        if (ch === '.') continue;
        ctx.fillStyle = pal[ch];
        ctx.fillRect(x0 + (x + dx) * cell, y0 + y * cell, cell, cell);
      }
    });
  }

  function canvas(id, px, o) {
    var n = size(id), cell = Math.max(1, Math.floor(px / n));
    var c = document.createElement('canvas');
    c.width = c.height = n * cell;
    draw(c.getContext('2d'), id, 0, 0, cell, o);
    return c;
  }

  return { draw: draw, size: size, egg: egg, canvas: canvas };
})(typeof DigiData !== 'undefined' ? DigiData : require('./data.js'));

if (typeof module !== 'undefined' && module.exports) module.exports = Sprite;
