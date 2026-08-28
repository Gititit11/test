/* 최근 7일 운동량을 근육 부위별로 모아 인체 그림에 표시한다.
 * 색은 부위마다 정해진 주당 볼륨 랜드마크(MV/MEV/MAV/MRV)로 판정한다.
 */
(function (global) {
  'use strict';

  // 그림에 표시하는 근육 그룹.
  // mv/mev/mav/mrv 는 주당 세트 수 기준선이다 (Israetel 계열 볼륨 랜드마크).
  //   MV  유지에 필요한 최소치     MEV 성장이 시작되는 최소치
  //   MAV 가장 효율적인 구간의 시작 MRV 회복 가능한 한계
  // 문헌의 일반 권장치라 개인차가 크다. 우리 세트 수는 보조근을 0.4 로 세는
  // 가중치라 직접 세트만 세는 원 표와 완전히 같지는 않다.
  var GROUPS = [
    { id: 'traps',      ko: '승모근',      mv: 0, mev: 6,  mav: 16, mrv: 26 },
    { id: 'shoulders',  ko: '어깨',        mv: 0, mev: 8,  mav: 16, mrv: 26 },
    { id: 'chest',      ko: '가슴',        mv: 8, mev: 10, mav: 16, mrv: 22 },
    { id: 'lats',       ko: '등(광배)',    mv: 8, mev: 10, mav: 18, mrv: 25 },
    { id: 'lowerback',  ko: '허리(기립근)', mv: 0, mev: 4,  mav: 10, mrv: 16 },
    { id: 'biceps',     ko: '이두',        mv: 4, mev: 8,  mav: 16, mrv: 26 },
    { id: 'triceps',    ko: '삼두',        mv: 4, mev: 6,  mav: 12, mrv: 18 },
    { id: 'forearms',   ko: '전완',        mv: 2, mev: 6,  mav: 13, mrv: 20 },
    { id: 'abs',        ko: '복근',        mv: 0, mev: 6,  mav: 16, mrv: 25 },
    { id: 'obliques',   ko: '복사근',      mv: 0, mev: 4,  mav: 12, mrv: 20 },
    { id: 'glutes',     ko: '둔근',        mv: 0, mev: 4,  mav: 12, mrv: 16 },
    { id: 'quads',      ko: '대퇴사두',    mv: 6, mev: 8,  mav: 15, mrv: 20 },
    { id: 'hamstrings', ko: '햄스트링',    mv: 4, mev: 6,  mav: 13, mrv: 20 },
    { id: 'calves',     ko: '종아리',      mv: 6, mev: 8,  mav: 14, mrv: 20 }
  ];
  var MARK = {};
  GROUPS.forEach(function (g) { MARK[g.id] = g; });
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

    return { byGroup: acc, sessions: used };
  }

  // ── 구간과 색 ──────────────────────────────────────────
  // 그 주에 제일 많이 한 부위를 기준으로 삼던 상대 척도를 버리고,
  // 부위마다 정해진 볼륨 랜드마크로 절대 판정한다. 그래서 가볍게 한 주는
  // 전체가 옅게, 잘 채운 주는 전체가 짙게 나온다.
  //
  // 색은 청록 램프로 유지 → 최적까지 짙어지고, 양쪽 끝에 경고색을 하나씩
  // 둔다. 유지에도 못 미치는 부족은 노랑, 회복 한계를 넘은 초과는 빨강.
  // 많이 할수록 좋은 값이 아니라 모자라도 넘쳐도 나쁜 값이라, 가운데가
  // 좋고 양 끝이 눈에 띄는 배치가 뜻과 맞는다.
  // 다크 표면(#1b2029) 기준 검증: 청록 램프 명도 단조·인접 ΔL 0.09~0.10·
  // 단일 색조, 부족·초과와 나머지 모든 구간의 색약 ΔE 11.6 이상·정상시각
  // 15.3 이상, 여섯 색 모두 표면 대비 4:1 이상.
  var BANDS = [
    { key: 'none',  ko: '안 함', color: '#eef1f6', desc: '이번 주에 하지 않았습니다' },
    { key: 'below', ko: '부족',  color: '#ebd873', desc: '유지에 필요한 양(MV)에 못 미칩니다' },
    { key: 'keep',  ko: '유지',  color: '#77d5c2', desc: '유지는 되지만 성장 자극은 부족합니다 (MV~MEV)' },
    { key: 'grow',  ko: '성장',  color: '#1dbaa3', desc: '성장이 일어나는 구간입니다 (MEV~MAV)' },
    { key: 'best',  ko: '최적',  color: '#009c86', desc: '회복 범위 안에서 가장 효율이 좋은 구간입니다 (MAV~MRV)' },
    { key: 'over',  ko: '초과',  color: '#e8443c', desc: '회복 한계(MRV)를 넘었습니다' }
  ];

  // 세트 수가 어느 구간에 있는지. mv 나 mev 가 0 인 부위는 그 구간을 건너뛴다.
  function bandOf(sets, groupId) {
    var m = MARK[groupId];
    if (!m || !sets) return 0;
    if (sets < m.mv) return 1;
    if (sets < m.mev) return 2;
    if (sets < m.mav) return 3;
    if (sets <= m.mrv) return 4;
    return 5;
  }

  function colorFor(sets, groupId) {
    return BANDS[bandOf(sets, groupId)].color;
  }

  // 다음으로 할 일 한 줄. 성장 아래면 MEV 까지, 성장이면 MAV 까지 남은 양을
  // 알려 주고, 초과면 얼마나 넘었는지 말한다.
  function adviceFor(sets, groupId) {
    var m = MARK[groupId];
    if (!m) return '';
    var b = bandOf(sets, groupId);
    if (b === 5) return 'MRV보다 ' + fmtSets(sets - m.mrv) + '세트 많습니다. 줄이는 편이 좋습니다';
    if (b === 4) return '최적 구간입니다. 이대로 유지하세요';
    if (b === 3) return '최적 구간까지 ' + fmtSets(m.mav - sets) + '세트 남았습니다';
    return '성장 구간까지 ' + fmtSets(m.mev - sets) + '세트 남았습니다';
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
      var band = BANDS[bandOf(load.sets, g.id)];
      var cls = 'bm-m' + (selected === g.id ? ' bm-on' : '');
      return '<g class="' + cls + '" data-act="bm-sel" data-m="' + g.id + '" fill="' + band.color + '">' +
        '<title>' + g.ko + ' · ' + fmtSets(load.sets) + '세트 · ' + band.ko + '</title>' +
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
    MARK: MARK,
    BANDS: BANDS,
    bandOf: bandOf,
    adviceFor: adviceFor,
    PRIMARY: PRIMARY,
    SECONDARY: SECONDARY,
    aggregate: aggregate,
    colorFor: colorFor,
    figure: figure,
    fmtSets: fmtSets
  };
})(window);
