/* GymMate — 헬스 루틴 & 세트 체크 앱 */
(function () {
  'use strict';

  var S = window.Store;
  var DB = window.ExerciseDB;

  var APP_VERSION = '2026.08.28-26';

  var app = document.getElementById('app');
  var modalRoot = document.getElementById('modal');
  var toastRoot = document.getElementById('toast');

  // ── 유틸 ─────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ':' + pad(m) : m) + ':' + pad(s);
  }
  function fmtDur(ms) {
    var m = Math.round(ms / 60000);
    if (m < 60) return m + '분';
    return Math.floor(m / 60) + '시간 ' + (m % 60) + '분';
  }
  // 플랭크처럼 1~2분짜리는 분 단위로 자르면 변화가 안 보인다
  function fmtSec(sec) {
    sec = Math.round(sec);
    if (sec < 60) return sec + '초';
    var m = Math.floor(sec / 60), r = sec % 60;
    return m + '분' + (r ? ' ' + r + '초' : '');
  }
  function fmtDate(ts) {
    var d = new Date(ts);
    var days = ['일', '월', '화', '수', '목', '금', '토'];
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + days[d.getDay()] + ') ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function toast(msg) {
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    toastRoot.appendChild(el);
    setTimeout(function () { el.classList.add('out'); }, 1400);
    setTimeout(function () { el.remove(); }, 1800);
  }
  function num(v, fallback) {
    var n = parseFloat(v);
    return isNaN(n) ? (fallback || 0) : n;
  }

  // ── 라우터 ───────────────────────────────────────────
  var route = { name: 'routines', param: null };
  function parseHash() {
    var h = (location.hash || '#/routines').replace(/^#\/?/, '');
    var parts = h.split('/');
    return { name: parts[0] || 'routines', param: parts[1] || null };
  }
  function go(path) { location.hash = '#/' + path; }

  window.addEventListener('hashchange', function () {
    route = parseHash();
    closeModal();
    render();
  });

  // ── 휴식 타이머 ──────────────────────────────────────
  var REST_KEY = 'gymmate.rest';
  var rest = { remain: 0, total: 0, label: '', running: false, endsAt: 0 };
  var audioCtx = null;

  // 안드로이드에서 화면을 끄거나 앱을 전환하면 타이머 간격이 느려지므로
  // 남은 시간은 종료 시각(endsAt) 기준으로 계산한다.
  function saveRest() {
    try {
      if (rest.running) {
        localStorage.setItem(REST_KEY, JSON.stringify({
          endsAt: rest.endsAt, total: rest.total, label: rest.label
        }));
      } else {
        localStorage.removeItem(REST_KEY);
      }
    } catch (e) { /* 저장 실패는 무시 */ }
  }
  function restoreRest() {
    try {
      var raw = localStorage.getItem(REST_KEY);
      if (!raw) return;
      var r = JSON.parse(raw);
      if (r && r.endsAt > Date.now() && S.active()) {
        rest.endsAt = r.endsAt; rest.total = r.total; rest.label = r.label;
        rest.remain = Math.ceil((r.endsAt - Date.now()) / 1000);
        rest.running = true;
      } else {
        localStorage.removeItem(REST_KEY);
      }
    } catch (e) { /* 무시 */ }
  }

  // ── 휴식 종료 안내 음성 ──────────────────────────────
  // 동봉한 mp3 를 알림음과 같은 Web Audio 경로로 재생한다.
  // <audio> 로 재생하면 안드로이드가 음악을 아예 멈출 수 있다.
  var VOICES = [
    { id: 'ash',    label: 'Ash',    src: 'audio/ash.mp3' },
    { id: 'ivy',    label: 'Ivy',    src: 'audio/ivy.mp3' },
    { id: 'winter', label: 'Winter', src: 'audio/winter.mp3' }
  ];
  var voiceBuffers = {};

  function loadVoice(id) {
    if (voiceBuffers[id]) return Promise.resolve(voiceBuffers[id]);
    var v = VOICES.filter(function (x) { return x.id === id; })[0];
    if (!v) return Promise.resolve(null);
    unlockAudio();
    if (!audioCtx) return Promise.resolve(null);
    return fetch(v.src)
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (b) { return audioCtx.decodeAudioData(b); })
      .then(function (buf) { voiceBuffers[id] = buf; return buf; })
      .catch(function () { return null; });
  }

  function playVoice(id) {
    return loadVoice(id).then(function (buf) {
      if (!buf || !audioCtx) return false;
      try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        var src = audioCtx.createBufferSource();
        src.buffer = buf;
        src.connect(audioCtx.destination);
        src.start();
        return true;
      } catch (e) { return false; }
    });
  }

  function announceRestEnd() {
    beep();
    if (!S.settings.voice) return;
    // 알림음과 겹치지 않게 잠깐 뒤에 안내한다
    setTimeout(function () { playVoice(S.settings.voice); }, 600);
  }

  // 모바일 브라우저는 사용자 조작 이후에만 소리를 낼 수 있다
  function unlockAudio() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* 오디오 미지원 무시 */ }
  }
  document.addEventListener('pointerdown', function () {
    unlockAudio();
    if (S.settings.voice) loadVoice(S.settings.voice);
  }, { once: true });

  function beep() {
    if (!S.settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      [0, 0.18, 0.36].forEach(function (t) {
        var o = audioCtx.createOscillator();
        var g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, audioCtx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + t + 0.14);
        o.start(audioCtx.currentTime + t);
        o.stop(audioCtx.currentTime + t + 0.15);
      });
    } catch (e) { /* 오디오 미지원 무시 */ }
    try {
      if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
    } catch (e) { /* 진동 미지원 무시 */ }
  }

  function startRest(sec, label) {
    if (!sec) return;
    rest.total = sec;
    rest.remain = sec;
    rest.endsAt = Date.now() + sec * 1000;
    rest.label = label || '';
    rest.running = true;
    saveRest();
    drawRest();
  }
  function stopRest() {
    rest.running = false; rest.remain = 0; rest.endsAt = 0;
    saveRest();
    drawRest();
  }
  function tickRest(silent) {
    if (!rest.running) return;
    var left = Math.ceil((rest.endsAt - Date.now()) / 1000);
    rest.remain = Math.max(0, left);
    if (left <= 0) {
      rest.running = false;
      saveRest();
      if (!silent) { announceRestEnd(); toast('휴식 끝! 다음 세트 시작'); }
    }
    drawRest();
  }
  function adjustRest(delta) {
    if (!rest.running) return;
    rest.endsAt += delta * 1000;
    rest.total = Math.max(rest.total, Math.ceil((rest.endsAt - Date.now()) / 1000));
    saveRest();
    tickRest();
  }
  function drawRest() {
    var bar = document.getElementById('restbar');
    if (!bar) return;
    if (!rest.running) { bar.className = 'restbar'; bar.innerHTML = ''; return; }
    var pct = rest.total ? (rest.remain / rest.total) * 100 : 0;
    bar.className = 'restbar show';
    bar.innerHTML =
      '<div class="rest-fill" style="width:' + pct.toFixed(1) + '%"></div>' +
      '<div class="rest-inner">' +
        '<button class="rest-btn" data-act="rest-adj" data-v="-15">-15초</button>' +
        '<div class="rest-mid"><span class="rest-time">' + fmtClock(rest.remain) + '</span>' +
        '<span class="rest-label">휴식 · ' + esc(rest.label) + '</span></div>' +
        '<button class="rest-btn" data-act="rest-adj" data-v="15">+15초</button>' +
        '<button class="rest-btn ghost" data-act="rest-skip">건너뛰기</button>' +
      '</div>';
  }

  function tick() {
    tickRest();
    var el = document.querySelector('[data-tick="elapsed"]');
    var act = S.active();
    if (el && act) el.textContent = fmtClock((Date.now() - act.startedAt) / 1000);
  }
  setInterval(tick, 1000);

  // ── 화면 꺼짐 방지 (운동 중에만) ─────────────────────
  var wakeLock = null;
  function updateWakeLock() {
    if (!('wakeLock' in navigator)) return;
    var want = !!S.active();
    if (want && !wakeLock && document.visibilityState === 'visible') {
      navigator.wakeLock.request('screen').then(function (lock) {
        wakeLock = lock;
        lock.addEventListener('release', function () { wakeLock = null; });
      }).catch(function () { /* 미지원·거부 시 무시 */ });
    } else if (!want && wakeLock) {
      wakeLock.release().catch(function () {});
      wakeLock = null;
    }
  }

  // 앱으로 돌아왔을 때 타이머를 즉시 맞춘다
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    tick();
    updateWakeLock();
  });

  // ── 공통 UI 조각 ─────────────────────────────────────
  function header(title, right) {
    return '<header class="topbar"><h1>' + esc(title) + '</h1>' +
      '<div class="topbar-actions">' + (right || '') + '</div></header>';
  }
  function nav() {
    var items = [
      ['routines', '루틴', '📋'],
      ['progress', '성장', '📊'],
      ['history', '기록', '📈'],
      ['settings', '설정', '⚙️']
    ];
    return '<nav class="tabbar">' + items.map(function (it) {
      // 운동 진행 화면은 탭이 없다. 루틴에서 들어오므로 루틴을 켜 둔다
      var here = route.name === 'session' ? 'routines' : route.name;
      var on = here === it[0] ? ' on' : '';
      return '<a class="tab' + on + '" href="#/' + it[0] + '">' +
        '<span class="tab-ico">' + it[2] + '</span><span>' + it[1] + '</span></a>';
    }).join('') + '</nav>';
  }
  function badge(text, cls) { return '<span class="badge ' + (cls || '') + '">' + esc(text) + '</span>'; }

  var PREVIEW_MAX = 5;   // 루틴 카드에 이름으로 보여줄 운동 수. 나머지는 "+N"

  // 부위마다 파스텔 색을 하나씩 준다. 색은 눈에 띄라고 넣은 것이고,
  // 배지 글자가 곧 운동 이름이라 색을 구분 못 해도 잃는 정보는 없다.
  var PART_CLASS = {
    '가슴': 'pt-chest', '등': 'pt-back', '어깨': 'pt-shoulder', '팔': 'pt-arm',
    '하체': 'pt-leg', '코어': 'pt-core', '유산소': 'pt-cardio'
  };
  function partBadge(item) {
    return partBadgeOf(S.findExercise(item.exerciseId), item.name);
  }
  // 운동을 알면 부위 색을, 모르면 기본 배지를 준다
  function partBadgeOf(ex, text) {
    var label = text || (ex ? ex.part : '');
    var cls = ex && PART_CLASS[ex.part];
    if (!cls) return badge(label);
    return '<span class="badge ' + cls + '" title="' + esc(ex.part) + '">' + esc(label) + '</span>';
  }
  function empty(msg, sub) {
    return '<div class="empty"><div class="empty-ico">🗒️</div><p>' + esc(msg) + '</p>' +
      (sub ? '<p class="dim">' + esc(sub) + '</p>' : '') + '</div>';
  }

  function itemSummary(it) {
    if (!it.sets.length) return '세트 없음';
    if (it.type === 'time') {
      var secs = it.sets.map(function (s) { return s.sec; });
      var same = secs.every(function (v) { return v === secs[0]; });
      var dur = same ? fmtSec(secs[0]) : secs.map(fmtSec).join('/');
      // 한 번에 쭉 하는 운동은 "1세트 ×" 를 붙이지 않는다
      var txt = it.sets.length === 1 ? dur : it.sets.length + '세트 × ' + dur;
      // 유산소는 강도가 곧 그 운동의 내용이라 요약에도 같이 적는다.
      // 무게와 같은 규칙: 전부 같은 값일 때만 숫자, 아니면 "가변"
      function part(key, fmt) {
        var vs = it.sets.map(function (s) { return s[key]; });
        if (!vs.some(function (v) { return v != null; })) return '';
        var same = vs.every(function (v) { return v != null && v === vs[0]; });
        return ' · ' + (same ? fmt(vs[0]) : '가변');
      }
      var sp = part('speed', function (v) { return v + 'km/h'; });
      txt += sp;
      if (sp && sp.indexOf('가변') === -1) {
        var gr = it.sets.map(function (s) { return s.grade; });
        if (gr[0] && gr.every(function (v) { return v === gr[0]; })) txt += ' 경사 ' + gr[0] + '%';
      }
      txt += part('watt', function (v) { return v + 'W'; });
      txt += part('level', function (v) { return LEVEL_LABELS[v] || ''; });
      return txt;
    }
    var reps = it.sets.map(function (s) { return s.reps; });
    var ws = it.sets.map(function (s) { return s.weight; });
    var sameR = reps.every(function (v) { return v === reps[0]; });
    var sameW = ws.every(function (v) { return v === ws[0]; });
    if (bodyweight(it)) {
      return it.sets.length + '세트 × ' + (sameR ? reps[0] + '회' : reps.join('/') + '회') + ' · 맨몸';
    }
    var w = sameW ? (ws[0] ? ws[0] + S.settings.unit : '맨몸') : '가변';
    return it.sets.length + '세트 × ' + (sameR ? reps[0] + '회' : reps.join('/') + '회') + ' · ' + w;
  }

  // ── 화면: 루틴 목록 ──────────────────────────────────
  function viewRoutines() {
    var routines = S.routines();
    var act = S.active();
    var html = header('내 루틴', '<button class="btn primary sm" data-act="new-routine">+ 새 루틴</button>');
    html += '<main class="page">';

    if (act) {
      var c = S.countSets(act);
      html += '<div class="card live" data-act="goto-session">' +
        '<div class="live-dot"></div>' +
        '<div><strong>진행 중: ' + esc(act.routineName) + '</strong>' +
        '<p class="dim">' + c.done + '/' + c.total + ' 세트 완료 · 이어서 하기</p></div>' +
        '<span class="chev">›</span></div>';
    }

    if (!routines.length) {
      html += empty('아직 루틴이 없습니다.', '“+ 새 루틴”으로 나만의 루틴을 만들어 보세요.');
    } else {
      html += '<ul class="list">' + routines.map(function (r) {
        var sets = r.items.reduce(function (a, it) { return a + it.sets.length; }, 0);
        // 카드 전체가 시작 버튼이다. 편집·복제·삭제는 ⋮ 버튼 안으로 넣었다.
        return '<li class="card routine" data-act="start-routine" data-id="' + r.id + '">' +
          '<div class="routine-head">' +
            '<div><h3>' + esc(r.name) + '</h3>' +
            '<p class="dim">' + r.items.length + '개 운동 · 총 ' + sets + '세트' +
            (r.memo ? ' · ' + esc(r.memo) : '') + '</p></div>' +
            '<button class="icon more" data-act="routine-menu" data-id="' + r.id + '" ' +
              'aria-label="' + esc(r.name) + ' 옵션" title="옵션">⋮</button>' +
          '</div>' +
          '<div class="routine-preview">' +
            (r.items.slice(0, PREVIEW_MAX).map(partBadge).join('') || '<span class="dim">운동을 추가해 주세요</span>') +
            (r.items.length > PREVIEW_MAX ? badge('+' + (r.items.length - PREVIEW_MAX)) : '') +
          '</div>' +
        '</li>';
      }).join('') + '</ul>';
    }
    html += '</main>';
    return html;
  }

  // ── 화면: 루틴 편집 ──────────────────────────────────
  var openItems = {}; // 펼쳐진 항목 id

  function viewRoutineEdit(id) {
    var r = S.getRoutine(id);
    if (!r) return header('루틴', '') + '<main class="page">' + empty('루틴을 찾을 수 없습니다.') + '</main>';

    var html = header('루틴 편집',
      '<button class="btn sm" data-act="back">‹ 목록</button>');
    html += '<main class="page">';
    html += '<div class="card">' +
      '<label class="field"><span>루틴 이름</span>' +
      '<input type="text" data-bind="routine-name" data-id="' + r.id + '" value="' + esc(r.name) + '" placeholder="예: 월요일 가슴날"></label>' +
      '<label class="field"><span>메모</span>' +
      '<input type="text" data-bind="routine-memo" data-id="' + r.id + '" value="' + esc(r.memo || '') + '" placeholder="예: 상체 위주, 무게 천천히 증량"></label>' +
      '</div>';

    if (!r.items.length) {
      html += empty('운동이 비어 있습니다.', '아래 “운동 추가”로 머신 · 프리웨이트를 검색해 담아보세요.');
    } else {
      html += '<ul class="list">' + r.items.map(function (it, idx) {
        var ex = S.findExercise(it.exerciseId);
        var open = !!openItems[it.id];
        return '<li class="card item' + (open ? ' open' : '') + '">' +
          '<div class="item-head" data-act="toggle-item" data-id="' + it.id + '">' +
            '<div class="item-no">' + (idx + 1) + '</div>' +
            '<div class="item-main">' +
              '<h3>' + esc(it.name) + '</h3>' +
              '<p class="dim" data-summary="' + it.id + '">' + esc(itemSummary(it)) +
              (S.restOf(it) ? ' · 휴식 ' + S.restOf(it) + '초' : '') + '</p>' +
              (ex ? '<div class="tags">' + badge(ex.part, 'part') + badge(ex.equip, 'equip') + '</div>' : '') +
            '</div>' +
            '<span class="chev">' + (open ? '⌄' : '›') + '</span>' +
          '</div>' +
          (open ? itemEditor(r, it) : '') +
        '</li>';
      }).join('') + '</ul>';
    }

    html += '<div class="stack">' +
      '<button class="btn block" data-act="open-picker" data-id="' + r.id + '">+ 운동 추가</button>' +
      '<button class="btn primary block" data-act="start-routine" data-id="' + r.id + '">이 루틴으로 운동 시작</button>' +
      '</div>';
    html += '</main>';
    return html;
  }

  function itemEditor(r, it) {
    var unit = S.settings.unit;
    var cc = cardioCfg(it);
    var rows = it.sets.map(function (st, i) {
      var ids = 'data-rid="' + r.id + '" data-iid="' + it.id + '" data-si="' + i + '"';
      if (cc) {
        // 유산소는 입력할 게 많아 세트 행에 우겨넣지 않고 격자로 그린다
        return '<div class="cardioset">' +
          (it.sets.length > 1 ? '<div class="cs-head"><span class="setno">' + (i + 1) + '세트</span>' +
            '<button class="icon danger" title="세트 삭제" data-act="del-set" ' + ids + '>✕</button></div>' : '') +
          cardioFields(cc, st, 'set-', ids) +
        '</div>';
      }
      // 맨몸 운동은 들 무게가 없다. 체중은 설정에 있으니 칸을 두지 않는다.
      var bw = bodyweight(it);
      var repsField = '<label class="mini"><input type="number" inputmode="numeric" min="0" step="1" value="' + num(st.reps, 0) + '" ' +
        'data-bind="set-reps" ' + ids + '><span>회</span></label>';
      var fields = it.type === 'time'
        ? '<label class="mini"><input type="number" inputmode="numeric" min="0" step="5" value="' + num(st.sec, 0) + '" ' +
            'data-bind="set-sec" ' + ids + '><span>초</span></label>'
        : bw
          ? repsField
          : '<label class="mini"><input type="number" inputmode="decimal" min="0" step="0.5" value="' + num(st.weight, 0) + '" ' +
              'data-bind="set-weight" ' + ids + '><span>' + unit + '</span></label>' +
            '<span class="x">×</span>' + repsField;
      return '<div class="setrow">' +
        '<span class="setno">' + (i + 1) + '세트</span>' +
        '<div class="setfields">' + fields + '</div>' +
        '<button class="icon danger" title="세트 삭제" data-act="del-set" data-rid="' + r.id + '" data-iid="' + it.id + '" data-si="' + i + '">✕</button>' +
        '</div>';
    }).join('');

    return '<div class="item-body">' +
      '<div class="setlist">' + rows + '</div>' +
      '<div class="row gap">' +
        '<button class="btn sm" data-act="add-set" data-rid="' + r.id + '" data-iid="' + it.id + '">+ 세트 추가</button>' +
        '<button class="btn sm" data-act="fill-sets" data-rid="' + r.id + '" data-iid="' + it.id + '">1세트 값으로 전체 채우기</button>' +
      '</div>' +
      '<div class="row gap wrap">' +
        '<label class="field inline"><span>휴식(초)</span>' +
          '<input type="number" inputmode="numeric" min="0" step="10"' +
            ' value="' + (it.restSec == null ? '' : it.restSec) + '"' +
            ' placeholder="기본 ' + S.settings.defaultRest + '"' +
            ' data-bind="item-rest" data-rid="' + r.id + '" data-iid="' + it.id + '"></label>' +
        '<label class="field inline grow"><span>운동 메모</span>' +
          '<input type="text" value="' + esc(it.memo || '') + '" placeholder="예: 3번 핀, 등받이 4칸" data-bind="item-memo" data-rid="' + r.id + '" data-iid="' + it.id + '"></label>' +
      '</div>' +
      '<div class="row gap">' +
        '<button class="btn sm" data-act="move-item" data-rid="' + r.id + '" data-iid="' + it.id + '" data-dir="-1">↑ 위로</button>' +
        '<button class="btn sm" data-act="move-item" data-rid="' + r.id + '" data-iid="' + it.id + '" data-dir="1">↓ 아래로</button>' +
        '<button class="btn sm danger" data-act="del-item" data-rid="' + r.id + '" data-iid="' + it.id + '">운동 삭제</button>' +
      '</div>' +
    '</div>';
  }

  // 입력 중 전체 재렌더는 포커스를 잃게 하므로 요약 줄만 갱신한다
  function refreshItemSummary(rid, iid) {
    var r = S.getRoutine(rid);
    if (!r) return;
    var it = r.items.filter(function (i) { return i.id === iid; })[0];
    if (!it) return;
    var el = document.querySelector('[data-summary="' + iid + '"]');
    if (el) el.textContent = itemSummary(it) + (S.restOf(it) ? ' · 휴식 ' + S.restOf(it) + '초' : '');
  }

  // 지난번에 이 운동을 어떻게 했는지 한 줄로 보여 준다.
  // 진행 중인 세션은 아직 기록에 없으므로 그대로 직전 기록이 나온다.
  function lastRecordLine(item) {
    if (!item.exerciseId) return '';
    var r = S.lastRecordOf(item.exerciseId);
    if (!r) return '';
    var u = S.settings.unit;
    var v = r.type === 'time'
      ? fmtSec(r.totalSec) + (r.topSpeed ? ' · ' + r.topSpeed + 'km/h' : '')
      : (r.best ? (r.best.weight ? r.best.weight + u + ' × ' : '') + r.best.reps + '회' : '');
    if (!v) return '';
    return '<p class="lastrec" data-act="open-progress" data-id="' + item.exerciseId + '">' +
      '<span class="dim">지난번</span> <strong>' + esc(v) + '</strong>' +
      '<span class="dim"> · ' + fmtShortDate(r.at) + ' · ' + r.setCount + '세트</span>' +
      '<span class="chev">›</span></p>';
  }

  // ── 화면: 운동 진행 ──────────────────────────────────
  function viewSession() {
    var s = S.active();
    if (!s) {
      var routines = S.routines();
      return header('운동') + '<main class="page">' +
        empty('진행 중인 운동이 없습니다.', '루틴을 골라 시작해 보세요.') +
        (routines.length ? '<ul class="list">' + routines.map(function (r) {
          return '<li class="card row between">' +
            '<div><strong>' + esc(r.name) + '</strong><p class="dim">' + r.items.length + '개 운동</p></div>' +
            '<button class="btn primary" data-act="start-routine" data-id="' + r.id + '">시작</button></li>';
        }).join('') + '</ul>' : '') +
        '</main>';
    }

    var c = S.countSets(s);
    var pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
    var html = header(s.routineName,
      '<button class="btn sm" data-act="cancel-session">중단</button>' +
      '<button class="btn primary sm" data-act="finish-session">운동 완료</button>');

    html += '<main class="page session">';
    html += '<div class="card progress-card">' +
      '<div class="row between"><span class="dim">경과</span><strong data-tick="elapsed">' + fmtClock((Date.now() - s.startedAt) / 1000) + '</strong></div>' +
      '<div class="bar"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="row between"><span class="dim">' + c.done + ' / ' + c.total + ' 세트</span>' +
      '<span class="dim">' + S.volumeOf(s).toLocaleString() + S.settings.unit +
      ' · 약 <span data-tick="kcal">' + kcalOf(s).toLocaleString() + '</span> kcal</span></div>' +
      '</div>';

    html += s.items.map(function (it, idx) {
      var doneCount = it.sets.filter(function (x) { return x.done; }).length;
      var allDone = doneCount === it.sets.length && it.sets.length > 0;
      var cc = cardioCfg(it);
      var burned = it.type === 'time' ? itemKcal(it) : 0;
      return '<section class="card exercise' + (allDone ? ' done' : '') + '">' +
        '<div class="row between">' +
          '<h3>' + (idx + 1) + '. ' + esc(it.name) + (allDone ? ' ✅' : '') + '</h3>' +
          '<span class="dim" data-kcal="' + it.id + '">' +
            (burned ? '약 ' + burned.toLocaleString() + ' kcal · ' : '') +
            doneCount + '/' + it.sets.length + '</span>' +
        '</div>' +
        (it.memo ? '<p class="dim memo">📝 ' + esc(it.memo) + '</p>' : '') +
        lastRecordLine(it) +
        '<div class="setlist">' + it.sets.map(function (st, i) {
          var lids = 'data-iid="' + it.id + '" data-si="' + i + '"';
          var chk = '<button class="check' + (st.done ? ' on' : '') + '" data-act="toggle-set" ' + lids + ' ' +
            'aria-pressed="' + (st.done ? 'true' : 'false') + '" title="세트 완료 체크">' + (st.done ? '✓' : '') + '</button>';
          if (cc) {
            return '<div class="cardioset live' + (st.done ? ' checked' : '') + '">' +
              '<div class="cs-head">' +
                // 한 세트짜리는 "1세트" 라고 적을 이유가 없다
                '<span class="setno">' + (it.sets.length > 1 ? (i + 1) + '세트' : '') + '</span>' + chk +
              '</div>' +
              cardioFields(cc, st, 'live-', lids) +
            '</div>';
          }
          var bw = bodyweight(it);
          var liveReps = '<label class="mini"><input type="number" inputmode="numeric" min="0" step="1" value="' + num(st.reps, 0) + '" ' +
            'data-bind="live-reps" ' + lids + '><span>회</span></label>';
          var fields = it.type === 'time'
            ? '<label class="mini"><input type="number" inputmode="numeric" min="0" step="5" value="' + num(st.sec, 0) + '" ' +
                'data-bind="live-sec" ' + lids + '><span>초</span></label>'
            : bw
              ? liveReps
              : '<label class="mini"><input type="number" inputmode="decimal" min="0" step="0.5" value="' + num(st.weight, 0) + '" ' +
                  'data-bind="live-weight" ' + lids + '><span>' + S.settings.unit + '</span></label>' +
                '<span class="x">×</span>' + liveReps;
          return '<div class="setrow live' + (st.done ? ' checked' : '') + '">' +
            '<span class="setno">' + (i + 1) + '</span>' +
            '<div class="setfields">' + fields + '</div>' +
            '<button class="check' + (st.done ? ' on' : '') + '" data-act="toggle-set" data-iid="' + it.id + '" data-si="' + i + '" ' +
              'aria-pressed="' + (st.done ? 'true' : 'false') + '" title="세트 완료 체크">' + (st.done ? '✓' : '') + '</button>' +
            '</div>';
        }).join('') + '</div>' +
        '<div class="row gap">' +
          '<button class="btn sm" data-act="live-add-set" data-iid="' + it.id + '">+ 세트</button>' +
          '<button class="btn sm" data-act="live-del-set" data-iid="' + it.id + '">− 세트</button>' +
          '<label class="mini restedit right"><span>휴식</span>' +
            '<input type="number" inputmode="numeric" min="0" step="10"' +
            ' value="' + (it.restSec == null ? '' : it.restSec) + '"' +
            ' placeholder="' + S.settings.defaultRest + '"' +
            ' data-bind="live-rest" data-iid="' + it.id + '" aria-label="휴식 시간(초)"><span>초</span></label>' +
        '</div>' +
      '</section>';
    }).join('');

    html += '<button class="btn primary block lg" data-act="finish-session">운동 완료하고 기록 저장</button>';
    html += '</main>';
    return html;
  }

  // 유산소는 속도가 소모량을 지배하므로 속도 칸을 따로 준다.
  // 어떤 운동이 속도를 받는지는 칼로리 모듈이 알고 있다.
  var LEVEL_LABELS = ['가볍게', '보통', '세게'];

  /* 유산소 한 세트의 입력칸. 세트 행에 우겨넣으면 좁아서 못 읽으므로
   * 라벨을 붙인 격자로 따로 그린다. 기구가 알려주는 값만 보여 준다.
   *   트레드밀      시간 · 속도 · 경사
   *   사이클/로잉   시간 · 와트 · 강도
   *   그 밖        시간 · 강도                      */
  function cardioFields(cc, st, pre, attrs) {
    function field(label, inner) {
      return '<label class="cs-f"><span class="cs-l">' + label + '</span>' + inner + '</label>';
    }
    function numIn(bind, val, unit, extra) {
      return '<span class="cs-in"><input type="number" inputmode="decimal" min="0" ' + (extra || '') +
        ' value="' + (val == null ? '' : val) + '" data-bind="' + pre + bind + '" ' + attrs +
        '><em>' + unit + '</em></span>';
    }
    var html = field('시간', numIn('min', Math.round(num(st.sec, 0) / 6) / 10, '분', 'step="1"'));

    if (cc.model === 'walkrun') {
      html += field('속도', numIn('speed', st.speed, 'km/h', 'step="0.5" max="40"'));
      html += field('경사', numIn('grade', st.grade, '%', 'step="0.5" max="30"'));
    } else {
      if (cc.model === 'watt') {
        // 기계에 표시되는 이름 그대로 "와트". 없으면 아래 강도로 잡는다
        html += field('와트', numIn('watt', st.watt, 'W', 'step="5" max="600"'));
      }
      // "기본"이라는 선택지는 없앴다. 뭐가 기본인지 알 수 없는 데다,
      // 고정 MET 표를 쓰느라 "보통"보다 높게 나오는 역전이 있었다.
      var cur = st.level == null ? 1 : Number(st.level);
      var opts = LEVEL_LABELS.map(function (t, i) {
        return '<option value="' + i + '"' + (cur === i ? ' selected' : '') + '>' + t + '</option>';
      }).join('');
      html += field('강도', '<span class="cs-in"><select data-bind="' + pre + 'level" ' + attrs + '>' + opts + '</select></span>');
    }
    return '<div class="cs-grid">' + html + '</div>';
  }

  // 빈 칸은 null(기본 강도), 숫자는 범위 안으로 자른다
  function blankOrNum(v, lo, hi) {
    if (String(v).trim() === '') return null;
    return Math.min(hi, Math.max(lo, Math.round(num(v, 0) * 10) / 10));
  }
  // 속도를 고치는 동안 전체를 다시 그리면 입력칸이 날아간다. 숫자만 갈아 끼운다.
  function refreshKcal() {
    var sess = S.active();
    if (!sess) return;
    sess.items.forEach(function (it) {
      var el = document.querySelector('[data-kcal="' + it.id + '"]');
      if (!el) return;
      var burned = it.type === 'time' ? itemKcal(it) : 0;
      el.textContent = (burned ? '약 ' + burned.toLocaleString() + ' kcal · ' : '') +
        it.sets.filter(function (x) { return x.done; }).length + '/' + it.sets.length;
    });
    var tot = document.querySelector('[data-tick="kcal"]');
    if (tot) tot.textContent = kcalOf(sess).toLocaleString();
  }

  /* 맨몸 운동에는 무게 칸을 두지 않는다. 들 무게가 없고, 계산에 쓰는
   * 체중은 설정에 이미 있어서 여기서 또 받을 이유가 없다. */
  function bodyweight(item) {
    var ex = S.findExercise(item.exerciseId);
    return !!(ex && ex.equip === '맨몸' && item.type !== 'time');
  }
  /* 세트 하나를 읽을 수 있는 문장으로 바꾼다. 유산소는 분·속도·경사,
   * 맨몸은 횟수만, 기구 운동은 무게 × 횟수. 기록 상세만 예전 표기가
   * 남아 "1800초", "0kg × 20회" 로 나오던 걸 여기로 모았다. */
  function setText(item, st) {
    var u = S.settings.unit;
    if (item.type === 'time') {
      var cc = cardioCfg(item);
      var out = fmtSec(num(st.sec, 0));
      if (!cc) return out;
      if (st.speed != null) out += ' · ' + st.speed + 'km/h';
      if (st.grade) out += ' 경사 ' + st.grade + '%';
      if (st.watt != null) out += ' · ' + st.watt + 'W';
      if (st.level != null && st.watt == null) out += ' · ' + (LEVEL_LABELS[st.level] || '');
      return out;
    }
    var reps = num(st.reps, 0) + '회';
    var w = num(st.weight, 0);
    return (bodyweight(item) || !w) ? reps : w + u + ' × ' + reps;
  }

  // 한 세션에서 체크한 총 횟수 (맨몸처럼 볼륨이 0 인 날의 대체 지표)
  function repsOf(sess) {
    var total = 0;
    sess.items.forEach(function (it) {
      if (it.type === 'time') return;
      it.sets.forEach(function (st) { if (st.done !== false) total += num(st.reps, 0); });
    });
    return total;
  }

  // 가져온 결과를 한 줄로. 버린 항목이 있으면 숨기지 않고 알린다.
  function importMsg(rep) {
    if (!rep) return '가져오기 완료';
    var msg = '루틴 ' + rep.routines + '개 · 기록 ' + rep.sessions + '개를 가져왔습니다';
    if (rep.dropped) msg += ' (읽을 수 없는 항목 ' + rep.dropped + '개 제외)';
    return msg;
  }

  function cardioCfg(item) {
    if (!item || item.type !== 'time' || !window.Calories) return null;
    return window.Calories.cardioOf(item.exerciseId, S.findExercise(item.exerciseId));
  }
  // 유산소 운동 하나가 태운 열량
  function itemKcal(item) {
    if (!window.Calories) return 0;
    return window.Calories.timeItem(item, S.findExercise(item.exerciseId), S.settings.bodyWeight);
  }

  function kcalOf(sess) {
    if (!window.Calories) return 0;
    return window.Calories.session(sess, S.settings.bodyWeight, function (id) {
      return S.findExercise(id);
    });
  }

  // ── 화면: 기록 ───────────────────────────────────────
  var bmSel = null;   // 근육 지도에서 선택한 부위

  function bodyMapCard(sessions) {
    var BM = window.BodyMap;
    if (!BM) return '';
    var data = BM.aggregate(sessions, 7, function (id) { return S.findExercise(id); });
    var ranked = BM.GROUPS.map(function (g) {
      return { id: g.id, ko: g.ko, sets: data.byGroup[g.id].sets, volume: data.byGroup[g.id].volume };
    }).sort(function (a, b) { return b.sets - a.sets; });

    var trained = ranked.filter(function (r) { return r.sets > 0; });
    var sel = bmSel && data.byGroup[bmSel] ? bmSel : (trained[0] ? trained[0].id : null);

    var legend = '<div class="bm-legend">' +
      '<span class="dim">적음</span>' +
      BM.RAMP.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') +
      '<span class="dim">많음</span>' +
      '<span class="bm-idle"><i style="background:' + BM.IDLE + '"></i>미실시</span>' +
      '</div>';

    var detail = '';
    if (sel) {
      var d = data.byGroup[sel];
      var tops = Object.keys(d.top).sort(function (a, b) { return d.top[b] - d.top[a]; }).slice(0, 3);
      detail = '<div class="bm-detail">' +
        '<div class="row between"><strong>' + esc(BM.LABEL[sel]) + '</strong>' +
        '<span class="dim">' + BM.fmtSets(d.sets) + '세트' +
        (d.volume ? ' · ' + Math.round(d.volume).toLocaleString() + S.settings.unit : '') + '</span></div>' +
        (tops.length
          ? '<p class="dim">' + tops.map(function (n) {
              return esc(n) + ' ' + BM.fmtSets(d.top[n]);
            }).join(' · ') + '</p>'
          : '<p class="dim">최근 7일 동안 이 부위 기록이 없습니다.</p>') +
        '</div>';
    }

    var rank = trained.length
      ? '<ul class="bm-rank">' + trained.map(function (r) {
          var pct = data.max ? Math.max(4, (r.sets / data.max) * 100) : 0;
          var on = r.id === sel ? ' on' : '';
          return '<li class="bm-row' + on + '" data-act="bm-sel" data-m="' + r.id + '">' +
            '<span class="bm-name">' + esc(r.ko) + '</span>' +
            '<span class="bm-bar"><i style="width:' + pct.toFixed(1) + '%;background:' +
              BM.colorFor(r.sets, data.max) + '"></i></span>' +
            '<span class="bm-val">' + BM.fmtSets(r.sets) + '</span></li>';
        }).join('') + '</ul>'
      : '<p class="dim center">최근 7일 기록이 없습니다.</p>';

    return '<section class="card bodymap">' +
      '<div class="row between"><h3>최근 7일 부위별 운동량</h3>' +
      '<span class="dim">' + data.sessions + '회 운동</span></div>' +
      '<p class="dim">주동근 1세트, 보조근 0.4세트로 계산합니다. 부위를 눌러 자세히 보세요.</p>' +
      '<div class="bm-figs">' +
        '<figure class="bm-fig">' + BM.figure('front', data, sel) + '<figcaption>앞</figcaption></figure>' +
        '<figure class="bm-fig">' + BM.figure('back', data, sel) + '<figcaption>뒤</figcaption></figure>' +
      '</div>' +
      legend + detail + rank +
      '</section>';
  }

  // ── 성장: 꺾은선 차트 ────────────────────────────────
  // 한 차트에 한 가지 값만 그린다. 무게와 횟수는 단위가 달라
  // 축을 겹치지 않고 차트를 위아래로 나눈다.
  function lineChart(opts) {
    var pts = opts.points;                       // [{ at, v }] 오래된 것 → 최근
    if (!pts.length) return '';
    var W = 320, H = 132, L = 34, R = 12, T = 14, B = 22;
    var iw = W - L - R, ih = H - T - B;

    var vs = pts.map(function (p) { return p.v; });
    var lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
    if (hi === lo) { hi = lo + (lo || 1) * 0.1; lo = Math.max(0, lo - (lo || 1) * 0.1); }
    var pad = (hi - lo) * 0.12; hi += pad; lo = Math.max(0, lo - pad);

    var x = function (i) { return pts.length === 1 ? L + iw / 2 : L + (i / (pts.length - 1)) * iw; };
    var y = function (v) { return T + ih - ((v - lo) / (hi - lo)) * ih; };

    // 눈금은 위·가운데·아래 세 개면 충분하다
    var ticks = [lo, (lo + hi) / 2, hi];
    var grid = ticks.map(function (v) {
      return '<line class="ch-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/>' +
        '<text class="ch-tick" x="' + (L - 6) + '" y="' + (y(v) + 3.5).toFixed(1) + '">' + Math.round(v) + '</text>';
    }).join('');

    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1); }).join(' ');
    var maxI = vs.lastIndexOf(Math.max.apply(null, vs));
    var lastI = pts.length - 1;

    var dots = pts.map(function (p, i) {
      var lab = fmtShortDate(p.at) + ' · ' + p.label;
      return '<circle class="ch-dot" cx="' + x(i).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="4.5"' +
        ' data-act="ch-pick" data-lab="' + esc(lab) + '" data-key="' + opts.key + '">' +
        '<title>' + esc(lab) + '</title></circle>' +
        // 터치 목표는 점보다 크게 잡는다
        '<circle class="ch-hit" cx="' + x(i).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="14"' +
        ' data-act="ch-pick" data-lab="' + esc(lab) + '" data-key="' + opts.key + '"/>';
    }).join('');

    // 값은 전부 적지 않고 최고점과 마지막만 직접 표시한다.
    // 라벨 폭을 미리 재서 서로 겹치면 마지막 것만 남긴다.
    var CH = 5.6;                                     // 10px 글자의 대략적인 자폭
    function box(i) {
      var w = pts[i].label.length * CH;
      var cx = x(i), a = 'middle', x0 = cx - w / 2;
      if (cx > W - R - w / 2) { a = 'end'; x0 = cx - w; }
      else if (cx < L + w / 2) { a = 'start'; x0 = cx; }
      return { a: a, x0: x0, x1: x0 + w };
    }
    function tag(i) {
      if (i < 0 || i >= pts.length) return '';
      var b = box(i);
      return '<text class="ch-val" text-anchor="' + b.a + '" x="' + x(i).toFixed(1) + '" y="' + (y(pts[i].v) - 9).toFixed(1) + '">' +
        esc(pts[i].label) + '</text>';
    }
    var labels = tag(lastI);
    if (maxI !== lastI) {
      var bm = box(maxI), bl = box(lastI);
      var overlap = bm.x1 + 6 > bl.x0 && bl.x1 + 6 > bm.x0;
      if (!overlap) labels = tag(maxI) + labels;      // 겹치면 최고점 라벨은 생략
    }

    return '<figure class="chart" style="--ch:' + opts.color + '">' +
      '<figcaption>' + esc(opts.title) + '</figcaption>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.title) +
        ' — ' + pts.length + '회 기록, ' + esc(pts[0].label) + ' 에서 ' + esc(pts[lastI].label) + '">' +
        grid +
        '<path class="ch-line" d="' + d + '"/>' + dots + labels +
      '</svg>' +
      '<div class="ch-x"><span>' + fmtShortDate(pts[0].at) + '</span>' +
        (pts.length > 1 ? '<span>' + fmtShortDate(pts[lastI].at) + '</span>' : '') + '</div>' +
      '<p class="ch-read dim" data-read="' + opts.key + '">점을 누르면 그 날 기록이 보입니다</p>' +
    '</figure>';
  }

  function fmtShortDate(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  // ── 화면: 성장 ───────────────────────────────────────
  function viewProgress(id) {
    if (id) return viewProgressDetail(id);
    var list = S.trainedExercises();
    var html = header('성장');
    html += '<main class="page">';
    if (!list.length) {
      html += empty('아직 기록이 없습니다.', '운동을 한 번 완료하면 여기에서 무게와 횟수 변화를 볼 수 있습니다.');
    } else {
      html += '<ul class="list">' + list.map(function (e) {
        var ex = S.findExercise(e.exerciseId);
        var sub = e.type === 'time'
          ? fmtSec(e.last.totalSec)
          : (e.last.best
              ? (e.last.best.weight ? e.last.best.weight + S.settings.unit + ' × ' : '') + e.last.best.reps + '회'
              : '기록 없음');
        return '<li class="card row between" data-act="open-progress" data-id="' + e.exerciseId + '">' +
          '<div><strong>' + esc(e.name) + '</strong>' +
          '<p class="dim">최근 ' + esc(sub) + ' · ' + e.days + '회 수행 · ' + fmtDate(e.lastAt) + '</p>' +
          (ex ? '<div class="tags">' + partBadgeOf(ex) + '</div>' : '') + '</div>' +
          '<span class="chev">›</span></li>';
      }).join('') + '</ul>';
    }
    html += '</main>';
    return html;
  }

  function viewProgressDetail(id) {
    var rows = S.progressOf(id);
    var ex = S.findExercise(id);
    var name = rows.length ? rows[rows.length - 1].name : (ex ? ex.name : '운동');
    var html = header(name, '<button class="btn sm" data-act="back-progress">목록</button>');
    html += '<main class="page">';

    if (!rows.length) {
      html += empty('아직 기록이 없습니다.', '이 운동을 완료하면 변화가 쌓입니다.');
      return html + '</main>';
    }

    var timed = rows[rows.length - 1].type === 'time';
    var u = S.settings.unit;

    if (timed) {
      var bestSec = rows.reduce(function (a, r) { return Math.max(a, r.totalSec); }, 0);
      html += '<div class="card stats">' +
        '<div><strong>' + fmtSec(bestSec) + '</strong><span class="dim">최고 시간</span></div>' +
        '<div><strong>' + rows.length + '</strong><span class="dim">수행 횟수</span></div>' +
        '</div>';
      html += lineChart({
        title: '시간 추이', key: 'sec', color: '#5588f0',
        points: rows.map(function (r) {
          return { at: r.at, v: r.totalSec,
                   label: fmtSec(r.totalSec) + (r.topSpeed ? ' (' + r.topSpeed + 'km/h)' : '') };
        })
      });
      // 속도를 적어 둔 기록이 있으면 속도 변화도 함께 본다
      if (rows.some(function (r) { return r.topSpeed; })) {
        html += lineChart({
          title: '속도 추이(km/h)', key: 'spd', color: '#25a98f',
          points: rows.filter(function (r) { return r.topSpeed; }).map(function (r) {
            return { at: r.at, v: r.topSpeed, label: r.topSpeed + 'km/h' };
          })
        });
      }
    } else {
      var pr = rows.reduce(function (a, r) { return r.topWeight > a.topWeight ? r : a; }, rows[0]);
      var bestE = rows.reduce(function (a, r) { return Math.max(a, r.e1rm); }, 0);
      var lastRow = rows[rows.length - 1];
      // 맨몸 운동은 무게가 늘 0 이라 무게 차트·최고 무게·1RM 이 의미 없다
      var noWeight = !rows.some(function (r) { return r.topWeight > 0; });
      var bestReps = rows.reduce(function (a, r) { return Math.max(a, r.best ? r.best.reps : 0); }, 0);
      var totalReps = rows.reduce(function (a, r) { return a + r.totalReps; }, 0);

      html += '<div class="card stats">' +
        (noWeight
          ? '<div><strong>' + bestReps + '회</strong><span class="dim">한 세트 최고</span></div>' +
            '<div><strong>' + totalReps.toLocaleString() + '회</strong><span class="dim">누적 횟수</span></div>'
          : '<div><strong>' + pr.topWeight + u + '</strong><span class="dim">최고 무게</span></div>' +
            '<div><strong>' + bestE + u + '</strong><span class="dim">추정 1RM</span></div>') +
        '<div><strong>' + rows.length + '</strong><span class="dim">수행 횟수</span></div>' +
        '<div><strong>' + (lastRow.best
            ? (noWeight ? lastRow.best.reps + '회' : lastRow.best.weight + '×' + lastRow.best.reps)
            : '-') + '</strong>' +
          '<span class="dim">마지막 기록</span></div>' +
        '</div>';

      if (!noWeight) {
        html += lineChart({
          title: '무게 추이(' + u + ') — 그 날 가장 무겁게 친 세트', key: 'w', color: '#5588f0',
          points: rows.map(function (r) {
            return { at: r.at, v: r.topWeight, label: r.topWeight + u + ' × ' + (r.best ? r.best.reps : 0) + '회' };
          })
        });
      }
      html += lineChart({
        title: noWeight ? '횟수 추이(회) — 한 세트 최고' : '횟수 추이(회) — 그 세트의 반복 횟수',
        key: 'r', color: '#25a98f',
        points: rows.map(function (r) {
          var rr = r.best ? r.best.reps : 0;
          return { at: r.at, v: rr, label: rr + '회' + (noWeight ? '' : ' (' + r.topWeight + u + ')') };
        })
      });
    }

    // 색만으로 읽히지 않도록 같은 내용을 표로도 둔다
    html += '<section class="card"><h3>날짜별 기록</h3><ul class="loglist">' +
      rows.slice().reverse().map(function (r) {
        var v = timed
          ? fmtSec(r.totalSec) + (r.topSpeed ? ' · ' + r.topSpeed + 'km/h' : '')
          : (r.best ? (r.best.weight ? r.best.weight + u + ' × ' : '') + r.best.reps + '회' : '-');
        return '<li data-act="open-history" data-id="' + r.sessionId + '">' +
          '<span class="dim">' + fmtDate(r.at) + '</span>' +
          '<strong>' + esc(v) + '</strong>' +
          '<span class="dim">' + r.setCount + '세트' +
          (timed ? '' : ' · ' + (r.volume ? r.volume.toLocaleString() + u : '총 ' + r.totalReps + '회')) +
          '</span></li>';
      }).join('') + '</ul></section>';

    html += '</main>';
    return html;
  }

  function viewHistory(id) {
    if (id) return viewHistoryDetail(id);
    var list = S.sessions();
    var html = header('운동 기록');
    html += '<main class="page">';

    if (!list.length) {
      html += empty('기록이 없습니다.', '운동을 완료하면 여기에 쌓입니다.');
    } else {
      var weekAgo = Date.now() - 7 * 864e5;
      var week = list.filter(function (s) { return s.startedAt >= weekAgo; });
      var weekVol = week.reduce(function (a, s) { return a + S.volumeOf(s); }, 0);
      var weekKcal = week.reduce(function (a, s) { return a + kcalOf(s); }, 0);
      var weekReps = week.reduce(function (a, s) { return a + repsOf(s); }, 0);
      /* 볼륨은 무게를 든 운동에만 있는 값이다. 맨몸·유산소만 한 주에는
       * 0 이 뜨는데 아무것도 안 한 것처럼 읽혀서, 라벨에 기구 기준임을
       * 밝히고 옆에 총 횟수를 같이 둔다. */
      html += '<div class="card stats">' +
        '<div><strong>' + week.length + '</strong><span class="dim">최근 7일 운동</span></div>' +
        '<div><strong>' + weekKcal.toLocaleString() + '</strong><span class="dim">7일 칼로리(kcal)</span></div>' +
        '<div><strong>' + weekVol.toLocaleString() + '</strong><span class="dim">7일 볼륨(기구 ' + S.settings.unit + ')</span></div>' +
        '<div><strong>' + weekReps.toLocaleString() + '</strong><span class="dim">7일 총 횟수</span></div>' +
        '<div><strong>' + list.length + '</strong><span class="dim">총 운동 횟수</span></div>' +
        '</div>';

      html += bodyMapCard(list);

      html += '<ul class="list">' + list.map(function (s) {
        return '<li class="card row between" data-act="open-history" data-id="' + s.id + '">' +
          '<div><strong>' + esc(s.routineName) + '</strong>' +
          '<p class="dim">' + fmtDate(s.startedAt) + ' · ' + fmtDur(s.finishedAt - s.startedAt) +
          ' · ' + S.countSets(s, true) + '세트 · 약 ' + kcalOf(s).toLocaleString() + ' kcal</p></div>' +
          '<span class="chev">›</span></li>';
      }).join('') + '</ul>';
    }
    html += '</main>';
    return html;
  }

  function viewHistoryDetail(id) {
    var s = S.getSession(id);
    if (!s) return header('기록') + '<main class="page">' + empty('기록을 찾을 수 없습니다.') + '</main>';
    var html = header('운동 기록', '<button class="btn sm" data-act="back-history">‹ 목록</button>');
    html += '<main class="page">';
    html += '<div class="card">' +
      '<h3>' + esc(s.routineName) + '</h3>' +
      '<p class="dim">' + fmtDate(s.startedAt) + ' · ' + fmtDur(s.finishedAt - s.startedAt) + '</p>' +
      '<div class="row gap" style="margin-top:8px">' +
      badge(S.countSets(s, true) + '세트 완료') +
      // 볼륨은 무게를 든 운동에만 있는 값이라, 맨몸·유산소만 한 날엔 0kg 이
      // 아니라 총 횟수를 적는다
      (S.volumeOf(s) ? badge('볼륨 ' + S.volumeOf(s).toLocaleString() + S.settings.unit) : '') +
      (repsOf(s) ? badge('총 ' + repsOf(s).toLocaleString() + '회') : '') +
      badge('약 ' + kcalOf(s).toLocaleString() + ' kcal') +
      '</div></div>';
    html += s.items.map(function (it) {
      return '<section class="card">' +
        '<h3>' + esc(it.name) + '</h3>' +
        '<div class="setlist">' + it.sets.map(function (st, i) {
          return '<div class="setrow static"><span class="setno">' + (i + 1) + '세트</span>' +
            '<span>' + esc(setText(it, st)) + '</span></div>';
        }).join('') + '</div></section>';
    }).join('');
    html += '<button class="btn danger block" data-act="del-history" data-id="' + s.id + '">이 기록 삭제</button>';
    html += '</main>';
    return html;
  }

  // ── 화면: 설정 ───────────────────────────────────────
  function viewSettings() {
    var st = S.settings;
    var customs = S.state.customExercises;
    var html = header('설정');
    html += '<main class="page">';
    html += '<div class="card">' +
      '<label class="field inline"><span>기본 휴식 시간(초)</span>' +
      '<input type="number" inputmode="numeric" min="0" step="10" value="' + st.defaultRest + '" data-bind="set-rest"></label>' +
      '<button class="btn sm block" data-act="reset-rest">모든 루틴을 기본 휴식 시간으로</button>' +
      '<label class="field inline"><span>무게 단위</span>' +
      '<select data-bind="set-unit">' +
        '<option value="kg"' + (st.unit === 'kg' ? ' selected' : '') + '>kg</option>' +
        '<option value="lb"' + (st.unit === 'lb' ? ' selected' : '') + '>lb</option>' +
      '</select></label>' +
      '<label class="field inline"><span>휴식 종료 알림음</span>' +
      '<input type="checkbox" data-bind="set-sound"' + (st.sound ? ' checked' : '') + '></label>' +
      '</div>';

    html += '<div class="card">' +
      '<h3>안내 목소리</h3>' +
      '<ul class="voicelist">' +
        '<li class="voicerow' + (st.voice ? '' : ' on') + '">' +
          '<button class="voicepick" data-act="voice-pick" data-v="">' +
            '<strong>사용 안 함</strong></button></li>' +
        VOICES.map(function (v) {
          return '<li class="voicerow' + (st.voice === v.id ? ' on' : '') + '">' +
            '<button class="voicepick" data-act="voice-pick" data-v="' + v.id + '">' +
              '<strong>' + esc(v.label) + '</strong></button>' +
            '<button class="btn sm" data-act="voice-play" data-v="' + v.id + '" ' +
              'aria-label="' + esc(v.label) + ' 들어보기">▶</button>' +
          '</li>';
        }).join('') +
      '</ul></div>';

    html += '<div class="card">' +
      '<h3>칼로리 추정</h3>' +
      '<label class="field inline"><span>체중(kg)</span>' +
      '<input type="number" inputmode="decimal" min="20" max="250" step="0.5" value="' + st.bodyWeight + '" data-bind="set-weight-kg"></label>' +
      '</div>';

    html += '<div class="card">' +
      '<h3>내가 추가한 운동 (' + customs.length + ')</h3>' +
      (customs.length
        ? '<ul class="chiplist">' + customs.map(function (e) {
            return '<li class="chip">' + esc(e.name) +
              '<button class="icon" data-act="del-custom" data-id="' + e.id + '">✕</button></li>';
          }).join('') + '</ul>'
        : '') +
      '</div>';

    html += '<div class="card">' +
      '<h3>데이터 백업</h3>' +
      '<div class="row gap wrap" style="margin-top:10px">' +
        '<button class="btn" data-act="export">백업 내보내기</button>' +
        '<button class="btn" data-act="import">파일로 가져오기</button>' +
        '<button class="btn" data-act="import-text">붙여넣기로 가져오기</button>' +
        '<button class="btn danger" data-act="reset">전체 초기화</button>' +
      '</div></div>';
    html += '<div class="card row between">' +
      '<span class="dim">버전 ' + APP_VERSION + ' · 내장 운동 ' + DB.builtIn.length + '종</span>' +
      '<button class="btn sm" data-act="check-update">업데이트 확인</button>' +
      '</div>';
    html += '</main>';
    return html;
  }

  // ── 운동 검색 모달 ───────────────────────────────────
  var picker = { routineId: null, q: '', part: '', equip: '', sets: 3, reps: 10 };

  function openPicker(routineId) {
    picker.routineId = routineId;
    picker.q = ''; picker.part = ''; picker.equip = '';
    drawPicker();
    setTimeout(function () {
      var i = document.getElementById('pk-q');
      if (i) i.focus();
    }, 30);
  }
  function closeModal() { modalRoot.innerHTML = ''; modalRoot.classList.remove('show'); }

  // 루틴 카드의 ⋮ 메뉴
  // ⋮ 옆에 붙는 작은 메뉴. 버튼 위치에 맞춰 띄운다.
  function openRoutineMenu(id, btn) {
    if (!S.getRoutine(id)) return;
    modalRoot.classList.add('show');
    modalRoot.innerHTML =
      '<div class="pop-bg" data-act="close-modal"></div>' +
      '<div class="popmenu" id="rt-menu">' +
        '<button class="menu-item" data-act="menu-edit" data-id="' + id + '">편집</button>' +
        '<button class="menu-item" data-act="menu-dup" data-id="' + id + '">복제</button>' +
        '<button class="menu-item danger" data-act="menu-del" data-id="' + id + '">삭제</button>' +
      '</div>';

    var m = document.getElementById('rt-menu');
    if (!btn) return;
    var b = btn.getBoundingClientRect();
    var w = m.offsetWidth, h = m.offsetHeight, pad = 8;

    // 오른쪽 끝을 버튼에 맞추되 화면 밖으로 나가지 않게 한다
    var left = Math.min(Math.max(pad, b.right - w), window.innerWidth - w - pad);
    // 아래에 자리가 없으면 버튼 위로 띄운다
    var top = b.bottom + 4;
    if (top + h > window.innerHeight - pad) top = Math.max(pad, b.top - h - 4);

    m.style.left = Math.round(left) + 'px';
    m.style.top = Math.round(top) + 'px';
    m.classList.add('ready');
  }

  function pickerResults() {
    var list = DB.search(S.allExercises(), picker.q, { part: picker.part, equip: picker.equip });
    if (!list.length) return '<div class="empty small"><p>검색 결과가 없습니다.</p></div>';
    return list.map(function (e) {
      return '<div class="ex" data-act="pk-add" data-id="' + e.id + '">' +
        '<div><strong>' + esc(e.name) + '</strong>' +
        '<p class="dim">' + esc(e.en || '') + (e.muscles.length ? ' · ' + esc(e.muscles.join(', ')) : '') + '</p>' +
        '<div class="tags">' + badge(e.part, 'part') + badge(e.equip, 'equip') +
        (e.type === 'time' ? badge('시간') : '') + (e.custom ? badge('내 운동', 'mine') : '') + '</div></div>' +
        '<span class="plus">+</span></div>';
    }).join('');
  }

  // 검색어를 칠 때 시트 전체를 다시 그리면 입력창이 새 요소로 교체돼
  // 한글 조합(IME)이 매 글자마다 끊긴다. 그래서 결과 목록만 갈아끼운다.
  function updatePicker() {
    var sheet = modalRoot.querySelector('.sheet');
    if (!sheet) return;
    var chips = sheet.querySelectorAll('.fchip');
    for (var i = 0; i < chips.length; i++) {
      var c = chips[i];
      c.classList.toggle('on', picker[c.dataset.key] === c.dataset.v);
    }
    var listEl = sheet.querySelector('.sheet-list');
    if (listEl) {
      listEl.innerHTML = pickerResults();
      listEl.scrollTop = 0;
    }
    var customBtn = sheet.querySelector('[data-act="pk-custom"]');
    if (customBtn) {
      customBtn.innerHTML = '＋ 직접 추가하기' + (picker.q ? ' (“' + esc(picker.q) + '”)' : '');
    }
  }

  function drawPicker() {
    var chips = function (label, key, values) {
      return '<div class="chiprow"><span class="chiprow-label">' + label + '</span>' +
        '<button class="fchip' + (picker[key] === '' ? ' on' : '') + '" data-act="pk-filter" data-key="' + key + '" data-v="">전체</button>' +
        values.map(function (v) {
          return '<button class="fchip' + (picker[key] === v ? ' on' : '') + '" data-act="pk-filter" data-key="' + key + '" data-v="' + v + '">' + v + '</button>';
        }).join('') + '</div>';
    };

    modalRoot.classList.add('show');
    modalRoot.innerHTML =
      '<div class="sheet-bg" data-act="close-modal"></div>' +
      '<div class="sheet">' +
        '<div class="sheet-head">' +
          '<h2>운동 검색</h2>' +
          '<button class="icon" data-act="close-modal">✕</button>' +
        '</div>' +
        '<div class="sheet-search">' +
          '<input id="pk-q" type="search" placeholder="예: 랫풀다운, 머신, 하체, ㅂㅊㅍ" value="' + esc(picker.q) + '" data-bind="pk-q" autocomplete="off">' +
        '</div>' +
        chips('부위', 'part', DB.PARTS) +
        chips('장비', 'equip', DB.EQUIPS) +
        '<div class="sheet-default">' +
          '기본값 <input type="number" inputmode="numeric" min="1" max="20" value="' + picker.sets + '" data-bind="pk-sets">세트 × ' +
          '<input type="number" inputmode="numeric" min="1" max="100" value="' + picker.reps + '" data-bind="pk-reps">회로 추가' +
        '</div>' +
        '<div class="sheet-list">' + pickerResults() + '</div>' +
        '<div class="sheet-foot">' +
          '<button class="btn block" data-act="pk-custom">＋ 직접 추가하기' + (picker.q ? ' (“' + esc(picker.q) + '”)' : '') + '</button>' +
        '</div>' +
      '</div>';
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }

  function openExportSheet() {
    modalRoot.classList.add('show');
    modalRoot.innerHTML =
      '<div class="sheet-bg" data-act="close-modal"></div>' +
      '<div class="sheet">' +
        '<div class="sheet-head"><h2>데이터 백업</h2>' +
        '<button class="icon" data-act="close-modal">✕</button></div>' +
        '<div class="sheet-body">' +
          '<p class="dim">아래 내용을 메모장·메일 등에 복사해 두면 나중에 그대로 되돌릴 수 있습니다.</p>' +
          '<textarea id="exp-json" readonly spellcheck="false">' + esc(S.exportJSON()) + '</textarea>' +
        '</div>' +
        '<div class="sheet-foot stack">' +
          '<button class="btn primary block" data-act="export-copy">복사하기</button>' +
          '<button class="btn block" data-act="export-file">파일로 저장</button>' +
        '</div>' +
      '</div>';
  }

  function customExerciseForm() {
    var name = prompt('운동 이름을 입력하세요.', picker.q || '');
    if (!name || !name.trim()) return;
    var part = prompt('부위 (' + DB.PARTS.join(' / ') + ')', '가슴');
    if (!part) return;
    var equip = prompt('장비 (' + DB.EQUIPS.join(' / ') + ')', '머신');
    if (!equip) return;
    var isTime = confirm('시간(초) 기준 운동인가요?\n확인 = 시간 기준(플랭크·유산소), 취소 = 횟수 기준');
    var ex = S.addCustomExercise({
      name: name.trim(),
      part: DB.PARTS.indexOf(part.trim()) >= 0 ? part.trim() : '기타',
      equip: DB.EQUIPS.indexOf(equip.trim()) >= 0 ? equip.trim() : '기타',
      type: isTime ? 'time' : 'reps'
    });
    toast('“' + ex.name + '” 등록됨');
    if (picker.routineId) {
      S.addItem(picker.routineId, ex, { sets: picker.sets, reps: picker.reps });
      render();
    }
    picker.q = '';
    drawPicker();
  }

  // ── 렌더 ─────────────────────────────────────────────
  function render() {
    var body;
    switch (route.name) {
      case 'routine': body = viewRoutineEdit(route.param); break;
      case 'session': body = viewSession(); break;
      case 'progress': body = viewProgress(route.param); break;
      case 'history': body = viewHistory(route.param); break;
      case 'settings': body = viewSettings(); break;
      default: body = viewRoutines();
    }
    app.innerHTML = body + nav() + '<div id="restbar" class="restbar"></div>';
    drawRest();
    updateWakeLock();
  }

  // ── 이벤트 위임 ──────────────────────────────────────
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-act]');
    if (!t) return;
    var act = t.dataset.act;
    var id = t.dataset.id;
    var rid = t.dataset.rid, iid = t.dataset.iid, si = parseInt(t.dataset.si, 10);

    switch (act) {
      case 'new-routine': {
        var name = prompt('새 루틴 이름', '나의 루틴');
        if (!name) return;
        var r = S.createRoutine(name.trim());
        go('routine/' + r.id);
        break;
      }
      case 'edit-routine': go('routine/' + id); break;
      case 'back': go('routines'); break;
      case 'back-history': go('history'); break;
      case 'open-progress': go('progress/' + id); break;
      case 'back-progress': go('progress'); break;
      case 'ch-pick': {
        // 점을 누르면 그 차트 아래에 그 날 기록을 적는다
        var read = document.querySelector('[data-read="' + t.dataset.key + '"]');
        if (read) { read.textContent = t.dataset.lab; read.classList.add('on'); }
        break;
      }
      case 'goto-session': go('session'); break;

      case 'dup-routine': S.duplicateRoutine(id); toast('복제했습니다'); render(); break;
      case 'del-routine':
        if (confirm('루틴을 삭제할까요? 되돌릴 수 없습니다.')) { S.deleteRoutine(id); render(); }
        break;

      case 'routine-menu': openRoutineMenu(id, t); break;
      case 'menu-edit': closeModal(); go('routine/' + id); break;
      case 'menu-dup': closeModal(); S.duplicateRoutine(id); toast('복제했습니다'); render(); break;
      case 'menu-del':
        closeModal();
        if (confirm('루틴을 삭제할까요? 되돌릴 수 없습니다.')) { S.deleteRoutine(id); render(); }
        break;

      case 'start-routine': {
        var rt = S.getRoutine(id);
        if (!rt) return;
        if (!rt.items.length) {
          toast('운동을 먼저 추가해 주세요');
          go('routine/' + id);
          return;
        }
        if (S.active() && !confirm('진행 중인 운동이 있습니다. 새로 시작할까요? (진행 중인 기록은 사라집니다)')) return;
        S.startSession(id);
        stopRest();
        go('session');
        break;
      }

      case 'toggle-item':
        openItems[t.dataset.id] = !openItems[t.dataset.id];
        render();
        break;

      case 'open-picker': openPicker(id); break;
      case 'reset-rest': {
        var n = S.resetAllRest();
        toast(n ? n + '개 운동을 기본값으로 되돌렸습니다' : '모두 이미 기본값입니다');
        break;
      }
      case 'close-modal': closeModal(); break;
      case 'pk-filter':
        picker[t.dataset.key] = t.dataset.v;
        updatePicker();
        break;
      case 'pk-add': {
        var ex = S.findExercise(t.dataset.id);
        if (!ex) return;
        var cardio = ex.type === 'time' && ex.part === '유산소';
        // 유산소는 픽커의 세트 기본값을 쓰지 않는다 (한 번에 쭉 하는 운동)
        S.addItem(picker.routineId, ex, cardio ? {} : { sets: picker.sets, reps: picker.reps });
        toast('“' + ex.name + '” 추가됨');
        render();
        break;
      }
      case 'pk-custom': customExerciseForm(); break;

      case 'add-set': {
        var r2 = S.getRoutine(rid);
        var it2 = r2.items.filter(function (i) { return i.id === iid; })[0];
        var last = it2.sets[it2.sets.length - 1];
        it2.sets.push(last ? Object.assign({}, last) : (it2.type === 'time' ? { sec: 60 } : { reps: 10, weight: 0 }));
        S.commit(); render();
        break;
      }
      case 'del-set': {
        var r3 = S.getRoutine(rid);
        var it3 = r3.items.filter(function (i) { return i.id === iid; })[0];
        if (it3.sets.length <= 1) { toast('최소 1세트는 필요합니다'); return; }
        it3.sets.splice(si, 1);
        S.commit(); render();
        break;
      }
      case 'fill-sets': {
        var r4 = S.getRoutine(rid);
        var it4 = r4.items.filter(function (i) { return i.id === iid; })[0];
        var first = it4.sets[0];
        it4.sets = it4.sets.map(function () { return Object.assign({}, first); });
        S.commit(); render(); toast('전체 세트를 1세트 값으로 맞췄습니다');
        break;
      }
      case 'move-item': S.moveItem(rid, iid, parseInt(t.dataset.dir, 10)); render(); break;
      case 'del-item':
        if (confirm('이 운동을 루틴에서 뺄까요?')) { S.removeItem(rid, iid); render(); }
        break;

      // ── 세션 ──
      case 'toggle-set': {
        var s = S.active();
        if (!s) return;
        var item = s.items.filter(function (i) { return i.id === iid; })[0];
        var st = item.sets[si];
        st.done = !st.done;
        st.doneAt = st.done ? Date.now() : null;
        S.commit();
        if (st.done) {
          var restSec = S.restOf(item);
          if (restSec) startRest(restSec, item.name + ' ' + (si + 1) + '세트 완료');
          else beep();
        }
        render();
        break;
      }
      case 'live-add-set': {
        S.updateActive(function (s) {
          var it = s.items.filter(function (i) { return i.id === iid; })[0];
          var last = it.sets[it.sets.length - 1];
          it.sets.push(Object.assign({}, last || (it.type === 'time' ? { sec: 60 } : { reps: 10, weight: 0 }),
            { done: false, doneAt: null }));
        });
        render();
        break;
      }
      case 'live-del-set': {
        S.updateActive(function (s) {
          var it = s.items.filter(function (i) { return i.id === iid; })[0];
          if (it.sets.length > 1) it.sets.pop();
        });
        render();
        break;
      }
      case 'rest-adj': adjustRest(parseInt(t.dataset.v, 10)); break;
      case 'rest-skip': stopRest(); break;
      case 'cancel-session':
        if (confirm('진행 중인 운동을 중단할까요? 기록이 저장되지 않습니다.')) {
          S.cancelSession(); stopRest(); go('routines'); render();
        }
        break;
      case 'finish-session': {
        var cur = S.active();
        if (!cur) return;
        var cnt = S.countSets(cur);
        if (!cnt.done) {
          if (!confirm('완료한 세트가 없습니다. 기록 없이 종료할까요?')) return;
          S.cancelSession(); stopRest(); go('routines'); render(); return;
        }
        if (cnt.done < cnt.total && !confirm('남은 세트가 ' + (cnt.total - cnt.done) + '개 있습니다. 지금 완료할까요?')) return;
        var saved = S.finishSession();
        stopRest();
        toast('기록을 저장했습니다');
        go(saved ? 'history/' + saved.id : 'history');
        break;
      }

      // ── 기록 ──
      case 'bm-sel':
        bmSel = (bmSel === t.dataset.m) ? null : t.dataset.m;
        render();
        break;
      case 'open-history': go('history/' + id); break;
      case 'del-history':
        if (confirm('이 기록을 삭제할까요?')) { S.deleteSession(id); go('history'); }
        break;

      // ── 설정 ──
      case 'check-update': {
        toast('최신 버전을 확인합니다');
        var reload = function () { location.reload(); };
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
          navigator.serviceWorker.getRegistration()
            .then(function (reg) { return reg ? reg.update() : null; })
            .then(reload, reload);
        } else {
          reload();
        }
        break;
      }
      case 'voice-pick':
        S.settings.voice = t.dataset.v || '';
        S.commit();
        if (S.settings.voice) { unlockAudio(); playVoice(S.settings.voice); }
        render();
        break;
      case 'voice-play':
        unlockAudio();
        playVoice(t.dataset.v);
        break;
      case 'del-custom':
        if (confirm('이 운동을 삭제할까요? 기존 루틴의 항목은 그대로 유지됩니다.')) {
          S.removeCustomExercise(id); render();
        }
        break;
      case 'export': openExportSheet(); break;
      case 'export-copy': {
        var text = document.getElementById('exp-json').value;
        copyText(text).then(function (ok) {
          toast(ok ? '백업 내용을 복사했습니다' : '복사 실패 — 직접 선택해 복사해 주세요');
        });
        break;
      }
      case 'export-file': {
        var blob = new Blob([S.exportJSON()], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'gymmate-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        break;
      }
      case 'import-text': {
        var text2 = prompt('백업 내용(JSON)을 붙여넣어 주세요.');
        if (!text2) return;
        try { var rep = S.importJSON(text2); toast(importMsg(rep)); closeModal(); render(); }
        catch (e) { alert('가져오기 실패: ' + e.message); }
        break;
      }
      case 'import': {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = function () {
          var f = input.files[0];
          if (!f) return;
          var reader = new FileReader();
          reader.onload = function () {
            try { var rep2 = S.importJSON(reader.result); toast(importMsg(rep2)); render(); }
            catch (e) { alert('가져오기 실패: ' + e.message); }
          };
          reader.readAsText(f);
        };
        input.click();
        break;
      }
      case 'reset':
        if (confirm('모든 루틴과 기록이 삭제됩니다. 계속할까요?')) { S.resetAll(); go('routines'); render(); }
        break;
    }
  });

  // 입력값 반영 (입력 즉시 + 확정 시점 모두)
  function onFieldChange(ev) {
    var t = ev.target.closest('[data-bind]');
    if (!t) return;
    var bind = t.dataset.bind;
    var rid = t.dataset.rid, iid = t.dataset.iid, si = parseInt(t.dataset.si, 10);

    function editSet(fn) {
      var r = S.getRoutine(rid);
      if (!r) return;
      var it = r.items.filter(function (i) { return i.id === iid; })[0];
      if (!it || !it.sets[si]) return;
      fn(it.sets[si], it);
      S.commit();
    }
    function editLiveSet(fn) {
      S.updateActive(function (s) {
        var it = s.items.filter(function (i) { return i.id === iid; })[0];
        if (it && it.sets[si]) fn(it.sets[si]);
      });
    }

    switch (bind) {
      case 'routine-name': S.updateRoutine(t.dataset.id, { name: t.value.trim() || '이름 없는 루틴' }); break;
      case 'routine-memo': S.updateRoutine(t.dataset.id, { memo: t.value.trim() }); break;
      case 'set-weight': editSet(function (st) { st.weight = num(t.value, 0); }); refreshItemSummary(rid, iid); break;
      case 'set-reps': editSet(function (st) { st.reps = Math.max(0, Math.round(num(t.value, 0))); }); refreshItemSummary(rid, iid); break;
      case 'set-sec': editSet(function (st) { st.sec = Math.max(0, Math.round(num(t.value, 0))); }); refreshItemSummary(rid, iid); break;
      // 속도·경사는 비워 두면 그 운동의 기본 강도로 계산한다
      case 'set-watt': editSet(function (st) { st.watt = blankOrNum(t.value, 0, 600); }); refreshItemSummary(rid, iid); break;
      case 'set-level': editSet(function (st) { st.level = Number(t.value); }); refreshItemSummary(rid, iid); break;
      case 'set-min': editSet(function (st) { st.sec = Math.max(0, Math.round(num(t.value, 0) * 60)); }); refreshItemSummary(rid, iid); break;
      case 'set-speed': editSet(function (st) { st.speed = blankOrNum(t.value, 0, 40); }); refreshItemSummary(rid, iid); break;
      case 'set-grade': editSet(function (st) { st.grade = blankOrNum(t.value, 0, 30); }); refreshItemSummary(rid, iid); break;
      case 'item-rest':
        // 빈 칸은 "기본값 따름"(null) 이다
        S.updateItem(rid, iid, {
          restSec: t.value.trim() === '' ? null : Math.max(0, Math.round(num(t.value, 0)))
        });
        refreshItemSummary(rid, iid);
        break;
      case 'item-memo': S.updateItem(rid, iid, { memo: t.value }); break;

      case 'live-weight': editLiveSet(function (st) { st.weight = num(t.value, 0); }); break;
      case 'live-reps': editLiveSet(function (st) { st.reps = Math.max(0, Math.round(num(t.value, 0))); }); break;
      case 'live-sec': editLiveSet(function (st) { st.sec = Math.max(0, Math.round(num(t.value, 0))); }); break;
      case 'live-watt': editLiveSet(function (st) { st.watt = blankOrNum(t.value, 0, 600); }); refreshKcal(); break;
      case 'live-level': editLiveSet(function (st) { st.level = Number(t.value); }); refreshKcal(); break;
      case 'live-min': editLiveSet(function (st) { st.sec = Math.max(0, Math.round(num(t.value, 0) * 60)); }); refreshKcal(); break;
      case 'live-speed': editLiveSet(function (st) { st.speed = blankOrNum(t.value, 0, 40); }); refreshKcal(); break;
      case 'live-grade': editLiveSet(function (st) { st.grade = blankOrNum(t.value, 0, 30); }); refreshKcal(); break;
      case 'live-rest': {
        // 빈 칸은 "기본값 따름"(null) 이다
        var blank = t.value.trim() === '';
        var sec = blank ? null : Math.max(0, Math.round(num(t.value, 0)));
        S.updateActive(function (s) {
          var it = s.items.filter(function (i) { return i.id === iid; })[0];
          if (it) it.restSec = sec;
        });
        // 오늘 운동뿐 아니라 원래 루틴에도 반영해 다음에도 같은 값이 쓰이게 한다
        var cur = S.active();
        if (cur && S.getRoutine(cur.routineId)) S.updateItem(cur.routineId, iid, { restSec: sec });
        if (ev.type === 'change') {
          toast(blank ? '기본 휴식 시간을 따릅니다' : '휴식 ' + sec + '초 · 루틴에도 저장됨');
        }
        break;
      }

      case 'set-rest':
        S.settings.defaultRest = Math.max(0, Math.round(num(t.value, 90)));
        S.commit();
        break;
      case 'set-unit':
        S.settings.unit = t.value; S.commit();
        if (ev.type === 'change') render();
        break;
      case 'set-sound': S.settings.sound = t.checked; S.commit(); break;
      case 'set-weight-kg':
        S.settings.bodyWeight = Math.min(250, Math.max(20, num(t.value, 70)));
        S.commit();
        break;

      case 'pk-sets': picker.sets = Math.max(1, Math.round(num(t.value, 3))); break;
      case 'pk-reps': picker.reps = Math.max(1, Math.round(num(t.value, 10))); break;
    }
  }
  document.addEventListener('change', onFieldChange);
  document.addEventListener('input', onFieldChange);

  // 검색어는 입력 즉시 반영 (입력창은 건드리지 않아 한글 조합이 유지된다)
  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.dataset && t.dataset.bind === 'pk-q') {
      picker.q = t.value;
      updatePicker();
    }
  });
  // 한글·일본어 등 조합 입력이 확정되는 순간에도 한 번 갱신
  document.addEventListener('compositionend', function (ev) {
    var t = ev.target;
    if (t && t.dataset && t.dataset.bind === 'pk-q') {
      picker.q = t.value;
      updatePicker();
    }
  });

  // 진행 중 운동이 있으면 실수로 창을 닫지 않도록 경고
  window.addEventListener('beforeunload', function (e) {
    if (S.active() && S.countSets(S.active()).done > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // 시작
  route = parseHash();
  if (!location.hash) location.hash = '#/routines';
  restoreRest();
  render();
})();
