/* 스캔메이트 화면 흐름
 *
 *   홈(모은 페이지) ─촬영/앨범→ 모서리 맞추기 ─다음→ 보정(필터·회전) ─완료→ 홈
 *                                                        └ PDF 만들기 → 내려받기/공유
 *
 * 페이지는 메모리에만 둔다. 문서 사진은 개인정보일 때가 많아서 기기에 남기지 않는다.
 * 대신 페이지가 있는 채로 나가려 하면 브라우저가 한 번 물어보게 한다.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var MAX_SRC = 2400; // 원본 사진 긴 변 (이보다 크면 줄여서 다룬다)

  /* page = { src, quad, filter, rot, warped, filtered, out, thumb } */
  var pages = [];
  var draft = null;       // 지금 손보는 페이지 (index < 0 이면 새 페이지)
  var openScreen = null;  // 'crop' | 'edit' | 'pdf'

  /* ---------- 공통 ---------- */
  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function busy(text) {
    $('busyText').textContent = text || '처리 중…';
    $('busy').hidden = !text;
  }
  // 무거운 계산 전에 진행 표시가 먼저 그려지도록 한 박자 쉰다
  function paint() {
    return new Promise(function (r) { requestAnimationFrame(function () { setTimeout(r, 0); }); });
  }
  function work(text, fn) {
    busy(text);
    return paint().then(fn).catch(function (e) {
      console.error(e); toast(e && e.message ? e.message : '처리하지 못했어요');
    }).then(function (v) { busy(null); return v; });
  }

  function process(p) {
    if (!p.warped) { p.warped = Scan.warp(p.src, p.quad, MAX_SRC); p.filtered = null; }
    if (!p.filtered) p.filtered = Scan.filter(p.warped, p.filter);
    p.out = Scan.rotate(p.filtered, p.rot);
  }

  function makeThumb(p) {
    var s = Math.min(1, 360 / Math.max(p.out.width, p.out.height));
    var c = Scan.makeCanvas(Math.round(p.out.width * s), Math.round(p.out.height * s));
    var x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(p.out, 0, 0, c.width, c.height);
    p.thumb = c.toDataURL('image/jpeg', 0.8);
  }

  function newDraft(src) {
    var q = Scan.detect(src);
    return { src: src, quad: q || Scan.defaultQuad(src.width, src.height), found: !!q,
             filter: 'color', rot: 0, index: -1 };
  }

  /* ---------- 화면 전환 (안드로이드 뒤로가기로 닫히게 history 를 쓴다) ---------- */
  function show(name) {
    ['crop', 'edit', 'pdf'].forEach(function (s) { $(s).hidden = s !== name; });
    if (!openScreen) history.pushState({ scr: name }, '');
    else history.replaceState({ scr: name }, '');
    openScreen = name;
    if (name === 'crop') layoutCrop();
    if (name === 'edit') drawEdit();
  }
  function closeScreen() { if (openScreen) history.back(); }
  window.addEventListener('popstate', function () {
    if (!openScreen) return;
    ['crop', 'edit', 'pdf'].forEach(function (s) { $(s).hidden = true; });
    openScreen = null; draft = null;
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) {
    b.addEventListener('click', function () {
      // 보정 화면에서 '다시 자르기'로 들어온 경우엔 취소하면 보정 화면으로 돌아간다
      if (openScreen === 'crop' && draft && draft.prevQuad) {
        draft.quad = draft.prevQuad; draft.prevQuad = null;
        show('edit');
        return;
      }
      closeScreen();
    });
  });

  /* ---------- 홈 ---------- */
  function renderHome() {
    var ol = $('pages');
    ol.innerHTML = '';
    pages.forEach(function (p, i) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.className = 'thumb'; b.type = 'button';
      b.setAttribute('aria-label', (i + 1) + '페이지 고치기');
      var img = document.createElement('img');
      img.src = p.thumb; img.alt = '';
      b.appendChild(img);
      b.addEventListener('click', function () { openEdit(i); });
      var no = document.createElement('span');
      no.className = 'no'; no.textContent = i + 1;
      li.appendChild(b); li.appendChild(no);
      ol.appendChild(li);
    });
    $('empty').hidden = pages.length > 0;
    $('count').textContent = pages.length ? pages.length + '페이지' : '';
    $('toPdf').disabled = !pages.length;
    $('clearAll').hidden = !pages.length;
  }

  function openEdit(i) {
    var p = pages[i];
    draft = { src: p.src, quad: p.quad, filter: p.filter, rot: p.rot, warped: p.warped,
              filtered: p.filtered, out: p.out, thumb: p.thumb, index: i };
    show('edit');
  }

  function takeFiles(files) {
    files = Array.prototype.slice.call(files || []);
    if (!files.length) return;
    if (files.length === 1) {
      work('사진 여는 중…', function () {
        return Scan.load(files[0], MAX_SRC).then(function (src) {
          draft = newDraft(src);
          show('crop');
          if (!draft.found) toast('테두리를 못 찾았어요. 모서리를 직접 맞춰 주세요');
        });
      });
      return;
    }
    // 여러 장은 자동으로 잘라 바로 넣는다. 눌러서 하나씩 고칠 수 있다.
    var done = 0, missed = 0;
    busy('0 / ' + files.length);
    files.reduce(function (chain, f) {
      return chain.then(paint).then(function () {
        return Scan.load(f, MAX_SRC).then(function (src) {
          var p = newDraft(src);
          if (!p.found) missed++;
          process(p); makeThumb(p);
          delete p.index; delete p.found;
          pages.push(p);
        }).catch(function () { missed++; });
      }).then(function () { busy(++done + ' / ' + files.length); });
    }, Promise.resolve()).then(function () {
      busy(null); renderHome();
      toast(missed ? missed + '장은 테두리를 못 찾았어요. 눌러서 고쳐 주세요'
                   : files.length + '장을 넣었어요. 눌러서 고칠 수 있어요');
    });
  }

  $('camIn').addEventListener('change', function (e) { takeFiles(e.target.files); e.target.value = ''; });
  $('galIn').addEventListener('change', function (e) { takeFiles(e.target.files); e.target.value = ''; });
  $('clearAll').addEventListener('click', function () {
    if (!confirm('모은 페이지를 모두 지울까요?')) return;
    pages = []; renderHome();
  });

  /* ---------- 모서리 맞추기 ---------- */
  var cv = $('cropCanvas'), cx = cv.getContext('2d'), loupe = $('loupe'), lx = loupe.getContext('2d');
  var view = { k: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };
  var drag = null; // { h: 손잡이 번호, off: [dx,dy], last: 원본 좌표 }

  function layoutCrop() {
    if (!draft) return;
    var r = $('cropStage').getBoundingClientRect(), dpr = window.devicePixelRatio || 1, pad = 28;
    view.w = r.width; view.h = r.height; view.dpr = dpr;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    var W = draft.src.width, H = draft.src.height;
    view.k = Math.min((r.width - pad * 2) / W, (r.height - pad * 2) / H);
    view.ox = (r.width - W * view.k) / 2; view.oy = (r.height - H * view.k) / 2;
    loupe.width = loupe.height = Math.round(120 * dpr);
    drawCrop();
  }

  function toScreen(p) { return [view.ox + p[0] * view.k, view.oy + p[1] * view.k]; }
  function handles() {
    var q = draft.quad, hs = q.map(toScreen);
    for (var i = 0; i < 4; i++) {
      var a = hs[i], b = hs[(i + 1) % 4];
      hs.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); // 4~7: 변 가운데 (변째로 옮기기)
    }
    return hs;
  }

  function drawCrop() {
    var d = view.dpr, q = draft.quad.map(toScreen);
    cx.setTransform(d, 0, 0, d, 0, 0);
    cx.clearRect(0, 0, view.w, view.h);
    cx.drawImage(draft.src, view.ox, view.oy, draft.src.width * view.k, draft.src.height * view.k);

    cx.beginPath();
    cx.rect(0, 0, view.w, view.h);
    cx.moveTo(q[0][0], q[0][1]);
    for (var i = 1; i < 4; i++) cx.lineTo(q[i][0], q[i][1]);
    cx.closePath();
    cx.fillStyle = 'rgba(0,0,0,0.55)';
    cx.fill('evenodd');

    cx.beginPath();
    cx.moveTo(q[0][0], q[0][1]);
    for (i = 1; i < 4; i++) cx.lineTo(q[i][0], q[i][1]);
    cx.closePath();
    cx.lineWidth = 2; cx.strokeStyle = '#2fd4a7'; cx.stroke();

    var hs = handles();
    hs.forEach(function (p, j) {
      var on = drag && drag.h === j;
      cx.beginPath();
      if (j < 4) cx.arc(p[0], p[1], on ? 15 : 12, 0, Math.PI * 2);
      else cx.arc(p[0], p[1], on ? 9 : 7, 0, Math.PI * 2);
      cx.fillStyle = on ? 'rgba(47,212,167,0.5)' : 'rgba(47,212,167,0.22)';
      cx.fill();
      cx.lineWidth = 2; cx.strokeStyle = '#2fd4a7'; cx.stroke();
    });
  }

  function drawLoupe(sp) {
    var z = 3, size = 120, d = view.dpr;
    var src = [(sp[0] - view.ox) / view.k, (sp[1] - view.oy) / view.k];
    var span = size / (view.k * z); // 확대경에 들어갈 원본 픽셀 폭
    lx.setTransform(1, 0, 0, 1, 0, 0);
    lx.fillStyle = '#000'; lx.fillRect(0, 0, loupe.width, loupe.height);
    lx.imageSmoothingEnabled = true;
    lx.drawImage(draft.src, src[0] - span / 2, src[1] - span / 2, span, span, 0, 0, loupe.width, loupe.height);
    lx.setTransform(d, 0, 0, d, 0, 0);
    lx.strokeStyle = '#2fd4a7'; lx.lineWidth = 1.5;
    lx.beginPath();
    lx.moveTo(size / 2 - 14, size / 2); lx.lineTo(size / 2 + 14, size / 2);
    lx.moveTo(size / 2, size / 2 - 14); lx.lineTo(size / 2, size / 2 + 14);
    lx.stroke();
    loupe.classList.toggle('right', sp[0] < 160 && sp[1] < 160);
    loupe.hidden = false;
  }

  function local(e) {
    var r = cv.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  function clampSrc(p) {
    return [Math.min(draft.src.width, Math.max(0, p[0])), Math.min(draft.src.height, Math.max(0, p[1]))];
  }

  cv.addEventListener('pointerdown', function (e) {
    if (!draft) return;
    var p = local(e), hs = handles(), best = -1, bd = 44;
    hs.forEach(function (h, i) {
      var dd = Math.hypot(h[0] - p[0], h[1] - p[1]) + (i >= 4 ? 6 : 0); // 겹치면 모서리 우선
      if (dd < bd) { bd = dd; best = i; }
    });
    if (best < 0) return;
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    drag = { h: best, off: [hs[best][0] - p[0], hs[best][1] - p[1]],
             last: [(p[0] - view.ox) / view.k, (p[1] - view.oy) / view.k] };
    if (best < 4) drawLoupe(hs[best]);
    drawCrop();
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var p = local(e), sp = [p[0] + drag.off[0], p[1] + drag.off[1]];
    var q = draft.quad.map(function (c) { return c.slice(); });
    if (drag.h < 4) {
      q[drag.h] = clampSrc([(sp[0] - view.ox) / view.k, (sp[1] - view.oy) / view.k]);
      drawLoupe(toScreen(q[drag.h]));
    } else {
      var now = [(p[0] - view.ox) / view.k, (p[1] - view.oy) / view.k];
      var dx = now[0] - drag.last[0], dy = now[1] - drag.last[1], a = drag.h - 4, b = (a + 1) % 4;
      q[a] = clampSrc([q[a][0] + dx, q[a][1] + dy]);
      q[b] = clampSrc([q[b][0] + dx, q[b][1] + dy]);
      drag.last = now;
    }
    draft.quad = q;
    drawCrop();
  });
  function endDrag() { if (!drag) return; drag = null; loupe.hidden = true; drawCrop(); }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', function () { if (openScreen === 'crop') layoutCrop(); if (openScreen === 'edit') drawEdit(); });

  $('cropAuto').addEventListener('click', function () {
    var q = Scan.detect(draft.src);
    if (q) { draft.quad = q; drawCrop(); toast('문서 테두리를 찾았어요'); }
    else toast('테두리를 못 찾았어요. 모서리를 직접 맞춰 주세요');
  });
  $('cropFull').addEventListener('click', function () {
    var W = draft.src.width, H = draft.src.height;
    draft.quad = [[0, 0], [W, 0], [W, H], [0, H]];
    drawCrop();
  });
  $('cropNext').addEventListener('click', function () {
    var q = draft.quad;
    if (!Scan.isConvex(q)) q = Scan.orderCorners(q);
    if (!Scan.isConvex(q) || Scan.polyArea(q) < 400) { toast('모서리가 꼬였어요. 다시 맞춰 주세요'); return; }
    draft.quad = q; draft.warped = null; draft.prevQuad = null;
    work('반듯하게 펴는 중…', function () { process(draft); show('edit'); });
  });

  /* ---------- 보정 ---------- */
  var ec = $('editCanvas');
  function drawEdit() {
    if (!draft || !draft.out) return;
    var stage = ec.parentNode.getBoundingClientRect(), o = draft.out, dpr = window.devicePixelRatio || 1;
    var s = Math.min((stage.width - 24) / o.width, (stage.height - 16) / o.height);
    var dw = Math.max(1, Math.floor(o.width * s)), dh = Math.max(1, Math.floor(o.height * s));
    ec.style.width = dw + 'px'; ec.style.height = dh + 'px';
    ec.width = Math.round(dw * dpr); ec.height = Math.round(dh * dpr);
    var x = ec.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(o, 0, 0, ec.width, ec.height);

    var isNew = draft.index < 0;
    $('editTitle').textContent = isNew ? '새 페이지' : (draft.index + 1) + ' / ' + pages.length + '페이지';
    $('editDelete').hidden = isNew;
    $('editLeft').hidden = $('editRight').hidden = isNew;
    $('editLeft').disabled = draft.index <= 0;
    $('editRight').disabled = draft.index >= pages.length - 1;
    Array.prototype.forEach.call($('filters').children, function (b) {
      b.classList.toggle('on', b.getAttribute('data-f') === draft.filter);
    });
  }

  $('filters').addEventListener('click', function (e) {
    var f = e.target.getAttribute && e.target.getAttribute('data-f');
    if (!f || !draft || f === draft.filter) return;
    draft.filter = f; draft.filtered = null;
    work('적용 중…', function () { process(draft); drawEdit(); });
  });
  $('editRotate').addEventListener('click', function () {
    draft.rot = (draft.rot + 1) % 4;
    process(draft); drawEdit();
  });
  $('editRecrop').addEventListener('click', function () {
    draft.prevQuad = draft.quad;
    show('crop');
  });
  function move(by) {
    var i = draft.index, j = i + by;
    if (j < 0 || j >= pages.length) return;
    var t = pages[i]; pages[i] = pages[j]; pages[j] = t;
    draft.index = j;
    renderHome(); drawEdit();
  }
  $('editLeft').addEventListener('click', function () { move(-1); });
  $('editRight').addEventListener('click', function () { move(1); });
  $('editDelete').addEventListener('click', function () {
    if (!confirm('이 페이지를 지울까요?')) return;
    pages.splice(draft.index, 1);
    renderHome(); closeScreen();
  });
  $('editDone').addEventListener('click', function () {
    makeThumb(draft);
    var p = { src: draft.src, quad: draft.quad, filter: draft.filter, rot: draft.rot,
              warped: draft.warped, filtered: draft.filtered, out: draft.out, thumb: draft.thumb };
    var isNew = draft.index < 0;
    if (isNew) pages.push(p); else pages[draft.index] = p;
    renderHome(); closeScreen();
    if (isNew) toast(pages.length + '페이지째 넣었어요');
  });

  /* ---------- PDF ---------- */
  var pdfOpt = { size: 'a4', quality: 0.86 };
  function seg(id, key, parse) {
    $(id).addEventListener('click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-v');
      if (!v) return;
      pdfOpt[key] = parse ? parse(v) : v;
      Array.prototype.forEach.call($(id).children, function (b) { b.classList.toggle('on', b === e.target); });
    });
  }
  seg('pdfSize', 'size');
  seg('pdfQuality', 'quality', parseFloat);

  function stamp() {
    var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '_' + z(d.getHours()) + z(d.getMinutes());
  }
  function fileName() {
    var n = ($('pdfName').value || '').trim().replace(/[\\/:*?"<>|]+/g, '_') || ('scan_' + stamp());
    return /\.pdf$/i.test(n) ? n : n + '.pdf';
  }

  var canShareFiles = false;
  try {
    canShareFiles = !!(navigator.canShare &&
      navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] }));
  } catch (e) { }

  function optKey() { return pdfOpt.size + '|' + pdfOpt.quality; }

  $('toPdf').addEventListener('click', function () {
    ready = null; // 페이지가 바뀌었을 수 있다
    $('pdfName').value = 'scan_' + stamp();
    $('pdfInfo').textContent = pages.length + '페이지를 한 파일로 묶어요.';
    $('pdfShare').hidden = !canShareFiles;
    show('pdf');
  });

  function jpeg(canvas, q) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) {
        if (!b) return reject(new Error('이미지를 만들지 못했어요'));
        b.arrayBuffer().then(function (buf) { resolve(new Uint8Array(buf)); }, reject);
      }, 'image/jpeg', q);
    });
  }
  function buildPdf() {
    return pages.reduce(function (chain, p) {
      return chain.then(function (list) {
        return jpeg(p.out, pdfOpt.quality).then(function (bytes) {
          list.push({ jpeg: bytes, width: p.out.width, height: p.out.height });
          return list;
        });
      });
    }, Promise.resolve([])).then(function (list) { return Pdf.build(list, { size: pdfOpt.size }); });
  }
  function sizeText(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.ceil(n / 1024) + 'KB'; }

  $('pdfSave').addEventListener('click', function () {
    var name = fileName();
    work('PDF 만드는 중…', function () {
      return buildPdf().then(function (blob) {
        var url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        toast(name + ' (' + sizeText(blob.size) + ') 저장했어요');
      });
    });
  });
  // 공유 시트는 누른 직후에만 열 수 있다. PDF 를 만드는 사이 그 시간이 지나 버리면
  // 만들어 둔 파일을 들고 있다가, 한 번 더 눌렀을 때 곧바로 연다.
  var ready = null;
  function share(blob, name) {
    return navigator.share({ files: [new File([blob], name, { type: 'application/pdf' })], title: name });
  }
  $('pdfShare').addEventListener('click', function () {
    var name = fileName();
    if (ready && ready.name === name && ready.key === optKey()) {
      share(ready.blob, name).catch(function (e) {
        if (!e || e.name !== 'AbortError') toast('공유하지 못했어요. 내려받기를 써 주세요');
      });
      return;
    }
    work('PDF 만드는 중…', function () {
      return buildPdf().then(function (blob) {
        ready = { blob: blob, name: name, key: optKey() };
        return share(blob, name).catch(function (e) {
          if (e && e.name === 'AbortError') return;
          if (e && e.name === 'NotAllowedError') { toast('PDF 를 준비했어요. 공유하기를 한 번 더 눌러 주세요'); return; }
          throw new Error('공유하지 못했어요. 내려받기를 써 주세요');
        });
      });
    });
  });

  /* ---------- 마무리 ---------- */
  window.addEventListener('beforeunload', function (e) {
    if (!pages.length) return;
    e.preventDefault(); e.returnValue = '';
  });

  renderHome();

  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('sw.js').catch(function () { });
  }
})();
