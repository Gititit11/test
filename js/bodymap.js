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
  // 단일 색조(파랑) 순차 램프. 어두운 배경이라 값이 클수록 밝아진다.
  var RAMP = ['#2f5290', '#3a6bc4', '#4d84ea', '#7ea6ff', '#b8ceff'];
  var IDLE = '#303a4c';

  function colorFor(value, max) {
    if (!value || !max) return IDLE;
    var i = Math.floor((value / max) * RAMP.length - 1e-9);
    if (i < 0) i = 0;
    if (i > RAMP.length - 1) i = RAMP.length - 1;
    return RAMP[i];
  }

  // ── 인체 그림 ──────────────────────────────────────────
  // 오른쪽 절반만 정의하고 좌우 대칭으로 한 번 더 그린다.
  var BASE = [
    // 몸통
    '<path d="M100,64 C112,64 124,70 133,80 C140,90 139,104 137,118 ' +
      'C135,140 130,158 122,172 C129,182 132,190 131,202 ' +
      'C129,224 116,242 100,246 Z"/>',
    // 팔 (어깨~손)
    '<path d="M133,78 C146,84 153,100 152,118 C151,142 150,168 148,190 ' +
      'C147,204 146,214 143,222 C136,224 132,218 133,208 ' +
      'C135,186 134,158 132,132 C131,112 128,90 133,78 Z"/>',
    // 다리 (골반~발목)
    '<path d="M100,242 C114,240 128,250 130,268 C132,292 126,312 123,330 ' +
      'C121,352 119,378 117,394 C116,406 106,408 105,396 ' +
      'C104,376 104,352 104,330 C102,308 100,282 100,262 Z"/>',
    // 발
    '<path d="M105,396 C114,394 123,402 123,410 C123,416 107,416 105,412 Z"/>'
  ].join('');

  var CENTER = '<ellipse cx="100" cy="34" rx="17" ry="20"/>' +
    '<path d="M88,52 L112,52 L114,68 L86,68 Z"/>';

  var FRONT = [
    ['traps',     '<path d="M103,64 C112,66 121,71 128,79 L125,86 C117,78 110,74 103,71 Z"/>'],
    ['shoulders', '<path d="M129,79 C142,84 150,97 149,113 C139,114 132,105 129,93 Z"/>'],
    ['chest',     '<path d="M103,87 C113,85 123,90 126,98 C127,107 121,114 111,115 L103,114 Z"/>'],
    ['abs',       '<path d="M103,119 L116,121 C116,140 114,158 111,172 L103,174 Z"/>'],
    ['obliques',  '<path d="M118,122 C126,134 126,155 117,173 C115,157 117,139 118,122 Z"/>'],
    ['biceps',    '<path d="M137,116 C147,118 150,132 148,148 C146,158 139,158 137,148 ' +
                    'C135,136 135,124 137,116 Z"/>'],
    ['forearms',  '<path d="M138,166 C148,169 150,185 148,201 C146,211 140,211 138,201 ' +
                    'C136,187 136,176 138,166 Z"/>'],
    ['quads',     '<path d="M104,250 C119,247 129,257 128,277 C127,297 123,311 117,315 ' +
                    'C109,313 105,296 104,278 Z"/>'],
    ['calves',    '<path d="M107,328 C119,327 124,343 122,363 C120,381 114,389 110,385 ' +
                    'C106,373 105,346 107,328 Z"/>']
  ];

  var BACK = [
    ['traps',      '<path d="M103,63 C114,66 124,73 130,82 C126,100 116,110 103,114 Z"/>'],
    ['shoulders',  '<path d="M129,79 C142,84 150,97 149,113 C139,114 132,105 129,93 Z"/>'],
    ['lats',       '<path d="M103,117 C116,114 126,107 131,117 C134,133 126,155 114,169 ' +
                     'L103,173 Z"/>'],
    ['lowerback',  '<path d="M103,152 C111,150 116,156 115,166 C113,178 108,185 103,187 Z"/>'],
    ['triceps',    '<path d="M137,117 C148,120 151,134 149,150 C147,160 140,160 138,150 ' +
                     'C136,138 136,126 137,117 Z"/>'],
    ['forearms',   '<path d="M138,166 C148,169 150,185 148,201 C146,211 140,211 138,201 ' +
                     'C136,187 136,176 138,166 Z"/>'],
    ['glutes',     '<path d="M103,196 C117,192 131,202 130,218 C128,234 115,242 103,240 Z"/>'],
    ['hamstrings', '<path d="M104,250 C119,247 129,257 128,277 C127,297 123,311 117,315 ' +
                     'C109,313 105,296 104,278 Z"/>'],
    ['calves',     '<path d="M107,326 C121,326 126,344 124,364 C122,382 114,390 110,386 ' +
                     'C106,374 105,344 107,326 Z"/>']
  ];

  function figure(view, data, selected) {
    var shapes = view === 'front' ? FRONT : BACK;
    var half = shapes.map(function (s) {
      var id = s[0];
      var g = data.byGroup[id] || { sets: 0 };
      var fill = colorFor(g.sets, data.max);
      var on = selected === id ? ' bm-on' : '';
      return '<g class="bm-m' + on + '" data-act="bm-sel" data-m="' + id + '" fill="' + fill + '">' +
        '<title>' + LABEL[id] + ' · ' + fmtSets(g.sets) + '세트</title>' + s[1] + '</g>';
    }).join('');

    return '<svg class="bm-svg" viewBox="0 0 200 424" role="img" ' +
      'aria-label="' + (view === 'front' ? '앞모습' : '뒷모습') + ' 부위별 운동량">' +
      '<g class="bm-base">' + CENTER + BASE +
        '<g transform="translate(200,0) scale(-1,1)">' + BASE + '</g></g>' +
      half + '<g transform="translate(200,0) scale(-1,1)">' + half + '</g>' +
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
