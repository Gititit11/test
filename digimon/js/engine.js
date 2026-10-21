/* 디지몬 육성 — 게임 규칙
 *
 * 화면(DOM)에 손대지 않는 순수 로직이라 node 에서 그대로 시험한다 (test/engine.test.js).
 *
 *   newState()                  → 빈 저장 상태
 *   hatch(state, line, now)     → 디지타마를 받는다. 5분 동안 흔들리다가 부화 (키우던 디지몬은 보관함으로)
 *   store / resume / release    → 보관함. 보관한 디지몬은 시간이 멈춘다
 *   tick(state, now)            → 마지막으로 본 때부터 now 까지 1분씩 흘려 보낸다
 *   feed / snack / train / clean / toggleLights / wake / armor / useChip
 *   judge(mon)                  → 지금 진화하면 어떻게 되는지 (상태를 바꾸지 않음)
 *   wildFor(stageIdx, rnd)      → 야생 디지몬 하나 (스캔할 때마다 새로 뽑는다)
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
      daily: { date: '', scans: 0 },
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
      deathAt: t + R.lifespanHours * HOUR,
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
    if (mon.dead) return false; // 보관하기 전에 수명이 다했다
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
    ['born', 'stageStart', 'stageEnd', 'deathAt', 'armor', 'lastTick'].forEach(function (k) {
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
    if (t >= mon.deathAt) { die(state, mon, t); return; }

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

    // 배변은 자는 동안에도 방치 시간이 흐른다
    mon.poops.forEach(function (p) {
      if (++p.age === R.poopLimitMinutes) {
        mon.c.hygiene++;
        emit(state, 'mistake', t, { kind: 'poop' });
      }
    });

    if (!mon.sleeping) {
      if (++mon.hungerT >= R.hungerEvery[mon.stage]) { mon.hungerT = 0; if (mon.hunger > 0) mon.hunger--; }
      if (++mon.strengthT >= R.strengthEvery[mon.stage]) { mon.strengthT = 0; if (mon.strength > 0) mon.strength--; }
      if (++mon.poopT >= R.poopEvery[mon.stage]) {
        mon.poopT = 0;
        if (mon.poops.length < R.maxPoops) { mon.poops.push({ age: 0 }); emit(state, 'poop', t); }
      }
      // 호출: 0칸이 된 채로 15분이 지나면 실수 1. 채워 줄 때까지는 한 번만 센다.
      mon.callH = mon.hunger === 0 ? mon.callH + 1 : 0;
      mon.callS = mon.strength === 0 ? mon.callS + 1 : 0;
      if (mon.callH === 1 || mon.callS === 1) emit(state, 'call', t);
      if (mon.callH === R.callMinutes) { mon.c.mistakes++; emit(state, 'mistake', t, { kind: 'hunger' }); }
      if (mon.callS === R.callMinutes) { mon.c.mistakes++; emit(state, 'mistake', t, { kind: 'strength' }); }
    }

    if (mon.stageEnd && t >= mon.stageEnd) evolveNow(state, mon, t);
  }

  function die(state, mon, t) {
    mon.dead = true; mon.armor = null;
    remember(state, mon, t, 'died');
    emit(state, 'death', t, { to: mon.species });
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
      case 'r1': return c.mistakes <= 3 && c.training >= 16 && c.training <= 47; // 훈련도 너무 많으면 안 된다
      case 'r21': return c.mistakes <= 3 && c.training >= 48;
      case 'r2': case 'r14': case 'r18': return true;
      case 'r3': return c.mistakes >= 6;
      case 'r4': return c.hygiene >= 4 || c.overfeed >= 6;
      case 'r34': return c.mistakes >= 6 || c.hygiene >= 4 || c.overfeed >= 6;
      case 'r12': return c.sleep >= 4;
      case 'r5': case 'r13': return c.mistakes <= 2 && bat && wr >= 0.6;
      case 'r6': return c.training >= 48 && c.hungryBattles >= 5;
      case 'r7': return c.mistakes <= 2 && bat && wr >= 0.8;
      case 'r8': return c.mistakes === 0 && bat && wr >= 0.4;
      case 'r20': return c.mistakes >= 3 && c.mistakes <= 5 && bat && wr >= 0.6;
      case 'r9': return c.mistakes <= 1 && c.battles > 0 && wr >= 0.7 && c.bossWins >= 1;
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
    // 성숙기는 실패하면 수명이 하루 준다, 완전체는 그대로
    return { to: null, kind: 'fail', cut: mon.stage === 'adult' };
  }

  function evolveNow(state, mon, t) {
    var r = judge(mon);
    if (mon.armor) endArmor(state, mon, t);
    if (r.kind === 'fail') {
      mon.c = freshCounters();
      mon.stageStart = t;
      mon.stageEnd = t + R.stageHours[mon.stage] * HOUR;
      if (r.cut) mon.deathAt -= R.failLifespanCutHours * HOUR;
      emit(state, 'fail', t, { to: mon.species, cut: !!r.cut });
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
  function isEgg(state) { return state.mon.stage === 'egg'; }

  function feed(state) {
    var mon = state.mon;
    if (isEgg(state)) return { ok: false, reason: 'egg' };
    if (mon.sleeping) return asleep();
    if (mon.hunger >= 4) { mon.c.overfeed++; return { ok: true, over: true }; }
    mon.hunger++;
    return { ok: true };
  }

  function snack(state) {
    var mon = state.mon;
    if (isEgg(state)) return { ok: false, reason: 'egg' };
    if (mon.sleeping) return asleep();
    var over = mon.hunger >= 4;
    if (over) mon.c.overfeed++;
    if (mon.strength < 4) mon.strength++;
    return { ok: true, over: over };
  }

  // 훈련 미니게임 한 판 = 훈련 1회. 세 번 중 두 번 맞히면 힘이 오른다.
  function train(state, hits) {
    var mon = state.mon;
    if (isEgg(state)) return { ok: false, reason: 'egg' };
    if (mon.sleeping) return asleep();
    mon.c.training++;
    var good = hits >= 2;
    if (good && mon.strength < 4) mon.strength++;
    return { ok: true, good: good };
  }

  function clean(state) {
    var n = state.mon.poops.length;
    state.mon.poops = [];
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
    return { ok: true };
  }

  /* ---------- 야생 디지몬 ---------- */
  // 배틀에서 쓰는 단계 번호. 아머체는 그 아머체의 단계로 친다.
  function battleStage(mon) { return STAGE_IDX[D.SPECIES[form(mon)].stage]; }

  function pickOdds(odds, x) {
    var keys = Object.keys(odds), acc = 0;
    for (var i = 0; i < keys.length; i++) { acc += odds[keys[i]]; if (x < acc) return keys[i]; }
    return keys[0]; // 남는 확률은 첫 항목 (궁극체 일반 73.7%)
  }
  function pick(list, x) { return list[Math.floor(x * list.length)]; }

  /* 단계 → 등급 → (속성) → 디지몬. 스캔할 때마다 새로 뽑는다. */
  function wildFor(myStage, rnd) {
    rnd = rnd || Math.random;
    var lo = Math.max(myStage, STAGE_IDX.child), top = STAGE_IDX.ultimate;
    var level = lo >= top ? top : rnd() < R.upChance ? lo + 1 : lo;
    var st = D.STAGES[level];
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

  /* ---------- 배틀 ---------- */
  function canBattle(state) {
    var mon = state.mon;
    if (!mon || mon.dead) return { ok: false, reason: 'none' };
    if (STAGE_IDX[mon.stage] < STAGE_IDX.child) return { ok: false, reason: 'baby' };
    if (mon.sleeping) return { ok: false, reason: 'sleep' };
    return { ok: true };
  }

  function rollDaily(state, now) {
    var k = dateKey(now);
    if (state.daily.date !== k) state.daily = { date: k, scans: 0 };
  }

  // 하루 5회 (모든 디지몬이 함께 쓴다). 바코드는 스캔 신호일 뿐, 무엇이 나올지는 매번 다르다.
  function scan(state, code, now, rnd) {
    var can = canBattle(state);
    if (!can.ok) return can;
    if (!String(code || '').replace(/\s+/g, '')) return { ok: false, reason: 'empty' };
    rollDaily(state, now);
    if (state.daily.scans >= R.scansPerDay) return { ok: false, reason: 'limit' };
    state.daily.scans++;
    var w = wildFor(battleStage(state.mon), rnd);
    register(state, w.id, 'seen', now);
    return { ok: true, wild: w, left: R.scansPerDay - state.daily.scans };
  }
  function scansLeft(state, now) {
    rollDaily(state, now);
    return R.scansPerDay - state.daily.scans;
  }

  // 백신 → 바이러스 → 데이터 → 백신. 프리는 상성 없음.
  var BEATS = { vaccine: 'virus', virus: 'data', data: 'vaccine' };
  function advantage(a, b) {
    if (BEATS[a] === b) return 1.3;
    if (BEATS[b] === a) return 1 / 1.3;
    return 1;
  }

  function myPower(mon) {
    var S = D.SPECIES[form(mon)];
    var base = R.stagePower[D.STAGES[battleStage(mon)]] * S.mult;
    return base * (0.85 + 0.05 * mon.strength) * (mon.hunger === 0 ? 0.8 : 1);
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
      ignores: !!me.ignores
    };
  }

  /* 한 턴: cmd = 'attack' | 'special' | 'guard'. rnd 를 넘기면 결과가 정해진다(시험용). */
  var CMDS = ['attack', 'special', 'guard'];
  function battleTurn(b, cmd, rnd) {
    rnd = rnd || Math.random;
    if (b.over) return null;
    var out = { ignored: false };
    if (b.ignores && rnd() < R.ignoreChance) {
      out.ignored = true;
      cmd = CMDS[Math.floor(rnd() * 3)];
    }
    var e = rnd(), eCmd = e < 0.6 ? 'attack' : e < 0.85 ? 'special' : 'guard';
    out.pCmd = cmd; out.eCmd = eCmd;
    out.pDmg = hit(cmd, eCmd, b.pPow, b.ePow, b.pAdv, rnd);
    out.eDmg = hit(eCmd, cmd, b.ePow, b.pPow, b.eAdv, rnd);
    b.ehp = Math.max(0, b.ehp - out.pDmg);
    b.php = Math.max(0, b.php - out.eDmg);
    b.turn++;
    if (b.ehp === 0) { b.over = true; b.won = true; }
    else if (b.php === 0) { b.over = true; b.won = false; }
    else if (b.turn >= 20) { b.over = true; b.won = b.php >= b.ehp; }
    return out;
  }
  function hit(cmd, otherCmd, atk, def, adv, rnd) {
    if (cmd === 'guard') return 0;
    var chance = cmd === 'special' ? 0.55 : 0.9;
    if (rnd() >= chance) return 0;
    var dmg = 14 * Math.pow(atk / def, 0.8) * adv * (0.85 + rnd() * 0.3);
    if (cmd === 'special') dmg *= 2;
    if (otherCmd === 'guard') dmg *= 0.4;
    return Math.max(1, Math.round(dmg));
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

  /* 배틀 결과를 진화 수치·도감·아이템에 반영한다 */
  function endBattle(state, b, now, rnd) {
    rnd = rnd || Math.random;
    var mon = state.mon, c = mon.c, reward = null;
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
    }
    if (mon.hunger > 0) mon.hunger--; // 배틀하면 배가 고파진다
    var sp = special(state, mon);
    if (sp) evolveTo(state, mon, sp.to, sp.kind, now);
    return { won: b.won, reward: reward };
  }

  return {
    MIN: MIN, HOUR: HOUR, STAGE_IDX: STAGE_IDX,
    newState: newState, hatch: hatch, store: store, resume: resume, release: release,
    slotsLeft: slotsLeft, tick: tick, sleepNow: sleepNow,
    judge: judge, passes: passes, warning: warning, form: form, winRate: winRate, dateKey: dateKey,
    feed: feed, snack: snack, train: train, clean: clean, toggleLights: toggleLights, wake: wake,
    armorKinds: armorKinds, canArmor: canArmor, armor: armor, useChip: useChip,
    wildFor: wildFor, battleStage: battleStage, advantage: advantage,
    canBattle: canBattle, scan: scan, scansLeft: scansLeft,
    startBattle: startBattle, battleTurn: battleTurn, endBattle: endBattle,
    myPower: myPower, wildPower: wildPower
  };
})(typeof DigiData !== 'undefined' ? DigiData : require('./data.js'));

if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
