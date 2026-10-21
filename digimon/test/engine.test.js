// node --test digimon/test  (취침 시간 판정이 현지 시각을 쓰므로 UTC 로 고정한다)
process.env.TZ = 'UTC';

var test = require('node:test');
var assert = require('node:assert/strict');
var D = require('../js/data.js');
var E = require('../js/engine.js');

var H = E.HOUR, M = E.MIN;
var MORNING = Date.UTC(2026, 0, 5, 9, 0); // 깨어 있는 시간

function at(lineId, stage, species, counters) {
  var s = E.newState();
  var mon = E.hatch(s, lineId, MORNING);
  mon.stage = stage; mon.species = species;
  Object.assign(mon.c, counters || {});
  return s;
}
function judge(lineId, stage, species, counters, extra) {
  var s = at(lineId, stage, species, counters);
  Object.assign(s.mon, extra || {});
  return E.judge(s.mon);
}

test('모든 라인과 풀의 디지몬이 데이터에 있다', function () {
  Object.keys(D.LINES).forEach(function (k) {
    var L = D.LINES[k];
    ['baby1', 'baby2', 'child', 'adult', 'perfect', 'ultimate', 'mid', 'dark', 'armor'].forEach(function (f) {
      if (L[f]) assert.ok(D.SPECIES[L[f]], k + '.' + f + ' = ' + L[f]);
    });
  });
  Object.keys(D.WILD).forEach(function (st) {
    Object.keys(D.WILD[st]).forEach(function (a) {
      D.WILD[st][a].forEach(function (id) {
        assert.ok(D.SPECIES[id], id);
        assert.equal(D.SPECIES[id].stage, st, id);
        assert.equal(D.SPECIES[id].attr, a, id);
      });
    });
  });
  Object.keys(D.BOSSES).forEach(function (st) {
    D.BOSSES[st].forEach(function (id) { assert.ok(D.SPECIES[id].boss, id); });
  });
  assert.equal(D.LINE_ORDER.length, 6);
  assert.equal(D.SPECIES.beelzemon.boss, undefined, '베르제브몬은 보스가 아니라 임프몬 궁극체');
});

test('성장기 → 성숙기: 정상 / 중간 / 훈련 상한', function () {
  assert.deepEqual(judge('agumon', 'child', 'agumon', { mistakes: 3, training: 16 }), { to: 'greymon', kind: 'normal' });
  assert.deepEqual(judge('agumon', 'child', 'agumon', { mistakes: 0, training: 47 }), { to: 'greymon', kind: 'normal' });
  assert.equal(judge('agumon', 'child', 'agumon', { mistakes: 0, training: 48 }).to, 'tyranomon');
  assert.equal(judge('agumon', 'child', 'agumon', { mistakes: 0, training: 15 }).to, 'tyranomon');
  assert.equal(judge('agumon', 'child', 'agumon', { mistakes: 4, training: 20 }).to, 'tyranomon');
  assert.equal(judge('veemon', 'child', 'veemon', { training: 20 }).to, 'exveemon');
  assert.equal(judge('guilmon', 'child', 'guilmon', { training: 60 }).to, 'darktyranomon');
  assert.equal(judge('impmon', 'child', 'impmon', { training: 20 }).to, 'devidramon');
  assert.equal(judge('impmon', 'child', 'impmon', { training: 2 }).to, 'bakemon');
});

test('성장기 → 성숙기: 스카몬 > 누메몬 > 다크 > 정상', function () {
  assert.equal(judge('gabumon', 'child', 'gabumon', { mistakes: 9, hygiene: 4, sleep: 9, training: 20 }).to, 'sukamon');
  assert.equal(judge('gabumon', 'child', 'gabumon', { overfeed: 6 }).to, 'sukamon');
  assert.equal(judge('gabumon', 'child', 'gabumon', { mistakes: 6, sleep: 9 }).to, 'numemon');
  assert.equal(judge('gabumon', 'child', 'gabumon', { sleep: 4, training: 20 }).to, 'blackgarurumon');
  assert.equal(judge('agumon', 'child', 'agumon', { sleep: 4, training: 20 }).to, 'greymon', '블랙가루몬은 가브몬 한정');
});

test('파닥몬: 훈련이 모자라면 두 번까지 연장, 그 뒤 누메몬', function () {
  assert.equal(judge('patamon', 'child', 'patamon', { training: 23 }).kind, 'extend');
  assert.equal(judge('patamon', 'child', 'patamon', { training: 23 }, { extensions: 2 }).to, 'numemon');
  assert.equal(judge('patamon', 'child', 'patamon', { training: 80, mistakes: 3 }).to, 'angemon');
  assert.equal(judge('patamon', 'child', 'patamon', { training: 30, mistakes: 5 }).to, 'unimon');

  var s = at('patamon', 'child', 'patamon', { training: 5 });
  s.mon.stageEnd = MORNING + M;
  E.tick(s, MORNING + M);
  assert.equal(s.mon.species, 'patamon');
  assert.equal(s.mon.extensions, 1);
  assert.equal(s.mon.c.training, 5, '연장 중에도 수치는 이어서 쌓인다');
  assert.equal(s.mon.stageEnd, MORNING + M + 24 * H);
});

