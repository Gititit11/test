/* 디지몬 육성 — 게임 규칙
 *
 * 화면(DOM)에 손대지 않는 순수 로직이라 node 에서 그대로 시험한다 (test/engine.test.js).
 *
 *   newState()                  → 빈 저장 상태
 *   hatch(state, line, now)     → 디지타마를 받는다. 5분 동안 흔들리다가 부화 (키우던 디지몬은 보관함으로)
 *   store / resume / release    → 보관함. 보관한 디지몬은 시간이 멈춘다
 *   tick(state, now)            → 마지막으로 본 때부터 now 까지 1분씩 흘려 보낸다
 *   feed / snack / train / clean / toggleLights / wake / armor / useChip / medicine
 *   judge(mon)                  → 지금 진화하면 어떻게 되는지 (상태를 바꾸지 않음)
 *   wildFor(stageIdx, rnd) / wildForCode(code, stageIdx) → 야생 디지몬 하나 (같은 바코드 · 같은 내 단계면 늘 같은 디지몬)
 *   scan / startBattle / battleTurn / endBattle
 *
 * 앱을 닫아 둔 동안의 일은 다시 열 때 tick 이 한꺼번에 따라잡는다.
 * 그래서 시간이 흐르는 규칙은 모두 '1분 단위' 로 적는다.
 */
