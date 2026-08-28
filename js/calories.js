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
    'x-hack-squat': 0.45, 'x-v-squat-machine': 0.45, 'x-goblet-squat': 0.45, 'x-leg-press': 0.40,
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
    'x-overhead-dumbbell-extension': 0.40, 'x-cable-overhead-triceps-extension': 0.40,
    'x-crunch': 0.20, 'x-sit-up': 0.35, 'x-leg-raise': 0.40, 'x-hanging-leg-raise': 0.45
  };

  // 자기 체중 중 실제로 들어올리는 비율. 해부학적 추정치보다 낮게 잡았다.
  var BODY_LOAD = {
    'x-barbell-back-squat': 0.75, 'x-front-squat': 0.75, 'x-smith-machine-squat': 0.70,
    'x-hack-squat': 0.55, 'x-v-squat-machine': 0.55, 'x-goblet-squat': 0.75,
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

  /* 유산소는 속도가 소모량을 지배한다. 8km/h 로 뛴 20분과 14km/h 로 뛴 20분을
   * 같은 값으로 볼 수 없어서, 속도를 적으면 고정 MET 대신 아래 식을 쓴다.
   *
   * 걷기·달리기는 ACSM 대사 공식(VO2, mL/kg/분)을 그대로 쓴다.
   *   걷기   : 0.1 × 속도(m/분) + 1.8 × 속도(m/분) × 경사 + 3.5
   *   달리기 : 0.2 × 속도(m/분) + 0.9 × 속도(m/분) × 경사 + 3.5
   * 자전거는 속도로 나눈 통용 MET 구간을 쓴다(실내 자전거의 km/h 표시 기준).
   *
   * 나온 값에 0.85를 곱해 낮춰 잡는다. 이 앱의 다른 계수와 같은 방침이고,
   * 9km/h 달리기에서 기존 고정값 8.0 과 거의 같은 값이 나오도록 맞춘 값이다. */
  var CARDIO_SHADE = 0.85;
  // 걷기 식은 6.4km/h 까지, 달리기 식은 8km/h 부터가 검증 구간이다. 그 사이를
  // 한 지점에서 잘라 쓰면 6.9 와 7.1 이 두 배 차이가 나므로 구간을 섞는다.
  var WALK_MAX = 6.4, RUN_MIN = 8.0;

  /* 유산소마다 기계가 알려주는 값이 다르다. 경사가 없는 기구에 경사 칸을
   * 두거나, 속도가 무의미한 기구에 속도 칸을 두면 안 된다.
   *   walkrun — 속도(km/h) + 경사(%)   : 트레드밀
   *   watt    — 와트(W)                : 사이클·로잉 (표시가 없으면 강도로)
   *   level   — 강도(가볍게/보통/세게)  : 속도·와트가 무의미한 기구 */
  var CARDIO = {
    'x-treadmill-running':      { model: 'walkrun' },
    'x-incline-treadmill-walk': { model: 'walkrun' },   // 예전 기록용
    'x-stationary-bike':        { model: 'watt', levels: [4.0, 6.0, 8.5] },
    'x-rowing-machine':         { model: 'watt', levels: [4.8, 7.0, 9.5] },
    'x-elliptical':             { model: 'level', levels: [4.0, 5.0, 6.8] },
    'x-stair-climber':          { model: 'level', levels: [6.0, 8.0, 10.0] },
    'x-jump-rope':              { model: 'level', levels: [8.8, 11.0, 12.3] },
    'x-battle-rope':            { model: 'level', levels: [6.0, 8.0, 10.0] }
  };
  var LEVEL_DEFAULT = [3.5, 5.0, 7.0];      // 사용자가 직접 추가한 유산소

  function cardioOf(exerciseId, ex) {
    if (CARDIO[exerciseId]) return CARDIO[exerciseId];
    // 직접 추가한 유산소는 어떤 기구인지 알 수 없으니 강도만 받는다
    if (ex && ex.part === '유산소' && ex.type === 'time') {
      return { model: 'level', levels: LEVEL_DEFAULT };
    }
    return null;
  }

  /* 에르고미터(사이클·로잉)의 ACSM 식. 일한 양이 곧 소모량이라 기계가
   * 표시하는 와트를 그대로 쓸 수 있다.
   *   VO2 = 1.8 × 일률(kgm/분) / 체중 + 7,  1 W = 6.12 kgm/분
   * 검증: 100W 70kg → 6.5 MET (통용값 6.8), 로잉 150W 70kg → 8.7 (통용 8.5) */
  function wattMet(watt, bodyWeight) {
    if (!watt || !bodyWeight) return null;
    return (1.8 * 6.12 * watt / bodyWeight + 7) / 3.5;
  }

  /* 속도(km/h)와 경사(%)로 MET 을 낸다. 속도가 없으면 null 을 돌려
   * 호출한 쪽이 고정 MET 으로 돌아가게 한다. */
  function speedMet(cfg, kmh, gradePct) {
    kmh = num(kmh);
    if (!cfg || cfg.model !== 'walkrun' || kmh <= 0) return null;
    var mpm = kmh * 1000 / 60;                       // m/분
    var g = Math.max(0, num(gradePct)) / 100;
    var walk = 0.1 * mpm + 1.8 * mpm * g + 3.5;
    var run  = 0.2 * mpm + 0.9 * mpm * g + 3.5;
    var vo2;
    if (kmh <= WALK_MAX) vo2 = walk;
    else if (kmh >= RUN_MIN) vo2 = run;
    else {
      var t = (kmh - WALK_MAX) / (RUN_MIN - WALK_MAX);
      vo2 = walk + (run - walk) * t;                 // 걷기↔달리기 사이는 섞어 쓴다
    }
    return (vo2 / 3.5) * CARDIO_SHADE;
  }

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

  function metOf(item, ex, set, bodyWeight) {
    var cfg = cardioOf(item.exerciseId, ex);
    if (cfg && set) {
      if (cfg.model === 'walkrun') {
        var m = speedMet(cfg, set.speed, set.grade);
        if (m) return m;                              // 속도를 적었으면 그 값으로
      } else if (cfg.model === 'watt') {
        var w = wattMet(num(set.watt), bodyWeight);
        if (w) return w * CARDIO_SHADE;               // 와트가 있으면 가장 정확하다
      }
      /* 와트가 없거나 강도만 받는 기구는 고른 단계로. 고르지 않았으면
       * "보통"(1번)으로 본다. 예전에는 여기서 고정 MET 표로 빠졌는데,
       * 그 값들은 0.85 보정 이전 기준이라 "보통"보다 오히려 높게 나왔다. */
      var lv = cfg.levels && cfg.levels[set.level == null ? 1 : Number(set.level)];
      if (lv) return lv * CARDIO_SHADE;
    }
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
          var extra = Math.max(0, metOf(it, ex, st, bodyWeight) - CONFIG.MET_REST);
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

  /* 시간형 운동 하나가 태운 열량. 유산소 카드에 바로 보여 주려고 따로 뺐다.
   * 기초 대사분을 뺀 순수 추가분이므로 세션 합계와 같은 기준이다. */
  function timeItem(item, ex, bodyWeight) {
    if (!item || item.type !== 'time' || !bodyWeight) return 0;
    var kcal = 0;
    item.sets.forEach(function (st) {
      if (st.done === false) return;
      var extra = Math.max(0, metOf(item, ex, st, bodyWeight) - CONFIG.MET_REST);
      kcal += metKcal(extra, bodyWeight, num(st.sec) / 60);
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
    cardioOf: cardioOf,
    speedMet: speedMet,
    wattMet: wattMet,
    timeItem: timeItem,
    session: session,
    total: total,
    romOf: romOf,
    loadOf: loadOf
  };
})(window);