test('성숙기 → 완전체', function () {
  var ok = { mistakes: 2, battles: 15, wins: 9 };
  assert.equal(judge('agumon', 'adult', 'greymon', ok).to, 'metalgreymon');
  assert.equal(judge('agumon', 'adult', 'greymon', { mistakes: 2, battles: 15, wins: 8 }).kind, 'fail');
  assert.equal(judge('agumon', 'adult', 'greymon', Object.assign({ training: 48, hungryBattles: 5 }, ok)).to, 'skullgreymon');
  assert.equal(judge('gabumon', 'adult', 'blackgarurumon', ok).kind, 'purify');
  assert.equal(judge('gabumon', 'adult', 'blackgarurumon', ok).to, 'weregarurumon');
  assert.equal(judge('patamon', 'adult', 'angemon', { mistakes: 1, battles: 10 }).to, 'holyangemon');
  assert.equal(judge('patamon', 'adult', 'angemon', { mistakes: 4, battles: 99, wins: 99 }).to, 'devimon');
  assert.equal(judge('agumon', 'adult', 'numemon', { battles: 15, wins: 6 }).to, 'monzaemon');
  assert.equal(judge('agumon', 'adult', 'numemon', { mistakes: 1, battles: 15, wins: 6 }).kind, 'fail');
  assert.equal(judge('impmon', 'adult', 'devidramon', ok).to, 'astamon');
});

test('완전체 → 궁극체', function () {
  var ok = { mistakes: 1, battles: 10, wins: 7, bossWins: 1 };
  assert.equal(judge('guilmon', 'perfect', 'megalogrowlmon', ok).to, 'dukemon');
  assert.equal(judge('guilmon', 'perfect', 'megalogrowlmon', { mistakes: 3, maxStreak: 5 }).to, 'megidramon');
  assert.equal(judge('agumon', 'perfect', 'metalgreymon', Object.assign({}, ok, { bossWins: 0 })).kind, 'fail');
  assert.equal(judge('impmon', 'perfect', 'astamon', ok).to, 'beelzemon');
  assert.equal(judge('agumon', 'perfect', 'skullgreymon', ok).kind, 'terminal');
});

test('진화 실패: 성숙기는 수명이 줄고, 완전체는 그대로', function () {
  var s = at('agumon', 'adult', 'greymon', {});
  var death = s.mon.deathAt;
  s.mon.stageEnd = MORNING + M;
  E.tick(s, MORNING + M);
  assert.equal(s.mon.species, 'greymon');
  assert.equal(s.mon.deathAt, death - 24 * H);
  assert.equal(s.mon.stageEnd, MORNING + M + 96 * H);

  s = at('agumon', 'perfect', 'metalgreymon', {});
  death = s.mon.deathAt;
  s.mon.stageEnd = MORNING + M;
  E.tick(s, MORNING + M);
  assert.equal(s.mon.deathAt, death);
});

test('부화부터 성장기까지 시간이 흐르고, 단계가 바뀌면 수치가 초기화된다', function () {
  var s = E.newState();
  E.hatch(s, 'agumon', MORNING);
  E.tick(s, MORNING + H);
  assert.equal(s.mon.species, 'koromon');
  assert.equal(s.mon.c.mistakes, 0);
  E.tick(s, MORNING + 25 * H);
  assert.equal(s.mon.species, 'agumon');
  assert.ok(s.meta.dex.botamon.raised && s.meta.dex.koromon.raised && s.meta.dex.agumon.raised);
});

