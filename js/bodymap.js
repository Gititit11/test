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
  var IDLE = '#374255';

  function colorFor(value, max) {
    if (!value || !max) return IDLE;
    var i = Math.floor((value / max) * RAMP.length - 1e-9);
    if (i < 0) i = 0;
    if (i > RAMP.length - 1) i = RAMP.length - 1;
    return RAMP[i];
  }

  // ── 인체 그림 ──────────────────────────────────────────
  // 오른쪽 절반만 정의하고 좌우 대칭으로 한 번 더 그린다.
  // 오른쪽 절반만 좌표를 정의하고 좌우 대칭으로 한 번 더 그린다.
  // viewBox 220 x 450, 중심선 x=110.
  // 비율: 머리 높이 50 → 전신 8등신, 어깨너비 = 머리너비 2.4배, 허리 < 골반 < 어깨.

  var SILHOUETTE =
    'M110,74 ' +
    'C120,74 128,79 136,86 ' +          // 승모 능선
    'C146,92 154,100 156,114 ' +        // 삼각근
    'C158,132 158,152 159,172 ' +       // 위팔 바깥
    'C160,196 162,220 163,244 ' +       // 팔꿈치 → 아래팔
    'C164,266 164,282 163,292 ' +       // 손목
    'C162,306 154,311 150,303 ' +       // 손
    'C147,296 147,286 146,276 ' +
    'C144,250 142,222 141,196 ' +       // 아래팔 안쪽
    'C140,170 139,146 138,124 ' +       // 위팔 안쪽 → 겨드랑이
    'C138,148 134,170 130,192 ' +       // 몸통 옆선 → 허리
    'C134,202 138,210 139,222 ' +       // 골반
    'C142,240 142,262 141,282 ' +       // 허벅지 바깥
    'C140,306 136,318 134,330 ' +       // 무릎
    'C133,350 131,378 127,400 ' +       // 종아리
    'C125,410 124,416 124,420 ' +       // 발목
    'C130,424 132,432 126,435 ' +       // 발
    'L112,435 ' +
    'C110,429 110,424 110,420 ' +
    'C112,396 114,360 113,330 ' +
    'C114,300 112,272 110,248 Z';

  var BASE = '<path d="' + SILHOUETTE + '"/>';

  var CENTER =
    '<ellipse cx="110" cy="44" rx="18" ry="23"/>' +      // 머리
    '<path d="M99,56 L121,56 L124,82 L96,82 Z"/>';      // 목

  // 어깨·팔은 앞뒤 위치가 같아 공유한다
  var DELT =
    'M133,88 C146,94 156,106 158,124 C157,132 152,135 148,131 ' +
    'C142,125 138,113 136,103 C135,97 132,91 133,88 Z';
  var UPPER_ARM =
    'M137,118 C143,130 149,138 153,143 C156,162 158,180 159,197 ' +
    'C155,203 145,203 142,196 C140,172 138,142 137,118 Z';
  var FOREARM =
    'M142,201 C150,197 159,202 161,221 C163,245 164,269 163,285 ' +
    'C157,293 149,291 147,281 C145,255 143,223 142,201 Z';
  var CALF =
    'M117,342 C129,340 134,356 133,378 C132,394 130,404 128,412 ' +
    'L116,412 C113,392 114,362 117,342 Z';

  // 근육 결 — 색과 무관한 형태 정보 (클릭 대상 아님)
  var LINES = {
    front:
      '<path d="M115,163 L126,164 M115,181 L125,182 M115,197 L123,198"/>' +   // 복직근 구분
      '<path d="M126,268 C131,290 133,312 133,328"/>' +        // 대퇴 직근/외측광근
      '<path d="M122,356 C126,374 127,394 126,408"/>' +        // 종아리 갈래
      '<path d="M119,117 C126,120 131,125 134,131"/>',         // 대흉근 결
    back:
      '<path d="M117,146 C126,142 133,136 138,133"/>' +        // 광배 상연
      '<path d="M119,232 C129,232 136,236 140,241"/>' +        // 둔근 결
      '<path d="M124,288 C130,306 132,324 132,336"/>' +        // 햄스트링 갈래
      '<path d="M122,356 C126,374 127,394 126,408"/>'
  };

  var FRONT = [
    ['traps',     '<path d="M113,72 C121,74 130,80 137,88 L133,99 ' +
                    'C127,90 119,85 113,83 Z"/>'],
    ['shoulders', '<path d="' + DELT + '"/>'],
    ['chest',     '<path d="M113,110 L133,116 C137,121 137,130 134,137 ' +
                    'L118,142 C114,134 113,121 113,110 Z"/>'],
    ['abs',       '<path d="M113,145 L127,148 C127,168 125,190 121,208 L113,209 Z"/>'],
    ['obliques',  '<path d="M129,147 C133,162 132,185 125,208 ' +
                    'C122,202 127,166 129,147 Z"/>'],
    ['biceps',    '<path d="' + UPPER_ARM + '"/>'],
    ['forearms',  '<path d="' + FOREARM + '"/>'],
    ['quads',     '<path d="M114,252 C129,248 141,258 141,282 ' +
                    'C141,304 138,320 135,332 L120,332 C116,312 113,284 114,252 Z"/>'],
    ['calves',    '<path d="' + CALF + '"/>']
  ];

  var BACK = [
    ['traps',      '<path d="M113,72 C123,75 133,81 140,90 ' +
                     'C136,111 125,126 113,130 Z"/>'],
    ['shoulders',  '<path d="' + DELT + '"/>'],
    ['lats',       '<path d="M114,132 C127,128 135,121 139,131 ' +
                     'C142,151 133,177 119,193 L114,196 Z"/>'],
    ['lowerback',  '<path d="M114,175 C123,173 129,181 128,194 ' +
                     'C126,207 119,214 114,216 Z"/>'],
    ['triceps',    '<path d="' + UPPER_ARM + '"/>'],
    ['forearms',   '<path d="' + FOREARM + '"/>'],
    ['glutes',     '<path d="M114,220 C129,215 142,227 141,245 ' +
                     'C140,263 127,271 114,269 Z"/>'],
    ['hamstrings', '<path d="M114,273 C129,269 141,281 141,303 ' +
                     'C141,323 138,335 135,341 L120,341 C116,321 113,297 114,273 Z"/>'],
    ['calves',     '<path d="' + CALF + '"/>']
  ];

  function figure(view, data, selected) {
    var shapes = view === 'front' ? FRONT : BACK;
    var half = shapes.map(function (s) {
      var id = s[0];
      var g = data.byGroup[id] || { sets: 0 };
      var fill = colorFor(g.sets, data.max);
      var on = selected === id ? ' bm-on' : '';
      var idle = fill === IDLE ? ' stroke="#4a5568"' : '';
      return '<g class="bm-m' + on + '" data-act="bm-sel" data-m="' + id + '" fill="' + fill + '"' + idle + '>' +
        '<title>' + LABEL[id] + ' · ' + fmtSets(g.sets) + '세트</title>' + s[1] + '</g>';
    }).join('');

    return '<svg class="bm-svg" viewBox="0 0 220 450" role="img" ' +
      'aria-label="' + (view === 'front' ? '앞모습' : '뒷모습') + ' 부위별 운동량">' +
      '<g class="bm-base">' + CENTER + BASE +
        '<g transform="translate(220,0) scale(-1,1)">' + BASE + '</g></g>' +
      '<g class="bm-muscles">' + half +
        '<g transform="translate(220,0) scale(-1,1)">' + half + '</g></g>' +
      '<g class="bm-lines">' + LINES[view] +
        '<g transform="translate(220,0) scale(-1,1)">' + LINES[view] + '</g></g>' +
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
