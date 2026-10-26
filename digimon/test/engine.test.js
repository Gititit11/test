// node --test digimon/test  (취침 시간 판정이 현지 시각을 쓰므로 UTC 로 고정한다)
process.env.TZ = 'UTC';

var test = require('node:test');
var assert = require('node:assert/strict');
var D = require('../js/data.js');
var E = require('../js/engine.js');
var SHEETS = require('../js/sheets.js');

var H = E.HOUR, M = E.MIN;
var MORNING = Date.UTC(2026, 0, 5, 9, 0); // 깨어 있는 시간

function seeded(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function at(lineId, stage, species, counters) {
  var s = E.newState();
  var mon = E.hatch(s, lineId, MORNING);
  mon.stage = stage; mon.species = species;
  mon.stageEnd = MORNING + 1000 * H; // 시험 도중에 저절로 진화하지 않게
  Object.assign(mon.c, counters || {});
  return s;
}
function to(lineId, stage, species, counters) {
  return E.judge(at(lineId, stage, species, counters).mon).to;
}
function quiet(mon) { // 시간을 흘려도 배고픔·힘·배변이 끼어들지 않게
  mon.hunger = 4; mon.strength = 4; mon.hungerT = -1e9; mon.strengthT = -1e9; mon.poopT = -1e9;
}

test('데이터: 모든 종에 도트 시트가 있고, 표가 서로 맞는다', function () {
  Object.keys(D.SPECIES).forEach(function (id) { assert.ok(SHEETS[id], id + ' 시트'); });
  assert.deepEqual(D.LINE_ORDER, ['agumon', 'gabumon', 'veemon', 'impmon', 'guilmon', 'renamon']);
  assert.equal(Object.keys(D.WILD).reduce(function (n, st) {
    return n + Object.keys(D.WILD[st]).reduce(function (m, a) { return m + D.WILD[st][a].length; }, 0);
  }, 0), 150, '야생 150종');
  assert.equal(D.BOSSES.perfect.length + D.BOSSES.ultimate.length + D.LEGENDS.length, 30, '보스 30종');
  D.LINE_ORDER.forEach(function (k) { assert.ok(SHEETS['egg_' + k], k + ' 디지타마 그림'); });
  D.LINE_ORDER.forEach(function (k) {
    var L = D.LINES[k];
    Object.keys(L.evo).forEach(function (from) {
      L.evo[from].forEach(function (e) {
        assert.ok(D.RULE_HINTS[e[0]] && D.RULE_KIND[e[0]], e[0]);
        var a = E.STAGE_IDX[D.SPECIES[from].stage], b = E.STAGE_IDX[D.SPECIES[e[1]].stage];
        assert.equal(b, a + 1, from + ' → ' + e[1]);
      });
    });
  });
  Object.keys(D.WILD).forEach(function (st) {
    Object.keys(D.WILD[st]).forEach(function (a) {
      D.WILD[st][a].forEach(function (id) {
        assert.equal(D.SPECIES[id].stage, st, id);
        assert.equal(D.SPECIES[id].attr, a, id);
      });
    });
  });
  Object.keys(D.BOSSES).forEach(function (st) {
    D.BOSSES[st].forEach(function (id) { assert.ok(D.SPECIES[id].boss); assert.equal(D.SPECIES[id].stage, st); });
  });
  D.LEGENDS.forEach(function (id) { assert.ok(D.SPECIES[id].legend); });
  Object.keys(D.RULES.gradeOdds).forEach(function (st) {
    var sum = Object.values(D.RULES.gradeOdds[st]).reduce(function (a, b) { return a + b; });
    assert.ok(Math.abs(sum - 1) < 1e-9, st);
  });
});

test('성장기 → 성숙기 (아구몬): ④ > ③ > ① > ②', function () {
  assert.equal(to('agumon', 'child', 'agumon', { mistakes: 3, training: 16 }), 'greymon');
  assert.equal(to('agumon', 'child', 'agumon', { training: 47 }), 'greymon');
  assert.equal(to('agumon', 'child', 'agumon', { training: 120 }), 'greymon', '훈련은 많이 해도 정상 진화 (상한 없음)');
  assert.equal(to('agumon', 'child', 'agumon', { training: 15 }), 'ogremon');
  assert.equal(to('agumon', 'child', 'agumon', { mistakes: 4, training: 20 }), 'ogremon');
  assert.equal(to('agumon', 'child', 'agumon', { mistakes: 6 }), 'algomon_adult');
  assert.equal(to('agumon', 'child', 'agumon', { mistakes: 6, hygiene: 4 }), 'coelamon');
  assert.equal(to('agumon', 'child', 'agumon', { overfeed: 6 }), 'coelamon');
  assert.equal(to('agumon', 'child', 'agumon', { sleep: 9, training: 20 }), 'greymon', '⑫ 은 파피몬 한정');
});

test('성장기 → 성숙기 (파피몬·브이몬)', function () {
  assert.equal(to('gabumon', 'child', 'gabumon', { training: 20 }), 'garurumon');
  assert.equal(to('gabumon', 'child', 'gabumon', { sleep: 4, training: 20 }), 'dokugumon');
  assert.equal(to('gabumon', 'child', 'gabumon', { sleep: 4, hygiene: 4 }), 'algomon_adult');
  assert.equal(to('gabumon', 'child', 'gabumon', {}), 'gorimon');
  assert.equal(to('veemon', 'child', 'veemon', { training: 20 }), 'exveemon');
  assert.equal(to('veemon', 'child', 'veemon', {}), 'veedramon');
  assert.equal(to('veemon', 'child', 'veemon', { mistakes: 7 }), 'digitamamon');
  var s = at('veemon', 'child', 'veemon', { mistakes: 7 });
  s.mon.stageEnd = MORNING + M;
  E.tick(s, MORNING + M);
  assert.equal(s.mon.species, 'digitamamon');
  assert.equal(s.mon.stageEnd, null, '디지타몬은 더 진화하지 않는다');
});

test('새 스타터: 임프몬 · 길몬 · 레나몬', function () {
  var ok = { mistakes: 2, battles: 15, wins: 9 }, ult = { mistakes: 1, battles: 10, wins: 7, bossWins: 1 };
  assert.equal(to('impmon', 'child', 'impmon', { training: 20 }), 'wizarmon');
  assert.equal(to('impmon', 'child', 'impmon', { sleep: 4, training: 20 }), 'devimon');
  assert.equal(to('impmon', 'child', 'impmon', { hygiene: 4 }), 'raremon');
  assert.equal(to('impmon', 'child', 'impmon', {}), 'bakemon');
  assert.equal(to('impmon', 'adult', 'devimon', ok), 'baalmon', '정화');
  assert.equal(to('impmon', 'perfect', 'baalmon', Object.assign({ sleep: 0 }, ult)), 'beelzebumon_2010');
  assert.equal(to('guilmon', 'child', 'guilmon', { training: 20 }), 'growmon');
  assert.equal(to('guilmon', 'child', 'guilmon', { training: 60 }), 'growmon_orange', '㉑ 훈련 48 이상');
  assert.equal(to('guilmon', 'child', 'guilmon', { training: 60, mistakes: 5 }), 'siesamon');
  assert.equal(to('guilmon', 'child', 'guilmon', { mistakes: 6 }), 'devidramon');
  assert.equal(to('guilmon', 'perfect', 'megalogrowmon', { mistakes: 3, maxStreak: 5 }), 'megidramon');
  assert.equal(E.judge(at('guilmon', 'perfect', 'mihiramon', ult).mon).kind, 'terminal', '데바는 막다른 진화');
  assert.equal(to('renamon', 'child', 'renamon', { training: 20 }), 'kyubimon');
  assert.equal(to('renamon', 'child', 'renamon', { sleep: 4, training: 20 }), 'youkomon');
  assert.equal(to('renamon', 'adult', 'youkomon', {}), 'doumon');
  assert.equal(to('renamon', 'perfect', 'taomon', Object.assign({ sleep: 1 }, ult)), 'sakuyamon');
  assert.equal(to('renamon', 'perfect', 'parasimon', { mistakes: 3, maxStreak: 5 }), 'vikaralamon');

  var boss = { id: 'piemon', name: '피에몬', attr: 'virus', grade: 'boss', level: E.STAGE_IDX.ultimate };
  [['guilmon', 'dukemon', 'dukemon_crimson'], ['impmon', 'beelzebumon', 'beelzebumon_blast']].forEach(function (c) {
    var s = at(c[0], 'ultimate', c[1]);
    for (var i = 0; i < 3; i++) { var b = E.startBattle(s, boss); b.over = true; b.won = true; E.endBattle(s, b, MORNING, seeded(i)); }
    assert.equal(s.mon.species, c[2]);
  });
});

test('성숙기 → 완전체', function () {
  var ok = { mistakes: 2, battles: 15, wins: 9 };
  assert.equal(to('agumon', 'adult', 'greymon', ok), 'metalgreymon');
  assert.equal(to('agumon', 'adult', 'greymon', Object.assign({ training: 48, hungryBattles: 5 }, ok)), 'skullgreymon');
  assert.equal(to('agumon', 'adult', 'greymon', { mistakes: 4, battles: 15, wins: 9 }), 'metaltyranomon');
  assert.equal(to('agumon', 'adult', 'greymon', { mistakes: 6, battles: 15, wins: 9 }), null);
  assert.equal(to('agumon', 'adult', 'ogremon', { battles: 15, wins: 7 }), 'mamemon', '⑦ 승률 50% 미만이면 막다른 진화');
  assert.equal(to('agumon', 'adult', 'greymon', { battles: 15, wins: 8 }), 'metalgreymon', '⑤ 승률 50% 이상');
  assert.equal(to('agumon', 'adult', 'greymon', { battles: 15, wins: 7 }), null, '⑦ 이 없는 라인은 실패');
  assert.equal(to('agumon', 'adult', 'ogremon', ok), 'andromon');
  assert.equal(to('agumon', 'adult', 'algomon_adult', { battles: 15, wins: 6 }), 'neodevimon');
  assert.equal(to('gabumon', 'adult', 'algomon_adult', { battles: 15, wins: 6 }), 'orochimon', '같은 종도 라인마다 다르다');
  assert.equal(to('agumon', 'adult', 'coelamon', ok), 'anomalocarimon');
  assert.equal(to('gabumon', 'adult', 'dokugumon', ok), 'weregarurumon');
  assert.equal(E.judge(at('gabumon', 'adult', 'dokugumon', ok).mon).kind, 'purify');
  assert.equal(to('gabumon', 'adult', 'dokugumon', {}), 'waruseadramon');
  assert.equal(to('gabumon', 'adult', 'gorimon', { battles: 20, wins: 9 }), 'bigmamemon');
  assert.equal(to('gabumon', 'adult', 'gorimon', { battles: 20, wins: 16 }), 'valvemon', '승률이 높으면 정상 쪽');
  assert.equal(to('veemon', 'adult', 'exveemon', {}), 'dinobeemon');
  assert.equal(to('veemon', 'adult', 'veedramon', { battles: 15, wins: 7 }), 'goldveedramon');
  assert.equal(to('veemon', 'adult', 'veedramon', { battles: 15, wins: 14 }), 'aeroveedramon', '승률이 높아도 막다른 진화로 빠지지 않는다');
  assert.equal(to('veemon', 'adult', 'veedramon', ok), 'aeroveedramon');
});

test('완전체 → 궁극체', function () {
  var ok = { mistakes: 1, battles: 10, wins: 7, bossWins: 1 };
  assert.equal(to('agumon', 'perfect', 'metalgreymon', ok), 'wargreymon');
  assert.equal(to('agumon', 'perfect', 'metalgreymon', Object.assign({}, ok, { wins: 6 })), 'wargreymon', '⑨ 승률 60%');
  assert.equal(to('agumon', 'perfect', 'metalgreymon', Object.assign({}, ok, { wins: 5 })), null);
  assert.equal(to('agumon', 'perfect', 'metalgreymon', { mistakes: 0, battles: 1, wins: 1, bossWins: 1 }), null, '배틀 10번은 해야 한다');
  assert.equal(to('agumon', 'perfect', 'metalgreymon', Object.assign({}, ok, { bossWins: 0 })), null);
  assert.equal(to('agumon', 'perfect', 'metaltyranomon', { mistakes: 3, maxStreak: 5 }), 'blitzgreymon');
  assert.equal(to('gabumon', 'perfect', 'weregarurumon', ok), 'cresgarurumon', '수면 방해 0 이면 숨은 진화');
  assert.equal(to('gabumon', 'perfect', 'weregarurumon', Object.assign({ sleep: 1 }, ok)), 'metalgarurumon');
  assert.equal(to('veemon', 'perfect', 'paildramon', ok), 'imperialdramon_dm');
  assert.equal(E.judge(at('agumon', 'perfect', 'skullgreymon', ok).mon).kind, 'terminal');
});

test('진화 실패: 성숙기는 다음 판정이 하루 늦어지고, 완전체는 그대로', function () {
  var s = at('agumon', 'adult', 'greymon', {});
  s.mon.stageEnd = MORNING + M;
  E.tick(s, MORNING + M);
  assert.equal(s.mon.species, 'greymon');
  assert.equal(s.mon.stageEnd, MORNING + M + 96 * H + 24 * H);

  s = at('agumon', 'perfect', 'metalgreymon', {});
  s.mon.stageEnd = MORNING + M;
  E.tick(s, MORNING + M);
  assert.equal(s.mon.stageEnd, MORNING + M + 120 * H);
});

test('수명은 없다: 궁극체는 아무리 지나도 사라지지 않는다', function () {
  var s = at('agumon', 'ultimate', 'wargreymon');
  s.mon.stageEnd = null;
  s.mon.hunger = 4; s.mon.strength = 4;
  E.tick(s, MORNING + 60 * 24 * H);
  assert.equal(s.mon.dead, false);
  assert.equal(s.mon.species, 'wargreymon');
});

test('⑩ 오메가몬: 짝을 키워 본 적 있고 보스 3번 격파 / ⑲ 파이터 모드', function () {
  var boss = { id: 'piemon', name: '피에몬', attr: 'virus', grade: 'boss', level: E.STAGE_IDX.ultimate };
  function win(s) { var b = E.startBattle(s, boss); b.over = true; b.won = true; return E.endBattle(s, b, MORNING, seeded(1)); }

  var s = at('agumon', 'ultimate', 'wargreymon');
  win(s); win(s); win(s);
  assert.equal(s.mon.species, 'wargreymon', '메탈가루몬을 키운 적이 없다');
  s.meta.dex.metalgarurumon = { raised: true };
  win(s);
  assert.equal(s.mon.species, 'omegamon');
  assert.ok(s.meta.dex.omegamon.raised);

  s = at('veemon', 'ultimate', 'imperialdramon_dm');
  win(s); win(s);
  assert.equal(s.mon.species, 'imperialdramon_dm');
  win(s);
  assert.equal(s.mon.species, 'imperialdramon');
});

test('디지타마: 5분 동안 흔들리다가 부화한다', function () {
  var s = E.newState();
  E.hatch(s, 'guilmon', MORNING);
  assert.equal(s.mon.stage, 'egg');
  assert.equal(E.form(s.mon), 'egg_guilmon');
  assert.equal(E.feed(s).ok, false, '디지타마는 먹이를 먹지 않는다');
  E.tick(s, MORNING + 4 * M);
  assert.equal(s.mon.stage, 'egg');
  assert.equal(s.mon.hunger, 2, '알일 때는 배고파지지 않는다');
  assert.ok(!s.meta.dex.jyarimon, '부화 전에는 도감에 없다');
  s.events = [];
  E.tick(s, MORNING + 5 * M);
  assert.equal(s.mon.species, 'jyarimon');
  assert.equal(s.events.filter(function (e) { return e.type === 'evolve'; })[0].kind, 'hatch');
  assert.ok(s.meta.dex.jyarimon.raised);
  assert.equal(s.mon.stageEnd, MORNING + 5 * M + H);
});

test('부화부터 성장기까지 시간이 흐르고, 단계가 바뀌면 수치가 초기화된다', function () {
  var s = E.newState();
  E.hatch(s, 'agumon', MORNING);
  E.tick(s, MORNING + 5 * M + H);
  assert.equal(s.mon.species, 'koromon');
  assert.equal(s.mon.c.mistakes, 0);
  E.tick(s, MORNING + 5 * M + 25 * H);
  assert.equal(s.mon.species, 'agumon');
  assert.ok(s.meta.dex.botamon.raised && s.meta.dex.koromon.raised && s.meta.dex.agumon.raised);
});

test('보관함: 여러 마리를 두고, 보관한 동안은 시간이 멈춘다', function () {
  var s = E.newState();
  var a = E.hatch(s, 'agumon', MORNING);
  E.tick(s, MORNING + 2 * H);
  assert.equal(a.species, 'koromon');
  var g = E.hatch(s, 'gabumon', MORNING + 2 * H);
  assert.equal(s.mon, g);
  assert.equal(s.box.length, 1);
  assert.equal(s.box[0], a, '키우던 디지몬은 사라지지 않고 보관함으로');

  // 보관한 3일 동안 아구몬의 시간은 멈춰 있다
  var stageLeft = a.stageEnd - (MORNING + 2 * H);
  var later = MORNING + 74 * H;
  quiet(g);
  E.tick(s, later);
  assert.ok(E.resume(s, a.uid, later));
  assert.equal(s.mon, a);
  assert.equal(s.box[0], g);
  assert.equal(a.species, 'koromon');
  assert.equal(a.stageEnd - later, stageLeft);
  assert.equal(a.lastTick, later);

  // 슬롯은 6칸
  for (var i = 0; i < 4; i++) assert.ok(E.hatch(s, 'veemon', later));
  assert.equal(E.slotsLeft(s), 0);
  assert.equal(E.hatch(s, 'veemon', later), null);
  var n = s.box.length;
  assert.ok(E.release(s, s.box[0].uid, later));
  assert.equal(s.box.length, n - 1);
  assert.equal(s.meta.history[0].how, 'released');
  assert.equal(E.slotsLeft(s), 1);
});

test('예전 저장에서 수명이 다한 디지몬이 있어도 새 알을 받을 수 있다', function () {
  var s = at('agumon', 'ultimate', 'wargreymon');
  s.mon.dead = true;
  assert.ok(E.hatch(s, 'veemon', MORNING + 10 * M));
  assert.equal(s.box.length, 0);
});

test('배고픔 호출을 20분 넘게 두면 실수 1, 한 번만 센다', function () {
  var s = at('agumon', 'child', 'agumon');
  s.mon.hunger = 0; s.mon.strength = 4;
  E.tick(s, MORNING + 19 * M);
  assert.equal(s.mon.c.mistakes, 0);
  E.tick(s, MORNING + 20 * M);
  assert.equal(s.mon.c.mistakes, 1);
  E.tick(s, MORNING + 50 * M);
  assert.equal(s.mon.c.mistakes, 1);
  E.feed(s);
  assert.equal(s.mon.hunger, 1);
  assert.equal(s.mon.callH, 0, '먹이를 주면 호출이 바로 끝난다');
  s.mon.strength = 0; s.mon.callS = 3;
  E.snack(s);
  assert.equal(s.mon.callS, 0, '간식으로 힘을 채워도 바로 끝난다');
});

test('병: 똥 4개면 아프고, 배틀에서 지면 다칠 수 있고, 약 한 번이면 낫는다', function () {
  var s = at('agumon', 'child', 'agumon');
  quiet(s.mon);
  s.mon.poops = [{ age: 0 }, { age: 0 }, { age: 0 }];
  s.mon.poopT = D.RULES.poopEvery.child - 1;
  E.tick(s, MORNING + M);
  assert.equal(s.mon.poops.length, 4);
  assert.equal(s.mon.sick, true);
  assert.equal(E.canBattle(s).reason, 'sick');
  assert.equal(E.train(s, 3).reason, 'sick');
  // 아프고 한 시간 안에 약을 안 주면 케어 실수 1, 병 하나에 한 번만
  E.clean(s); quiet(s.mon);
  E.tick(s, MORNING + M + 60 * M);
  assert.equal(s.mon.c.mistakes, 1);
  E.tick(s, MORNING + M + 5 * H);
  assert.equal(s.mon.c.mistakes, 1, '오래 아파도 한 번만');
  assert.equal(E.medicine(s).ok, true);
  assert.equal(s.mon.sick, false);
  assert.equal(E.medicine(s).reason, 'healthy', '안 아프면 약을 먹지 않는다');
  E.tick(s, MORNING + 8 * H);
  assert.equal(s.mon.c.mistakes, 1, '나은 뒤에는 더 쌓이지 않는다');

  var w = { id: 'palmon', name: '팔몬', attr: 'data', grade: 'normal', level: E.STAGE_IDX.child };
  var b = E.startBattle(s, w); b.over = true; b.won = false;
  assert.equal(E.endBattle(s, b, MORNING, function () { return 0.1; }).injured, true, '20% 확률로 다친다');
  assert.equal(s.mon.sick, true);
  s.mon.sick = false;
  b = E.startBattle(s, w); b.over = true; b.won = false;
  assert.equal(E.endBattle(s, b, MORNING, function () { return 0.5; }).injured, false);
});

test('과식: 배부를 때 먹이나 간식을 주면 센다', function () {
  var s = at('agumon', 'child', 'agumon');
  s.mon.hunger = 4;
  E.feed(s); E.snack(s);
  assert.equal(s.mon.c.overfeed, 2);
  s.mon.hunger = 3;
  E.feed(s);
  assert.equal(s.mon.c.overfeed, 2);
});

test('배변을 3시간 넘게 두면 위생 실수 (치울 때까지 한 번만)', function () {
  var s = at('agumon', 'child', 'agumon');
  s.mon.poops = [{ age: 0 }, { age: 0 }, { age: 0 }];
  s.mon.poopT = -9999;
  E.tick(s, MORNING + 179 * M);
  assert.equal(s.mon.c.hygiene, 0);
  E.tick(s, MORNING + 180 * M);
  assert.equal(s.mon.c.hygiene, 1, '똥이 셋이어도 한 번');
  E.tick(s, MORNING + 10 * H);
  assert.equal(s.mon.c.hygiene, 1, '오래 두어도 한 번');
  E.clean(s);
  assert.equal(s.mon.poops.length, 0);
  s.mon.poops = [{ age: 0 }];
  E.tick(s, MORNING + 13 * H + M);
  assert.equal(s.mon.c.hygiene, 2, '치운 뒤 새로 쌓인 똥은 다시 센다');
});

test('수면: 불을 30분 넘게 안 끄거나 깨우면 수면 방해', function () {
  var s = at('gabumon', 'child', 'gabumon');
  var night = Date.UTC(2026, 0, 5, 22, 0);
  s.mon.lastTick = night - 2 * M; s.mon.stageEnd = null; s.mon.hunger = 4; s.mon.strength = 4;
  E.tick(s, night - M);
  assert.equal(s.mon.sleeping, false, '밤 10시 전에는 깨어 있다');
  E.tick(s, night);
  assert.equal(s.mon.sleeping, true);
  E.tick(s, night + 29 * M);
  assert.equal(s.mon.c.sleep, 0);
  E.tick(s, night + 30 * M);
  assert.equal(s.mon.c.sleep, 1);
  E.tick(s, night + 3 * H);
  assert.equal(s.mon.c.sleep, 1, '하룻밤에 한 번');
  assert.equal(E.feed(s).ok, false);
  E.wake(s, night + 3 * H);
  assert.equal(s.mon.c.sleep, 2);
  E.tick(s, night + 3 * H + 11 * M);
  assert.equal(s.mon.sleeping, true, '잠깐 뒤 다시 잔다');
  E.tick(s, Date.UTC(2026, 0, 6, 7, 59));
  assert.equal(s.mon.sleeping, true, '아침 8시까지 잔다');
  E.tick(s, Date.UTC(2026, 0, 6, 8, 0));
  assert.equal(s.mon.sleeping, false);
  assert.equal(s.mon.lights, true);
});

test('잘못된 진화 하루 전에는 경고한다', function () {
  var s = at('agumon', 'child', 'agumon', { mistakes: 6 });
  s.mon.stageEnd = MORNING + 25 * H;
  assert.equal(E.warning(s.mon, MORNING), false, '아직 하루 넘게 남음');
  assert.equal(E.warning(s.mon, MORNING + 2 * H), true);
  s.mon.c.mistakes = 0; s.mon.c.training = 20;
  assert.equal(E.warning(s.mon, MORNING + 2 * H), false);
  s.mon.c.training = 0;
  assert.equal(E.warning(s.mon, MORNING + 2 * H), false, '중간 루트(②)는 경고하지 않는다');
});

test('아머진화: 가진 디지멘탈로 고르고, 하루 1회, 48시간', function () {
  var s = at('veemon', 'child', 'veemon');
  s.mon.stageEnd = MORNING + 70 * H;
  assert.equal(E.canArmor(s, MORNING), false);
  s.meta.items.thunder = true; s.meta.items.miracle = true;
  assert.deepEqual(E.armorKinds(s, MORNING), ['thunder', 'miracle']);
  assert.equal(E.armor(s, MORNING, 'flame').ok, false, '없는 디지멘탈');
  assert.equal(E.armor(s, MORNING, 'miracle').to, 'magnamon');
  assert.equal(E.battleStage(s.mon), E.STAGE_IDX.perfect);
  assert.equal(E.canArmor(s, MORNING + H), false);
  E.train(s, 3);
  assert.equal(s.mon.c.training, 1, '아머 중에도 수치는 쌓인다');
  quiet(s.mon);
  E.tick(s, MORNING + 48 * H);
  assert.equal(E.form(s.mon), 'veemon');
  assert.equal(E.armor(s, MORNING + 48 * H, 'thunder').to, 'raidramon', '다음 날 다시');
  assert.equal(E.battleStage(s.mon), E.STAGE_IDX.adult);
  assert.equal(s.meta.items.thunder, true, '디지멘탈은 닳지 않는다');
});

test('야생: 내 단계별 등장 단계 확률과 단계별 등급 확률', function () {
  var r = seeded(7), N = 40000;
  function tally(stage) {
    var t = { child: 0, adult: 0, perfect: 0, ultimate: 0, boss: 0, legend: 0, rare: 0 };
    for (var i = 0; i < N; i++) {
      var w = E.wildFor(stage, r);
      assert.ok(D.SPECIES[w.id], w.id);
      assert.equal(D.SPECIES[w.id].stage, D.STAGES[w.level], w.id);
      t[D.STAGES[w.level]]++;
      if (w.grade !== 'normal') t[w.grade]++;
    }
    return t;
  }
  var c = tally(E.STAGE_IDX.child);
  assert.ok(Math.abs(c.child / N - 0.65) < 0.01, JSON.stringify(c));
  assert.equal(c.ultimate + c.legend, 0, '성장기는 궁극체를 만나지 않는다');
  var p = tally(E.STAGE_IDX.perfect);
  assert.ok(Math.abs(p.perfect / N - 0.5) < 0.01, JSON.stringify(p));
  assert.ok(Math.abs(p.boss / N - (0.5 * 0.09 + 0.15 * 0.05)) < 0.004, JSON.stringify(p));
  var u = tally(E.STAGE_IDX.ultimate);
  assert.ok(Math.abs(u.ultimate / N - 0.2) < 0.01, JSON.stringify(u));
  assert.ok(Math.abs(u.legend / N - 0.2 * 0.015) < 0.0015, JSON.stringify(u));
});

test('스캔: 같은 바코드 · 같은 내 단계면 늘 같은 디지몬, 진화하면 같거나 더 높은 단계', function () {
  var s = at('agumon', 'child', 'agumon'), seen = {};
  var first = E.scan(s, '8801234567893', MORNING).wild;
  assert.ok(s.meta.dex[first.id].seen, '만난 디지몬은 도감에 실루엣으로');
  for (var i = 0; i < 2; i++) assert.deepEqual(E.scan(s, ' 8801234567893 ', MORNING).wild, first, '공백은 무시하고 같은 디지몬');
  s.mon = at('agumon', 'child', 'agumon').mon;
  assert.deepEqual(E.scan(s, '8801234567893', MORNING).wild, first, '같은 단계의 다른 디지몬도 같은 상대');
  for (var k = 0; k < 2000; k++) {
    var code = '880' + k, prev = -1, faces = {};
    [E.STAGE_IDX.child, E.STAGE_IDX.adult, E.STAGE_IDX.perfect, E.STAGE_IDX.ultimate].forEach(function (my) {
      var w = E.wildForCode(code, my);
      assert.ok(w.level >= prev, code + ': 진화해도 더 낮은 단계가 나오지 않는다');
      prev = w.level;
      if (faces[w.level]) assert.deepEqual(w, faces[w.level], code + ': 같은 단계면 같은 디지몬');
      faces[w.level] = w;
    });
    if (k < 200) seen[E.wildForCode(code, E.STAGE_IDX.adult).id] = 1;
  }
  assert.ok(Object.keys(seen).length > 50, '바코드가 다르면 여러 디지몬');
  assert.equal(E.scan(s, ' ', MORNING).reason, 'empty');
  var A = E.STAGE_IDX.adult;
  assert.deepEqual(E.wildForCode('036000291452', A), E.wildForCode('0036000291452', A), 'UPC-A 와 EAN-13 은 같은 상품');
  assert.deepEqual(E.wildForCode('8801-0430 14809', A), E.wildForCode('8801043014809', A));
});

test('배틀 횟수: 찍기는 무제한, 배틀은 디지몬마다 하루 5번 (0 이면 무제한)', function () {
  var keep = D.RULES.scansPerDay;
  D.RULES.scansPerDay = 5;
  var s = at('agumon', 'child', 'agumon'), first = s.mon;
  for (var j = 0; j < 30; j++) assert.equal(E.scan(s, '880' + j, MORNING).ok, true, '찍기는 무제한');
  assert.equal(E.scansLeft(s, MORNING), 5, '찍기만 해서는 안 줄어든다');
  for (var i = 0; i < 5; i++) assert.equal(E.takeBattle(s, MORNING).ok, true);
  assert.equal(E.takeBattle(s, MORNING).reason, 'limit');
  assert.equal(E.scansLeft(s, MORNING), 0);
  assert.equal(E.scan(s, '1', MORNING).ok, true, '배틀을 다 해도 찍어 보기는 된다');
  // 보관함에 넣고 다른 디지몬을 데려오면 그 디지몬은 따로 5번
  var other = at('gabumon', 'child', 'gabumon').mon;
  s.box.push(first); s.mon = other;
  assert.equal(E.scansLeft(s, MORNING), 5);
  s.mon = first;
  assert.equal(E.takeBattle(s, MORNING + 24 * H).ok, true, '다음 날 풀린다');
  D.RULES.scansPerDay = 0;
  for (var k = 0; k < 30; k++) assert.equal(E.takeBattle(s, MORNING + 24 * H).ok, true, '0 이면 무제한');
  D.RULES.scansPerDay = keep;
});

test('상성: 백신 → 바이러스 → 데이터 → 백신, 프리는 영향 없음', function () {
  assert.ok(E.advantage('vaccine', 'virus') > 1);
  assert.ok(E.advantage('virus', 'data') > 1);
  assert.ok(E.advantage('data', 'vaccine') > 1);
  assert.ok(E.advantage('virus', 'vaccine') < 1);
  assert.equal(E.advantage('free', 'virus'), 1);
});

test('유년기는 배틀할 수 없다', function () {
  var s = E.newState();
  E.hatch(s, 'agumon', MORNING);
  assert.equal(E.scan(s, '1', MORNING).reason, 'baby');
});

test('배틀 결과: 수치·도감·보상·배고픔', function () {
  var s = at('agumon', 'adult', 'greymon'), r = seeded(9);
  s.mon.hunger = 0;
  var w = { id: 'vamdemon', name: '묘티스몬', attr: 'virus', grade: 'boss', level: E.STAGE_IDX.perfect };
  var got = [];
  for (var i = 0; i < 4; i++) {
    var b = E.startBattle(s, w);
    b.over = true; b.won = true;
    got.push(E.endBattle(s, b, MORNING, r).reward);
  }
  assert.deepEqual(got.slice(0, 3).sort(), ['archer', 'flame', 'thunder'], '완전체 보스는 디지멘탈 셋을 겹치지 않게');
  assert.equal(got[3], 'chip');
  assert.equal(s.meta.dex.vamdemon.wins, 4);
  assert.equal(s.mon.c.hungryBattles, 4, '배고픈 채로 네 번');
  assert.equal(s.mon.c.bossWins, 4);

  var u = { id: 'piemon', name: '피에몬', attr: 'virus', grade: 'boss', level: E.STAGE_IDX.ultimate };
  b = E.startBattle(s, u); b.over = true; b.won = true;
  assert.equal(E.endBattle(s, b, MORNING, r).reward, 'miracle');
  b = E.startBattle(s, u); b.over = true; b.won = true;
  assert.equal(E.endBattle(s, b, MORNING, r).reward, 'chip');

  s.mon.hunger = 3;
  for (i = 0; i < 5; i++) {
    b = E.startBattle(s, w);
    b.over = true; b.won = false;
    E.endBattle(s, b, MORNING, r);
  }
  assert.equal(s.mon.c.maxStreak, 5);
  assert.equal(s.mon.hunger, 0);
});

test('배틀 턴이 끝까지 진행되고, 블리츠그레이몬은 가끔 명령을 무시한다', function () {
  var s = at('agumon', 'ultimate', 'blitzgreymon');
  var r = seeded(42);
  var b = E.startBattle(s, { id: 'wargreymon', name: '워그레이몬', attr: 'vaccine', grade: 'normal', level: E.STAGE_IDX.ultimate }), n = 0;
  while (!b.over) { E.battleTurn(b, 'attack', r); n++; }
  assert.ok(n <= 20);
  assert.equal(b.ignores, true);
  var armor = at('veemon', 'child', 'veemon');
  armor.meta.items.flame = true;
  E.armor(armor, MORNING, 'flame');
  var boss = { id: 'vamdemon', attr: 'virus', grade: 'boss', level: E.STAGE_IDX.perfect };
  assert.ok(E.startBattle(armor, boss).pPow > E.myPower(armor.mon) * 1.4, '아머체는 보스에게 강하다');
});

test('배틀: 공격 > 필살기 > 방어 > 공격, 필살기는 게이지 3칸', function () {
  var s = at('agumon', 'adult', 'greymon');
  var w = { id: 'garurumon', name: '가루몬', attr: 'vaccine', grade: 'normal', level: E.STAGE_IDX.adult };
  function fight(foeCmd) { // 상대 커맨드를 정해 둔다
    var b = E.startBattle(s, w);
    var R = D.RULES, keep = R.foeRead;
    R.foeRead = 0;
    var odds = { foeFull: R.foeFull, foeCharging: R.foeCharging };
    R.foeFull = {}; R.foeFull[foeCmd] = 1; R.foeCharging = {}; R.foeCharging[foeCmd === 'special' ? 'attack' : foeCmd] = 1;
    return { b: b, done: function () { R.foeRead = keep; R.foeFull = odds.foeFull; R.foeCharging = odds.foeCharging; } };
  }
  var f = fight('attack'), b = f.b, r;
  r = E.battleTurn(b, 'special', seeded(1));
  assert.equal(r.pCmd, 'attack', '게이지가 없으면 필살기는 공격으로');
  r = E.battleTurn(b, 'guard', seeded(2));
  assert.equal(r.pEvent, 'counter');
  assert.ok(r.pDmg > 0 && r.eDmg < r.pDmg, '막고 반격: ' + JSON.stringify(r));
  assert.equal(b.pGauge, 3, '공격 +1, 막아내기 +2');
  assert.ok(E.canSpecial(b));
  f.done();
  f = fight('guard'); b = f.b; b.pGauge = 3;
  r = E.battleTurn(b, 'special', seeded(3));
  assert.equal(r.pEvent, 'break'); assert.equal(r.eDmg, 0); assert.equal(b.pGauge, 0, '필살기를 쓰면 게이지 0');
  f.done();
  f = fight('special'); b = f.b; b.eGauge = 3;
  r = E.battleTurn(b, 'attack', seeded(4));
  assert.equal(r.eCmd, 'special'); assert.equal(r.pEvent, 'cut');
  assert.ok(r.eDmg < r.pDmg, '끊긴 필살기는 약하다: ' + JSON.stringify(r));
  f.done();
});

test('훈련 레벨: 성공 16번마다 1레벨, 최대 10, 진화해도 남고 레벨마다 전투력 +3%', function () {
  var s = at('agumon', 'child', 'agumon');
  s.mon.strength = 4; // 훈련은 힘도 채우니 미리 가득
  var p0 = E.myPower(s.mon);
  for (var i = 0; i < 15; i++) E.train(s, 2);
  E.train(s, 1); // 실패는 안 센다
  assert.equal(E.trainLevel(s.mon), 0);
  var r = E.train(s, 3);
  assert.equal(r.levelUp, true); assert.equal(E.trainLevel(s.mon), 1);
  assert.ok(Math.abs(E.myPower(s.mon) / p0 - 1.03) < 1e-9);
  s.mon.trainOk = 1000;
  assert.equal(E.trainLevel(s.mon), 10, '최대 10');
  s.mon.trainOk = 48;
  quiet(s.mon); s.mon.c.training = 20;
  E.tick(s, s.mon.stageEnd + 1);
  assert.equal(s.mon.stage, 'adult');
  assert.equal(E.trainLevel(s.mon), 3, '진화해도 그대로');
});