test('배고픔 호출을 15분 넘게 두면 실수 1, 한 번만 센다', function () {
  var s = at('agumon', 'child', 'agumon');
  s.mon.hunger = 0; s.mon.strength = 4;
  E.tick(s, MORNING + 14 * M);
  assert.equal(s.mon.c.mistakes, 0);
  E.tick(s, MORNING + 15 * M);
  assert.equal(s.mon.c.mistakes, 1);
  E.tick(s, MORNING + 50 * M);
  assert.equal(s.mon.c.mistakes, 1);
  E.feed(s);
  assert.equal(s.mon.hunger, 1);
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

test('배변을 3시간 넘게 두면 위생 실수', function () {
  var s = at('agumon', 'child', 'agumon');
  s.mon.poops = [{ age: 0 }];
  s.mon.poopT = -9999; // 새 배변은 막는다
  E.tick(s, MORNING + 179 * M);
  assert.equal(s.mon.c.hygiene, 0);
  E.tick(s, MORNING + 180 * M);
  assert.equal(s.mon.c.hygiene, 1);
  E.clean(s);
  assert.equal(s.mon.poops.length, 0);
});

test('수면: 불을 30분 넘게 안 끄거나 깨우면 수면 방해', function () {
  var s = at('gabumon', 'child', 'gabumon');
  var night = Date.UTC(2026, 0, 5, 21, 0);
  s.mon.lastTick = night - M; s.mon.stageEnd = null; s.mon.hunger = 4; s.mon.strength = 4;
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
  assert.equal(s.mon.sleeping, false);
  E.tick(s, night + 3 * H + 11 * M);
  assert.equal(s.mon.sleeping, true, '잠깐 뒤 다시 잔다');
  E.tick(s, Date.UTC(2026, 0, 6, 7, 1));
  assert.equal(s.mon.sleeping, false);
  assert.equal(s.mon.lights, true);
});

test('불을 끄면 수면 방해가 없다', function () {
  var s = at('gabumon', 'child', 'gabumon');
  var night = Date.UTC(2026, 0, 5, 21, 0);
  s.mon.lastTick = night - M; s.mon.stageEnd = null;
  E.tick(s, night + 5 * M);
  E.toggleLights(s);
  E.tick(s, night + 2 * H);
  assert.equal(s.mon.c.sleep, 0);
});

test('스카몬 구제: 하루 동안 위생 실수·과식 0 이면 정상 성숙기', function () {
  var s = at('agumon', 'child', 'agumon', { hygiene: 4 });
  s.mon.stageEnd = MORNING + M; s.mon.poops = []; s.mon.poopT = -1e9;
  E.tick(s, MORNING + M);
  assert.equal(s.mon.species, 'sukamon');
  assert.equal(s.mon.stageEnd, null);
  s.mon.hunger = 4; s.mon.strength = 4; s.mon.hungerT = -1e9; s.mon.strengthT = -1e9;
  E.tick(s, MORNING + M + 24 * H);
  assert.equal(s.mon.species, 'greymon');

  s = at('agumon', 'child', 'agumon', { overfeed: 6 });
  s.mon.stageEnd = MORNING + M;
  E.tick(s, MORNING + M);
  s.mon.hunger = 4;
  E.feed(s);
  assert.equal(E.warning(s.mon, MORNING + 2 * M), true, '구제 실패 예고');
  E.tick(s, MORNING + M + 24 * H);
  assert.equal(s.mon.species, 'sukamon');
  assert.equal(s.mon.rescueUntil, null);
});

test('잘못된 진화 하루 전에는 경고한다', function () {
  var s = at('agumon', 'child', 'agumon', { mistakes: 6 });
  s.mon.stageEnd = MORNING + 25 * H;
  assert.equal(E.warning(s.mon, MORNING), false, '아직 하루 넘게 남음');
  assert.equal(E.warning(s.mon, MORNING + 2 * H), true);
  s.mon.c.mistakes = 0; s.mon.c.training = 20;
  assert.equal(E.warning(s.mon, MORNING + 2 * H), false);
});

test('아머진화: 디지멘탈, 하루 1회, 48시간', function () {
  var s = at('veemon', 'child', 'veemon');
  s.mon.stageEnd = MORNING + 70 * H;
  assert.equal(E.canArmor(s, MORNING), false);
  s.meta.items.digimental = 1;
  assert.equal(E.armor(s, MORNING).ok, true);
  assert.equal(E.form(s.mon), 'flamedramon');
  assert.equal(E.battleStage(s.mon), E.STAGE_IDX.adult);
  assert.equal(E.canArmor(s, MORNING + H), false);
  E.train(s, 3);
  assert.equal(s.mon.c.training, 1, '아머 중에도 수치는 쌓인다');
  s.mon.hungerT = -1e9; s.mon.strengthT = -1e9; s.mon.poopT = -1e9; s.mon.hunger = 4; s.mon.strength = 4;
  E.tick(s, MORNING + 48 * H);
  assert.equal(E.form(s.mon), 'veemon');
});

test('바코드: 같은 코드면 같은 디지몬, 단계는 같거나 한 단계 위', function () {
  var a = E.wildFor('8801234567893', 2), b = E.wildFor('8801234567893', 2);
  assert.deepEqual(a, b);
  var grades = { normal: 0, rare: 0, boss: 0 };
  for (var i = 0; i < 6000; i++) {
    var w = E.wildFor(String(880000000000 + i * 7919), 3);
    grades[w.grade === 'boss' ? 'boss' : w.grade === 'rare' ? 'rare' : 'normal']++;
    assert.ok(w.level >= 3 && w.level <= 4, '단계 ' + w.level);
    assert.ok(D.SPECIES[w.id], w.id);
    if (w.grade === 'boss') assert.equal(D.SPECIES[w.id].stage, 'perfect');
  }
  assert.ok(Math.abs(grades.normal / 6000 - 0.70) < 0.03, JSON.stringify(grades));
  assert.ok(Math.abs(grades.boss / 6000 - 0.05) < 0.015, JSON.stringify(grades));
  // 성장기에는 보스가 없어서 희귀로 바뀐다
  for (i = 0; i < 2000; i++) assert.notEqual(E.wildFor('c' + i, 2).grade, 'boss');
  // 프리 속성은 성장기에서만 나온다
  for (i = 0; i < 2000; i++) {
    var x = E.wildFor('f' + i, 3);
    if (x.level >= 3) assert.notEqual(x.attr, 'free');
  }
});

test('상성: 백신 → 바이러스 → 데이터 → 백신, 프리는 영향 없음', function () {
  assert.ok(E.advantage('vaccine', 'virus') > 1);
  assert.ok(E.advantage('virus', 'data') > 1);
  assert.ok(E.advantage('data', 'vaccine') > 1);
  assert.ok(E.advantage('virus', 'vaccine') < 1);
  assert.equal(E.advantage('free', 'virus'), 1);
  assert.equal(E.advantage('data', 'free'), 1);
});

test('스캔 제한: 하루 5회, 같은 바코드는 하루 1번 배틀', function () {
  var s = at('agumon', 'child', 'agumon');
  var r = E.scan(s, '111', MORNING);
  assert.equal(r.ok, true);
  var b = E.startBattle(s, r.wild);
  b.over = true; b.won = true;
  E.endBattle(s, b, MORNING);
  assert.equal(E.scan(s, '111', MORNING).reason, 'today');
  for (var i = 0; i < 4; i++) assert.equal(E.scan(s, 'x' + i, MORNING).ok, true);
  assert.equal(E.scan(s, 'y', MORNING).reason, 'limit');
  assert.equal(E.scan(s, 'y', MORNING + 24 * H).ok, true, '다음 날 풀린다');
  assert.equal(E.scan(s, '111', MORNING + 24 * H).ok, true);
});

test('유년기와 자는 동안은 배틀할 수 없다', function () {
  var s = E.newState();
  E.hatch(s, 'agumon', MORNING);
  assert.equal(E.scan(s, '1', MORNING).reason, 'baby');
});

test('배틀 결과: 수치·도감·보상·배고픔', function () {
  var s = at('agumon', 'adult', 'greymon');
  s.mon.hunger = 0;
  var w = { id: 'myotismon', name: '묘티스몬', attr: 'virus', grade: 'boss', level: 4, code: 'z' };
  var b = E.startBattle(s, w);
  b.over = true; b.won = true;
  assert.equal(E.endBattle(s, b, MORNING).reward, 'digimental');
  assert.equal(s.meta.items.digimental, 1);
  assert.ok(s.meta.dex.myotismon.beaten);
  assert.equal(s.mon.c.hungryBattles, 1);
  assert.equal(s.mon.c.bossWins, 1);
  b = E.startBattle(s, Object.assign({}, w, { code: 'z2' }));
  b.over = true; b.won = true;
  assert.equal(E.endBattle(s, b, MORNING).reward, 'chip');

  s.mon.hunger = 3;
  for (var i = 0; i < 5; i++) {
    b = E.startBattle(s, Object.assign({}, w, { code: 'l' + i }));
    b.over = true; b.won = false;
    E.endBattle(s, b, MORNING);
  }
  assert.equal(s.mon.c.maxStreak, 5);
  assert.equal(s.mon.c.battles, 7);
  assert.equal(s.mon.hunger, 0);
});

test('배틀 턴이 끝까지 진행된다', function () {
  var s = at('guilmon', 'ultimate', 'megidramon');
  var b = E.startBattle(s, E.wildFor('abc', 5));
  var r = E.rng(42), ignored = 0, n = 0;
  while (!b.over) { if (E.battleTurn(b, 'attack', r).ignored) ignored++; n++; }
  assert.ok(n <= 20);
  assert.ok(b.php === 0 || b.ehp === 0 || n === 20);
  assert.equal(b.ignores, true);
});

test('수명이 다하면 기록에 남는다', function () {
  var s = at('agumon', 'ultimate', 'wargreymon');
  s.mon.stageEnd = null;
  s.mon.deathAt = MORNING + 5 * M;
  E.tick(s, MORNING + 10 * M);
  assert.equal(s.mon.dead, true);
  assert.equal(s.meta.history[0].species, 'wargreymon');
});
