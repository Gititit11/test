/* 마중물 — 화면
 *
 * 마중물: 펌프에서 물이 나오게 하려고 먼저 붓는 한 바가지의 물.
 * 한 잔이 하루의 물길을 튼다는 뜻으로 붙인 이름이다.
 */
(function () {
  'use strict';

  var app = document.getElementById('app');
  var modalRoot = document.getElementById('modal');
  var toastRoot = document.getElementById('toast');

  var route = 'home';
  var detailKey = null;     // 기록 탭에서 펼쳐 본 날짜

  /* ---------- 자잘한 도구 ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function ml(n) { return Number(n).toLocaleString('ko-KR'); }

  /* 하루가 바뀌는 시각(기본 새벽 4시) 이전에 마신 물은 전날 기록에 들어간다.
     그 줄만 "오전" 이라고 적으면 목록이 거꾸로 놓인 것처럼 보이므로 "새벽" 으로 구분한다. */
  function timeText(ts) {
    var d = new Date(ts), h = d.getHours();
    var ampm = h < Store.settings().dayStart ? '새벽 ' : (h < 12 ? '오전 ' : '오후 ');
    return ampm + (h % 12 === 0 ? 12 : h % 12) +
      ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }

  function dayText(key) {
    var p = key.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    var w = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    var today = Store.todayKey();
    if (key === today) return '오늘';
    if (key === Store.shiftKey(today, -1)) return '어제';
    return (+p[1]) + '월 ' + (+p[2]) + '일 (' + w + ')';
  }

  var toastTimer = null;
  function toast(msg, action) {
    toastRoot.innerHTML = '<div class="toast">' + esc(msg) +
      (action ? '<button class="toast-btn" data-act="toast-action">' + esc(action.label) + '</button>' : '') +
      '</div>';
    if (action) {
      toastRoot.querySelector('[data-act="toast-action"]').onclick = function () {
        toastRoot.innerHTML = ''; action.run();
      };
    }
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastRoot.innerHTML = ''; }, action ? 5000 : 2200);
  }

  function closeModal() { modalRoot.className = 'modal'; modalRoot.innerHTML = ''; }

  function openModal(title, inner, onMount) {
    modalRoot.className = 'modal open';
    modalRoot.innerHTML =
      '<div class="modal-back" data-act="modal-close"></div>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
        '<div class="sheet-head"><h3>' + esc(title) + '</h3>' +
        '<button class="icon-btn" data-act="modal-close" aria-label="닫기">✕</button></div>' +
        '<div class="sheet-body">' + inner + '</div>' +
      '</div>';
    if (onMount) onMount(modalRoot);
  }

  /* ---------- 오늘 ---------- */

  function glass(t) {
    var pct = t.goal > 0 ? Math.min(100, Math.round(t.ml / t.goal * 100)) : 0;
    var over = t.ml >= t.goal && t.goal > 0;
    return '' +
      '<div class="glass' + (over ? ' full' : '') + '">' +
        '<div class="water" style="height:' + pct + '%">' +
          // 0% 일 때 물결까지 그리면 바닥에 물이 조금 남은 것처럼 보인다
          (pct > 0 ? '<div class="wave"></div><div class="wave two"></div>' : '') +
        '</div>' +
        '<div class="glass-face">' +
          '<div class="glass-pct">' + pct + '<span>%</span></div>' +
          '<div class="glass-ml">' + ml(t.ml) + ' <span>/ ' + ml(t.goal) + ' mL</span></div>' +
          '<div class="glass-cnt">' + t.count + '번 · ' +
            (Store.settings().cup > 0 ? (t.ml / Store.settings().cup).toFixed(1) + '잔' : '') + '</div>' +
        '</div>' +
      '</div>';
  }

  function nextLine() {
    var r = Store.remind();
    if (!r.on) return '<div class="next off" data-act="go-remind">알림 꺼짐 · 켜려면 여기를 누르세요</div>';
    if (Remind.permission() !== 'granted') {
      return '<div class="next warn" data-act="go-remind">알림 권한이 필요해요 · 눌러서 허용하기</div>';
    }
    var at = Remind.nextAt(Date.now());
    if (!at) return '<div class="next" data-act="go-remind">오늘은 더 안 부를게 · 목표 달성!</div>';
    return '<div class="next" data-act="go-remind">다음 알림 · ' + Remind.label(at) +
      ' <span class="dim">(' + Remind.untilText(at) + ')</span></div>';
  }

  function homePage() {
    var t = Store.today();
    var s = Store.settings();
    var presets = (s.presets || []).slice(0, 6);

    var quick = presets.map(function (p) {
      return '<button class="quick" data-act="add" data-ml="' + p + '">' +
        '<span class="quick-ico">' + cupIcon(p) + '</span>' +
        '<span class="quick-ml">' + p + '<em>mL</em></span></button>';
    }).join('');

    var logs = t.logs.slice().reverse().map(function (l) {
      return '<li class="log"><span class="log-time">' + timeText(l.at) + '</span>' +
        '<span class="log-ml">' + ml(l.ml) + ' mL</span>' +
        '<button class="icon-btn ghost" data-act="del-log" data-id="' + esc(l.id) + '" aria-label="삭제">✕</button></li>';
    }).join('');

    return '' +
      '<div class="page">' +
        glass(t) +
        nextLine() +
        '<div class="quick-grid">' + quick +
          '<button class="quick custom" data-act="custom"><span class="quick-ico">✎</span>' +
          '<span class="quick-ml">직접<em>입력</em></span></button>' +
        '</div>' +
        (Store.canUndo() ? '<button class="btn ghost block" data-act="undo">방금 기록 취소</button>' : '') +
        '<div class="card">' +
          '<h3>오늘 기록 <span class="dim">' + t.count + '번</span></h3>' +
          (logs ? '<ul class="list logs">' + logs + '</ul>'
                : '<p class="dim empty">아직 비어 있어요. 위에서 한 잔 눌러 시작해요 💧</p>') +
        '</div>' +
      '</div>';
  }

  /* 양에 따라 잔 모양을 다르게 — 눈으로 크기를 가늠하게 */
  function cupIcon(v) {
    if (v <= 120) return '🥃';
    if (v <= 250) return '🥛';
    if (v <= 400) return '☕';
    return '🍶';
  }

  /* ---------- 기록 ---------- */

  function historyPage() {
    var days = Store.recent(14);
    var max = Math.max.apply(null, days.map(function (d) { return d.ml; }).concat([Store.settings().goal]));
    var bars = days.map(function (d) {
      var h = max > 0 ? Math.max(2, Math.round(d.ml / max * 100)) : 2;
      var p = d.key.split('-');
      return '<button class="bar-col' + (d.ml >= d.goal && d.ml > 0 ? ' done' : '') +
        (d.key === detailKey ? ' sel' : '') + '" data-act="pick-day" data-key="' + d.key + '">' +
        '<span class="bar-wrap"><span class="bar" style="height:' + h + '%"></span></span>' +
        '<span class="bar-day">' + (+p[2]) + '</span></button>';
    }).join('');

    var w = Store.summary(7), m = Store.summary(30);
    var detail = '';
    if (detailKey) {
      var list = Store.logsOf(detailKey);
      var tot = list.reduce(function (s, l) { return s + l.ml; }, 0);
      detail = '<div class="card">' +
        '<div class="row between"><h3>' + esc(dayText(detailKey)) + '</h3>' +
        '<span class="dim">' + ml(tot) + ' mL · ' + list.length + '번</span></div>' +
        (list.length
          ? '<ul class="list logs">' + list.slice().reverse().map(function (l) {
              return '<li class="log"><span class="log-time">' + timeText(l.at) + '</span>' +
                '<span class="log-ml">' + ml(l.ml) + ' mL</span>' +
                '<button class="icon-btn ghost" data-act="del-log" data-id="' + esc(l.id) + '" aria-label="삭제">✕</button></li>';
            }).join('') + '</ul>'
          : '<p class="dim empty">이 날은 기록이 없어요.</p>') +
        '</div>';
    }

    return '' +
      '<div class="page">' +
        '<div class="card">' +
          '<h3>최근 2주</h3>' +
          '<div class="chart" style="--goal:' + (max > 0 ? Math.min(1, Store.settings().goal / max).toFixed(3) : 0) + '">' +
            '<div class="goal-line"><span>목표</span></div>' + bars +
          '</div>' +
        '</div>' +
        detail +
        '<div class="stats">' +
          stat('연속 달성', Store.streak() + '일', '목표를 채운 날이 이어진 기간') +
          stat('7일 평균', ml(w.avg) + ' mL', w.days + '일 기록 기준') +
          stat('7일 달성률', w.rate + '%', w.done + ' / ' + w.days + '일') +
          stat('30일 평균', ml(m.avg) + ' mL', m.days + '일 기록 기준') +
        '</div>' +
      '</div>';
  }

  function stat(label, value, sub) {
    return '<div class="stat"><div class="stat-v">' + esc(value) + '</div>' +
      '<div class="stat-l">' + esc(label) + '</div><div class="stat-s">' + esc(sub) + '</div></div>';
  }

  /* ---------- 알림 ---------- */

  function remindPage() {
    var r = Store.remind();
    var perm = Remind.permission();
    var at = r.on ? Remind.nextAt(Date.now()) : 0;

    var permNote = '';
    if (perm === 'unsupported') {
      permNote = note('warn', '이 브라우저는 알림을 지원하지 않아요. 앱을 열어 두면 화면 안에서만 알려 줄게요.');
    } else if (perm === 'denied') {
      permNote = note('warn', '알림이 차단돼 있어요. 브라우저 주소창의 자물쇠 → 알림 → 허용으로 바꿔 주세요.');
    } else if (perm === 'default' && r.on) {
      permNote = note('warn', '아직 알림을 허용하지 않았어요. 아래 버튼으로 허용해 주세요.');
    }

    var everyChips = [30, 60, 90, 120, 180].map(function (v) {
      return '<button class="chip' + (r.everyMin === v ? ' on' : '') +
        '" data-act="set-every" data-v="' + v + '">' + (v < 60 ? v + '분' : (v / 60) + '시간') + '</button>';
    }).join('') +
    '<button class="chip' + ([30, 60, 90, 120, 180].indexOf(r.everyMin) < 0 ? ' on' : '') +
      '" data-act="every-custom">직접 (' + r.everyMin + '분)</button>';

    var timeChips = (r.times || []).slice().sort().map(function (t) {
      return '<button class="chip time" data-act="del-time" data-v="' + esc(t) + '">' +
        esc(t) + ' <em>✕</em></button>';
    }).join('') + '<button class="chip add" data-act="add-time">＋ 시각 추가</button>';

    var dayBtns = ['일', '월', '화', '수', '목', '금', '토'].map(function (d, i) {
      return '<button class="day' + (r.days.indexOf(i) >= 0 ? ' on' : '') +
        '" data-act="toggle-day" data-v="' + i + '">' + d + '</button>';
    }).join('');

    return '' +
      '<div class="page">' +
        '<div class="card">' +
          row('물 마실 시간 알림', toggle('remind-on', r.on)) +
          '<p class="dim">정한 시간이 되면 "물 마셔" 하고 불러 줄게요.</p>' +
        '</div>' +
        permNote +
        (perm === 'default' || perm === 'denied'
          ? '<button class="btn block" data-act="ask-perm">알림 허용하기</button>' : '') +
        (r.on ? '' +
          '<div class="card">' +
            '<h3>어떻게 부를까</h3>' +
            '<div class="seg">' +
              '<button class="' + (r.mode === 'interval' ? 'on' : '') + '" data-act="mode" data-v="interval">일정 간격</button>' +
              '<button class="' + (r.mode === 'times' ? 'on' : '') + '" data-act="mode" data-v="times">정한 시각</button>' +
            '</div>' +
            (r.mode === 'interval'
              ? '<div class="chips">' + everyChips + '</div>' +
                row('마시면 간격을 다시 셈', toggle('after-drink', r.afterDrink)) +
                '<p class="dim">켜 두면 방금 마신 시각부터 간격을 다시 세요. 꺼 두면 정해진 간격대로 계속 불러요.</p>'
              : '<div class="chips">' + timeChips + '</div>') +
          '</div>' +
          '<div class="card">' +
            '<h3>부르는 시간대</h3>' +
            '<div class="row gap times-row">' +
              '<label class="field"><span>시작</span><input type="time" data-act="from" value="' + esc(r.from) + '"></label>' +
              '<label class="field"><span>끝</span><input type="time" data-act="to" value="' + esc(r.to) + '"></label>' +
            '</div>' +
            '<div class="days">' + dayBtns + '</div>' +
            '<p class="dim">자는 동안에는 부르지 않도록 기상~취침 시간으로 맞춰 두세요.</p>' +
          '</div>' +
          '<div class="card">' +
            row('목표를 채우면 그만 부르기', toggle('skip-done', r.skipWhenDone)) +
            row('알림음', toggle('sound', Store.settings().sound)) +
            row('진동', toggle('vibrate', Store.settings().vibrate)) +
            row('"조금 뒤에" 를 누르면', '<span class="dim">' +
              '<button class="chip mini" data-act="snooze-min">' + r.snoozeMin + '분 뒤</button></span>') +
          '</div>' +
          '<div class="card next-card">' +
            '<h3>다음 알림</h3>' +
            (at ? '<div class="next-big">' + Remind.label(at) + '<span class="dim"> · ' + Remind.untilText(at) + '</span></div>'
                : '<div class="next-big dim">예정 없음</div>') +
            '<button class="btn ghost block" data-act="test">지금 한 번 보내 보기</button>' +
          '</div>' +
          note('info', '앱을 완전히 닫으면 브라우저가 알림을 대신 울려 주지 못할 수 있어요. ' +
            '홈 화면에 설치해 두고 백그라운드에 남겨 두면 가장 잘 동작해요. ' +
            '아이폰은 홈 화면에 설치(공유 → 홈 화면에 추가)해야 알림을 받을 수 있어요.')
        : '') +
      '</div>';
  }

  function note(kind, text) { return '<div class="note ' + kind + '">' + esc(text) + '</div>'; }
  function row(label, right) {
    return '<div class="row between line"><span>' + label + '</span>' + right + '</div>';
  }
  function toggle(act, on) {
    return '<button class="sw' + (on ? ' on' : '') + '" role="switch" aria-checked="' + !!on +
      '" data-act="' + act + '"><span></span></button>';
  }

  /* ---------- 설정 ---------- */

  function settingsPage() {
    var s = Store.settings();
    var goals = [1500, 2000, 2500, 3000];
    var goalChips = goals.map(function (g) {
      return '<button class="chip' + (s.goal === g ? ' on' : '') + '" data-act="set-goal" data-v="' + g + '">' +
        ml(g) + '</button>';
    }).join('') +
    '<button class="chip' + (goals.indexOf(s.goal) < 0 ? ' on' : '') + '" data-act="goal-custom">직접 (' + ml(s.goal) + ')</button>';

    var presetChips = (s.presets || []).map(function (p, i) {
      return '<button class="chip time" data-act="edit-preset" data-i="' + i + '">' + p + ' mL <em>✎</em></button>';
    }).join('') + (s.presets.length < 6 ? '<button class="chip add" data-act="add-preset">＋ 추가</button>' : '');

    return '' +
      '<div class="page">' +
        '<div class="card">' +
          '<h3>하루 목표</h3>' +
          '<div class="chips">' + goalChips + '</div>' +
          '<p class="dim">몸무게 × 30 mL 정도가 흔한 기준이에요. 70 kg 이면 약 2,100 mL.</p>' +
        '</div>' +
        '<div class="card">' +
          '<h3>빠른 추가 버튼</h3>' +
          '<div class="chips">' + presetChips + '</div>' +
          '<p class="dim">눌러서 양을 바꾸고, 0 으로 두면 지워져요.</p>' +
        '</div>' +
        '<div class="card">' +
          row('한 잔 기준', '<button class="chip mini" data-act="set-cup">' + s.cup + ' mL</button>') +
          row('하루가 바뀌는 시각', '<button class="chip mini" data-act="set-daystart">새벽 ' + s.dayStart + '시</button>') +
          '<p class="dim">새벽에 마신 물을 전날 기록으로 넣으려면 하루가 바뀌는 시각을 늦춰 두세요.</p>' +
        '</div>' +
        '<div class="card">' +
          '<h3>기록 관리</h3>' +
          '<div class="stack">' +
            '<button class="btn ghost block" data-act="export">백업 내보내기 (.json)</button>' +
            '<button class="btn ghost block" data-act="import">백업 가져오기</button>' +
            '<button class="btn danger block" data-act="reset">기록 전체 지우기</button>' +
          '</div>' +
          '<input type="file" accept="application/json,.json" id="importFile" hidden>' +
        '</div>' +
        '<div class="card about">' +
          '<h3>마중물</h3>' +
          '<p class="dim">펌프에서 물이 나오게 하려고 먼저 붓는 한 바가지의 물이 마중물이에요. ' +
          '오늘의 첫 잔이 하루의 물길을 틔우기를.</p>' +
          '<p class="dim">기록은 이 기기의 브라우저에만 저장돼요. 서버로 보내지 않아요.</p>' +
        '</div>' +
      '</div>';
  }

  /* ---------- 틀 ---------- */

  var TABS = [
    { id: 'home', label: '오늘', ico: '💧' },
    { id: 'history', label: '기록', ico: '📊' },
    { id: 'remind', label: '알림', ico: '🔔' },
    { id: 'settings', label: '설정', ico: '⚙️' }
  ];

  var TITLES = { home: '마중물', history: '기록', remind: '알림', settings: '설정' };

  function render() {
    var body =
      route === 'history' ? historyPage() :
      route === 'remind' ? remindPage() :
      route === 'settings' ? settingsPage() : homePage();

    app.innerHTML =
      '<header class="topbar"><h1>' + esc(TITLES[route] || '마중물') + '</h1>' +
        (route === 'home' ? '<span class="streak" title="연속 달성">🔥 ' + Store.streak() + '</span>' : '') +
      '</header>' + body +
      '<nav class="tabbar">' + TABS.map(function (t) {
        return '<button class="tab' + (route === t.id ? ' on' : '') + '" data-act="tab" data-v="' + t.id + '">' +
          '<span class="tab-ico">' + t.ico + '</span><span>' + t.label + '</span></button>';
      }).join('') + '</nav>';
  }

  function go(r) {
    route = r;
    if (r !== 'history') detailKey = null;
    location.hash = '#/' + r;
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- 입력 모달 ---------- */

  /* 숫자 하나를 받는 작은 창. 모바일에서 바로 숫자 자판이 뜨도록 inputmode 를 준다. */
  function askNumber(title, opts, done) {
    openModal(title,
      '<label class="field big"><input type="number" inputmode="numeric" pattern="[0-9]*" ' +
        'id="numInput" value="' + (opts.value != null ? opts.value : '') + '" ' +
        'min="' + (opts.min || 0) + '" max="' + (opts.max || 99999) + '" step="' + (opts.step || 1) + '">' +
        '<span class="unit">' + esc(opts.unit || '') + '</span></label>' +
      (opts.hint ? '<p class="dim">' + esc(opts.hint) + '</p>' : '') +
      (opts.chips ? '<div class="chips">' + opts.chips.map(function (c) {
        return '<button class="chip" data-act="num-chip" data-v="' + c + '">' + c + '</button>';
      }).join('') + '</div>' : '') +
      '<button class="btn block" data-act="num-ok">확인</button>',
      function (rootEl) {
        var input = rootEl.querySelector('#numInput');
        setTimeout(function () { input.focus(); input.select(); }, 50);
        rootEl.addEventListener('click', function (e) {
          var b = e.target.closest('[data-act]');
          if (!b) return;
          if (b.dataset.act === 'num-chip') { input.value = b.dataset.v; }
          if (b.dataset.act === 'num-ok') { closeModal(); done(Number(input.value)); }
        });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { closeModal(); done(Number(input.value)); }
        });
      });
  }

  function askTime(title, value, done) {
    openModal(title,
      '<label class="field big"><input type="time" id="timeInput" value="' + esc(value || '09:00') + '"></label>' +
      '<button class="btn block" data-act="time-ok">확인</button>',
      function (rootEl) {
        var input = rootEl.querySelector('#timeInput');
        rootEl.addEventListener('click', function (e) {
          var b = e.target.closest('[data-act="time-ok"]');
          if (b) { closeModal(); done(input.value); }
        });
      });
  }

  /* ---------- 동작 ---------- */

  function addWater(amount) {
    Store.add(amount);
    Remind.sync();
    var t = Store.today();
    if (t.ml >= t.goal && t.ml - amount < t.goal) {
      toast('오늘 목표 달성! 🎉 ' + ml(t.ml) + ' mL');
      Remind.beep();
    } else {
      toast(ml(amount) + ' mL 기록 · 오늘 ' + ml(t.ml) + ' mL', { label: '취소', run: function () {
        Store.undo(); Remind.sync(); render();
      } });
    }
    render();
  }

  var ACTS = {
    tab: function (b) { go(b.dataset.v); },
    'go-remind': function () {
      if (Remind.permission() === 'default') Remind.request().then(function () { go('remind'); });
      else go('remind');
    },
    add: function (b) { addWater(Number(b.dataset.ml)); },
    custom: function () {
      askNumber('마신 양', { value: Store.settings().cup, unit: 'mL', min: 1, max: 5000, step: 10,
        chips: [50, 100, 150, 200, 250, 300, 500, 700] }, function (v) {
        if (v > 0) addWater(v);
      });
    },
    undo: function () { Store.undo(); Remind.sync(); render(); toast('되돌렸어요'); },
    'del-log': function (b) { Store.remove(b.dataset.id); Remind.sync(); render(); },
    'pick-day': function (b) { detailKey = detailKey === b.dataset.key ? null : b.dataset.key; render(); },

    /* 알림 */
    'remind-on': function () {
      var r = Store.remind();
      if (r.on) { Store.setRemind({ on: false }); Remind.sync(); render(); return; }
      Store.setRemind({ on: true, lastFired: 0, snoozeUntil: 0 });
      if (Remind.permission() === 'default') {
        Remind.request().then(function (p) {
          if (p !== 'granted') toast('알림을 허용해야 앱 밖에서도 부를 수 있어요');
          Remind.sync(); render();
        });
      } else { Remind.registerPeriodic(); Remind.sync(); }
      render();
    },
    'ask-perm': function () {
      Remind.request().then(function (p) {
        toast(p === 'granted' ? '알림을 허용했어요' : '알림이 허용되지 않았어요');
        render();
      });
    },
    mode: function (b) { Store.setRemind({ mode: b.dataset.v }); Remind.sync(); render(); },
    'set-every': function (b) { Store.setRemind({ everyMin: Number(b.dataset.v) }); Remind.sync(); render(); },
    'every-custom': function () {
      askNumber('알림 간격', { value: Store.remind().everyMin, unit: '분', min: 10, max: 480, step: 5,
        chips: [20, 45, 75, 150, 240] }, function (v) {
        if (v >= 10) { Store.setRemind({ everyMin: Math.round(v) }); Remind.sync(); }
        render();
      });
    },
    'add-time': function () {
      askTime('알림 시각 추가', '09:00', function (v) {
        if (!v) return;
        var times = Store.remind().times.slice();
        if (times.indexOf(v) < 0) times.push(v);
        Store.setRemind({ times: times.sort() });
        Remind.sync(); render();
      });
    },
    'del-time': function (b) {
      var times = Store.remind().times.filter(function (t) { return t !== b.dataset.v; });
      Store.setRemind({ times: times }); Remind.sync(); render();
    },
    'toggle-day': function (b) {
      var v = Number(b.dataset.v), days = Store.remind().days.slice();
      var i = days.indexOf(v);
      if (i >= 0) days.splice(i, 1); else days.push(v);
      Store.setRemind({ days: days.sort() }); Remind.sync(); render();
    },
    'after-drink': function () { Store.setRemind({ afterDrink: !Store.remind().afterDrink }); Remind.sync(); render(); },
    'skip-done': function () { Store.setRemind({ skipWhenDone: !Store.remind().skipWhenDone }); Remind.sync(); render(); },
    sound: function () { Store.setSettings({ sound: !Store.settings().sound }); render(); },
    vibrate: function () { Store.setSettings({ vibrate: !Store.settings().vibrate }); render(); },
    'snooze-min': function () {
      askNumber('미루는 시간', { value: Store.remind().snoozeMin, unit: '분', min: 5, max: 120, step: 5,
        chips: [10, 15, 20, 30, 60] }, function (v) {
        if (v >= 5) Store.setRemind({ snoozeMin: Math.round(v) });
        render();
      });
    },
    test: function () {
      if (Remind.permission() !== 'granted') { toast('먼저 알림을 허용해 주세요'); return; }
      Remind.test().then(function (ok) {
        toast(ok ? '보냈어요. 화면을 잠깐 내려 보세요' : '알림을 보내지 못했어요');
      });
    },

    /* 설정 */
    'set-goal': function (b) { Store.setSettings({ goal: Number(b.dataset.v) }); Remind.sync(); render(); },
    'goal-custom': function () {
      askNumber('하루 목표', { value: Store.settings().goal, unit: 'mL', min: 200, max: 8000, step: 100,
        chips: [1200, 1800, 2200, 2800, 3500] }, function (v) {
        if (v >= 200) { Store.setSettings({ goal: Math.round(v) }); Remind.sync(); }
        render();
      });
    },
    'edit-preset': function (b) {
      var i = Number(b.dataset.i), presets = Store.settings().presets.slice();
      askNumber('빠른 추가 버튼', { value: presets[i], unit: 'mL', min: 0, max: 2000, step: 10,
        hint: '0 으로 두면 이 버튼을 지워요.', chips: [100, 150, 200, 250, 350, 500] }, function (v) {
        if (!v) presets.splice(i, 1); else presets[i] = Math.round(v);
        Store.setSettings({ presets: presets });
        render();
      });
    },
    'add-preset': function () {
      askNumber('빠른 추가 버튼', { value: 250, unit: 'mL', min: 10, max: 2000, step: 10,
        chips: [100, 150, 200, 250, 350, 500] }, function (v) {
        if (v > 0) {
          var presets = Store.settings().presets.concat([Math.round(v)]);
          Store.setSettings({ presets: presets.sort(function (a, b) { return a - b; }) });
        }
        render();
      });
    },
    'set-cup': function () {
      askNumber('한 잔 기준', { value: Store.settings().cup, unit: 'mL', min: 50, max: 1000, step: 10,
        chips: [150, 200, 250, 300] }, function (v) {
        if (v >= 50) { Store.setSettings({ cup: Math.round(v) }); Remind.sync(); }
        render();
      });
    },
    'set-daystart': function () {
      askNumber('하루가 바뀌는 시각', { value: Store.settings().dayStart, unit: '시', min: 0, max: 8, step: 1,
        hint: '0 이면 자정, 4 면 새벽 4시에 날짜가 넘어가요.' }, function (v) {
        Store.setSettings({ dayStart: Math.max(0, Math.min(8, Math.round(v))) });
        render();
      });
    },
    export: function () {
      var blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '마중물-백업-' + Store.todayKey() + '.json';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    },
    import: function () { document.getElementById('importFile').click(); },
    reset: function () {
      if (!confirm('지금까지의 물 기록을 모두 지울까요? 되돌릴 수 없어요.')) return;
      Store.reset(); Remind.sync(); render(); toast('전부 지웠어요');
    },
    'modal-close': function () { closeModal(); }
  };

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var fn = ACTS[b.dataset.act];
    if (fn) { e.preventDefault(); fn(b); }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.act === 'from') { Store.setRemind({ from: t.value }); Remind.sync(); render(); }
    if (t.dataset && t.dataset.act === 'to') { Store.setRemind({ to: t.value }); Remind.sync(); render(); }
    if (t.id === 'importFile' && t.files && t.files[0]) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var res = Store.importJSON(String(reader.result));
          toast('기록 ' + res.count + '개를 가져왔어요' + (res.dropped ? ' (' + res.dropped + '개는 건너뜀)' : ''));
        } catch (err) {
          alert('백업을 읽지 못했습니다: ' + err.message);
        }
        Remind.sync(); render();
      };
      reader.readAsText(t.files[0]);
    }
  });

  /* ---------- 시작 ---------- */

  function readHash() {
    var m = /^#\/(home|history|remind|settings)/.exec(location.hash || '');
    route = m ? m[1] : 'home';
  }

  window.addEventListener('hashchange', function () { readHash(); render(); });

  // 화면으로 돌아왔을 때: 날짜가 바뀌었을 수도, 알림에서 뭔가 눌렀을 수도 있다
  function refresh() {
    Remind.drainPending().then(function (n) {
      if (n) toast(n + '건을 알림에서 기록했어요');
      Remind.tick();
      render();
    });
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  if (navigator.serviceWorker) {
    // 알림 버튼을 누른 결과를 서비스워커가 바로 알려 준다
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'majungmul-pending') refresh();
    });
  }
  window.addEventListener('focus', refresh);
  document.addEventListener('pointerdown', function once() {
    Remind.unlockAudio();
    document.removeEventListener('pointerdown', once);
  });

  readHash();
  render();
  Remind.start(function (text) { toast('💧 ' + text); });
  Remind.drainPending().then(function (n) { if (n) render(); });

  // 자정(정확히는 하루가 바뀌는 시각)을 넘기면 화면을 새로 그린다
  var shownDay = Store.todayKey();
  setInterval(function () {
    var k = Store.todayKey();
    if (k !== shownDay) { shownDay = k; render(); }
    else if (route === 'home' || route === 'remind') {
      // 남은 시간 표시만 조용히 갱신
      var next = document.querySelector('.next, .next-big');
      if (next) render();
    }
  }, 30000);
})();
