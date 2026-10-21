/* 디지몬 육성 화면 흐름
 *
 *   알 고르기 → 육성 화면 ─ 훈련 / 바코드 스캔 → 배틀 / 도감 / 정보
 *                    └ 진화·수명 연출은 엔진이 남긴 사건(events)을 보고 띄운다
 *
 * 상태는 localStorage 한 칸에 둔다. 앱을 닫아 둔 사이의 시간은 열 때 엔진이 따라잡는다.
 * 주소에 ?dev=1 을 붙이면 정보 화면에 시간 건너뛰기 버튼이 생긴다 (시험용).
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'digimon:v1';
  var D = DigiData, E = Engine, R = D.RULES, H = E.HOUR, M = E.MIN;
  var DEV = /[?&]dev=1/.test(location.search);

  var state = load();
  function now() { return Date.now() + (state.meta.offset || 0); }

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.v === 1) return s;
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
  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { } }

  /* ---------- 화면 전환 (안드로이드 뒤로가기로 닫히게 history 를 쓴다) ---------- */
  var SCREENS = ['train', 'scan', 'battle', 'dex', 'info'];
  var openScreen = null;
  function show(name) {
    SCREENS.forEach(function (s) { $(s).hidden = s !== name; });
    if (!openScreen) history.pushState({ scr: name }, '');
    else history.replaceState({ scr: name }, '');
    openScreen = name;
  }
  function closeScreen() { if (openScreen) history.back(); }
  window.addEventListener('popstate', function () {
    if (!openScreen) return;
    var was = openScreen;
    SCREENS.forEach(function (s) { $(s).hidden = true; });
    openScreen = null;
    onClosed(was);
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) {
    b.addEventListener('click', closeScreen);
  });
  function onClosed(was) {
    if (was === 'train') stopTrain();
    if (was === 'scan') stopCam();
    if (was === 'battle' && battle && !battle.over) finishBattle(true); // 도망쳐도 패배로 친다
    render();
  }

  /* ---------- 알 고르기 ---------- */
  function renderEggs() {
    var ul = $('eggList');
    ul.innerHTML = '';
    D.LINE_ORDER.forEach(function (id) {
      var L = D.LINES[id];
      var li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button';
      var c = document.createElement('canvas');
      c.width = 8 * 6; c.height = 10 * 6;
      Sprite.egg(c.getContext('2d'), id, 0, 0, 6);
      var tx = document.createElement('span');
      tx.innerHTML = '<span class="n"></span><br><span class="t"></span>';
      tx.querySelector('.n').textContent = L.name + '의 디지타마';
      tx.querySelector('.t').textContent = L.from + ' · ' + L.trait;
      b.appendChild(c); b.appendChild(tx);
      b.addEventListener('click', function () {
        if (!confirm(L.name + '의 디지타마를 고를까요?')) return;
        E.hatch(state, id, now());
        state.events = [];
        save(); render();
        toast(josa(name(D.LINES[id].baby1), '이', '가') + ' 태어났어요!');
      });
      li.appendChild(b); ul.appendChild(li);
    });
  }

  /* ---------- 육성 화면 ---------- */
  function pips(el, n) {
    el.innerHTML = '';
    for (var i = 0; i < 4; i++) { var p = document.createElement('i'); if (i < n) p.className = 'on'; el.appendChild(p); }
  }

  function render() {
    var mon = state.mon, t = now();
    $('eggs').hidden = !!mon;
    $('home').hidden = !mon;
    if (!mon) { renderEggs(); return; }
    if (mon.dead) { showDead(); return; }

    var id = E.form(mon), S = D.SPECIES[id];
    $('monName').textContent = S.name;
    $('monStage').textContent = mon.armor ? '아머체' : D.STAGE_NAMES[mon.stage];
    var at = $('monAttr');
    at.textContent = D.ATTR_NAMES[S.attr]; at.className = 'chip attr ' + S.attr;
    $('monAge').textContent = dur(t - mon.born) + '째';
    pips($('hunger'), mon.hunger);
    pips($('strength'), mon.strength);

    var msg = $('msg'), warn = E.warning(mon, t), text = '', bad = false;
    if (mon.sleeping) { text = mon.lights ? '잠들었어요. 불을 꺼 주세요!' : '쿨쿨…'; bad = mon.lights; }
    else if (mon.callH > 0) { text = '배고파해요!'; bad = true; }
    else if (mon.callS > 0) { text = '힘이 없어요. 간식이나 훈련을!'; bad = true; }
    else if (mon.poops.length) { text = '똥을 치워 주세요'; }
    else if (warn) { text = '몸 색이 어두워졌어요… 뭔가 잘못되고 있어요'; bad = true; }
    else if (mon.armor) { text = '아머진화 중 · ' + dur(mon.armor - t) + ' 남음'; }
    else text = '기분이 좋아 보여요';
    if (!mon.sleeping && warn && text !== '몸 색이 어두워졌어요… 뭔가 잘못되고 있어요') text += ' · 색이 어두워요';
    msg.textContent = text; msg.className = 'msg' + (bad ? ' warn' : '');

    var next;
    if (mon.rescueUntil) next = '구제 판정까지 ' + dur(mon.rescueUntil - t) + ' (위생 실수·과식 0 을 지켜요)';
    else if (mon.stageEnd) next = '다음 진화까지 ' + dur(mon.stageEnd - t);
    else if (mon.stage === 'ultimate') next = '궁극체 · 수명이 다할 때까지 함께해요';
    else next = '더 진화하지 않아요';
    $('next').textContent = next;

    $('lightsLabel').textContent = mon.lights ? '불 끄기' : '불 켜기';
    document.querySelector('[data-act="wake"]').disabled = !mon.sleeping;
    document.querySelector('[data-act="battle"]').disabled = !E.canBattle(state).ok;
    document.querySelector('[data-act="armor"]').hidden = !E.canArmor(state, t);
    document.querySelector('[data-act="chip"]').hidden = !state.meta.items.chip;
    document.querySelector('[data-act="chip"]').lastChild.textContent = '디지 칩 ×' + state.meta.items.chip;
  }

  /* ---------- 화면(LCD) 그리기 ---------- */
  var lcd = $('lcd'), lx = lcd.getContext('2d');
  var walk = { x: 60, dir: 1, frame: 0 }, effect = null, lastFrame = 0;
  var POOP = ['..X..', '.XXX.', 'XXXXX'];

  function drawLcd(ts) {
    requestAnimationFrame(drawLcd);
    if (ts - lastFrame < 220) return;
    lastFrame = ts;
    var mon = state.mon;
    if (!mon || mon.dead || $('home').hidden) return;
    var W = 160, Hh = 112, dark = !mon.lights;
    lx.fillStyle = dark ? '#1a1f2a' : '#d7e8c4';
    lx.fillRect(0, 0, W, Hh);
    lx.fillStyle = dark ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.04)';
    for (var gy = 0; gy < Hh; gy += 4) lx.fillRect(0, gy, W, 1);

    var id = E.form(mon), n = Sprite.size(id), cell = 4, sw = n * cell;
    var floor = 100, y = floor - sw;
    walk.frame ^= 1;
    if (mon.sleeping) {
      walk.x = (W - sw) / 2 - 12;
    } else {
      walk.x += walk.dir * 4;
      var maxX = W - sw - 34;
      if (walk.x > maxX) { walk.x = maxX; walk.dir = -1; }
      if (walk.x < 4) { walk.x = 4; walk.dir = 1; }
      if (Math.random() < 0.08) walk.dir *= -1;
    }
    var bob = mon.sleeping ? 0 : walk.frame * 2;
    Sprite.draw(lx, id, Math.round(walk.x), y + bob, cell, {
      flip: walk.dir < 0, frame: mon.sleeping ? 0 : walk.frame, dark: E.warning(mon, now())
    });
    if (dark) { lx.fillStyle = 'rgba(10,12,20,.55)'; lx.fillRect(0, 0, W, Hh); }

    // 배변
    mon.poops.slice(0, 6).forEach(function (p, i) {
      var px = W - 26 + (i % 2) * 12, py = floor - 8 - Math.floor(i / 2) * 12;
      POOP.forEach(function (row, ry) {
        for (var rx = 0; rx < row.length; rx++) if (row[rx] === 'X') {
          lx.fillStyle = '#6a4a2a'; lx.fillRect(px + rx * 2, py + ry * 2, 2, 2);
        }
      });
    });

    lx.font = 'bold 12px monospace';
    if (mon.sleeping) {
      lx.fillStyle = dark ? '#c9d4ff' : '#1b1f17';
      lx.fillText(walk.frame ? 'Z z' : 'z Z', (W + sw) / 2 - 8, y + 4);
    }
    if (!mon.sleeping && (mon.callH > 0 || mon.callS > 0)) {
      lx.fillStyle = '#d6332f';
      lx.fillRect(6, 6, 14, 16);
      lx.fillStyle = '#fff'; lx.fillText('!', 10, 18);
    }
    if (effect && ts < effect.until) {
      lx.font = 'bold 14px sans-serif';
      lx.fillStyle = dark ? '#fff' : '#1b1f17';
      lx.fillText(effect.text, 8, 36);
    }
  }
  function fx(text) { effect = { text: text, until: performance.now() + 1400 }; }

  /* ---------- 돌보기 ---------- */
  function sleepingGuard() {
    if (!state.mon.sleeping) return false;
    toast('자고 있어요. 깨우려면 ⏰ 깨우기 (수면 방해로 쳐요)');
    return true;
  }

  var ACTS = {
    feed: function () {
      if (sleepingGuard()) return;
      var r = E.feed(state);
      if (r.over) { toast('배가 불러요… 과식했어요'); fx('윽…'); } else fx('냠냠');
    },
    snack: function () {
      if (sleepingGuard()) return;
      var r = E.snack(state);
      if (r.over) { toast('배부른데 간식까지… 과식했어요'); fx('윽…'); } else fx('♪');
    },
    train: function () { if (!sleepingGuard()) startTrain(); },
    clean: function () {
      var r = E.clean(state);
      toast(r.n ? '깨끗해졌어요' : '치울 게 없어요');
    },
    lights: function () { E.toggleLights(state); },
    wake: function () {
      if (!state.mon.sleeping) return;
      if (!confirm('자는 걸 깨우면 수면 방해로 쳐요. 깨울까요?')) return;
      E.wake(state, now()); fx('하암…');
    },
    battle: function () { openScan(); },
    dex: function () { renderDex(); show('dex'); },
    info: function () { renderInfo(); show('info'); },
    armor: function () {
      if (!confirm('디지멘탈로 아머진화할까요? 48시간 동안 플레이드라몬이 돼요.')) return;
      E.armor(state, now());
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
      save(); render(); drainEvents();
    });
  });

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
      fx(r.good ? '하앗!' : '헉헉');
    }, 450);
  });

  /* ---------- 바코드 스캔 ---------- */
  var cam = { stream: null, timer: 0, detector: null }, found = null;
  var canDetect = 'BarcodeDetector' in window && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  function openScan() {
    var can = E.canBattle(state);
    if (!can.ok) { toast(can.reason === 'sleep' ? '자고 있어요' : '성장기부터 배틀할 수 있어요'); return; }
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
      ' · 같은 바코드는 하루 한 번만 배틀해요';
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
    empty: '바코드 숫자를 넣어 주세요', today: '이 바코드와는 오늘 이미 싸웠어요. 내일 다시!',
    limit: '오늘 스캔을 다 썼어요. 내일 다시!', sleep: '자고 있어요', baby: '성장기부터 배틀할 수 있어요'
  };
  function lookUp(code) {
    E.tick(state, now());
    var r = E.scan(state, code, now());
    if (!r.ok) { toast(REASON[r.reason] || '스캔할 수 없어요'); return; }
    found = r.wild;
    save(); updateScanLeft();
    var w = r.wild, S = D.SPECIES[w.id];
    var c = $('wildPic'), x = c.getContext('2d'), n = Sprite.size(w.id), cell = Math.floor(72 / n);
    x.clearRect(0, 0, 72, 72);
    Sprite.draw(x, w.id, Math.floor((72 - n * cell) / 2), Math.floor((72 - n * cell) / 2), cell, { flip: true });
    var nm = $('wildName');
    nm.textContent = '야생 ' + S.name;
    if (w.grade !== 'normal') {
      var g = document.createElement('span');
      g.className = 'grade ' + w.grade; g.textContent = w.grade === 'boss' ? '보스' : '희귀';
      nm.appendChild(g);
    }
    $('wildInfo').textContent = D.STAGE_NAMES[D.STAGES[w.level]] + ' · ' + D.ATTR_NAMES[w.attr] +
      (state.meta.dex[w.id] && state.meta.dex[w.id].beaten ? ' · 도감 등록됨' : ' · 처음 보는 디지몬');
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

  /* ---------- 배틀 ---------- */
  var battle = null, arena = $('arena'), ax = arena.getContext('2d'), shake = { p: 0, e: 0 };
  var CMD_NAMES = { attack: '공격', special: '필살기', guard: '방어' };

  function startBattle(w) {
    E.tick(state, now());
    battle = E.startBattle(state, w);
    $('pName').textContent = name(battle.me);
    $('eName').textContent = w.name + (w.grade === 'boss' ? ' (보스)' : w.grade === 'rare' ? ' (희귀)' : '');
    $('blog').textContent = josa('야생 ' + w.name, '이', '가') + ' 나타났다!' + (battle.hungry ? ' (배가 고파 힘이 빠져 있다)' : '');
    $('cmds').hidden = false; $('battleDone').hidden = true;
    setCmds(true);
    drawArena(); hpBars();
    show('battle');
  }
  function hpBars() {
    $('pHp').style.width = battle.php + '%';
    $('eHp').style.width = battle.ehp + '%';
  }
  function drawArena() {
    if (!battle) return;
    ax.fillStyle = '#d7e8c4'; ax.fillRect(0, 0, 200, 96);
    var a = battle.me, b = battle.wild.id;
    var na = Sprite.size(a), nb = Sprite.size(b), ca = Math.max(2, Math.floor(80 / Math.max(na, nb))), cb = ca;
    Sprite.draw(ax, a, 12 + shake.p, 90 - na * ca, ca, {});
    Sprite.draw(ax, b, 188 - nb * cb + shake.e, 90 - nb * cb, cb, { flip: true });
  }
  function setCmds(on) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-cmd]'), function (b) { b.disabled = !on; });
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-cmd]'), function (btn) {
    btn.addEventListener('click', function () {
      if (!battle || battle.over) return;
      var r = E.battleTurn(battle, btn.getAttribute('data-cmd'));
      var me = name(battle.me), en = battle.wild.name, lines = [];
      if (r.ignored) lines.push(josa(me, '이', '가') + ' 명령을 무시했다!');
      lines.push(me + ' ' + CMD_NAMES[r.pCmd] + (r.pCmd === 'guard' ? '' : r.pDmg ? ' → ' + r.pDmg : ' → 빗나감'));
      lines.push(en + ' ' + CMD_NAMES[r.eCmd] + (r.eCmd === 'guard' ? '' : r.eDmg ? ' → ' + r.eDmg : ' → 빗나감'));
      $('blog').textContent = lines.join(' · ');
      setCmds(false);
      shake.e = r.pDmg ? 4 : 0; shake.p = r.eDmg ? -4 : 0;
      drawArena(); hpBars();
      vibrate(r.eDmg ? 40 : 0);
      setTimeout(function () {
        shake.p = shake.e = 0; drawArena();
        if (battle.over) finishBattle(false); else setCmds(true);
      }, 380);
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
    if (r.reward === 'digimental') text += ' · 디지멘탈을 얻었어요!';
    if (r.reward === 'chip') text += ' · 디지 칩을 얻었어요!';
    $('blog').textContent = text;
    $('cmds').hidden = true; $('battleDone').hidden = false;
    vibrate(r.won ? [40, 60, 40] : 120);
    battle = null;
  }

  /* ---------- 도감 ---------- */
  function dexSections() {
    var secs = [], used = {};
    function add(title, ids) {
      ids = ids.filter(function (id) { if (used[id]) return false; used[id] = 1; return true; });
      if (ids.length) secs.push({ title: title, ids: ids });
    }
    D.LINE_ORDER.forEach(function (k) {
      var L = D.LINES[k], ids = [L.baby1, L.baby2, L.child];
      if (L.armor) ids.push(L.armor);
      ids.push(L.adult, L.mid); if (L.dark) ids.push(L.dark);
      ids.push(L.perfect, L.ultimate);
      if (k === 'agumon') ids.push('skullgreymon');
      if (k === 'patamon') ids.push('devimon');
      if (k === 'guilmon') ids.push('megidramon');
      add(L.name + ' 라인', ids);
    });
    add('실패·숨은 루트', ['numemon', 'monzaemon', 'sukamon']);
    ['child', 'adult', 'perfect'].forEach(function (st) {
      var ids = [];
      Object.keys(D.WILD[st]).forEach(function (a) { ids = ids.concat(D.WILD[st][a]); });
      add('야생 ' + D.STAGE_NAMES[st], ids);
    });
    add('보스', D.BOSSES.perfect.concat(D.BOSSES.ultimate));
    return secs;
  }
  function renderDex() {
    var body = $('dexBody'), total = 0, have = 0;
    body.innerHTML = '';
    dexSections().forEach(function (sec) {
      var div = document.createElement('div'); div.className = 'dex-sec';
      var h = document.createElement('h3'); h.textContent = sec.title; div.appendChild(h);
      var grid = document.createElement('div'); grid.className = 'dex-grid';
      sec.ids.forEach(function (id) {
        var got = !!state.meta.dex[id]; total++; if (got) have++;
        var cell = document.createElement('div'); cell.className = 'dex-cell' + (got ? '' : ' no');
        cell.appendChild(Sprite.canvas(id, 48, { silhouette: !got }));
        var s = document.createElement('span');
        s.textContent = got ? name(id) : '???';
        cell.appendChild(s); grid.appendChild(cell);
      });
      div.appendChild(grid); body.appendChild(div);
    });
    $('dexCount').textContent = have + ' / ' + total;
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
      ['남은 수명', dur(mon.deathAt - t)],
      ['다음 진화', mon.stageEnd ? dur(mon.stageEnd - t) + ' 뒤' : '없음'],
      ['전투력', Math.round(E.myPower(mon))]
    ]));
    body.appendChild(heading('이 단계에서 쌓인 값 (진화 판정에 쓰여요)'));
    body.appendChild(table([
      ['케어 실수', c.mistakes], ['훈련', c.training], ['과식', c.overfeed],
      ['위생 실수', c.hygiene], ['수면 방해', c.sleep],
      ['배틀', c.battles + '전 ' + c.wins + '승 ' + c.losses + '패' +
        (c.battles ? ' (승률 ' + Math.round(E.winRate(c) * 100) + '%)' : '')],
      ['최다 연패', c.maxStreak], ['보스 격파', c.bossWins], ['배고픈 채 배틀', c.hungryBattles]
    ].concat(mon.line === 'patamon' && mon.stage === 'child' ? [['성장기 연장', mon.extensions + ' / 2']] : [])));
    body.appendChild(heading('아이템'));
    body.appendChild(table([
      ['디지멘탈', state.meta.items.digimental + (mon.line === 'veemon' ? ' (성장기 브이몬이 아머진화)' : '')],
      ['디지 칩', state.meta.items.chip + ' (배고픔·힘 가득)']
    ]));
    if (state.meta.history.length) {
      body.appendChild(heading('지난 디지몬'));
      body.appendChild(table(state.meta.history.map(function (h) {
        return [name(h.species), D.LINES[h.line].name + ' 라인 · ' + dur(h.died - h.born)];
      })));
    }
    var reset = document.createElement('button');
    reset.className = 'btn ghost'; reset.textContent = '처음부터 다시 (도감까지 모두 지우기)';
    reset.addEventListener('click', function () {
      if (!confirm('정말 모두 지울까요? 도감과 아이템도 사라져요.')) return;
      state = E.newState(); save(); closeScreen(); render();
    });
    body.appendChild(reset);
  }

  /* ---------- 진화·사건 ---------- */
  var queue = [], evoOpen = false;
  var KIND = {
    normal: '진화!', mid: '진화!', dark: '폭주 진화!', purify: '정화 진화!', hidden: '숨은 진화!',
    numemon: '진화…?', sukamon: '진화…?', rescue: '구제 진화!', armor: '아머진화!'
  };
  var NOTE = {
    dark: '돌보는 방식이 진화를 비틀었어요',
    purify: '어둠을 털어내고 정상 루트로 돌아왔어요',
    hidden: '실패 루트에 숨어 있던 진화예요',
    numemon: '케어 실수가 너무 많았어요',
    sukamon: '하루 동안 위생 실수·과식 없이 지내면 다시 기회가 있어요',
    rescue: '깨끗하게 지낸 덕분에 정상 성숙기가 됐어요',
    armor: '48시간 동안 플레이드라몬이 돼요. 보스전에 강해요'
  };
  function drainEvents() {
    var evs = state.events.splice(0);
    if (!evs.length) return;
    var t = now(), mistakes = 0, recentCall = false;
    evs.forEach(function (e) {
      if (e.type === 'evolve' || e.type === 'death') queue.push(e);
      else if (e.type === 'fail') queue.push(e);
      else if (e.type === 'extend') toast('파닥몬의 성장기가 하루 늘었어요 (' + e.n + '/2). 훈련을 더 해 주세요');
      else if (e.type === 'rescueFail') toast('구제에 실패했어요. 스카몬으로 남아요');
      else if (e.type === 'armorEnd') toast('아머진화가 풀렸어요');
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
    var sec = $('evo'), pic = $('evoPic'), x = pic.getContext('2d');
    x.clearRect(0, 0, 128, 128);
    var id = e.to, n = Sprite.size(id), cell = Math.floor(112 / n);
    Sprite.draw(x, id, Math.floor((128 - n * cell) / 2), Math.floor((128 - n * cell) / 2), cell, {});
    if (e.type === 'fail') {
      $('evoKind').textContent = '진화 실패';
      $('evoName').textContent = josa(name(id), '은', '는') + ' 그대로예요';
      $('evoNote').textContent = e.cut ? '조건이 모자랐어요. 수명이 하루 줄었어요' : '조건이 모자랐어요. 다음 판정까지 다시 키워 봐요';
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
    var x = $('deadPic').getContext('2d'), n = Sprite.size(mon.species), cell = Math.floor(112 / n);
    x.clearRect(0, 0, 128, 128);
    Sprite.draw(x, mon.species, Math.floor((128 - n * cell) / 2), Math.floor((128 - n * cell) / 2), cell, { dark: true });
    $('deadName').textContent = josa(name(mon.species), '이', '가') + ' 디지타마로 돌아갔어요';
    $('deadNote').textContent = dur(mon.deathAt - mon.born) + ' 동안 함께했어요. 도감과 아이템은 그대로 남아요.';
    $('dead').hidden = false;
  }
  $('newEgg').addEventListener('click', function () {
    state.mon = null; state.events = []; save();
    $('dead').hidden = true; queue = []; render();
  });

  /* ---------- 시작 ---------- */
  function loop() {
    if (state.mon && !state.mon.dead) {
      E.tick(state, now());
      drainEvents();
      if (!openScreen && !evoOpen) render();
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

  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('sw.js').catch(function () { });
  }
})();
