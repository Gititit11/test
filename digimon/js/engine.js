/* 디지몬 육성 — 게임 규칙
 *
 * 화면(DOM)에 손대지 않는 순수 로직이라 node 에서 그대로 시험한다 (test/engine.test.js).
 *
 *   newState()                  → 빈 저장 상태
 *   hatch(state, line, now)     → 디지타마를 골라 부화
 *   tick(state, now)            → 마지막으로 본 때부터 now 까지 1분씩 흘려 보낸다
 *   feed / snack / train / clean / toggleLights / wake / armor / useChip
 *   judge(mon)                  → 지금 진화하면 어떻게 되는지 (상태를 바꾸지 않음)
 *   wildFor(code, stageIdx)     → 바코드 → 야생 디지몬 (같은 바코드면 늘 같다)
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
      v: 1,
      // 세대를 넘어 남는 것: 도감, 아이템, 지난 디지몬
      meta: { dex: {}, items: { digimental: 0, chip: 0 }, bossEver: false, history: [] },
      mon: null,
      daily: { date: '', scans: 0, codes: [] },
      events: []
    };
  }

  function emit(state, type, t, extra) {
    var e = { type: type, t: t };
    for (var k in extra || {}) e[k] = extra[k];
    state.events.push(e);
    if (state.events.length > 60) state.events.splice(0, state.events.length - 60);
  }

  function register(state, id, how) {
    var e = state.meta.dex[id] || (state.meta.dex[id] = {});
    e[how] = true;
  }

  function line(mon) { return D.LINES[mon.line]; }
  function form(mon) { return mon.armor ? line(mon).armor : mon.species; }
  function stageHours(mon) {
    if (mon.stage === 'child' && mon.line === 'patamon') return R.patamonChildHours;
    return R.stageHours[mon.stage];
  }
  function winRate(c) { return c.battles ? c.wins / c.battles : 0; }

  /* ---------- 부화 ---------- */
  function hatch(state, lineId, now) {
    var L = D.LINES[lineId], t = floorMin(now);
    state.mon = {
      line: lineId, species: L.baby1, stage: 'baby1',
      born: t, stageStart: t, stageEnd: t + R.stageHours.baby1 * HOUR,
      deathAt: t + R.lifespanHours * HOUR,
      extensions: 0,
      hunger: 2, strength: 2, poops: [],
      lights: true, sleeping: false, woken: 0, lightMin: 0, sleepPenalized: false,
      callH: 0, callS: 0, hungerT: 0, strengthT: 0, poopT: 0,
      c: freshCounters(),
      armor: null, armorDay: '', rescueUntil: null,
      dead: false, lastTick: t
    };
    register(state, L.baby1, 'raised');
    emit(state, 'hatch', t, { to: L.baby1 });
    return state.mon;
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

    if (mon.armor && t >= mon.armor) {
      mon.armor = null;
      emit(state, 'armorEnd', t, { to: mon.species });
    }

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

    if (mon.rescueUntil && t >= mon.rescueUntil) rescue(state, mon, t);
    if (mon.stageEnd && t >= mon.stageEnd) evolveNow(state, mon, t);
  }

  function die(state, mon, t) {
    mon.dead = true; mon.armor = null;
    state.meta.history.unshift({ line: mon.line, species: mon.species, born: mon.born, died: t });
    if (state.meta.history.length > 30) state.meta.history.length = 30;
    emit(state, 'death', t, { to: mon.species });
  }

  /* ---------- 진화 판정 ----------
   * 결과 { to, kind }
   *   kind: normal | mid | dark | purify | hidden | numemon | sukamon | rescue
   *         extend (파닥몬 성장기 연장) | fail (현 단계 유지) | terminal (더 진화 없음)
   * 겹치면 스카몬 > 누메몬 > 다크·폭주 > 정상 순서.
   */
  function judge(mon) {
    var L = line(mon);
    switch (mon.stage) {
      case 'baby1': return { to: L.baby2, kind: 'normal' };
      case 'baby2': return { to: L.child, kind: 'normal' };
      case 'child': return judgeChild(mon, L);
      case 'adult': return judgeAdult(mon, L);
      case 'perfect': return judgePerfect(mon, L);
      default: return { to: null, kind: 'terminal' };
    }
  }

  function judgeChild(mon, L) {
    var c = mon.c;
    if (c.hygiene >= 4 || c.overfeed >= 6) return { to: 'sukamon', kind: 'sukamon' };
    if (c.mistakes >= 6) return { to: 'numemon', kind: 'numemon' };
    if (L.dark && c.sleep >= 4) return { to: L.dark, kind: 'dark' };
    if (mon.line === 'patamon') {
      // 대기만성: 훈련이 모자라면 성장기를 하루씩, 두 번까지 늘린다
      if (c.training < R.patamonTraining) {
        return mon.extensions < R.patamonMaxExtend ? { to: null, kind: 'extend' } : { to: 'numemon', kind: 'numemon' };
      }
      return c.mistakes <= 3 ? { to: L.adult, kind: 'normal' } : { to: L.mid, kind: 'mid' };
    }
    // 훈련 상한 47 — 많이 할수록 좋은 게 아니다
    if (c.mistakes <= 3 && c.training >= 16 && c.training <= 47) return { to: L.adult, kind: 'normal' };
    return { to: L.mid, kind: 'mid' };
  }

  function judgeAdult(mon, L) {
    var c = mon.c, s = mon.species;
    var normalOk = c.mistakes <= 2 && c.battles >= 15 && winRate(c) >= 0.6;
    var fail = { to: null, kind: 'fail', cut: true };
    if (s === 'numemon') {
      return c.mistakes === 0 && c.battles >= 15 && winRate(c) >= 0.4 ? { to: 'monzaemon', kind: 'hidden' } : fail;
    }
    if (s === 'greymon' && c.training >= 48 && c.hungryBattles >= 5) return { to: 'skullgreymon', kind: 'dark' };
    if (s === 'angemon') {
      if (c.mistakes >= 4) return { to: 'devimon', kind: 'dark' };
      return c.mistakes <= 1 && c.battles >= 10 ? { to: L.perfect, kind: 'normal' } : fail;
    }
    if (L.dark && s === L.dark) return normalOk ? { to: L.perfect, kind: 'purify' } : fail;
    if (s === L.adult) return normalOk ? { to: L.perfect, kind: 'normal' } : fail;
    return { to: null, kind: 'terminal' };
  }

  function judgePerfect(mon, L) {
    var c = mon.c, s = mon.species;
    if (s === 'megalogrowlmon' && c.maxStreak >= 5 && c.mistakes >= 3) return { to: 'megidramon', kind: 'dark' };
    if (s === L.perfect) {
      var ok = c.mistakes <= 1 && c.battles > 0 && winRate(c) >= 0.7 && c.bossWins >= 1;
      return ok ? { to: L.ultimate, kind: 'normal' } : { to: null, kind: 'fail', cut: false };
    }
    return { to: null, kind: 'terminal' };
  }

  function evolveNow(state, mon, t) {
    var r = judge(mon);
    if (mon.armor) { mon.armor = null; emit(state, 'armorEnd', t, { to: mon.species }); }
    if (r.kind === 'extend') {
      mon.extensions++;
      mon.stageEnd = t + R.patamonExtendHours * HOUR; // 수치는 그대로 이어서 쌓는다
      emit(state, 'extend', t, { to: mon.species, n: mon.extensions });
      return;
    }
    if (r.kind === 'fail') {
      mon.c = freshCounters();
      mon.stageStart = t;
      mon.stageEnd = t + stageHours(mon) * HOUR;
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
    mon.stageStart = t; mon.c = freshCounters(); mon.extensions = 0;
    mon.armor = null; mon.rescueUntil = null;
    mon.stageEnd = (S.terminal || S.stage === 'ultimate') ? null : t + stageHours(mon) * HOUR;
    if (kind === 'sukamon') mon.rescueUntil = t + R.rescueHours * HOUR;
    register(state, to, 'raised');
    emit(state, 'evolve', t, { from: from, to: to, kind: kind });
  }

  // 스카몬이 된 뒤 하루 동안 위생 실수·과식 0 이면 정상 성숙기로 한 번 더 기회를 준다
  function rescue(state, mon, t) {
    mon.rescueUntil = null;
    if (mon.c.hygiene === 0 && mon.c.overfeed === 0) evolveTo(state, mon, line(mon).adult, 'rescue', t);
    else emit(state, 'rescueFail', t, { to: mon.species });
  }

  /* 잘못된 진화가 하루 안에 올 것 같으면 true — 화면이 디지몬을 어둡게 그린다 */
  var BAD = { sukamon: 1, numemon: 1, dark: 1, fail: 1, extend: 1 };
  function warning(mon, now) {
    if (!mon || mon.dead) return false;
    if (mon.rescueUntil) return mon.c.hygiene > 0 || mon.c.overfeed > 0;
    if (!mon.stageEnd || mon.stageEnd - now > R.previewHours * HOUR) return false;
    return !!BAD[judge(mon).kind];
  }

  /* ---------- 돌보기 ---------- */
  function asleep(mon) { return { ok: false, reason: 'sleep' }; }

  function feed(state) {
    var mon = state.mon;
    if (mon.sleeping) return asleep(mon);
    if (mon.hunger >= 4) { mon.c.overfeed++; return { ok: true, over: true }; }
    mon.hunger++;
    return { ok: true };
  }

  function snack(state) {
    var mon = state.mon;
    if (mon.sleeping) return asleep(mon);
    var over = mon.hunger >= 4;
    if (over) mon.c.overfeed++;
    if (mon.strength < 4) mon.strength++;
    return { ok: true, over: over };
  }

  // 훈련 미니게임 한 판 = 훈련 1회. 세 번 중 두 번 맞히면 힘이 오른다.
  function train(state, hits) {
    var mon = state.mon;
    if (mon.sleeping) return asleep(mon);
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

  /* 아머진화 — 성장기 브이몬 + 디지멘탈 보유, 하루 1회, 48시간 */
  function canArmor(state, now) {
    var mon = state.mon;
    if (!mon || mon.dead) return false;
    return mon.line === 'veemon' && mon.stage === 'child' && !mon.armor &&
      state.meta.items.digimental > 0 && mon.armorDay !== dateKey(now) && !mon.sleeping;
  }
  function armor(state, now) {
    if (!canArmor(state, now)) return { ok: false };
    var mon = state.mon, to = line(mon).armor;
    mon.armor = now + R.armorHours * HOUR;
    mon.armorDay = dateKey(now);
    register(state, to, 'raised');
    emit(state, 'evolve', now, { from: mon.species, to: to, kind: 'armor' });
    return { ok: true };
  }

  // 특수 아이템(디지 칩): 배고픔과 힘을 가득 채운다. 과식으로 치지 않는다.
  function useChip(state) {
    var mon = state.mon, it = state.meta.items;
    if (!it.chip || mon.sleeping) return { ok: false };
    it.chip--;
    mon.hunger = 4; mon.strength = 4;
    return { ok: true };
  }

  /* ---------- 바코드 → 야생 디지몬 ---------- */
  // FNV-1a 로 섞은 뒤 mulberry32 로 수열을 뽑는다. 같은 바코드면 늘 같은 수열.
  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
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
  function normalizeCode(code) { return String(code || '').replace(/\s+/g, '').trim(); }

  // 배틀에서 쓰는 단계 번호. 아머진화 중인 플레이드라몬은 성숙기로 친다.
  function battleStage(mon) { return mon.armor ? STAGE_IDX.adult : STAGE_IDX[mon.stage]; }

  /* 속성 → 등급 → 디지몬 순서로 정한다. 단계는 내 단계와 같거나 한 단계 위. */
  function wildFor(code, myStage) {
    var r = rng(hash(normalizeCode(code)));
    var a = r(), g = r(), s = r(), p = r(), q = r();
    var attr = a < 0.3 ? 'vaccine' : a < 0.6 ? 'data' : a < 0.9 ? 'virus' : 'free';
    var O = R.gradeOdds;
    var grade = g < O.normal ? 'normal' : g < O.normal + O.rare ? 'rare' : 'boss';
    var lo = Math.max(myStage, STAGE_IDX.child), hi = Math.min(lo + 1, STAGE_IDX.ultimate);
    var level = s < 0.5 ? lo : hi;

    if (grade === 'boss') {
      var cands = [];
      [lo, hi].forEach(function (i) {
        (D.BOSSES[D.STAGES[i]] || []).forEach(function (id) { if (cands.indexOf(id) < 0) cands.push(id); });
      });
      if (cands.length) {
        var id = cands[Math.floor(p * cands.length)];
        return mk(id, 'boss', STAGE_IDX[D.SPECIES[id].stage], code);
      }
      grade = 'rare'; // 이 단계엔 보스가 없다
    }
    // 궁극체 야생 풀은 없으니 완전체 풀에서 궁극체 수준으로 강하게 나온다
    var poolStage = D.STAGES[Math.min(level, STAGE_IDX.perfect)];
    var pool = D.WILD[poolStage];
    if (!pool[attr]) attr = ['vaccine', 'data', 'virus'][Math.floor(q * 3)];
    var list = pool[attr];
    return mk(list[Math.floor(p * list.length)], grade, level, code);
  }
  function mk(id, grade, level, code) {
    var S = D.SPECIES[id];
    return { id: id, name: S.name, attr: S.attr, grade: grade, level: level, code: normalizeCode(code) };
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
    if (state.daily.date !== k) state.daily = { date: k, scans: 0, codes: [] };
  }

  // 하루 5회, 같은 바코드는 하루 1번만 배틀
  function scan(state, code, now) {
    var can = canBattle(state);
    if (!can.ok) return can;
    code = normalizeCode(code);
    if (!code) return { ok: false, reason: 'empty' };
    rollDaily(state, now);
    if (state.daily.codes.indexOf(code) >= 0) return { ok: false, reason: 'today' };
    if (state.daily.scans >= R.scansPerDay) return { ok: false, reason: 'limit' };
    state.daily.scans++;
    return { ok: true, wild: wildFor(code, battleStage(state.mon)), left: R.scansPerDay - state.daily.scans };
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
    var id = form(mon), S = D.SPECIES[id];
    var base = R.stagePower[D.STAGES[battleStage(mon)]] * S.mult;
    return base * (0.85 + 0.05 * mon.strength) * (mon.hunger === 0 ? 0.8 : 1);
  }
  function wildPower(w) {
    return R.stagePower[D.STAGES[w.level]] * R.gradePower[w.grade];
  }

  function startBattle(state, wild) {
    var mon = state.mon, me = D.SPECIES[form(mon)];
    var pPow = myPower(mon), ePow = wildPower(wild);
    if (wild.grade === 'boss' && me.bossMult) pPow *= me.bossMult;
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

  /* 배틀 결과를 진화 수치·도감·아이템에 반영한다 */
  function endBattle(state, b, now) {
    var mon = state.mon, c = mon.c, it = state.meta.items, reward = null;
    rollDaily(state, now);
    if (state.daily.codes.indexOf(b.wild.code) < 0) state.daily.codes.push(b.wild.code);
    c.battles++;
    if (b.hungry) c.hungryBattles++;
    if (b.won) {
      c.wins++; c.streak = 0;
      register(state, b.wild.id, 'beaten');
      if (b.wild.grade === 'boss') {
        c.bossWins++;
        if (!state.meta.bossEver) { state.meta.bossEver = true; it.digimental++; reward = 'digimental'; }
        else { it.chip++; reward = 'chip'; }
      }
    } else {
      c.losses++; c.streak++;
      if (c.streak > c.maxStreak) c.maxStreak = c.streak;
    }
    if (mon.hunger > 0) mon.hunger--; // 배틀하면 배가 고파진다
    return { won: b.won, reward: reward };
  }

  return {
    MIN: MIN, HOUR: HOUR, STAGE_IDX: STAGE_IDX,
    newState: newState, hatch: hatch, tick: tick, sleepNow: sleepNow,
    judge: judge, warning: warning, form: form, winRate: winRate, dateKey: dateKey,
    feed: feed, snack: snack, train: train, clean: clean, toggleLights: toggleLights, wake: wake,
    canArmor: canArmor, armor: armor, useChip: useChip,
    hash: hash, rng: rng, wildFor: wildFor, battleStage: battleStage, advantage: advantage,
    canBattle: canBattle, scan: scan, scansLeft: scansLeft,
    startBattle: startBattle, battleTurn: battleTurn, endBattle: endBattle,
    myPower: myPower, wildPower: wildPower
  };
})(typeof DigiData !== 'undefined' ? DigiData : require('./data.js'));

if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
