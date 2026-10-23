/* 디지몬 육성 화면 흐름
 *
 *   알 고르기 → 육성 화면 ─ 훈련 / 바코드 스캔 → 배틀 / 도감 / 정보 / 보관함
 *                    └ 진화 연출은 엔진이 남긴 사건(events)을 보고 띄운다
 *
 * 상태는 localStorage 한 칸에 둔다. 앱을 닫아 둔 사이의 시간은 열 때 엔진이 따라잡는다.
 * 보관함의 디지몬은 시간이 멈춰 있어서 따라잡을 것이 없다.
 * 주소에 ?dev=1 을 붙이면 정보 화면에 시간 건너뛰기 버튼이 생긴다 (시험용).
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'digimon:v2'; // v1(스타터 6종 시절) 저장은 규칙이 달라 이어 쓰지 않는다
  var D = DigiData, E = Engine, R = D.RULES, H = E.HOUR, M = E.MIN;
  var DEV = /[?&]dev=1/.test(location.search);

  var state = load();
  function now() { return Date.now() + (state.meta.offset || 0); }

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.v === 2) return s;
    } catch (e) { }
    return E.newState();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { }
  }

  /* ---------- 공통 ---------- */
  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  // 받침이 있으면 a, 없으면 b (이/가, 은/는, 을/를)
  function josa(word, a, b) {
    var c = word.charCodeAt(word.length - 1) - 0xac00;
    return word + (c >= 0 && c <= 11171 && c % 28 ? a : b);
  }
  function name(id) { return D.SPECIES[id].name; }
  function dur(ms) {
    ms = Math.max(0, ms);
    var d = Math.floor(ms / (24 * H)), h = Math.floor(ms % (24 * H) / H), m = Math.floor(ms % H / M);
    if (d) return d + '일 ' + h + '시간';
    if (h) return h + '시간 ' + m + '분';
    return m + '분';
  }
  // 캔버스 가운데에 정수 배율로 크게 그린다
  var pictures = [];
  function picture(c, id, o) {
    pictures = pictures.filter(function (p) { return p[0] !== c; }).concat([[c, id, o]]);
    var x = c.getContext('2d'), m = Sprite.measure(id);
    var fit = (c.width - 8) / Math.max(m.w, m.h);
    var sc = fit >= 1 ? Math.floor(fit) : fit; // 칸보다 큰 보스는 줄여서 그린다
    x.clearRect(0, 0, c.width, c.height);
    Sprite.draw(x, id, Math.floor((c.width - m.w * sc) / 2), Math.floor((c.height - m.h * sc) / 2), sc, o);
  }
  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { } }

  /* ---------- 화면 전환 (안드로이드 뒤로가기로 닫히게 history 를 쓴다) ---------- */
  // 화면은 위로 쌓인다 (도감 위에 도감 한 칸). replace 면 맨 위 화면을 바꿔 끼운다 (스캔 → 배틀).
  var stack = [];
  function top() { return stack[stack.length - 1] || null; }
  function show(name, replace) {
    if (replace && stack.length) {
      $(stack.pop()).hidden = true;
      history.replaceState({ scr: name }, '');
    } else history.pushState({ scr: name }, '');
    stack.push(name);
    $(name).hidden = false;
  }
  function closeScreen() { if (stack.length) history.back(); }
  window.addEventListener('popstate', function () {
    if (ignorePops > 0) { ignorePops--; return; }
    if (!stack.length) return;
    var was = stack.pop();
    $(was).hidden = true;
    onClosed(was);
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) {
    b.addEventListener('click', closeScreen);
  });
  function onClosed(was) {
    if (was === 'train') stopTrain();
    if (was === 'scan') stopCam();
    if (was === 'battle' && battle && !battle.over) finishBattle(true); // 도망쳐도 패배로 친다
    if (!stack.length) render();
  }

  /* ---------- 알 고르기 ---------- */
  var choosing = false; // 키우던 디지몬이 있는데 새 알을 고르는 중
  function alive() { return state.mon && !state.mon.dead ? state.mon : null; }
  function renderEggs() {
    var cur = alive(), left = E.slotsLeft(state);
    $('eggsBack').hidden = !cur;
    $('eggsNote').textContent = cur
      ? '고른 알은 5분 뒤에 깨어나요. 키우던 ' + josa(name(E.form(cur)), '은', '는') + ' 보관함으로 가요 (남은 칸 ' + left + ').'
      : '고른 알은 5분 동안 흔들리다가 깨어나요. 시간은 실제 시간으로 흘러요.';
    $('eggBox').hidden = !state.box.length || !!cur;
    if (!cur) monList($('eggBoxList'), false);
    var ul = $('eggList');
    ul.innerHTML = '';
    D.LINE_ORDER.forEach(function (id) {
      var L = D.LINES[id];
      var li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button';
      var c = document.createElement('canvas');
      c.width = 64; c.height = 80;
      var em = Sprite.measure('egg_' + id);
      Sprite.egg(c.getContext('2d'), id, Math.floor((64 - em.w * 2) / 2), 80 - em.h * 2, 2);
      var tx = document.createElement('span');
      tx.innerHTML = '<span class="n"></span><br><span class="t"></span>';
      tx.querySelector('.n').textContent = L.name + '의 디지타마';
      tx.querySelector('.t').textContent = L.trait;
      b.appendChild(c); b.appendChild(tx);
      b.disabled = left <= 0;
      b.addEventListener('click', function () {
        if (!confirm(L.name + '의 디지타마를 고를까요?')) return;
        if (!E.hatch(state, id, now())) { toast('보관함이 가득 찼어요. 한 마리를 떠나보내 주세요'); return; }
        state.events = []; choosing = false;
        save(); render();
        toast(L.name + '의 디지타마를 받았어요! ' + R.eggMinutes + '분 뒤에 깨어나요');
      });
      li.appendChild(b); ul.appendChild(li);
    });
  }
  $('eggsBack').addEventListener('click', function () { choosing = false; render(); });

  /* ---------- 보관함 ---------- */
  // 키우는 디지몬과 보관함의 디지몬을 줄로 그린다. withActive 면 키우는 디지몬도 맨 위에.
  function monList(ul, withActive) {
    ul.innerHTML = '';
    var t = now(), rows = [];
    if (withActive && alive()) rows.push(state.mon);
    rows = rows.concat(state.box);
    rows.forEach(function (mon) {
      var on = mon === state.mon, id = E.form(mon);
      var li = document.createElement('li'); li.className = 'mon-row' + (on ? ' on' : '');
      li.appendChild(Sprite.canvas(id, 56, { anim: 'idle' }));
      var tx = document.createElement('div'); tx.className = 'txt';
      var age = (on ? t : mon.pausedAt) - mon.born;
      tx.innerHTML = '<div class="n"></div><div class="t"></div><div class="t"></div>';
      tx.children[0].textContent = name(id);
      tx.children[1].textContent = (mon.armor ? '아머체' : D.STAGE_NAMES[mon.stage]) + ' · ' +
        D.LINES[mon.line].name + ' 라인 · ' + dur(age) + '째';
      tx.children[2].textContent = on ? '키우는 중' : '보관 중 · 눌러서 데려오기';
      li.appendChild(tx);
      if (!on) {
        // 줄을 누르면 데려온다
        li.classList.add('tap');
        li.addEventListener('click', function () {
          var cur = alive();
          if (cur && !confirm(josa(name(E.form(cur)), '을', '를') + ' 보관함에 넣고 ' + josa(name(id), '을', '를') + ' 데려올까요?')) return;
          E.resume(state, mon.uid, now());
          choosing = false;
          save(); closeAll(); render(); drainEvents();
          toast(josa(name(id), '이', '가') + ' 돌아왔어요');
        });
        var bye = document.createElement('button'); bye.className = 'btn danger'; bye.textContent = '떠나보내기';
        bye.addEventListener('click', function (e) {
          e.stopPropagation();
          if (!confirm(josa(name(id), '을', '를') + ' 떠나보낼까요? 되돌릴 수 없어요. (도감 기록은 남아요)')) return;
          E.release(state, mon.uid, now());
          save(); renderBox(); renderEggs();
        });
        li.appendChild(bye);
      }
      ul.appendChild(li);
    });
  }
  function renderBox() {
    monList($('boxList'), true);
    var n = R.slots - E.slotsLeft(state);
    $('boxCount').textContent = n + ' / ' + R.slots;
    $('boxNew').disabled = E.slotsLeft(state) <= 0;
    $('boxNew').textContent = E.slotsLeft(state) > 0 ? '새 디지타마 받기' : '칸이 가득 찼어요';
  }
  $('boxNew').addEventListener('click', function () {
    choosing = true;
    closeAll(); render();
    window.scrollTo(0, 0);
  });
  // 열린 화면을 모두 닫는다 (history 는 한꺼번에 되돌린다)
  function closeAll() {
    if (!stack.length) return;
    var n = stack.length;
    while (stack.length) { var w = stack.pop(); $(w).hidden = true; onClosedQuiet(w); }
    history.go(-n);
    ignorePops = 1; // go(-n) 은 popstate 를 한 번만 부른다
  }
  var ignorePops = 0;
  function onClosedQuiet(was) {
    if (was === 'train') stopTrain();
    if (was === 'scan') stopCam();
  }

  /* ---------- 육성 화면 ---------- */
  function pips(el, n) {
    el.innerHTML = '';
    for (var i = 0; i < 4; i++) { var p = document.createElement('i'); if (i < n) p.className = 'on'; el.appendChild(p); }
  }

  function render() {
    var mon = state.mon, t = now();
    if (mon && mon.dead) { $('eggs').hidden = true; showDead(); return; }
    var eggs = !mon || choosing;
    $('eggs').hidden = !eggs;
    $('home').hidden = eggs;
    if (eggs) { renderEggs(); return; }

    var id = E.form(mon), S = D.SPECIES[id], egg = mon.stage === 'egg';
    $('monName').textContent = egg ? D.LINES[mon.line].name + '의 디지타마' : S.name;
    $('monStage').textContent = mon.armor ? '아머체' : D.STAGE_NAMES[mon.stage];
    var at = $('monAttr');
    at.textContent = D.ATTR_NAMES[S.attr]; at.className = 'chip attr ' + S.attr;
    at.hidden = egg;
    $('monAge').textContent = dur(t - mon.born) + '째';
    pips($('hunger'), mon.hunger);
    pips($('strength'), mon.strength);

    var msg = $('msg'), warn = E.warning(mon, t), text = '', bad = false;
    if (egg) text = mon.stageEnd - t > 60000 ? '흔들흔들… 안에서 뭔가 움직여요' : '금이 가고 있어요! 곧 깨어나요';
    else if (mon.sleeping) { text = mon.lights ? '잠들었어요. 불을 꺼 주세요!' : '쿨쿨…'; bad = mon.lights; }
    else if (mon.sick) { text = '아파요… 💊 약을 주세요'; bad = true; }
    else if (mon.callH > 0 && mon.hunger === 0) { text = '배고파해요!'; bad = true; }
    else if (mon.callS > 0 && mon.strength === 0) { text = '힘이 없어요. 간식이나 훈련을!'; bad = true; }
    else if (mon.poops.length) { text = '똥을 치워 주세요'; }
    else if (warn) { text = '몸 색이 어두워졌어요… 뭔가 잘못되고 있어요'; bad = true; }
    else if (mon.armor) { text = '아머진화 중 · ' + dur(mon.armor - t) + ' 남음'; }
    else text = ''; // 기분이 좋으면 말 대신 화면에서 하트·음표로 보여 준다
    if (!mon.sleeping && warn && text !== '몸 색이 어두워졌어요… 뭔가 잘못되고 있어요') text += ' · 색이 어두워요';
    msg.textContent = text; msg.className = 'msg' + (bad ? ' warn' : '');

    var next;
    if (egg) next = '부화까지 ' + clock(mon.stageEnd - t);
    else if (mon.stageEnd) next = '다음 진화까지 ' + dur(mon.stageEnd - t);
    else if (mon.stage === 'ultimate') next = '궁극체 · 최종 단계예요' + (specialHint(mon) || '');
    else next = '더 진화하지 않아요';
    $('next').textContent = next;

    $('lightsLabel').textContent = mon.lights ? '불 끄기' : '불 켜기';
    document.querySelector('[data-act="wake"]').disabled = !mon.sleeping;
    document.querySelector('[data-act="battle"]').disabled = !E.canBattle(state).ok;
    document.querySelector('[data-act="armor"]').hidden = !E.canArmor(state, t);
    document.querySelector('[data-act="chip"]').hidden = !state.meta.items.chip;
    document.querySelector('[data-act="chip"]').lastChild.textContent = '디지 칩 ×' + state.meta.items.chip;
    // 디지타마일 때는 돌볼 것이 없다
    ['feed', 'snack', 'train', 'clean', 'lights'].forEach(function (k) {
      document.querySelector('[data-act="' + k + '"]').disabled = egg;
    });
    // 먹는 중에는 다 먹을 때까지 더 줄 수 없다
    var eating = isEating();
    ['feed', 'snack', 'medicine'].forEach(function (k) {
      var b = document.querySelector('[data-act="' + k + '"]');
      b.disabled = b.disabled || eating;
    });
    if (egg) document.querySelector('[data-act="chip"]').hidden = true;
    document.querySelector('[data-act="medicine"]').hidden = !mon.sick;
  }
  function clock(ms) { // 분:초
    var sec = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(sec / 60) + '분 ' + (sec % 60 < 10 ? '0' : '') + sec % 60 + '초';
  }

  /* ---------- 화면(LCD) 그리기 ---------- */
  var lcd = $('lcd'), lx = lcd.getContext('2d');
  var walk = { x: 60, dir: -1, frame: 0, rest: 0 }, effect = null, lastFrame = 0, lastStep = 0;
  // 배변 도트 (24x24, 위쪽 검은 선은 냄새). 좌우로 번갈아 뒤집어 냄새가 일렁이게 한다.
  var poopImg = new Image();
  poopImg.src = 'img/poop.png';
  /* 음식 도트 (24x24 를 가로로 이은 그림). 디지몬이 오른쪽에서 먹는 그림이고, 디지몬이 왼쪽에 있으면 뒤집는다.
   *   meat  먹이(고기): 그대로 · 한 입 · 두 입 · 뼈
   *   snack 간식(딸기): 그대로 · 한 입 · 두 입 (세 입째에 사라진다)
   *   pill  약(캡슐):   그대로 · 한 입 · 두 입 (세 입째에 사라진다) */
  var FOOD_IMG = {};
  ['meat', 'snack', 'pill'].forEach(function (k) {
    FOOD_IMG[k] = new Image();
    FOOD_IMG[k].src = 'img/' + (k === 'pill' ? 'medicine' : k) + '.png';
  });
  var FOOD_SIZE = 24, FOOD_DROP = 450, FOOD_BITES = [800, 1150, 1500];
  function foodSize() { return { w: FOOD_SIZE, h: FOOD_SIZE }; }

  // 바닥에 놓인 음식. bites 번 베어 문 만큼 줄어든 그림을 그린다.
  function drawFood(kind, x, y, flip, bites) {
    var im = FOOD_IMG[kind], n = im.naturalWidth / FOOD_SIZE;
    if (!im.complete || !n || bites >= n) return; // 다 먹었다
    lx.save();
    if (flip) { lx.translate(x + FOOD_SIZE, y); lx.scale(-1, 1); x = 0; y = 0; }
    lx.drawImage(im, bites * FOOD_SIZE, 0, FOOD_SIZE, FOOD_SIZE, x, y, FOOD_SIZE, FOOD_SIZE);
    lx.restore();
  }

  function drawLcd(ts) {
    requestAnimationFrame(drawLcd);
    var eating = effect && effect.food && ts < effect.until;
    if (ts - lastFrame < (eating ? 50 : 220)) return; // 음식이 떨어질 때는 부드럽게
    lastFrame = ts;
    var mon = state.mon;
    if (!mon || mon.dead || $('home').hidden || stack.length) return;
    var W = 160, Hh = 112, dark = !mon.lights;
    lx.fillStyle = dark ? '#1a1f2a' : '#d7e8c4';
    lx.fillRect(0, 0, W, Hh);
    lx.fillStyle = dark ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.04)';
    for (var gy = 0; gy < Hh; gy += 4) lx.fillRect(0, gy, W, 1);

    if (mon.stage === 'egg') { drawEgg(mon, W, Hh); return; }
    var id = E.form(mon), m = Sprite.measure(id), sw = m.w;
    var floor = 104, y = floor - m.h, acting = effect && ts < effect.until && effect.anim;
    if (!eating || Math.floor(ts / 220) !== Math.floor(lastStep / 220)) { walk.frame++; lastStep = ts; }
    // 기분이 좋으면 가끔 멈춰서 기뻐하고 머리 위로 하트나 음표를 띄운다
    if (goodMood(mon) && !acting && !eating) {
      if (!mood || ts > mood.next) mood = { t0: ts, kind: Math.random() < 0.5 ? 'heart' : 'note', next: ts + 6000 + Math.random() * 6000 };
    } else mood = null;
    var cheering = mood && ts - mood.t0 < MOOD_MS;
    if (mon.sleeping) {
      walk.x = (W - sw) / 2 - 12;
    } else if (!acting && !eating && !mon.sick && !cheering) {
      // 걷다가 가끔 멈춰 선다
      if (walk.rest > 0) walk.rest--;
      else {
        walk.x += walk.dir * 3;
        var maxX = W - sw - 30;
        if (walk.x > maxX) { walk.x = maxX; walk.dir = -1; }
        if (walk.x < 4) { walk.x = 4; walk.dir = 1; }
        if (Math.random() < 0.06) walk.dir *= -1;
        if (Math.random() < 0.05) walk.rest = 6 + Math.floor(Math.random() * 10);
      }
    }
    var anim = mon.sleeping ? 'sleep' : acting ? effect.anim : walk.rest > 0 ? 'idle' : 'walk';
    if (eating && ts - effect.t0 < FOOD_DROP + 200) anim = 'idle'; // 음식이 놓인 뒤에 먹기 시작
    if (cheering) anim = ts - mood.t0 < MOOD_MS / 2 ? 'happy' : 'idle';
    var bob = SHEETS[id] || mon.sleeping ? 0 : (walk.frame & 1) * 2; // 시트는 프레임에 움직임이 들어 있다
    // 시트는 왼쪽을 보는 그림이라 오른쪽으로 갈 때 뒤집는다
    Sprite.draw(lx, id, Math.round(walk.x), y + bob, 1, {
      flip: walk.dir > 0, frame: walk.frame, anim: anim, dark: E.warning(mon, now())
    });
    if (cheering) drawMood(mood, ts, Math.round(walk.x + (walk.dir > 0 ? sw * 0.65 : sw * 0.35)), y);
    // 먹이·간식: 위에서 떨어진 뒤 세 입에 먹는다 (과식이면 먹지 않고 그대로 둔다)
    if (effect && effect.food && ts < effect.until) {
      var et = ts - effect.t0, fz = foodSize(effect.food), fw = fz.w, fh = fz.h;
      var left = walk.dir < 0; // 왼쪽을 보고 있으면 음식은 왼쪽에
      var fx0 = left ? Math.round(walk.x) - fw - 2 : Math.round(walk.x) + sw + 2;
      var fy = et < FOOD_DROP ? Math.round(-fh + (floor - 2) * et / FOOD_DROP) : floor - fh - 2;
      var bites = effect.refuse ? 0 : FOOD_BITES.filter(function (b) { return et >= b; }).length;
      drawFood(effect.food, fx0, Math.min(fy, floor - fh - 2), !left, bites);
    }
    if (dark) { lx.fillStyle = 'rgba(10,12,20,.55)'; lx.fillRect(0, 0, W, Hh); }

    // 배변
    // 오른쪽 아래부터 두 줄로 쌓는다. 아래 것을 먼저 그려야 위 똥이 아래 똥의 냄새 선을 덮는다.
    if (poopImg.complete && poopImg.naturalWidth) {
      var wave = (walk.frame >> 1) & 1;
      mon.poops.slice(0, 6).forEach(function (p, i) {
        var px = W - 24 - (i % 2) * 18, py = floor - 23 - Math.floor(i / 2) * 14;
        lx.save();
        if ((i + wave) & 1) { lx.translate(px + 24, py); lx.scale(-1, 1); lx.drawImage(poopImg, 0, 0); }
        else lx.drawImage(poopImg, px, py);
        lx.restore();
      });
    }

    lx.font = 'bold 12px monospace';
    if (mon.sleeping) {
      lx.fillStyle = dark ? '#c9d4ff' : '#1b1f17';
      lx.fillText(walk.frame & 2 ? 'Z z' : 'z Z', (W + sw) / 2 - 8, y + 4);
    }
    if (!mon.sleeping && ((mon.callH > 0 && mon.hunger === 0) || (mon.callS > 0 && mon.strength === 0))) {
      lx.fillStyle = '#d6332f';
      lx.fillRect(6, 6, 14, 16);
      lx.fillStyle = '#fff'; lx.fillText('!', 10, 18);
    }
    if (mon.sick && !mon.sleeping) drawSkull(W - 24, 6, (walk.frame >> 1) & 1);
    if (effect && ts < effect.until && effect.text) {
      lx.font = 'bold 14px sans-serif';
      lx.fillStyle = dark ? '#fff' : '#1b1f17';
      lx.fillText(effect.text, 8, 36);
    }
  }
  /* 기분 표시: 돌볼 것이 하나도 없을 때(배고픔·힘 1칸 이상, 똥·병·경고 없음) 가끔 하트나 음표가 떠오른다 */
  var mood = null, MOOD_MS = 1800;
  var MOOD_ICON = {
    heart: { color: '#ff5f8a', rows: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'] },
    note: { color: '#3b5bd8', rows: ['.XXXXX', '.X...X', '.X...X', '.X...X', 'XX..XX', 'XX..XX'] },
    note1: { color: '#3b5bd8', rows: ['..XX.', '..X.X', '..X..', '..X..', 'XXX..', 'XXX..'] }
  };
  function goodMood(mon) {
    return !mon.sleeping && !mon.sick && !mon.poops.length && mon.hunger > 0 && mon.strength > 0 &&
      !E.warning(mon, now());
  }
  function drawIcon(kind, x, y) {
    var ic = MOOD_ICON[kind];
    ic.rows.forEach(function (row, ry) {
      for (var rx = 0; rx < row.length; rx++) if (row[rx] === 'X') {
        lx.fillStyle = '#1b1f17'; lx.fillRect(x + rx * 2 - 1, y + ry * 2 - 1, 4, 4); // 테두리
      }
    });
    ic.rows.forEach(function (row, ry) {
      for (var rx = 0; rx < row.length; rx++) if (row[rx] === 'X') {
        lx.fillStyle = ic.color; lx.fillRect(x + rx * 2, y + ry * 2, 2, 2);
      }
    });
  }
  // 머리 위에서 흔들리며 떠오른다. 음표는 두 개가 번갈아 뜬다.
  function drawMood(md, ts, hx, top) {
    var k = (ts - md.t0) / MOOD_MS, rise = Math.round(k * 14), sway = Math.round(Math.sin(k * 9) * 3);
    var y = Math.max(2, top - 16 - rise);
    if (md.kind === 'heart') drawIcon('heart', hx - 7 + sway, y);
    else {
      drawIcon('note', hx - 12 + sway, y);
      if (k > 0.3) drawIcon('note1', hx + 4 - sway, y + 6);
    }
  }

  // 아플 때 오른쪽 위에 깜빡이는 해골
  var SKULL = ['.XXXXX.', 'XXXXXXX', 'X..X..X', 'XXXXXXX', '.XX.XX.', '.XXXXX.', '.X.X.X.'];
  function drawSkull(x, y, blink) {
    lx.fillStyle = '#5a3a7a'; lx.fillRect(x - 2, y, 18, 18);
    if (blink) return;
    lx.fillStyle = '#f4efe4';
    SKULL.forEach(function (row, ry) {
      for (var rx = 0; rx < row.length; rx++) if (row[rx] === 'X') lx.fillRect(x + rx * 2, y + 2 + ry * 2, 2, 2);
    });
  }

  // 디지타마: 흔들흔들하다가 마지막 1분 동안 금이 점점 커진다 (프레임 2-6)
  function drawEgg(mon, W, Hh) {
    var left = mon.stageEnd - now(), m = Sprite.measure('egg_' + mon.line), S = 2;
    var frame = left > 60000 ? null : 2 + Math.min(4, Math.floor((60000 - Math.max(0, left)) / 12000));
    var x = Math.round((W - m.w * S) / 2), y = 104 - m.h * S;
    if (frame == null) Sprite.egg(lx, mon.line, x, y, S, (walk.frame++ >> 1) & 1); // 천천히 흔들기
    else Sprite.egg(lx, mon.line, x + ((walk.frame++ & 1) ? 1 : -1), y, S, frame);
  }
  function fx(text, anim) { effect = { text: text, anim: anim, until: performance.now() + 1600 }; }
  // 먹는 연출이 끝나기 전까지는 먹는 중이다
  function isEating() {
    return !!(effect && effect.food && performance.now() < effect.until);
  }
  function eatingGuard() {
    if (!isEating()) return false;
    toast('아직 먹고 있어요');
    return true;
  }
  // 음식을 내려놓는다. 디지몬 앞에 자리가 없으면 반대쪽을 보게 돌려세운다.
  function feedFx(kind, refuse) {
    var fw = foodSize(kind).w + 4, m = Sprite.measure(E.form(state.mon));
    if (walk.dir < 0 && walk.x < fw) walk.dir = 1;
    else if (walk.dir > 0 && walk.x + m.w + fw > 160) walk.dir = -1;
    walk.rest = 0;
    var t0 = performance.now();
    effect = {
      food: kind, refuse: refuse, t0: t0, until: t0 + (refuse ? 1500 : 2000),
      anim: refuse ? 'idle' : 'eat', text: refuse ? '윽…' : ''
    };
    // 다 먹으면 버튼을 바로 다시 켠다
    setTimeout(function () { if (!stack.length) render(); }, effect.until - t0 + 50);
  }

  /* ---------- 돌보기 ---------- */
  function sleepingGuard() {
    if (!state.mon.sleeping) return false;
    toast('자고 있어요. 깨우려면 ⏰ 깨우기 (수면 방해로 쳐요)');
    return true;
  }

  var ACTS = {
    feed: function () {
      if (sleepingGuard() || eatingGuard()) return;
      var r = E.feed(state);
      if (r.over) toast('배가 불러요… 과식했어요');
      feedFx('meat', r.over);
    },
    snack: function () {
      if (sleepingGuard() || eatingGuard()) return;
      var r = E.snack(state);
      if (r.over) toast('배부른데 간식까지… 과식했어요');
      feedFx('snack', r.over);
    },
    train: function () {
      if (sleepingGuard()) return;
      if (state.mon.sick) { toast('아파서 훈련할 수 없어요. 약을 먼저 주세요'); return; }
      startTrain();
    },
    medicine: function () {
      if (sleepingGuard() || eatingGuard()) return;
      if (E.medicine(state).ok) { feedFx('pill', false); toast('약을 먹었어요. 이제 괜찮아요!'); }
    },
    clean: function () {
      var r = E.clean(state);
      toast(r.n ? '깨끗해졌어요' : '치울 게 없어요');
      if (r.n) fx('', 'happy');
    },
    lights: function () { E.toggleLights(state); },
    wake: function () {
      if (!state.mon.sleeping) return;
      if (!confirm('자는 걸 깨우면 수면 방해로 쳐요. 깨울까요?')) return;
      E.wake(state, now()); fx('하암…', 'idle');
    },
    battle: function () { openScan(); },
    dex: function () { renderDex(); show('dex'); },
    info: function () { renderInfo(); show('info'); },
    box: function () { renderBox(); show('box'); },
    armor: function () {
      var A = D.LINES[state.mon.line].armor;
      openPick('아머진화', '디지멘탈의 힘으로 48시간 동안 아머체가 돼요. 하루 한 번, 디지멘탈은 닳지 않아요.',
        E.armorKinds(state, now()).map(function (k) {
          return {
            label: D.RULE_HINTS[k] + ' → ' + name(A[k]) + ' (' + D.STAGE_NAMES[D.SPECIES[A[k]].stage] + ')',
            fn: function () { E.armor(state, now(), k); }
          };
        }));
    },
    chip: function () {
      if (E.useChip(state).ok) toast('디지 칩을 썼어요. 배고픔과 힘이 가득!');
      else toast('지금은 쓸 수 없어요');
    }
  };
  Array.prototype.forEach.call(document.querySelectorAll('[data-act]'), function (b) {
    b.addEventListener('click', function () {
      if (!state.mon || state.mon.dead) return;
      E.tick(state, now());
      ACTS[b.getAttribute('data-act')]();
      save(); if (!stack.length) render(); drainEvents();
    });
  });

  /* ---------- 고르기 ---------- */
  function openPick(title, note, options) {
    $('pickTitle').textContent = title;
    $('pickNote').textContent = note;
    var box = $('pickList');
    box.innerHTML = '';
    options.forEach(function (o) {
      var b = document.createElement('button'); b.className = 'btn'; b.textContent = o.label;
      b.addEventListener('click', function () {
        closeScreen();
        E.tick(state, now()); o.fn(); save(); drainEvents();
      });
      box.appendChild(b);
    });
    show('pick');
  }

  // 궁극체에서 보스 격파로 일어나는 진화의 진행 상황
  function specialHint(mon) {
    var s = (D.LINES[mon.line].special || {})[mon.species];
    if (!s) return '';
    if (s.partner && !(state.meta.dex[s.partner] && state.meta.dex[s.partner].raised)) return '';
    return ' · 보스 격파 ' + Math.min(mon.c.bossWins, R.jogressBossWins) + '/' + R.jogressBossWins;
  }

  /* ---------- 훈련 미니게임 ---------- */
  var tr = null;
  function startTrain() {
    tr = { round: 0, hits: [], pos: 0, speed: 1.4 + Math.random() * 0.6, raf: 0, t0: performance.now() };
    newZone();
    $('tries').textContent = '○ ○ ○';
    $('trainHit').disabled = false;
    show('train');
    tr.raf = requestAnimationFrame(trainLoop);
  }
  function newZone() {
    tr.zw = 18 + Math.random() * 8;
    tr.zx = 6 + Math.random() * (88 - tr.zw);
    $('zone').style.left = tr.zx + '%'; $('zone').style.width = tr.zw + '%';
  }
  function trainLoop(ts) {
    if (!tr) return;
    var p = ((ts - tr.t0) / 1000 * tr.speed) % 2;
    tr.pos = (p < 1 ? p : 2 - p) * 100; // 왕복
    $('marker').style.left = tr.pos + '%';
    tr.raf = requestAnimationFrame(trainLoop);
  }
  function stopTrain() { if (tr) cancelAnimationFrame(tr.raf); tr = null; }
  $('trainHit').addEventListener('click', function () {
    if (!tr || tr.round >= 3) return;
    var ok = tr.pos >= tr.zx && tr.pos <= tr.zx + tr.zw;
    tr.hits.push(ok); tr.round++;
    vibrate(ok ? 30 : [20, 40, 20]);
    $('tries').textContent = [0, 1, 2].map(function (i) {
      return i < tr.hits.length ? (tr.hits[i] ? '●' : '✕') : '○';
    }).join(' ');
    if (tr.round < 3) { tr.speed += 0.25; newZone(); return; }
    var hits = tr.hits.filter(Boolean).length;
    $('trainHit').disabled = true;
    E.tick(state, now());
    var r = E.train(state, hits);
    save();
    setTimeout(function () {
      closeScreen();
      toast(r.good ? '훈련 성공! 힘이 올랐어요' : '훈련 끝. 다음엔 더 잘할 수 있어요');
      fx(r.good ? '하앗!' : '헉헉', r.good ? 'train' : 'idle');
    }, 450);
  });

  /* ---------- 바코드 스캔 ---------- */
  var cam = { stream: null, timer: 0, detector: null }, found = null;
  var canDetect = 'BarcodeDetector' in window && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  function openScan() {
    var can = E.canBattle(state);
    if (!can.ok) {
      toast(can.reason === 'sleep' ? '자고 있어요' : can.reason === 'sick' ? '아파서 배틀할 수 없어요. 약을 먼저 주세요' : '성장기부터 배틀할 수 있어요');
      return;
    }
    found = null;
    $('wildCard').hidden = true; $('fight').hidden = true;
    $('codeIn').value = '';
    $('camStart').hidden = !canDetect;
    $('camNote').hidden = canDetect;
    updateScanLeft();
    show('scan');
  }
  function updateScanLeft() {
    $('scanLeft').textContent = '오늘 남은 스캔 ' + E.scansLeft(state, now()) + ' / ' + R.scansPerDay +
      ' · 어떤 바코드든 찍을 때마다 다른 디지몬이 나와요';
  }
  $('camStart').addEventListener('click', function () {
    $('camStart').hidden = true;
    try { cam.detector = new BarcodeDetector(); } catch (e) { $('camNote').hidden = false; return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(function (s) {
      cam.stream = s;
      var v = $('cam');
      v.srcObject = s; v.play();
      $('camBox').hidden = false;
      cam.timer = setInterval(function () {
        if (v.readyState < 2) return;
        cam.detector.detect(v).then(function (codes) {
          if (!codes.length || !cam.stream) return;
          var raw = codes[0].rawValue;
          stopCam();
          vibrate(60);
          $('codeIn').value = raw;
          lookUp(raw);
        }).catch(function () { });
      }, 300);
    }).catch(function () {
      $('camStart').hidden = false;
      toast('카메라를 열 수 없어요. 숫자를 직접 넣어 주세요');
    });
  });
  function stopCam() {
    clearInterval(cam.timer);
    if (cam.stream) cam.stream.getTracks().forEach(function (t) { t.stop(); });
    cam.stream = null;
    $('camBox').hidden = true;
    if (canDetect && !found) $('camStart').hidden = false;
  }
  $('codeForm').addEventListener('submit', function (e) {
    e.preventDefault();
    lookUp($('codeIn').value);
  });

  var REASON = {
    empty: '바코드 숫자를 넣어 주세요',
    limit: '오늘 스캔을 다 썼어요. 내일 다시!', sleep: '자고 있어요', baby: '성장기부터 배틀할 수 있어요'
  };
  function lookUp(code) {
    E.tick(state, now());
    var r = E.scan(state, code, now());
    if (!r.ok) { toast(REASON[r.reason] || '스캔할 수 없어요'); return; }
    found = r.wild;
    save(); updateScanLeft();
    var w = r.wild, S = D.SPECIES[w.id];
    picture($('wildPic'), w.id, {});
    var nm = $('wildName');
    nm.textContent = '야생 ' + S.name;
    if (w.grade !== 'normal') {
      var g = document.createElement('span');
      g.className = 'grade ' + w.grade; g.textContent = D.GRADE_NAMES[w.grade];
      nm.appendChild(g);
    }
    $('wildInfo').textContent = D.STAGE_NAMES[D.STAGES[w.level]] + ' · ' + D.ATTR_NAMES[w.attr] +
      (state.meta.dex[w.id].beaten ? ' · 이긴 적 있음' : ' · 아직 못 이긴 디지몬');
    var me = D.SPECIES[E.form(state.mon)], adv = E.advantage(me.attr, w.attr);
    $('wildAdv').textContent = adv > 1 ? '상성 유리!' : adv < 1 ? '상성 불리…' : '상성 보통';
    $('wildCard').hidden = false; $('fight').hidden = false;
    stopCam(); $('camStart').hidden = true;
  }
  $('fight').addEventListener('click', function () {
    if (!found) return;
    var w = found; found = null;
    startBattle(w);
  });
  function gradeTag(g) { return g === 'normal' ? '' : ' (' + D.GRADE_NAMES[g] + ')'; }

  /* ---------- 배틀 ---------- */
  var battle = null, arena = $('arena'), ax = arena.getContext('2d');
  var CMD_NAMES = { attack: '공격', special: '필살기', guard: '방어' };
  var view = null; // 화면에 그리는 두 디지몬 (배틀이 끝나도 결과 화면에 남는다)
  var turn = null; // 지금 재생 중인 한 턴의 연출

  function startBattle(w) {
    E.tick(state, now());
    battle = E.startBattle(state, w);
    view = { me: battle.me, foe: w.id, meAttr: D.SPECIES[battle.me].attr, foeAttr: w.attr, php: 100, ehp: 100,
      grade: w.grade, intro: performance.now() };
    turn = null;
    $('pName').textContent = name(battle.me);
    $('eName').textContent = w.name + gradeTag(w.grade);
    $('blog').textContent = josa('야생 ' + w.name, '이', '가') + ' 나타났다!' + (battle.hungry ? ' (배가 고파 힘이 빠져 있다)' : '');
    $('cmds').hidden = false; $('battleDone').hidden = true;
    setCmds(false); // 시작 연출이 끝나면 켠다
    hpBars();
    show('battle', true);
    requestAnimationFrame(arenaLoop);
  }
  function hpBars() {
    $('pHp').style.width = view.php + '%';
    $('eHp').style.width = view.ehp + '%';
  }

  /* ----- 배틀 연출 -----
   * 한 턴 = 내 행동 → 상대 행동. 공격은 상대 쪽으로 튀어나갔다 돌아오고, 필살기는 속성 색 탄을 쏜다.
   * 맞으면 깜빡이며 흔들리고, 머리 위로 피해 숫자가 떠오른다. 방어는 앞에 방패를 세운다.
   */
  var INTRO = { walk: 900, end: 1800 };
  var AW = arena.width, AH = arena.height; // 보스(레이드 128px)도 들어가게 크게 잡는다
  var T = { pGo: 0, pHit: 280, pBack: 460, eGo: 600, eHit: 880, eBack: 1060, end: 1500 };
  var SHOT = { vaccine: ['#fff4b0', '#ffb43a', '#e0602a'], data: ['#e6f6ff', '#5ab4ff', '#2a5fd0'],
    virus: ['#ffe0ff', '#c46aff', '#6a2aa8'], free: ['#f0ffe0', '#7ad05a', '#2f8a3a'] };
  // 3x5 도트 글꼴 (피해 숫자용)
  var FONT = {
    0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
    3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
    6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'],
    9: ['111', '101', '111', '001', '111'], M: ['10001', '11011', '10101', '10001', '10001'], I: ['111', '010', '010', '010', '111'],
    S: ['011', '100', '010', '001', '110'], '?': ['111', '001', '011', '000', '010'], '!': ['1', '1', '1', '0', '1'],
    V: ['101', '101', '101', '101', '010'], B: ['110', '101', '110', '101', '110'], O: ['111', '101', '101', '101', '111'],
    L: ['100', '100', '100', '100', '111'], E: ['111', '100', '110', '100', '111'], G: ['111', '100', '101', '101', '111'],
    N: ['1001', '1101', '1011', '1001', '1001'], D: ['110', '101', '101', '101', '110']
  };
  function textWidth(str, px) {
    var w = 0;
    for (var i = 0; i < str.length; i++) w += (FONT[str[i]][0].length + 1) * px;
    return w - px;
  }
  function pixelText(str, cx, y, px, color) {
    var x = Math.round(cx - textWidth(str, px) / 2);
    for (var i = 0; i < str.length; i++) {
      var g = FONT[str[i]];
      [['#1b1f17', 1], [color, 0]].forEach(function (pass) { // 테두리 먼저, 그 위에 글자
        ax.fillStyle = pass[0];
        g.forEach(function (row, ry) {
          for (var rx = 0; rx < row.length; rx++) if (row[rx] === '1') {
            if (pass[1]) {
              for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) ax.fillRect(x + rx * px + dx, y + ry * px + dy, px, px);
            } else ax.fillRect(x + rx * px, y + ry * px, px, px);
          }
        });
      });
      x += (g[0].length + 1) * px;
    }
  }
  function ease(t) { return t < 0 ? 0 : t > 1 ? 1 : 1 - (1 - t) * (1 - t); }
  // 튀어나간 정도 (0..1)
  function lunge(t, go, hit, back) {
    if (t < go || t >= back) return 0;
    return t < hit ? ease((t - go) / (hit - go)) : 1 - ease((t - hit) / (back - hit));
  }
  function burst(cx, cy, k, cols) { // 맞은 자리의 별 모양 불꽃
    var r = 4 + k * 10;
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      ax.fillStyle = cols[i % 2 ? 1 : 0]; ax.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
    }
    ax.fillStyle = cols[0]; ax.fillRect(cx - 3, cy - 3, 6, 6);
  }
  function shot(x, y, dir, cols, big) { // 필살기 탄: 가운데가 밝은 도트 공 + 꼬리
    for (var i = 3; i >= 1; i--) {
      ax.fillStyle = cols[2]; var s = (big ? 3 : 2) * (4 - i) / 2 + 1;
      ax.fillRect(Math.round(x - dir * i * 6 - s / 2), Math.round(y - s / 2), s, s);
    }
    var R = big ? 6 : 4;
    ax.fillStyle = cols[2]; ax.fillRect(x - R, y - R + 2, R * 2, R * 2 - 4); ax.fillRect(x - R + 2, y - R, R * 2 - 4, R * 2);
    ax.fillStyle = cols[1]; ax.fillRect(x - R + 2, y - R + 2, R * 2 - 4, R * 2 - 4);
    ax.fillStyle = cols[0]; ax.fillRect(x - 2, y - 2, 4, 4);
  }
  function shield(x, y, h, dir, hit) { // 방어: 앞쪽에 세운 도트 방패
    ax.fillStyle = hit ? '#ffffff' : 'rgba(120,200,255,.85)';
    ax.fillRect(x, y + 4, 3, h - 8);
    ax.fillRect(x + dir * 3, y, 3, 6); ax.fillRect(x + dir * 3, y + h - 6, 3, 6);
    ax.fillStyle = 'rgba(200,240,255,.9)'; ax.fillRect(x + (dir > 0 ? 0 : 1), y + 6, 2, 6);
  }

  function arenaLoop(ts) {
    if ($('battle').hidden || !view) return;
    drawArena(ts);
    requestAnimationFrame(arenaLoop);
  }
  function drawArena(ts) {
    if (!view) return;
    ts = ts || performance.now();
    ax.fillStyle = '#d7e8c4'; ax.fillRect(0, 0, AW, AH);
    ax.fillStyle = 'rgba(0,0,0,.05)'; ax.fillRect(0, AH - 8, AW, 8); // 바닥
    var a = view.me, b = view.foe, ma = Sprite.measure(a), mb = Sprite.measure(b);
    var px0 = 10, ex0 = AW - 10 - mb.w, floor = AH - 6;
    var gap = Math.max(0, ex0 - (px0 + ma.w)), reach = Math.min(gap - 4, 70);
    var idleF = Math.floor(ts / 420);
    var P = { x: px0, anim: 'idle', frame: idleF, hide: false }, Q = { x: ex0, anim: 'idle', frame: idleF, hide: false };
    var fx = [];

    // 시작 연출: 양쪽에서 걸어 들어온 뒤 VS (보스·전설이면 경고 글자도)
    if (view.intro) {
      var it = ts - view.intro, w = Math.min(1, it / INTRO.walk); // 걸음은 일정한 속도로
      P.x = -ma.w + (px0 + ma.w) * w; Q.x = AW + (ex0 - AW) * w;
      if (it < INTRO.walk) { P.anim = Q.anim = 'walk'; P.frame = Q.frame = Math.floor(it / 120); }
      if (it >= INTRO.walk && it < INTRO.walk + 70) { ax.fillStyle = '#ffffff'; ax.fillRect(0, 0, AW, AH); }
      if (it >= INTRO.walk) {
        var k = Math.min(1, (it - INTRO.walk) / 160), size = Math.round(6 - 3 * k);
        fx.push(function () { pixelText('VS', AW / 2, AH / 2 - 8 - size * 2.5, size, '#ff9d3a'); });
        if (view.grade === 'boss' || view.grade === 'legend') {
          var on = Math.floor((it - INTRO.walk) / 140) % 2 === 0;
          if (on) fx.push(function () {
            pixelText(view.grade === 'boss' ? 'BOSS!' : 'LEGEND!', ex0 + mb.w / 2, Math.max(2, floor - mb.h - 14), 2,
              view.grade === 'boss' ? '#ff5f6d' : '#f5c242');
          });
        }
      }
      if (it >= INTRO.end) { view.intro = null; if (battle && !battle.over) setCmds(true); }
    }

    if (turn) {
      var t = ts - turn.t0, r = turn.r;
      // 내 차례
      act(t, r.pCmd, r.pDmg, P, Q, 1, T.pGo, T.pHit, T.pBack, view.meAttr, '#ffd23f');
      // 상대 차례
      act(t, r.eCmd, r.eDmg, Q, P, -1, T.eGo, T.eHit, T.eBack, view.foeAttr, '#ff5f6d');
      if (r.ignored && t < 700) fx.push(function () { pixelText('?!', P.x + ma.w / 2, floor - ma.h - 14 - (t < 150 ? (150 - t) / 30 : 0), 2, '#ff9d3a'); });
      // HP 는 맞는 순간 줄인다
      if (t >= T.pHit && !turn.eDone) { turn.eDone = true; view.ehp = battle ? battle.ehp : turn.ehp; hpBars(); }
      if (t >= T.eHit && !turn.pDone) { turn.pDone = true; view.php = battle ? battle.php : turn.php; hpBars(); if (r.eDmg) vibrate(40); }
      if (t >= T.end) { var done = turn.done; turn = null; done(); }
    }

    function act(t, cmd, dmg, me, foe, dir, go, hit, back, attr, numCol) {
      var mm = dir > 0 ? ma : mb, fm = dir > 0 ? mb : ma, cols = SHOT[attr] || SHOT.free;
      var fy = floor - fm.h, cy = fy + fm.h / 2;
      if (cmd === 'guard') {
        // 방어는 자기 차례와 상관없이 턴 내내 방패를 든다
        var hitNow = t > (dir > 0 ? T.eHit : T.pHit) && t < (dir > 0 ? T.eHit : T.pHit) + 120;
        fx.push(function () { shield(dir > 0 ? me.x + mm.w + 2 : me.x - 5, floor - mm.h + 2, mm.h - 4, dir, hitNow); });
        return;
      }
      var k = lunge(t, go, hit, back);
      if (cmd === 'attack') {
        me.x += dir * reach * k;
        if (t >= go && t < back) { me.anim = t < hit ? 'run' : 'attack'; me.frame = Math.floor(t / 90); }
      } else { // 필살기: 살짝 물러섰다 쏜다
        me.x -= dir * 6 * k;
        if (t >= go && t < back) { me.anim = 'attack'; me.frame = 0; }
        if (t >= go + 80 && t < hit) {
          var p = ease((t - go - 80) / (hit - go - 80));
          var sx = dir > 0 ? px0 + ma.w : ex0, tx = dir > 0 ? ex0 + mb.w / 2 : px0 + ma.w / 2;
          fx.push(function () { shot(Math.round(sx + (tx - sx) * p), Math.round(floor - mm.h * 0.55), dir, cols, true); });
        }
      }
      // 맞는 순간
      if (t >= hit && t < hit + 260) {
        var e = (t - hit) / 260;
        if (dmg) {
          foe.x += (Math.floor(t / 40) % 2 ? 2 : -2) + dir * 3 * (1 - e);
          foe.hide = Math.floor(t / 70) % 2 === 1;
          foe.anim = 'idle';
          if (e < 0.6) fx.push(function () { burst(Math.round(foe.x + fm.w / 2), Math.round(cy), e, cmd === 'special' ? cols : ['#ffffff', '#ffd23f']); });
        }
      }
      // 피해 숫자는 머리 위로 떠오르며 사라진다
      if (t >= hit && t < hit + 620) {
        var u = (t - hit) / 620, big = cmd === 'special' && dmg;
        fx.push(function () {
          ax.globalAlpha = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
          pixelText(dmg ? String(dmg) : 'MISS', foe.x + fm.w / 2, Math.max(2, fy - 12 - u * 14), big ? 3 : 2, dmg ? (big ? '#ffffff' : numCol) : '#93a0b4');
          ax.globalAlpha = 1;
        });
      }
    }

    // 내 디지몬은 왼쪽에서 오른쪽을 본다 (그림은 왼쪽을 보므로 뒤집는다)
    if (!P.hide) Sprite.draw(ax, a, Math.round(P.x), floor - ma.h, 1, { flip: true, anim: P.anim, frame: P.frame });
    if (!Q.hide) Sprite.draw(ax, b, Math.round(Q.x), floor - mb.h, 1, { anim: Q.anim, frame: Q.frame });
    fx.forEach(function (f) { f(); });
  }
  function setCmds(on) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-cmd]'), function (b) { b.disabled = !on; });
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-cmd]'), function (btn) {
    btn.addEventListener('click', function () {
      if (!battle || battle.over || turn) return;
      var r = E.battleTurn(battle, btn.getAttribute('data-cmd'));
      var me = name(battle.me), en = battle.wild.name, lines = [];
      if (r.ignored) lines.push(josa(me, '이', '가') + ' 명령을 무시했다!');
      lines.push(me + ' ' + CMD_NAMES[r.pCmd] + (r.pCmd === 'guard' ? '' : r.pDmg ? ' → ' + r.pDmg : ' → 빗나감'));
      lines.push(en + ' ' + CMD_NAMES[r.eCmd] + (r.eCmd === 'guard' ? '' : r.eDmg ? ' → ' + r.eDmg : ' → 빗나감'));
      $('blog').textContent = lines.join(' · ');
      setCmds(false);
      turn = {
        t0: performance.now(), r: r, php: battle.php, ehp: battle.ehp,
        done: function () { if (battle && battle.over) finishBattle(false); else setCmds(true); }
      };
    });
  });

  function finishBattle(fled) {
    var b = battle;
    if (fled) { b.over = true; b.won = false; }
    E.tick(state, now());
    var r = E.endBattle(state, b, now());
    battle = fled ? null : battle;
    save();
    if (fled) { toast('도망쳤어요. 패배로 기록돼요'); return; }
    var text = r.won ? '승리! ' + josa(b.wild.name, '이', '가') + ' 도감에 등록됐어요' : '패배… 다음엔 이길 거예요';
    if (r.reward === 'chip') text += ' · 디지 칩을 얻었어요!';
    if (r.injured) text += ' · 다쳤어요! 💊 약을 주세요';
    else if (r.reward) text += ' · ' + josa(D.RULE_HINTS[r.reward], '을', '를') + ' 얻었어요!';
    $('blog').textContent = text;
    $('cmds').hidden = true; $('battleDone').hidden = false;
    vibrate(r.won ? [40, 60, 40] : 120);
    battle = null;
  }

  /* ---------- 도감 ----------
   * 칸은 세 가지: 키웠거나 이긴 디지몬(그림), 만나기만 한 디지몬(실루엣 + 이름), 모르는 디지몬(???)
   * 칸을 누르면 진화 전후와 조건을 보여 준다.
   */
  function lineSpecies(k) {
    var L = D.LINES[k], seen = {}, out = [], q = [L.baby1, L.baby2, L.child];
    while (q.length) {
      var id = q.shift();
      if (seen[id]) continue;
      seen[id] = 1; out.push(id);
      (L.evo[id] || []).forEach(function (e) { q.push(e[1]); });
      if (L.special && L.special[id]) q.push(L.special[id].to);
      if (id === L.child && L.armor) D.DIGIMENTALS.forEach(function (d) { q.push(L.armor[d]); });
    }
    return out.sort(function (a, b) { return E.STAGE_IDX[D.SPECIES[a].stage] - E.STAGE_IDX[D.SPECIES[b].stage]; });
  }
  function dexSections() {
    var secs = [], used = {};
    function add(title, ids) {
      ids = ids.filter(function (id) { if (used[id]) return false; used[id] = 1; return true; });
      if (ids.length) secs.push({ title: title, ids: ids });
    }
    D.LINE_ORDER.forEach(function (k) { add(D.LINES[k].name + ' 라인', lineSpecies(k)); });
    ['child', 'adult', 'perfect', 'ultimate'].forEach(function (st) {
      var ids = [];
      Object.keys(D.WILD[st]).forEach(function (a) { ids = ids.concat(D.WILD[st][a]); });
      add('야생 ' + D.STAGE_NAMES[st], ids);
    });
    add('보스', D.BOSSES.perfect.concat(D.BOSSES.ultimate));
    add('전설', D.LEGENDS);
    return secs;
  }
  function known(id) { var e = state.meta.dex[id]; return !!(e && (e.raised || e.beaten)); }
  function met(id) { return !!state.meta.dex[id]; }
  function renderDex() {
    var body = $('dexBody'), total = 0, have = 0, top0 = body.scrollTop;
    body.innerHTML = '';
    dexSections().forEach(function (sec) {
      var div = document.createElement('div'); div.className = 'dex-sec';
      var h = document.createElement('h3'), n = sec.ids.filter(known).length;
      h.textContent = sec.title + ' · ' + n + '/' + sec.ids.length;
      div.appendChild(h);
      var grid = document.createElement('div'); grid.className = 'dex-grid';
      sec.ids.forEach(function (id) {
        var got = known(id); total++; if (got) have++;
        var cell = document.createElement('button'); cell.type = 'button';
        cell.className = 'dex-cell' + (got ? '' : ' no');
        cell.appendChild(Sprite.canvas(id, 48, { silhouette: !got }));
        var s = document.createElement('span');
        s.textContent = got || met(id) ? name(id) : '???';
        cell.appendChild(s); grid.appendChild(cell);
        cell.addEventListener('click', function () { openDexCard(id); });
      });
      div.appendChild(grid); body.appendChild(div);
    });
    $('dexCount').textContent = have + ' / ' + total;
    body.scrollTop = top0;
  }

  function openDexCard(id) {
    var S = D.SPECIES[id], e = state.meta.dex[id], got = known(id);
    picture($('dcPic'), id, { silhouette: !got, anim: 'idle' });
    var nm = $('dcName');
    nm.textContent = got || e ? S.name : '???';
    if (S.boss || S.legend) {
      var g = document.createElement('span');
      g.className = 'grade ' + (S.boss ? 'boss' : 'legend'); g.textContent = S.boss ? '보스' : '전설';
      nm.appendChild(g);
    }
    $('dcInfo').textContent = D.STAGE_NAMES[S.stage] + ' · ' + D.ATTR_NAMES[S.attr] + (S.armor ? ' · 아머체' : '') +
      (S.terminal ? ' · 막다른 진화 (전투력 높음)' : '');

    var box = $('dcEvo');
    box.innerHTML = '';
    function section(title, rows) {
      if (!rows.length) return;
      var h = document.createElement('h4'); h.textContent = title; box.appendChild(h);
      rows.forEach(function (r) {
        var d = document.createElement('div'); d.className = 'evo-row';
        var b = document.createElement('b'); b.textContent = known(r[0]) || met(r[0]) ? name(r[0]) : '???';
        var sp = document.createElement('span'); sp.textContent = r[1];
        d.appendChild(b); d.appendChild(sp); box.appendChild(d);
      });
    }
    var from = [], to = [];
    D.LINE_ORDER.forEach(function (k) {
      var L = D.LINES[k], babies = [L.baby1, L.baby2, L.child];
      var bi = babies.indexOf(id);
      if (bi > 0) from.push([babies[bi - 1], '시간이 지나면']);
      if (bi >= 0 && bi < 2) to.push([babies[bi + 1], '시간이 지나면 (' + R.stageHours[D.SPECIES[id].stage] + '시간)']);
      Object.keys(L.evo).forEach(function (f) {
        L.evo[f].forEach(function (x) {
          if (x[1] === id) from.push([f, D.RULE_HINTS[x[0]]]);
          if (f === id) to.push([x[1], D.RULE_HINTS[x[0]]]);
        });
      });
      if (L.armor) D.DIGIMENTALS.forEach(function (dk) {
        if (L.armor[dk] === id) from.push([L.child, D.RULE_HINTS[dk] + ' (48시간)']);
        if (id === L.child) to.push([L.armor[dk], D.RULE_HINTS[dk] + ' · 아머진화 48시간']);
      });
      Object.keys(L.special || {}).forEach(function (f) {
        var x = L.special[f];
        if (x.to === id) from.push([f, D.RULE_HINTS[x.rule]]);
        if (f === id) to.push([x.to, D.RULE_HINTS[x.rule]]);
      });
    });
    var dedupe = function (rows) {
      var k = {}; return rows.filter(function (r) { var key = r[0] + r[1]; if (k[key]) return false; k[key] = 1; return true; });
    };
    section('진화 전', dedupe(from));
    section('진화 후', dedupe(to));
    if (!from.length && !to.length) {
      var where = S.legend ? '궁극체로 스캔하면 아주 드물게 (0.3%)' : S.boss
        ? D.STAGE_NAMES[S.stage] + ' 상대 중 ' + Math.round(R.gradeOdds[S.stage].boss * 100) + '% 확률로'
        : D.STAGE_NAMES[S.stage] + ' 상대로 바코드 배틀에서';
      section('만나는 곳', [[id, where]]);
    }
    show('dexCard');
  }

  /* ---------- 정보 ---------- */
  function table(rows) {
    var t = document.createElement('table'); t.className = 'kv';
    rows.forEach(function (r) {
      var tr = document.createElement('tr'), th = document.createElement('th'), td = document.createElement('td');
      th.textContent = r[0]; td.textContent = r[1];
      tr.appendChild(th); tr.appendChild(td); t.appendChild(tr);
    });
    return t;
  }
  function heading(text) { var h = document.createElement('p'); h.className = 'info-h'; h.textContent = text; return h; }

  function renderInfo() {
    var body = $('infoBody'), mon = state.mon, t = now(), c = mon.c;
    body.innerHTML = '';
    if (DEV) {
      body.appendChild(heading('시험용 시간 건너뛰기'));
      var dev = document.createElement('div'); dev.className = 'dev';
      [['+15분', 15 * M], ['+1시간', H], ['+6시간', 6 * H], ['+1일', 24 * H]].forEach(function (o) {
        var b = document.createElement('button'); b.className = 'btn'; b.textContent = o[0];
        b.addEventListener('click', function () {
          state.meta.offset = (state.meta.offset || 0) + o[1];
          E.tick(state, now()); save(); renderInfo(); drainEvents();
        });
        dev.appendChild(b);
      });
      body.appendChild(dev);
    }
    var S = D.SPECIES[E.form(mon)];
    body.appendChild(heading('지금'));
    body.appendChild(table([
      ['디지몬', S.name + ' (' + D.LINES[mon.line].name + ' 라인)'],
      ['단계 · 속성', (mon.armor ? '아머체' : D.STAGE_NAMES[mon.stage]) + ' · ' + D.ATTR_NAMES[S.attr]],
      ['나이', dur(t - mon.born)],
      ['다음 진화', mon.stageEnd ? dur(mon.stageEnd - t) + ' 뒤' : '없음'],
      ['전투력', mon.stage === 'egg' ? '-' : Math.round(E.myPower(mon))]
    ]));
    body.appendChild(heading('이 단계에서 쌓인 값 (진화 판정에 쓰여요)'));
    body.appendChild(table([
      ['케어 실수', c.mistakes], ['훈련', c.training], ['과식', c.overfeed],
      ['위생 실수', c.hygiene], ['수면 방해', c.sleep],
      ['배틀', c.battles + '전 ' + c.wins + '승 ' + c.losses + '패' +
        (c.battles ? ' (승률 ' + Math.round(E.winRate(c) * 100) + '%)' : '')],
      ['최다 연패', c.maxStreak], ['보스 격파', c.bossWins], ['배고픈 채 배틀', c.hungryBattles]
    ]));
    var it = state.meta.items;
    body.appendChild(heading('아이템 (모든 디지몬이 함께 써요)'));
    body.appendChild(table(D.DIGIMENTALS.map(function (k) {
      return [D.RULE_HINTS[k], it[k] ? '있음 → ' + name(D.LINES.veemon.armor[k]) : '없음'];
    }).concat([['디지 칩', it.chip + '개 (배고픔·힘 가득)']])));
    if (state.meta.history.length) {
      body.appendChild(heading('지난 디지몬'));
      body.appendChild(table(state.meta.history.map(function (h) {
        return [name(h.species), D.LINES[h.line].name + ' 라인 · ' + dur(h.died - h.born) + (h.how === 'released' ? ' · 떠나보냄' : '')];
      })));
    }
    var reset = document.createElement('button');
    reset.className = 'btn ghost'; reset.textContent = '처음부터 다시 (보관함·도감까지 모두 지우기)';
    reset.addEventListener('click', function () {
      if (!confirm('정말 모두 지울까요? 보관함의 디지몬, 도감, 아이템도 사라져요.')) return;
      state = E.newState(); choosing = false; save(); closeAll(); render();
    });
    body.appendChild(reset);
  }

  /* ---------- 진화·사건 ---------- */
  var queue = [], evoOpen = false;
  var KIND = {
    normal: '진화!', mid: '진화!', bad: '진화…?', dark: '폭주 진화!', purify: '정화 진화!', hidden: '숨은 진화!',
    jogress: '조그레스 진화!', mode: '모드 체인지!', armor: '아머진화!', hatch: '부화!'
  };
  var NOTE = {
    dark: '돌보는 방식이 진화를 비틀었어요',
    purify: '어둠을 털어내고 정상 루트로 돌아왔어요',
    hidden: '조건을 넘치게 채워서 숨은 진화가 열렸어요',
    bad: '돌보기가 많이 서툴렀어요',
    jogress: '두 영웅의 힘이 하나가 됐어요',
    mode: '보스를 이겨 낸 힘으로 모습이 바뀌었어요',
    armor: '48시간 동안 아머체가 돼요. 보스전에 강해요',
    hatch: '디지타마에서 깨어났어요. 잘 돌봐 주세요!'
  };
  function drainEvents() {
    var evs = state.events.splice(0);
    if (!evs.length) return;
    var t = now(), mistakes = 0, recentCall = false;
    evs.forEach(function (e) {
      if (e.type === 'evolve' || e.type === 'death') queue.push(e);
      else if (e.type === 'fail') queue.push(e);
      else if (e.type === 'armorEnd') toast('아머진화가 풀렸어요');
      else if (e.type === 'sick' && e.why === 'poop') toast('똥이 너무 쌓여서 병에 걸렸어요! 💊 약을 주세요');
      else if (e.type === 'mistake' && e.kind !== 'wake') mistakes++;
      else if (e.type === 'call' && t - e.t < 2 * M) recentCall = true;
    });
    if (recentCall) vibrate([80, 60, 80]);
    if (mistakes) toast(mistakes > 1 ? '자리를 비운 사이 실수가 ' + mistakes + '번 쌓였어요' : '돌보기 실수가 1번 쌓였어요');
    save();
    nextEvent();
  }
  function nextEvent() {
    if (evoOpen || !queue.length) return;
    var e = queue.shift();
    if (e.type === 'death') { showDead(); return; }
    evoOpen = true;
    var sec = $('evo'), id = e.to;
    picture($('evoPic'), id, { anim: e.type === 'fail' ? 'idle' : 'happy' });
    if (e.type === 'fail') {
      $('evoKind').textContent = '진화 실패';
      $('evoName').textContent = josa(name(id), '은', '는') + ' 그대로예요';
      $('evoNote').textContent = e.delay ? '조건이 모자랐어요. 다음 판정이 하루 늦어져요' : '조건이 모자랐어요. 다음 판정까지 다시 키워 봐요';
    } else {
      $('evoKind').textContent = KIND[e.kind] || '진화!';
      $('evoName').textContent = name(e.from) + ' → ' + name(id);
      $('evoNote').textContent = NOTE[e.kind] || '';
      sec.classList.remove('flash'); void sec.offsetWidth; sec.classList.add('flash');
      vibrate([60, 40, 60, 40, 160]);
    }
    sec.hidden = false;
  }
  $('evoOk').addEventListener('click', function () {
    $('evo').hidden = true; evoOpen = false;
    render(); nextEvent();
  });

  function showDead() {
    var mon = state.mon;
    $('home').hidden = true;
    picture($('deadPic'), mon.species, { dark: true, anim: 'sleep' });
    $('deadName').textContent = josa(name(mon.species), '이', '가') + ' 디지타마로 돌아갔어요';
    $('deadNote').textContent = dur((mon.deathAt || mon.lastTick) - mon.born) + ' 동안 함께했어요. 도감, 아이템, 보관함의 디지몬은 그대로 남아요.';
    $('dead').hidden = false;
  }
  $('newEgg').addEventListener('click', function () {
    state.mon = null; state.events = []; choosing = false; save();
    $('dead').hidden = true; queue = []; render();
  });

  /* ---------- 시작 ---------- */
  function loop() {
    if (state.mon && !state.mon.dead) {
      E.tick(state, now());
      drainEvents();
      if (!stack.length && !evoOpen) render();
      save();
    }
  }
  E.tick(state, now());
  render();
  drainEvents();
  save();
  setInterval(loop, 5000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) loop(); });
  requestAnimationFrame(drawLcd);
  // 시트를 처음 불러오면 그 그림이 들어간 화면을 다시 그린다
  Sprite.onload(function () {
    if (stack.indexOf('dex') >= 0) renderDex();
    if (top() === 'box') renderBox();
    if (!stack.length && !$('eggs').hidden) renderEggs();
    pictures.forEach(function (p) { picture(p[0], p[1], p[2]); });
  });

  // 안드로이드 앱(APK) 안에서는 파일이 이미 기기에 있어서 오프라인 캐시가 필요 없다
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0 && !/DigitamaApp/.test(navigator.userAgent)) {
    navigator.serviceWorker.register('sw.js').catch(function () { });
  }
})();
