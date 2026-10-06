/* 문서 사진 → 스캔본 이미지 처리.
 *
 * 외부 라이브러리 없이 캔버스 픽셀만 다룬다. 오프라인에서도 돌아야 하고,
 * OpenCV.js 같은 걸 들이면 앱보다 라이브러리가 몇십 배 무거워진다.
 *
 *   detect(canvas)          → 문서 네 모서리 [좌상, 우상, 우하, 좌하] (못 찾으면 null)
 *   warp(canvas, quad, max) → 모서리를 펴서 반듯한 직사각형으로
 *   filter(canvas, mode)    → 'original' | 'color' | 'gray' | 'bw'
 *   rotate(canvas, quarter) → 90° 단위 회전
 */
var Scan = (function () {
  'use strict';

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function ctx2d(c) { return c.getContext('2d', { willReadFrequently: true }); }

  function luminance(data, n) {
    var g = new Float32Array(n);
    for (var i = 0, j = 0; i < n; i++, j += 4) {
      g[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
    }
    return g;
  }

  // 가로·세로로 나눠 하는 상자 흐림. 가장자리는 끝 픽셀을 늘려 쓴다.
  function boxBlur(src, w, h, r) {
    var tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    var d = 2 * r + 1, x, y, k, acc;
    for (y = 0; y < h; y++) {
      var row = y * w;
      acc = 0;
      for (k = -r; k <= r; k++) acc += src[row + Math.min(Math.max(k, 0), w - 1)];
      for (x = 0; x < w; x++) {
        tmp[row + x] = acc / d;
        acc += src[row + Math.min(x + r + 1, w - 1)] - src[row + Math.max(x - r, 0)];
      }
    }
    for (x = 0; x < w; x++) {
      acc = 0;
      for (k = -r; k <= r; k++) acc += tmp[Math.min(Math.max(k, 0), h - 1) * w + x];
      for (y = 0; y < h; y++) {
        out[y * w + x] = acc / d;
        acc += tmp[Math.min(y + r + 1, h - 1) * w + x] - tmp[Math.max(y - r, 0) * w + x];
      }
    }
    return out;
  }

  // 최댓값 필터 — 종이 바탕을 추정할 때 글씨(어두운 점)를 지우는 용도
  function maxFilter(src, w, h, r) {
    var tmp = new Float32Array(w * h), out = new Float32Array(w * h), x, y, k, m;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        m = 0;
        for (k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) {
          if (src[y * w + k] > m) m = src[y * w + k];
        }
        tmp[y * w + x] = m;
      }
    }
    for (x = 0; x < w; x++) {
      for (y = 0; y < h; y++) {
        m = 0;
        for (k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) {
          if (tmp[k * w + x] > m) m = tmp[k * w + x];
        }
        out[y * w + x] = m;
      }
    }
    return out;
  }

  function otsu(g) {
    var hist = new Float64Array(256), n = g.length, i;
    for (i = 0; i < n; i++) hist[Math.min(255, g[i] | 0)]++;
    var sum = 0;
    for (i = 0; i < 256; i++) sum += i * hist[i];
    var sumB = 0, wB = 0, best = 0, t = 127;
    for (i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      var wF = n - wB;
      if (!wF) break;
      sumB += i * hist[i];
      var mB = sumB / wB, mF = (sum - sumB) / wF;
      var between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; t = i; }
    }
    return t;
  }

  // 윤곽선 지도: 소벨 세기 상위 몇 %를 선으로 보고 한 칸 두껍게 해서 틈을 메운다.
  function edgeMask(g, w, h) {
    var mag = new Float32Array(w * h), hist = new Uint32Array(1024), x, y, i;
    for (y = 1; y < h - 1; y++) {
      for (x = 1; x < w - 1; x++) {
        i = y * w + x;
        var gx = g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1];
        var gy = g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1];
        var m = Math.abs(gx) + Math.abs(gy);
        mag[i] = m;
        hist[Math.min(1023, m | 0)]++;
      }
    }
    var target = w * h * 0.88, acc = 0, t = 0;
    for (t = 0; t < 1024; t++) { acc += hist[t]; if (acc >= target) break; }
    t = Math.max(t, 36);
    var mask = new Uint8Array(w * h);
    for (y = 1; y < h - 1; y++) {
      for (x = 1; x < w - 1; x++) {
        if (mag[y * w + x] <= t) continue;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) mask[(y + dy) * w + x + dx] = 1;
        }
      }
    }
    return mask;
  }

  function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }

  function convexHull(pts) {
    pts.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var lower = [], upper = [], i;
    for (i = 0; i < pts.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) lower.pop();
      lower.push(pts[i]);
    }
    for (i = pts.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) upper.pop();
      upper.push(pts[i]);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);
  }

  function triArea(a, b, c) { return Math.abs(cross(a, b, c)) / 2; }

  function polyArea(p) {
    var s = 0;
    for (var i = 0; i < p.length; i++) {
      var a = p[i], b = p[(i + 1) % p.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  }

  // 볼록 껍질 안에 들어가는 가장 넓은 사각형. 대각선 (i,k) 를 정하면
  // 양쪽 꼭짓점은 서로 독립이라 O(n³) 로 충분하다.
  function maxQuad(hull) {
    var n = hull.length;
    if (n < 4) return null;
    var best = -1, quad = null, i, j, k, l;
    for (i = 0; i < n; i++) {
      for (k = i + 2; k < n; k++) {
        if (i === 0 && k === n - 1) continue;
        var bj = -1, ba = -1, bl = -1, bb = -1, a;
        for (j = i + 1; j < k; j++) {
          a = triArea(hull[i], hull[j], hull[k]);
          if (a > ba) { ba = a; bj = j; }
        }
        for (l = k + 1; l < n + i; l++) {
          a = triArea(hull[i], hull[k], hull[l % n]);
          if (a > bb) { bb = a; bl = l % n; }
        }
        if (bj < 0 || bl < 0) continue;
        if (ba + bb > best) { best = ba + bb; quad = [hull[i], hull[bj], hull[k], hull[bl]]; }
      }
    }
    return quad && { quad: quad, area: best };
  }

  // 막는 픽셀(barrier)을 두고 화면 테두리에서 물을 부었을 때 물이 닿지 않는
  // 영역 중 가장 큰 덩어리를 문서 후보로 본다. 글씨 같은 안쪽 구멍은 저절로 메워진다.
  function bestRegion(barrier, w, h) {
    var n = w * h, reached = new Uint8Array(n), stack = new Int32Array(n), sp = 0, i, x, y;
    function seed(p) { if (!barrier[p] && !reached[p]) { reached[p] = 1; stack[sp++] = p; } }
    for (x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (sp) {
      i = stack[--sp]; x = i % w;
      if (x > 0) seed(i - 1);
      if (x < w - 1) seed(i + 1);
      if (i >= w) seed(i - w);
      if (i < n - w) seed(i + w);
    }

    var label = new Int32Array(n), cur = 0, bestLabel = 0, bestArea = 0;
    for (var s = 0; s < n; s++) {
      if (reached[s] || label[s]) continue;
      cur++;
      var area = 0;
      label[s] = cur; stack[sp++] = s;
      while (sp) {
        i = stack[--sp]; area++; x = i % w;
        var nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < n - w ? i + w : -1];
        for (var q = 0; q < 4; q++) {
          var p = nb[q];
          if (p >= 0 && !reached[p] && !label[p]) { label[p] = cur; stack[sp++] = p; }
        }
      }
      if (area > bestArea) { bestArea = area; bestLabel = cur; }
    }
    if (!bestLabel) return null;

    // 줄마다 양 끝 점만 모아도 볼록 껍질은 같다
    var pts = [];
    for (y = 0; y < h; y++) {
      var lo = -1, hi = -1;
      for (x = 0; x < w; x++) {
        if (label[y * w + x] === bestLabel) { if (lo < 0) lo = x; hi = x; }
      }
      if (lo >= 0) { pts.push([lo, y]); pts.push([hi + 1, y]); pts.push([lo, y + 1]); pts.push([hi + 1, y + 1]); }
    }
    var hull = convexHull(pts);
    if (hull.length > 120) {
      var step = hull.length / 120, thin = [];
      for (var t = 0; t < 120; t++) thin.push(hull[Math.floor(t * step)]);
      hull = thin;
    }
    var mq = maxQuad(hull);
    if (!mq || mq.area <= 0) return null;

    var frac = bestArea / n;
    var fit = bestArea / mq.area; // 사각형에 가까우면 1 근처
    if (frac < 0.2 || frac > 0.985 || fit < 0.85 || fit > 1.2) return null;
    return { quad: mq.quad, score: frac * (1 - Math.abs(1 - fit) * 3) };
  }

  // 시계 방향 [좌상, 우상, 우하, 좌하] 로 정렬
  function orderCorners(q) {
    var cx = 0, cy = 0;
    q.forEach(function (p) { cx += p[0] / 4; cy += p[1] / 4; });
    var s = q.slice().sort(function (a, b) {
      return Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx);
    });
    var start = 0;
    for (var i = 1; i < 4; i++) {
      if (s[i][0] + s[i][1] < s[start][0] + s[start][1]) start = i;
    }
    return s.slice(start).concat(s.slice(0, start)).map(function (p) { return [p[0], p[1]]; });
  }

  function isConvex(q) {
    var sign = 0;
    for (var i = 0; i < 4; i++) {
      var c = cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4]);
      if (Math.abs(c) < 1e-6) return false;
      if (!sign) sign = Math.sign(c);
      else if (Math.sign(c) !== sign) return false;
    }
    return true;
  }

  function detect(canvas) {
    var W = canvas.width, H = canvas.height;
    var s = Math.min(1, 360 / Math.max(W, H));
    var w = Math.max(16, Math.round(W * s)), h = Math.max(16, Math.round(H * s));
    var c = makeCanvas(w, h), cx = ctx2d(c);
    cx.drawImage(canvas, 0, 0, w, h);
    var g = boxBlur(luminance(cx.getImageData(0, 0, w, h).data, w * h), w, h, 1);

    var cands = [];
    var t = otsu(g), bright = new Uint8Array(w * h);
    for (var i = 0; i < g.length; i++) bright[i] = g[i] > t ? 1 : 0;
    cands.push(bestRegion(bright, w, h));       // 밝은 종이 + 어두운 바닥
    cands.push(bestRegion(edgeMask(g, w, h), w, h)); // 테두리 선이 보이는 경우

    var best = null;
    cands.forEach(function (cd) { if (cd && (!best || cd.score > best.score)) best = cd; });
    if (!best) return null;
    // 경계 픽셀까지 덩어리에 들어가서 실제 종이보다 살짝 크다. 1.5칸만큼 안으로 당긴다.
    var q = orderCorners(best.quad), cxm = 0, cym = 0;
    q.forEach(function (p) { cxm += p[0] / 4; cym += p[1] / 4; });
    var sx = W / w, sy = H / h;
    return q.map(function (p) {
      var dx = cxm - p[0], dy = cym - p[1], len = Math.hypot(dx, dy) || 1, k = Math.min(1, 2.1 / len);
      var x = (p[0] + dx * k) * sx, y = (p[1] + dy * k) * sy;
      return [Math.min(W, Math.max(0, x)), Math.min(H, Math.max(0, y))];
    });
  }

  // 사각형 전체에서 안쪽으로 살짝 들어온 기본 선택
  function defaultQuad(W, H) {
    var m = 0.06;
    return [[W * m, H * m], [W * (1 - m), H * m], [W * (1 - m), H * (1 - m)], [W * m, H * (1 - m)]];
  }

  // 출력 좌표 (u,v) → 원본 좌표 (x,y) 투영 변환 계수
  function homography(from, to) {
    var A = [], b = [], i;
    for (i = 0; i < 4; i++) {
      var u = from[i][0], v = from[i][1], x = to[i][0], y = to[i][1];
      A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
      A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
    }
    // 가우스 소거 (부분 피벗)
    for (var col = 0; col < 8; col++) {
      var piv = col;
      for (i = col + 1; i < 8; i++) if (Math.abs(A[i][col]) > Math.abs(A[piv][col])) piv = i;
      var tr = A[col]; A[col] = A[piv]; A[piv] = tr;
      var tb = b[col]; b[col] = b[piv]; b[piv] = tb;
      for (i = col + 1; i < 8; i++) {
        var f = A[i][col] / A[col][col];
        for (var k = col; k < 8; k++) A[i][k] -= f * A[col][k];
        b[i] -= f * b[col];
      }
    }
    var h = new Array(8);
    for (i = 7; i >= 0; i--) {
      var sum = b[i];
      for (var j = i + 1; j < 8; j++) sum -= A[i][j] * h[j];
      h[i] = sum / A[i][i];
    }
    return h;
  }

  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

  // 비스듬히 찍힌 사각형의 실제 가로:세로 비율.
  // Zhang & He, "Whiteboard scanning and image enhancement" (2007) 의 방법으로,
  // 주점이 사진 한가운데라고 두고 초점거리를 함께 추정한다. 거의 정면이거나
  // 추정값이 말이 안 되면 null (그때는 변 길이로 대충 정한다).
  function trueAspect(q, W, H) {
    var u0 = W / 2, v0 = H / 2;
    function hv(p) { return [p[0] - u0, p[1] - v0, 1]; }
    function cr(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    var m1 = hv(q[0]), m2 = hv(q[1]), m3 = hv(q[3]), m4 = hv(q[2]); // 좌상, 우상, 좌하, 우하
    var c14 = cr(m1, m4);
    var k2 = dot(c14, m3) / dot(cr(m2, m4), m3);
    var k3 = dot(c14, m2) / dot(cr(m3, m4), m2);
    var n2 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]];
    var n3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];
    if (Math.abs(n2[2]) < 1e-4 || Math.abs(n3[2]) < 1e-4) return null; // 거의 정면
    var f2 = -(n2[0] * n3[0] + n2[1] * n3[1]) / (n2[2] * n3[2]);
    var diag = Math.hypot(W, H);
    if (!(f2 > 0) || Math.sqrt(f2) < diag * 0.3 || Math.sqrt(f2) > diag * 6) return null;
    var r = Math.sqrt((n2[0] * n2[0] + n2[1] * n2[1] + f2 * n2[2] * n2[2]) /
                      (n3[0] * n3[0] + n3[1] * n3[1] + f2 * n3[2] * n3[2]));
    return isFinite(r) && r > 0.1 && r < 10 ? r : null;
  }

  function warp(src, quad, maxSide) {
    var q = quad;
    var ow = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
    var oh = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
    var r = trueAspect(q, src.width, src.height);
    if (r) { if (ow / oh > r) oh = ow / r; else ow = oh * r; } // 줄이지 않고 짧은 쪽을 늘린다
    var sc = Math.min(1, (maxSide || 2400) / Math.max(ow, oh));
    var W = Math.max(1, Math.round(ow * sc)), H = Math.max(1, Math.round(oh * sc));
    var hm = homography([[0, 0], [W, 0], [W, H], [0, H]], q);

    var sw = src.width, sh = src.height;
    var sd = ctx2d(src).getImageData(0, 0, sw, sh).data;
    var out = makeCanvas(W, H), oc = ctx2d(out), img = oc.createImageData(W, H), od = img.data;
    var a = hm[0], b = hm[1], c = hm[2], d = hm[3], e = hm[4], f = hm[5], g = hm[6], h = hm[7];
    var o = 0;
    for (var v = 0; v < H; v++) {
      var vv = v + 0.5;
      for (var u = 0; u < W; u++, o += 4) {
        var uu = u + 0.5;
        var den = g * uu + h * vv + 1;
        var x = (a * uu + b * vv + c) / den - 0.5;
        var y = (d * uu + e * vv + f) / den - 0.5;
        if (x < 0) x = 0; else if (x > sw - 1) x = sw - 1;
        if (y < 0) y = 0; else if (y > sh - 1) y = sh - 1;
        var x0 = x | 0, y0 = y | 0;
        var x1 = x0 < sw - 1 ? x0 + 1 : x0, y1 = y0 < sh - 1 ? y0 + 1 : y0;
        var fx = x - x0, fy = y - y0;
        var p00 = (y0 * sw + x0) * 4, p10 = (y0 * sw + x1) * 4, p01 = (y1 * sw + x0) * 4, p11 = (y1 * sw + x1) * 4;
        for (var ch = 0; ch < 3; ch++) {
          var top = sd[p00 + ch] + (sd[p10 + ch] - sd[p00 + ch]) * fx;
          var bot = sd[p01 + ch] + (sd[p11 + ch] - sd[p01 + ch]) * fx;
          od[o + ch] = top + (bot - top) * fy;
        }
        od[o + 3] = 255;
      }
    }
    oc.putImageData(img, 0, 0);
    return out;
  }

  // 종이 바탕 밝기 추정: 작게 줄이고 → 글씨 지우고(max) → 흐림.
  // 그림자나 조명 얼룩이 있어도 바탕을 하얗게 펼 수 있다.
  function background(L, w, h) {
    var bs = Math.max(4, Math.round(Math.max(w, h) / 160));
    var bw = Math.ceil(w / bs), bh = Math.ceil(h / bs);
    var small = new Float32Array(bw * bh), cnt = new Float32Array(bw * bh), x, y;
    for (y = 0; y < h; y++) {
      var sy = ((y / bs) | 0) * bw;
      for (x = 0; x < w; x++) {
        var k = sy + ((x / bs) | 0);
        small[k] += L[y * w + x]; cnt[k]++;
      }
    }
    for (var i = 0; i < small.length; i++) small[i] /= cnt[i];
    small = boxBlur(maxFilter(small, bw, bh, 3), bw, bh, 3);

    var bg = new Float32Array(w * h);
    for (y = 0; y < h; y++) {
      var gy = Math.min(bh - 1, Math.max(0, (y + 0.5) / bs - 0.5));
      var y0 = gy | 0, y1 = Math.min(bh - 1, y0 + 1), fy = gy - y0;
      for (x = 0; x < w; x++) {
        var gx = Math.min(bw - 1, Math.max(0, (x + 0.5) / bs - 0.5));
        var x0 = gx | 0, x1 = Math.min(bw - 1, x0 + 1), fx = gx - x0;
        var t = small[y0 * bw + x0] + (small[y0 * bw + x1] - small[y0 * bw + x0]) * fx;
        var b = small[y1 * bw + x0] + (small[y1 * bw + x1] - small[y1 * bw + x0]) * fx;
        bg[y * w + x] = Math.max(24, t + (b - t) * fy);
      }
    }
    return bg;
  }

  function curve(lo, hi, gamma) {
    var lut = new Uint8ClampedArray(256);
    for (var i = 0; i < 256; i++) {
      var t = Math.min(1, Math.max(0, (i - lo) / (hi - lo)));
      lut[i] = Math.round(Math.pow(t, gamma) * 255);
    }
    return lut;
  }

  function filter(src, mode) {
    var w = src.width, h = src.height, out = makeCanvas(w, h), oc = ctx2d(out);
    oc.drawImage(src, 0, 0);
    if (mode === 'original') return out;

    var img = oc.getImageData(0, 0, w, h), d = img.data, n = w * h;
    var L = luminance(d, n), bg = background(L, w, h), i, j, f, v;

    if (mode === 'color') {
      var lut = curve(28, 238, 1.15);
      for (i = 0, j = 0; i < n; i++, j += 4) {
        f = 255 / bg[i];
        d[j] = lut[Math.min(255, d[j] * f) | 0];
        d[j + 1] = lut[Math.min(255, d[j + 1] * f) | 0];
        d[j + 2] = lut[Math.min(255, d[j + 2] * f) | 0];
      }
    } else if (mode === 'gray') {
      var lg = curve(28, 238, 1.2);
      for (i = 0, j = 0; i < n; i++, j += 4) {
        v = lg[Math.min(255, L[i] * 255 / bg[i]) | 0];
        d[j] = d[j + 1] = d[j + 2] = v;
      }
    } else { // bw
      var lb = curve(150, 205, 1);
      for (i = 0, j = 0; i < n; i++, j += 4) {
        v = lb[Math.min(255, L[i] * 255 / bg[i]) | 0];
        d[j] = d[j + 1] = d[j + 2] = v;
      }
    }
    oc.putImageData(img, 0, 0);
    return out;
  }

  function rotate(src, quarter) {
    quarter = ((quarter % 4) + 4) % 4;
    if (!quarter) return src;
    var w = src.width, h = src.height, odd = quarter % 2 === 1;
    var out = makeCanvas(odd ? h : w, odd ? w : h), c = out.getContext('2d');
    c.translate(out.width / 2, out.height / 2);
    c.rotate(quarter * Math.PI / 2);
    c.drawImage(src, -w / 2, -h / 2);
    return out;
  }

  // 사진 파일 → 긴 변 maxSide 이하 캔버스. EXIF 회전은 <img> 가 알아서 반영한다.
  function load(file, maxSide) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var s = Math.min(1, (maxSide || 2400) / Math.max(img.naturalWidth, img.naturalHeight));
        var c = makeCanvas(Math.round(img.naturalWidth * s), Math.round(img.naturalHeight * s));
        var cx = c.getContext('2d');
        cx.imageSmoothingQuality = 'high';
        cx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('이미지를 열 수 없어요')); };
      img.src = url;
    });
  }

  return {
    load: load, detect: detect, defaultQuad: defaultQuad, orderCorners: orderCorners,
    isConvex: isConvex, warp: warp, filter: filter, rotate: rotate, makeCanvas: makeCanvas,
    polyArea: polyArea
  };
})();
