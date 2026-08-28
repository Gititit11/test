/* 근력운동 칼로리 추정
 *
 * 모델: 기초 구간 + 역학적 일
 *   전체 세션 시간에 휴식 수준의 대사량을 깔고(기초 구간),
 *   실제로 들어올린 일(무게 × 가동거리 × 횟수)을 그 위에 더한다.
 *   시간형 운동(플랭크·유산소)은 해당 시간만큼 MET 차이를 더한다.
 *
 * 순수 MET 방식은 무게가 결과에 들어가지 않아(40kg 벤치와 100kg 벤치가 같은 값)
 * 증량이 반영되지 않는다. 역학적 일 항을 섞어 그 문제를 없앴다.
 *
 * 계수는 모두 통용되는 값보다 소모가 적게 나오는 쪽으로 잡았다.
 * 추정치이며 오차는 ±20~30% 수준이다.
 */
(function (global) {
  'use strict';

  var CONFIG = {
    G: 9.81,                 // 중력가속도 (m/s²)
    J_PER_KCAL: 4184,
    MET_REST: 1.8,           // 세트 사이 휴식. 일반적으로 서서 쉬기 2.0 → 보수적으로 1.8
    ECCENTRIC: 1.2,          // 내리는 동작 가산. 일반적으로 1.3 → 1.2
    EFFICIENCY: 0.25,        // 근수축 효율. 통용 0.20~0.25 → 높은 쪽(=소모 적게)
    MAX_MINUTES: 180,        // 앱을 켜둔 채 방치한 경우를 대비한 상한
    TAIL_MINUTES: 5,         // 첫 세트 전 준비·마지막 세트 후 정리 시간
    MIN_PER_SET: 1.2         // 세트당 최소 소요 시간(분). 보통 1.5~2.2분 → 보수적으로 1.2
  };

  // 가동거리(m). 운동별 지정이 없으면 부위 기본값을 쓴다. 모두 넉넉하지 않게 잡았다.
  var ROM_BY_PART = {
    '가슴': 0.35, '등': 0.40, '어깨': 0.40, '팔': 0.32,
    '하체': 0.40, '코어': 0.25, '유산소': 0.30
  };
  var ROM = {
    'x-barbell-back-squat': 0.50, 'x-front-squat': 0.50, 'x-smith-machine-squat': 0.45,
    'x-hack-squat': 0.45, 'x-goblet-squat': 0.45, 'x-leg-press': 0.40,
    'x-conventional-deadlift': 0.50, 'x-sumo-deadlift': 0.45, 'x-romanian-deadlift': 0.35,
    'x-lunge': 0.40, 'x-walking-lunge': 0.40, 'x-bulgarian-split-squat': 0.40, 'x-step-up': 0.40,
    'x-barbell-hip-thrust': 0.30, 'x-glute-bridge': 0.25,
    'x-leg-extension': 0.40, 'x-lying-leg-curl': 0.35, 'x-seated-leg-curl': 0.35,
    'x-standing-calf-raise': 0.12, 'x-seated-calf-raise': 0.12,
    'x-hip-abduction-machine': 0.25, 'x-hip-adduction-machine': 0.25,
    'x-barbell-bench-press': 0.35, 'x-incline-barbell-bench-press': 0.38,
    'x-dumbbell-bench-press': 0.38, 'x-chest-press-machine': 0.35, 'x-pec-deck-fly': 0.40,
    'x-push-up': 0.30, 'x-chest-dip': 0.35,
    'x-overhead-press': 0.50, 'x-dumbbell-shoulder-press': 0.50, 'x-shoulder-press-machine': 0.45,
    'x-dumbbell-lateral-raise': 0.45, 'x-cable-lateral-raise': 0.45, 'x-front-raise': 0.45,
    'x-barbell-shrug': 0.12, 'x-dumbbell-shrug': 0.12,
    'x-lat-pulldown': 0.50, 'x-pull-up': 0.55, 'x-chin-up': 0.55,
    'x-seated-cable-row': 0.45, 'x-bent-over-barbell-row': 0.40, 'x-one-arm-dumbbell-row': 0.40,
    'x-barbell-curl': 0.35, 'x-dumbbell-curl': 0.35, 'x-hammer-curl': 0.35,
    'x-triceps-pushdown': 0.30, 'x-rope-pushdown': 0.30, 'x-skull-crusher': 0.35,
    'x-crunch': 0.20, 'x-sit-up': 0.35, 'x-leg-raise': 0.40, 'x-hanging-leg-raise': 0.45
  };

  // 자기 체중 중 실제로 들어올리는 비율. 해부학적 추정치보다 낮게 잡았다.
  var BODY_LOAD = {
    'x-barbell-back-squat': 0.75, 'x-front-squat': 0.75, 'x-smith-machine-squat': 0.70,
    'x-hack-squat': 0.55, 'x-goblet-squat': 0.75,
    'x-conventional-deadlift': 0.30, 'x-sumo-deadlift': 0.30, 'x-romanian-deadlift': 0.25,
    'x-lunge': 0.60, 'x-walking-lunge': 0.60, 'x-bulgarian-split-squat': 0.60, 'x-step-up': 0.60,
    'x-barbell-hip-thrust': 0.40, 'x-glute-bridge': 0.35,
    'x-push-up': 0.60, 'x-wide-push-up': 0.60,
    'x-pull-up': 0.90, 'x-chin-up': 0.90, 'x-chest-dip': 0.85, 'x-triceps-dip': 0.85,
    'x-back-extension': 0.40, 'x-crunch': 0.25, 'x-sit-up': 0.35,
    'x-leg-raise': 0.30, 'x-hanging-leg-raise': 0.35, 'x-russian-twist': 0.20,
    'x-burpee': 0.60, 'x-mountain-climber': 0.25
  };
  var BODY_LOAD_DEFAULT_BODYWEIGHT = 0.45;   // 표에 없는 맨몸 운동

  // 시간형 운동의 MET. 통용값보다 낮게 잡았다 (예: 러닝은 보통 9~11).
  var TIME_MET = {
    'x-treadmill-running': 8.0, 'x-incline-treadmill-walk': 4.5, 'x-stationary-bike': 5.5,
    'x-rowing-machine': 6.0, 'x-elliptical': 5.0, 'x-stair-climber': 6.5,
    'x-jump-rope': 8.5, 'x-battle-rope': 6.5, 'x-farmers-walk': 4.5,
    'x-plank': 2.8, 'x-side-plank': 2.8, 'x-mountain-climber': 6.0
  };
  var TIME_MET_DEFAULT = 3.5;

  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

  function romOf(item, ex) {
    return ROM[item.exerciseId] || ROM_BY_PART[(ex && ex.part) || ''] || 0.35;
  }

  // 바벨·덤벨 무게에 자기 체중 중 움직이는 몫을 더한다
  function loadOf(item, ex, weight, bodyWeight) {
    var id = item.exerciseId;
    // 어시스트 풀업은 기록된 무게가 '도움받는 무게'라 체중에서 빼준다
    if (id === 'x-assisted-pull-up-machine') {
      return Math.max(0, bodyWeight * 0.90 - weight);
    }
    var frac = BODY_LOAD[id];
    if (frac === undefined && ex && ex.equip === '맨몸') frac = BODY_LOAD_DEFAULT_BODYWEIGHT;
    return weight + bodyWeight * (frac || 0);
  }

  function metOf(item, ex) {
    return TIME_MET[item.exerciseId] ||
      (ex && ex.part === '유산소' ? 5.0 : TIME_MET_DEFAULT);
  }

  function metKcal(met, bodyWeight, minutes) {
    return met * 3.5 * bodyWeight / 200 * minutes;   // 1 MET = 3.5 mL O₂/kg/분, O₂ 1L = 5 kcal
  }

  /* 세션 하나의 추정 소모 열량(kcal).
   * 진행 중인 세션이면 체크한 세트만 계산하고 경과 시간은 지금까지로 본다. */
  function session(sess, bodyWeight, findExercise, now) {
    if (!sess || !bodyWeight) return 0;
    var end = sess.finishedAt || now || Date.now();
    var minutes = Math.max(0, Math.min((end - sess.startedAt) / 60000, CONFIG.MAX_MINUTES));

    // 앱만 켜두고 쉰 시간까지 세지 않도록, 실제로 세트를 체크한 구간으로 제한한다.
    // (세트마다 체크 시각을 저장하고 있어 추정이 아니라 기록으로 계산한다)
    var first = Infinity, last = 0, doneSets = 0;
    sess.items.forEach(function (it) {
      it.sets.forEach(function (st) {
        if (st.done === false) return;
        doneSets++;
        if (!st.doneAt) return;
        if (st.doneAt < first) first = st.doneAt;
        if (st.doneAt > last) last = st.doneAt;
      });
    });
    if (last) {
      // 세트 시각이 몰려 기록된 경우를 대비해 세트 수 기준 최소치를 함께 본다
      var active = Math.max((last - first) / 60000, doneSets * CONFIG.MIN_PER_SET);
      minutes = Math.min(minutes, active + CONFIG.TAIL_MINUTES);
    }

    var kcal = metKcal(CONFIG.MET_REST, bodyWeight, minutes);   // 기초 구간

    sess.items.forEach(function (it) {
      var ex = findExercise ? findExercise(it.exerciseId) : null;
      it.sets.forEach(function (st) {
        if (st.done === false) return;
        if (it.type === 'time') {
          var extra = Math.max(0, metOf(it, ex) - CONFIG.MET_REST);
          kcal += metKcal(extra, bodyWeight, num(st.sec) / 60);
        } else {
          var reps = num(st.reps);
          if (!reps) return;
          var load = loadOf(it, ex, num(st.weight), bodyWeight);
          if (load <= 0) return;
          var joules = load * CONFIG.G * romOf(it, ex) * reps * CONFIG.ECCENTRIC;
          kcal += joules / CONFIG.J_PER_KCAL / CONFIG.EFFICIENCY;
        }
      });
    });
    return Math.round(kcal);
  }

  function total(sessions, bodyWeight, findExercise) {
    return sessions.reduce(function (a, s) {
      return a + session(s, bodyWeight, findExercise);
    }, 0);
  }

  global.Calories = {
    CONFIG: CONFIG,
    session: session,
    total: total,
    romOf: romOf,
    loadOf: loadOf
  };
})(window);