var Engine = (function (D) {
  'use strict';

  var MIN = 60000, HOUR = 60 * MIN;
  var R = D.RULES;
  var STAGE_IDX = {};
  D.STAGES.forEach(function (s, i) { STAGE_IDX[s] = i; });

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(t) {
    var d = new Date(t);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function floorMin(t) { return Math.floor(t / MIN) * MIN; }

  function freshCounters() {
    return {
      mistakes: 0, training: 0, overfeed: 0, hygiene: 0, sleep: 0,
      battles: 0, wins: 0, losses: 0, streak: 0, maxStreak: 0, bossWins: 0, hungryBattles: 0
    };
  }

  function newState() {
    return {
      v: 2,
      // 세대를 넘어 남는 것: 도감, 아이템, 지난 디지몬
      meta: {
        dex: {}, history: [], uid: 0,
        items: { flame: false, thunder: false, archer: false, miracle: false, chip: 0 }
      },
      mon: null,   // 지금 키우는 디지몬
      box: [],     // 보관함 (시간이 멈춰 있다)
      events: []
    };
  }

  function emit(state, type, t, extra) {
    var e = { type: type, t: t };
    for (var k in extra || {}) e[k] = extra[k];
    state.events.push(e);
    if (state.events.length > 60) state.events.splice(0, state.events.length - 60);
  }

  /* 도감: seen(만남) · raised(키움) · beaten(이김, wins 번) */
  function register(state, id, how, t) {
    var e = state.meta.dex[id] || (state.meta.dex[id] = { first: t || 0 });
    e[how] = true;
    if (how === 'beaten') e.wins = (e.wins || 0) + 1;
  }

  function line(mon) { return D.LINES[mon.line]; }
  function form(mon) { return mon.armor ? mon.armorTo : mon.species; }
  function evoList(mon) { return line(mon).evo[mon.species] || null; }
  function winRate(c) { return c.battles ? c.wins / c.battles : 0; }

  /* ---------- 부화 · 보관함 ---------- */
  function count(state) { return (state.mon && !state.mon.dead ? 1 : 0) + state.box.length; }
  function slotsLeft(state) { return R.slots - count(state); }

  function hatch(state, lineId, now) {
    if (slotsLeft(state) <= 0) return null;
    store(state, now);
    if (state.mon && !state.mon.dead) return null;
    var L = D.LINES[lineId], t = floorMin(now);
    state.mon = {
      uid: ++state.meta.uid,
      line: lineId, species: 'egg_' + lineId, stage: 'egg',
      born: t, stageStart: t, stageEnd: t + R.eggMinutes * MIN,
      hunger: 2, strength: 2, poops: [],
      lights: true, sleeping: false, woken: 0, lightMin: 0, sleepPenalized: false,
      callH: 0, callS: 0, hungerT: 0, strengthT: 0, poopT: 0,
      c: freshCounters(),
      armor: null, armorTo: null, armorDay: '',
      dead: false, lastTick: t
    };
    emit(state, 'egg', t, { to: state.mon.species });
    return state.mon;
  }

  // 키우던 디지몬을 보관함에 넣는다. 그 순간 시간이 멈춘다.
  function store(state, now) {
    var mon = state.mon;
    if (!mon || mon.dead) return false;
    tick(state, now);
    if (mon.dead) return false; // 예전 저장(수명이 있던 시절)에 남은 디지몬
    state.mon = null;
    mon.pausedAt = floorMin(now);
    state.box.push(mon);
    return true;
  }

  // 보관함에서 꺼낸다. 멈춰 있던 만큼 모든 시각을 뒤로 민다.
  function resume(state, uid, now) {
    var i = indexOf(state, uid);
    if (i < 0) return false;
    var mon = state.box.splice(i, 1)[0];
    store(state, now);
    var d = floorMin(now) - mon.pausedAt;
    ['born', 'stageStart', 'stageEnd', 'armor', 'lastTick'].forEach(function (k) {
      if (mon[k]) mon[k] += d;
    });
    delete mon.pausedAt;
    state.mon = mon;
    return true;
  }

  // 보관함의 디지몬을 떠나보낸다 (지난 디지몬 기록에 남는다)
  function release(state, uid, now) {
    var i = indexOf(state, uid);
    if (i < 0) return false;
    var mon = state.box.splice(i, 1)[0];
    remember(state, mon, now, 'released');
    return true;
  }
  function indexOf(state, uid) {
    for (var i = 0; i < state.box.length; i++) if (state.box[i].uid === uid) return i;
    return -1;
  }
  function remember(state, mon, t, how) {
    state.meta.history.unshift({ line: mon.line, species: mon.species, born: mon.born, died: t, how: how });
    if (state.meta.history.length > 30) state.meta.history.length = 30;
  }

  /* ---------- 시간 흐름 ---------- */
  function sleepNow(stage, t) {
    var w = R.sleep[stage];
    if (!w) return false;
    var h = new Date(t).getHours();
    return w[0] > w[1] ? (h >= w[0] || h < w[1]) : (h >= w[0] && h < w[1]);
  }

  function tick(state, now) {
    var mon = state.mon;
    if (!mon || mon.dead) return;
    while (!mon.dead && mon.lastTick + MIN <= now) {
      mon.lastTick += MIN;
      step(state, mon, mon.lastTick);
    }
  }

  function step(state, mon, t) {
    if (mon.stage === 'egg') { // 디지타마는 흔들리기만 한다
      if (t >= mon.stageEnd) evolveNow(state, mon, t);
      return;
    }
    if (mon.armor && t >= mon.armor) endArmor(state, mon, t);

    // 잠 — 취침 시간이 되면 잠들고, 깨우면 잠깐 깨어 있다가 다시 잔다
    if (!sleepNow(mon.stage, t)) {
      if (mon.sleeping) { emit(state, 'wakeup', t); mon.lights = true; }
      mon.sleeping = false; mon.woken = 0; mon.sleepPenalized = false; mon.lightMin = 0;
    } else if (mon.woken > 0) {
      mon.woken--; mon.sleeping = false;
    } else {
      if (!mon.sleeping) emit(state, 'sleep', t);
      mon.sleeping = true;
    }
    if (mon.sleeping && mon.lights && !mon.sleepPenalized) {
      if (++mon.lightMin > R.sleepLightsMinutes) {
        mon.sleepPenalized = true; // 하룻밤에 한 번만 센다
        mon.c.sleep++;
        emit(state, 'mistake', t, { kind: 'lights' });
      }
    }

    // 아프고 한 시간 안에 약을 안 주면 케어 실수 1. 정식처럼 병 하나에 한 번만 센다.
    if (mon.sick && ++mon.sickMin === R.sickMistakeMinutes) {
      mon.c.mistakes++;
      emit(state, 'mistake', t, { kind: 'sick' });
    }

    // 배변은 자는 동안에도 방치 시간이 흐른다. 똥이 3시간 넘게 남아 있으면 위생 실수 1.
    // 정식처럼 치울 때까지 한 번만 센다 (똥이 여러 개여도).
    mon.poops.forEach(function (p) { p.age++; });
    if (mon.poops.length && !mon.poopPenalized && mon.poops[0].age >= R.poopLimitMinutes) {
      mon.poopPenalized = true;
      mon.c.hygiene++;
      emit(state, 'mistake', t, { kind: 'poop' });
    }

    if (!mon.sleeping) {
      if (++mon.hungerT >= R.hungerEvery[mon.stage]) { mon.hungerT = 0; if (mon.hunger > 0) mon.hunger--; }
      if (++mon.strengthT >= R.strengthEvery[mon.stage]) { mon.strengthT = 0; if (mon.strength > 0) mon.strength--; }
      if (++mon.poopT >= R.poopEvery[mon.stage]) {
        mon.poopT = 0;
        if (mon.poops.length < R.maxPoops) { mon.poops.push({ age: 0 }); emit(state, 'poop', t); }
        if (mon.poops.length >= R.sickPoops) getSick(state, mon, t, 'poop');
      }
      // 호출: 0칸이 된 채로 20분이 지나면 실수 1. 채워 줄 때까지는 한 번만 센다.
      mon.callH = mon.hunger === 0 ? mon.callH + 1 : 0;
      mon.callS = mon.strength === 0 ? mon.callS + 1 : 0;
      if (mon.callH === 1 || mon.callS === 1) emit(state, 'call', t);
      if (mon.callH === R.callMinutes) { mon.c.mistakes++; emit(state, 'mistake', t, { kind: 'hunger' }); }
      if (mon.callS === R.callMinutes) { mon.c.mistakes++; emit(state, 'mistake', t, { kind: 'strength' }); }
    }

    if (mon.stageEnd && t >= mon.stageEnd) evolveNow(state, mon, t);
  }

  /* ---------- 진화 판정 ----------
   * 결과 { to, kind, rule }
   *   rule: 기획안 번호 (data.js 의 RULE_HINTS)
   *   kind: normal | mid | bad | dark | purify | hidden | jogress | mode | armor
   *         fail (조건 미달, 현 단계 유지) | terminal (더 진화 없음)
   * 라인 표에 적힌 순서대로 보고, 처음 맞는 조건으로 진화한다.
   */
  function passes(rule, c) {
    var wr = winRate(c), bat = c.battles >= 15;
    switch (rule) {
      case 'r1': return c.mistakes <= 3 && c.training >= 16; // 훈련은 16번 이상이면 많을수록 좋다 (상한 없음)
      case 'r21': return c.mistakes <= 3 && c.training >= 48;
      case 'r2': case 'r14': case 'r18': return true;
      case 'r3': return c.mistakes >= 6;
      case 'r4': return c.hygiene >= 4 || c.overfeed >= 6;
      case 'r34': return c.mistakes >= 6 || c.hygiene >= 4 || c.overfeed >= 6;
      case 'r12': return c.sleep >= 4;
      case 'r5': case 'r13': return c.mistakes <= 2 && bat && wr >= 0.5;
      case 'r6': return c.training >= 48 && c.hungryBattles >= 5;
      case 'r7': return c.mistakes <= 2 && bat && wr < 0.5; // 승률이 모자라면 막다른 진화 (잘할수록 정상 루트)
      case 'r8': return c.mistakes === 0 && bat && wr >= 0.4;
      case 'r20': return c.mistakes >= 3 && c.mistakes <= 5 && bat && wr >= 0.5;
      case 'r9': return c.mistakes <= 1 && c.battles >= 10 && wr >= 0.6 && c.bossWins >= 1; // 한두 판만 이기고 끝내지 못하게
      case 'r11': return c.maxStreak >= 5 && c.mistakes >= 3;
      case 'r15': return passes('r9', c) && c.sleep === 0;
    }
    return false;
  }

  function judge(mon) {
    var L = line(mon);
    if (mon.stage === 'egg') return { to: L.baby1, kind: 'hatch' };
    if (mon.stage === 'baby1') return { to: L.baby2, kind: 'normal' };
    if (mon.stage === 'baby2') return { to: L.child, kind: 'normal' };
    var list = evoList(mon);
    if (!list) return { to: null, kind: 'terminal' };
    for (var i = 0; i < list.length; i++) {
      var r = list[i][0];
      if (passes(r, mon.c)) return { to: list[i][1], kind: D.RULE_KIND[r], rule: r };
    }
    // 성숙기는 실패하면 다음 판정이 하루 늦어진다, 완전체는 그대로
    return { to: null, kind: 'fail', delay: mon.stage === 'adult' };
  }

  function evolveNow(state, mon, t) {
    var r = judge(mon);
    if (mon.armor) endArmor(state, mon, t);
    if (r.kind === 'fail') {
      mon.c = freshCounters();
      mon.stageStart = t;
      mon.stageEnd = t + R.stageHours[mon.stage] * HOUR;
      if (r.delay) mon.stageEnd += R.failDelayHours * HOUR;
      emit(state, 'fail', t, { to: mon.species, delay: !!r.delay });
      return;
    }
    if (!r.to) { mon.stageEnd = null; return; }
    evolveTo(state, mon, r.to, r.kind, t);
  }

  function evolveTo(state, mon, to, kind, t) {
    var from = form(mon), S = D.SPECIES[to];
    mon.species = to; mon.stage = S.stage;
    mon.stageStart = t; mon.c = freshCounters();
    mon.armor = null; mon.armorTo = null;
    mon.stageEnd = evoList(mon) || S.stage === 'baby1' || S.stage === 'baby2' || S.stage === 'child'
      ? t + R.stageHours[S.stage] * HOUR : null;
    register(state, to, 'raised', t);
    emit(state, 'evolve', t, { from: from, to: to, kind: kind });
  }

  /* ⑩ ⑲ — 궁극체가 보스를 이긴 뒤에 본다 */
  function special(state, mon) {
    var sp = line(mon).special, s = sp && sp[mon.species];
    if (!s || mon.c.bossWins < R.jogressBossWins) return null;
    if (s.partner && !(state.meta.dex[s.partner] && state.meta.dex[s.partner].raised)) return null;
    return { to: s.to, kind: D.RULE_KIND[s.rule], rule: s.rule };
  }

  /* 잘못된 진화가 하루 안에 올 것 같으면 true — 화면이 디지몬을 어둡게 그린다 */
  var BAD = { bad: 1, dark: 1, fail: 1 };
  function warning(mon, now) {
    if (!mon || mon.dead) return false;
    if (!mon.stageEnd || mon.stageEnd - now > R.previewHours * HOUR) return false;
    return !!BAD[judge(mon).kind];
  }

  /* ---------- 돌보기 ---------- */
  function asleep() { return { ok: false, reason: 'sleep' }; }
  // 채워 주면 호출(!)은 그 자리에서 끝난다 (1분 단위 시간 흐름을 기다리지 않는다)
  function answered(mon) {
    if (mon.hunger > 0) mon.callH = 0;
    if (mon.strength > 0) mon.callS = 0;
  }
  function isEgg(state) { return state.mon.stage === 'egg'; }

  function feed(state) {
    var mon = state.mon;
    if (isEgg(state)) return { ok: false, reason: 'egg' };
    if (mon.sleeping) return asleep();
    if (mon.hunger >= 4) { mon.c.overfeed++; return { ok: true, over: true }; }
    mon.hunger++;
    answered(mon);
    return { ok: true };
  }

  function snack(state) {
    var mon = state.mon;
    if (isEgg(state)) return { ok: false, reason: 'egg' };
    if (mon.sleeping) return asleep();
    var over = mon.hunger >= 4;
    if (over) mon.c.overfeed++;
    if (mon.strength < 4) mon.strength++;
    answered(mon);
    return { ok: true, over: over };
  }

  // 훈련 미니게임 한 판 = 훈련 1회. 세 번 중 두 번 맞히면 힘이 오른다.
  function train(state, hits) {
    var mon = state.mon;
    if (isEgg(state)) return { ok: false, reason: 'egg' };
    if (mon.sleeping) return asleep();
    if (mon.sick) return { ok: false, reason: 'sick' };
    mon.c.training++;
    var good = hits >= 2, lv = trainLevel(mon);
    if (good && mon.strength < 4) mon.strength++;
    if (good) mon.trainOk = (mon.trainOk || 0) + 1;
    answered(mon);
    return { ok: true, good: good, level: trainLevel(mon), levelUp: trainLevel(mon) > lv };
  }

  function clean(state) {
    var n = state.mon.poops.length;
    state.mon.poops = [];
    state.mon.poopPenalized = false;
    return { ok: true, n: n };
  }

  function toggleLights(state) {
    state.mon.lights = !state.mon.lights;
    return { ok: true, lights: state.mon.lights };
  }

  // 자는 걸 깨우면 수면 방해 1
  function wake(state, now) {
    var mon = state.mon;
    if (!mon.sleeping) return { ok: false, reason: 'awake' };
    mon.c.sleep++;
    mon.sleeping = false; mon.woken = R.wakeMinutes; mon.lights = true;
    emit(state, 'mistake', now, { kind: 'wake' });
    return { ok: true };
  }

  /* 아머진화 — 성장기 브이몬 + 디지멘탈, 하루 1회, 48시간. 디지멘탈은 닳지 않는다. */
  function armorKinds(state, now) {
    var mon = state.mon, A = mon && !mon.dead && line(mon).armor;
    if (!A || mon.stage !== 'child' || mon.armor || mon.sleeping || mon.armorDay === dateKey(now)) return [];
    return D.DIGIMENTALS.filter(function (k) { return state.meta.items[k] && A[k]; });
  }
  function canArmor(state, now) { return armorKinds(state, now).length > 0; }
  function armor(state, now, kind) {
    if (armorKinds(state, now).indexOf(kind) < 0) return { ok: false };
    var mon = state.mon, to = line(mon).armor[kind];
    mon.armor = now + R.armorHours * HOUR;
    mon.armorTo = to;
    mon.armorDay = dateKey(now);
    register(state, to, 'raised', now);
    emit(state, 'evolve', now, { from: mon.species, to: to, kind: 'armor', item: kind });
    return { ok: true, to: to };
  }
  function endArmor(state, mon, t) {
    mon.armor = null; mon.armorTo = null;
    emit(state, 'armorEnd', t, { to: mon.species });
  }

  // 디지 칩: 배고픔과 힘을 가득 채운다. 과식으로 치지 않는다.
  function useChip(state) {
    var mon = state.mon, it = state.meta.items;
    if (!it.chip || mon.sleeping || isEgg(state)) return { ok: false };
    it.chip--;
    mon.hunger = 4; mon.strength = 4;
    answered(mon);
    return { ok: true };
  }

  /* ---------- 야생 디지몬 ---------- */
  // 배틀에서 쓰는 단계 번호. 아머체는 그 아머체의 단계로 친다.
  function battleStage(mon) { return STAGE_IDX[D.SPECIES[form(mon)].stage]; }

  function pickOdds(odds, x) {
    var keys = Object.keys(odds), acc = 0;
    for (var i = 0; i < keys.length; i++) { acc += odds[keys[i]]; if (x < acc) return keys[i]; }
    return keys[0]; // 남는 확률은 첫 항목 (궁극체 일반 69.5%)
  }
  function pick(list, x) { return list[Math.floor(x * list.length)]; }

  /* 단계 → 등급 → (속성) → 디지몬 */
  // 내 단계(배틀 단계 번호)에 맞는 확률로 야생 디지몬의 단계를 고른다
  function wildStage(myStage, x) {
    var my = D.STAGES[Math.max(STAGE_IDX.child, Math.min(STAGE_IDX.ultimate, myStage))];
    return pickOdds(R.stageOdds[my], x);
  }
  function wildFor(myStage, rnd) {
    rnd = rnd || Math.random;
    return wildAt(wildStage(myStage, rnd()), rnd);
  }
  // 그 단계 안에서: 등급 → (속성) → 디지몬
  function wildAt(st, rnd) {
    var level = STAGE_IDX[st];
    var grade = pickOdds(R.gradeOdds[st], rnd());
    var id;
    if (grade === 'boss') id = pick(D.BOSSES[st], rnd());
    else if (grade === 'legend') id = pick(D.LEGENDS, rnd());
    else {
      var pool = D.WILD[st], attr = pickOdds(R.attrOdds, rnd());
      if (!pool[attr]) attr = pick(Object.keys(pool), rnd()); // 그 단계엔 그 속성이 없다
      id = pick(pool[attr], rnd());
    }
    var S = D.SPECIES[id];
    return { id: id, name: S.name, attr: S.attr, grade: grade, level: level };
  }

  // 바코드 숫자로 씨앗을 만들어 뽑으니, 같은 바코드는 언제 찍어도 같은 디지몬이 나온다
  // 같은 상품이라도 UPC-A(12자리)와 EAN-13(앞에 0)으로 다르게 읽힐 수 있어서 숫자만 남기고 앞의 0은 뗀다
  function codeKey(code) {
    var k = String(code || '').replace(/\s+/g, '');
    if (/^[\d-]+$/.test(k)) k = k.replace(/-/g, '').replace(/^0+(?=\d)/, '');
    return k;
  }
  function seeded(text) {
    var h = 2166136261; // FNV-1a
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    var a = h >>> 0;
    return function () { // mulberry32
      a = (a + 0x6D2B79F5) | 0;
      var x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  // 바코드 하나에 단계별 디지몬이 하나씩 정해져 있다 (바코드 + 단계로 씨앗을 만든다).
  // 어느 단계가 나올지는 바코드의 고정된 값 하나를 내 단계의 확률표에 대어 정한다.
  function wildForCode(code, myStage) {
    var k = codeKey(code), st = wildStage(myStage, seeded(k)());
    return wildAt(st, seeded(k + '#' + st));
  }

  /* ---------- 배틀 ---------- */
  function canBattle(state) {
    var mon = state.mon;
    if (!mon || mon.dead) return { ok: false, reason: 'none' };
    if (STAGE_IDX[mon.stage] < STAGE_IDX.child) return { ok: false, reason: 'baby' };
    if (mon.sleeping) return { ok: false, reason: 'sleep' };
    if (mon.sick) return { ok: false, reason: 'sick' };
    return { ok: true };
  }

  // 스캔 횟수는 디지몬마다 따로 센다 (날짜가 바뀌면 다시 5번)
  function rollDaily(mon, now) {
    var k = dateKey(now);
    if (!mon.daily || mon.daily.date !== k) mon.daily = { date: k, scans: 0 };
    return mon.daily;
  }

  // 바코드는 얼마든지 찍어 볼 수 있다. 바코드마다 나오는 디지몬이 정해져 있다.
  function scan(state, code, now) {
    var can = canBattle(state);
    if (!can.ok) return can;
    if (!codeKey(code)) return { ok: false, reason: 'empty' };
    var w = wildForCode(code, battleStage(state.mon));
    register(state, w.id, 'seen', now);
    return { ok: true, wild: w, left: scansLeft(state, now) };
  }
  // 배틀은 디지몬마다 하루 5번. 실제로 배틀에 들어갈 때만 한 번 쓴다.
  function takeBattle(state, now) {
    if (scansLeft(state, now) <= 0) return { ok: false, reason: 'limit' };
    rollDaily(state.mon, now).scans++;
    return { ok: true, left: scansLeft(state, now) };
  }
  function scansLeft(state, now) {
    if (!R.scansPerDay) return Infinity;
    if (!state.mon) return R.scansPerDay;
    return R.scansPerDay - rollDaily(state.mon, now).scans;
  }

  // 백신 → 바이러스 → 데이터 → 백신. 프리는 상성 없음.
  var BEATS = { vaccine: 'virus', virus: 'data', data: 'vaccine' };
  function advantage(a, b) {
    if (BEATS[a] === b) return 1.3;
    if (BEATS[b] === a) return 1 / 1.3;
    return 1;
  }

  // 훈련 레벨 (0..10): 성공한 훈련 수로 정해진다. 진화해도 그대로.
  function trainLevel(mon) {
    return Math.min(R.trainLvMax, Math.floor((mon.trainOk || 0) / R.trainLvEvery));
  }
  function myPower(mon) {
    var S = D.SPECIES[form(mon)];
    var base = R.stagePower[D.STAGES[battleStage(mon)]] * S.mult;
    return base * (0.85 + 0.05 * mon.strength) * (mon.hunger === 0 ? 0.8 : 1) * (1 + R.trainLvPower * trainLevel(mon));
  }
  function wildPower(w) {
    return R.stagePower[D.STAGES[w.level]] * R.gradePower[w.grade];
  }

  function startBattle(state, wild) {
    var mon = state.mon, me = D.SPECIES[form(mon)];
    var pPow = myPower(mon), ePow = wildPower(wild);
    if ((wild.grade === 'boss' || wild.grade === 'legend') && me.bossMult) pPow *= me.bossMult;
    return {
      wild: wild, me: me.id,
      php: R.hpMax, ehp: R.hpMax, turn: 0, over: false, won: false,
      hungry: mon.hunger === 0,
      pPow: pPow, ePow: ePow,
      pAdv: advantage(me.attr, wild.attr), eAdv: advantage(wild.attr, me.attr),
      pGauge: 0, eGauge: 0,
      ignores: !!me.ignores
    };
  }

  /* 한 턴: cmd = 'attack' | 'special' | 'guard'. rnd 를 넘기면 결과가 정해진다(시험용).
   * 둘이 동시에 고르고, 가위바위보처럼 공격 > 필살기 > 방어 > 공격.
   * 필살기는 게이지가 가득 차야 쓸 수 있다 (못 쓰면 공격으로 바뀐다). */
  var CMDS = ['attack', 'special', 'guard'];
  function canSpecial(b) { return b.pGauge >= R.gaugeMax; }
  // 상대는 반쯤은 내 습관을 읽고 그걸 가장 잘 받아치는 수를 낸다. 습관은 상황별로 따로 기억한다
  // (누구 게이지가 찼는지). 같은 상황에서 같은 것만 누르면 읽힌다.
  function situation(b) { return (b.eGauge >= R.gaugeMax ? 'E' : '-') + (canSpecial(b) ? 'P' : '-'); }
  function foeCommand(b, rnd) {
    var full = b.eGauge >= R.gaugeMax, base = full ? R.foeFull : R.foeCharging;
    if (rnd() >= R.foeRead) return pickOdds(base, rnd());
    var w0 = R.foePrior, q = { attack: w0, guard: w0, special: canSpecial(b) ? w0 : 0 }, n = q.attack + q.guard + q.special; // 아직 모를 때의 짐작
    ((b.hist || {})[situation(b)] || []).forEach(function (c) { q[c]++; n++; });
    var best = null, bestV = -1e9;
    Object.keys(base).forEach(function (o) {
      var v = 0;
      CMDS.forEach(function (p) { v += q[p] / n * (R.hitMult[o][p] - R.hitMult[p][o]); });
      if (v > bestV) { bestV = v; best = o; }
    });
    return best;
  }
  function battleTurn(b, cmd, rnd) {
    rnd = rnd || Math.random;
    if (b.over) return null;
    var out = { ignored: false };
    if (b.ignores && rnd() < R.ignoreChance) {
      out.ignored = true;
      cmd = CMDS[Math.floor(rnd() * 3)];
    }
    if (cmd === 'special' && !canSpecial(b)) cmd = 'attack';
    var eCmd = foeCommand(b, rnd), sit = situation(b);
    b.hist = b.hist || {};
    b.hist[sit] = (b.hist[sit] || []).concat(cmd).slice(-3);
    out.pCmd = cmd; out.eCmd = eCmd;
    out.pDmg = hit(cmd, eCmd, b.pPow, b.ePow, b.pAdv, rnd);
    out.eDmg = hit(eCmd, cmd, b.ePow, b.pPow, b.eAdv, rnd);
    // 무슨 일이 있었나 (화면 글귀용): 반격 · 가드 브레이크 · 끊기
    out.pEvent = event(cmd, eCmd); out.eEvent = event(eCmd, cmd);
    b.pGauge = gauge(b.pGauge, cmd, eCmd);
    b.eGauge = gauge(b.eGauge, eCmd, cmd);
    b.ehp = Math.max(0, b.ehp - out.pDmg);
    b.php = Math.max(0, b.php - out.eDmg);
    b.turn++;
    if (b.ehp === 0) { b.over = true; b.won = true; }
    else if (b.php === 0) { b.over = true; b.won = false; }
    else if (b.turn >= 20) { b.over = true; b.won = b.php >= b.ehp; }
    return out;
  }
  function hit(cmd, otherCmd, atk, def, adv, rnd) {
    var m = R.hitMult[cmd][otherCmd];
    if (!m) return 0;
    var dmg = 14 * Math.pow(atk / def, 0.8) * adv * m * (0.85 + rnd() * 0.3);
    return Math.max(1, Math.round(dmg));
  }
  function event(cmd, otherCmd) {
    if (cmd === 'guard' && otherCmd === 'attack') return 'counter';
    if (cmd === 'special' && otherCmd === 'guard') return 'break';
    if (cmd === 'attack' && otherCmd === 'special') return 'cut';
    return null;
  }
  function gauge(g, cmd, otherCmd) {
    if (cmd === 'special') return 0;
    return Math.min(R.gaugeMax, g + (cmd === 'guard' && otherCmd === 'attack' ? 2 : 1));
  }

  /* 보스 보상: 완전체 보스 → 아직 없는 디지멘탈(용기·우정·사랑) 중 하나,
   * 궁극체 보스·전설 → 기적의 디지멘탈. 이미 다 있으면 디지 칩. */
  function bossReward(state, w, rnd) {
    var it = state.meta.items;
    if (D.STAGES[w.level] === 'perfect') {
      var missing = ['flame', 'thunder', 'archer'].filter(function (k) { return !it[k]; });
      if (missing.length) { var k = pick(missing, rnd()); it[k] = true; return k; }
    } else if (!it.miracle) { it.miracle = true; return 'miracle'; }
    it.chip++;
    return 'chip';
  }

  /* ---------- 병 ----------
   * 똥이 4개 쌓이거나 배틀에서 지다 다치면 아프다. 아프면 훈련·배틀을 못 하고,
   * 한 시간 안에 약을 안 주면 케어 실수 1 (병 하나에 한 번만). 약 한 번이면 낫는다. */
  function getSick(state, mon, t, why) {
    if (mon.sick || mon.stage === 'egg') return false;
    mon.sick = true; mon.sickMin = 0;
    emit(state, 'sick', t, { why: why });
    return true;
  }
  function medicine(state) {
    var mon = state.mon;
    if (!mon.sick) return { ok: false, reason: 'healthy' };
    if (mon.sleeping) return asleep();
    mon.sick = false; mon.sickMin = 0;
    return { ok: true };
  }

  /* 배틀 결과를 진화 수치·도감·아이템에 반영한다 */
  function endBattle(state, b, now, rnd) {
    rnd = rnd || Math.random;
    var mon = state.mon, c = mon.c, reward = null, injured = false;
    c.battles++;
    if (b.hungry) c.hungryBattles++;
    if (b.won) {
      c.wins++; c.streak = 0;
      register(state, b.wild.id, 'beaten', now);
      if (b.wild.grade === 'boss' || b.wild.grade === 'legend') {
        c.bossWins++;
        reward = bossReward(state, b.wild, rnd);
      }
    } else {
      c.losses++; c.streak++;
      if (c.streak > c.maxStreak) c.maxStreak = c.streak;
      if (rnd() < R.injuryChance) injured = getSick(state, mon, now, 'injury');
    }
    if (mon.hunger > 0) mon.hunger--; // 배틀하면 배가 고파진다
    var sp = special(state, mon);
    if (sp) evolveTo(state, mon, sp.to, sp.kind, now);
    return { won: b.won, reward: reward, injured: injured };
  }

  return {
    MIN: MIN, HOUR: HOUR, STAGE_IDX: STAGE_IDX,
    newState: newState, hatch: hatch, store: store, resume: resume, release: release,
    slotsLeft: slotsLeft, tick: tick, sleepNow: sleepNow,
    judge: judge, passes: passes, warning: warning, form: form, winRate: winRate, dateKey: dateKey,
    feed: feed, snack: snack, train: train, clean: clean, toggleLights: toggleLights, wake: wake,
    armorKinds: armorKinds, canArmor: canArmor, armor: armor, useChip: useChip, medicine: medicine,
    wildFor: wildFor, wildForCode: wildForCode, trainLevel: trainLevel, canSpecial: canSpecial, battleStage: battleStage, advantage: advantage,
    canBattle: canBattle, scan: scan, scansLeft: scansLeft, takeBattle: takeBattle,
    startBattle: startBattle, battleTurn: battleTurn, endBattle: endBattle,
    myPower: myPower, wildPower: wildPower
  };
})(typeof DigiData !== 'undefined' ? DigiData : require('./data.js'));

if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
