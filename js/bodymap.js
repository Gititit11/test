/* 최근 운동량을 근육 부위별로 모아 인체 그림에 표시한다.
 * 세기 표현은 단일 색조 순차 램프(다크 배경 기준 검증 완료).
 */
(function (global) {
  'use strict';

  // 그림에 표시하는 근육 그룹
  var GROUPS = [
    { id: 'traps',      ko: '승모근' },
    { id: 'shoulders',  ko: '어깨' },
    { id: 'chest',      ko: '가슴' },
    { id: 'lats',       ko: '등(광배)' },
    { id: 'lowerback',  ko: '허리(기립근)' },
    { id: 'biceps',     ko: '이두' },
    { id: 'triceps',    ko: '삼두' },
    { id: 'forearms',   ko: '전완' },
    { id: 'abs',        ko: '복근' },
    { id: 'obliques',   ko: '복사근' },
    { id: 'glutes',     ko: '둔근' },
    { id: 'quads',      ko: '대퇴사두' },
    { id: 'hamstrings', ko: '햄스트링' },
    { id: 'calves',     ko: '종아리' }
  ];
  var LABEL = {};
  GROUPS.forEach(function (g) { LABEL[g.id] = g.ko; });

  // 운동 DB 의 근육 이름 → 그룹 (부분 일치, 위에서부터 검사)
  var ALIASES = [
    ['대흉근', 'chest'],
    ['광배', 'lats'], ['대원', 'lats'],
    ['능형', 'traps'], ['승모', 'traps'],
    ['삼각', 'shoulders'], ['회전근개', 'shoulders'],
    ['이두', 'biceps'],
    ['삼두', 'triceps'],
    ['전완', 'forearms'], ['상완요골', 'forearms'],
    ['복직', 'abs'], ['하복부', 'abs'], ['복횡', 'abs'], ['코어', 'abs'], ['고관절굴곡', 'abs'],
    ['복사', 'obliques'],
    ['척추기립', 'lowerback'],
    ['둔근', 'glutes'],
    ['대퇴사두', 'quads'], ['내전근', 'quads'],
    ['햄스트링', 'hamstrings'],
    ['비복', 'calves'], ['가자미', 'calves']
  ];
  var FULL_BODY = ['lats', 'shoulders', 'quads', 'glutes'];   // '전신' 표기 운동
  var BY_PART = {                                             // 근육 정보가 없을 때
    '가슴': ['chest'], '등': ['lats'], '어깨': ['shoulders'],
    '팔': ['biceps', 'triceps'], '하체': ['quads', 'hamstrings', 'glutes'],
    '코어': ['abs'], '유산소': ['quads', 'calves']
  };

  var PRIMARY = 1;      // 주동근 1세트
  var SECONDARY = 0.4;  // 보조근 0.4세트

  function groupOf(muscle) {
    for (var i = 0; i < ALIASES.length; i++) {
      if (muscle.indexOf(ALIASES[i][0]) !== -1) return ALIASES[i][1];
    }
    return null;
  }

  // 운동 하나가 어떤 그룹에 얼마만큼 기여하는지
  function contributions(item, exercise) {
    var out = {};
    var muscles = (exercise && exercise.muscles) || [];
    muscles.forEach(function (m, idx) {
      m = String(m).trim();
      if (m === '전신') {
        FULL_BODY.forEach(function (g) { out[g] = Math.max(out[g] || 0, SECONDARY); });
        return;
      }
      var g = groupOf(m);
      if (!g) return;
      var w = idx === 0 ? PRIMARY : SECONDARY;
      out[g] = Math.max(out[g] || 0, w);
    });
    if (!Object.keys(out).length) {
      var fallback = BY_PART[(exercise && exercise.part) || ''] || [];
      fallback.forEach(function (g) { out[g] = PRIMARY; });
    }
    return out;
  }

  // 기간 내 완료 기록을 그룹별로 합산
  function aggregate(sessions, days, findExercise) {
    var since = Date.now() - days * 864e5;
    var acc = {};
    GROUPS.forEach(function (g) { acc[g.id] = { sets: 0, volume: 0, top: {} }; });

    var used = 0;
    sessions.forEach(function (s) {
      if (s.startedAt < since) return;
      used++;
      s.items.forEach(function (it) {
        var ex = findExercise(it.exerciseId);
        var parts = contributions(it, ex);
        var setCount = it.sets.length;
        var vol = it.sets.reduce(function (a, st) {
          if (it.type === 'time') return a;
          return a + (Number(st.reps) || 0) * (Number(st.weight) || 0);
        }, 0);
        Object.keys(parts).forEach(function (g) {
          if (!acc[g]) return;
          var w = parts[g];
          acc[g].sets += setCount * w;
          acc[g].volume += vol * w;
          acc[g].top[it.name] = (acc[g].top[it.name] || 0) + setCount * w;
        });
      });
    });

    var max = 0;
    GROUPS.forEach(function (g) { max = Math.max(max, acc[g.id].sets); });
    return { byGroup: acc, max: max, sessions: used };
  }

  // ── 색 ─────────────────────────────────────────────────
  // 단일 색조(빨강) 순차 램프. 해부도처럼 많이 한 곳일수록 붉고,
  // 적게 한 곳일수록 하얗다. 안 한 곳(IDLE)이 가장 하얗다.
  var RAMP = ['#ffc7b8', '#ffa08c', '#f77358', '#e04434', '#bd1a1a'];
  var IDLE = '#eef1f6';

  function colorFor(value, max) {
    if (!value || !max) return IDLE;
    var i = Math.floor((value / max) * RAMP.length - 1e-9);
    if (i < 0) i = 0;
    if (i > RAMP.length - 1) i = RAMP.length - 1;
    return RAMP[i];
  }

  // ── 인체 그림 ────────────────────────────────────────
  // 경로 데이터는 js/bodyfigure.js (body-muscles, Apache-2.0) 에서 온다.
  function figure(view, data, selected) {
    var F = global.BodyFigure;
    if (!F) return '';
    var paths = F[view] || {};

    var muscles = GROUPS.map(function (g) {
      var d = paths[g.id];
      if (!d || !d.length) return '';
      var load = data.byGroup[g.id] || { sets: 0 };
      var fill = colorFor(load.sets, data.max);
      var cls = 'bm-m' +
        (fill === IDLE ? ' bm-idle' : '') +
        (selected === g.id ? ' bm-on' : '');
      return '<g class="' + cls + '" data-act="bm-sel" data-m="' + g.id + '" fill="' + fill + '">' +
        '<title>' + g.ko + ' · ' + fmtSets(load.sets) + '세트</title>' +
        d.map(function (p) { return '<path d="' + p + '"/>'; }).join('') + '</g>';
    }).join('');

    return '<svg class="bm-svg" viewBox="' + F.viewBox[view] + '" role="img" ' +
      'aria-label="' + (view === 'front' ? '앞모습' : '뒷모습') + ' 부위별 운동량">' +
      '<g class="bm-skin">' +
        (paths.skin || []).map(function (p) { return '<path d="' + p + '"/>'; }).join('') +
      '</g>' +
      muscles +
      '</svg>';
  }

  function fmtSets(n) {
    if (!n) return '0';
    return (Math.round(n * 10) / 10).toString().replace(/\.0$/, '');
  }

  global.BodyMap = {
    GROUPS: GROUPS,
    LABEL: LABEL,
    RAMP: RAMP,
    IDLE: IDLE,
    PRIMARY: PRIMARY,
    SECONDARY: SECONDARY,
    aggregate: aggregate,
    colorFor: colorFor,
    figure: figure,
    fmtSets: fmtSets
  };
})(window);
