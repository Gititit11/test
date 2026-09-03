/* localStorage 기반 저장소 */
(function (global) {
  'use strict';

  var KEY = 'gymmate.v1';
  var listeners = [];

  var DEFAULT = {
    version: 1,
    routines: [],
    sessions: [],       // 완료된 운동 기록
    customExercises: [],
    active: null,       // 진행 중인 세션
    settings: { defaultRest: 90, sound: true, voice: 'ash', cueVolume: 100, unit: 'kg', bodyWeight: 70 }
  };

  var state = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) {
        var seeded = seed(clone(DEFAULT));
        try { localStorage.setItem(KEY, JSON.stringify(seeded)); } catch (e) { /* 무시 */ }
        return seeded;
      }
      var parsed = JSON.parse(raw);
      return Object.assign(clone(DEFAULT), parsed, {
        settings: Object.assign(clone(DEFAULT.settings), parsed.settings || {})
      });
    } catch (e) {
      console.warn('저장된 데이터를 읽지 못해 초기화합니다.', e);
      return clone(DEFAULT);
    }
  }

  // 저장은 입력할 때마다 일어난다. 공간이 차면 경고가 계속 튀어나와
  // 앱을 못 쓰게 되므로 한 번만 알리고 이후에는 조용히 넘어간다.
  var warnedFull = false;
  /* 들여온 백업을 깨끗한 상태 객체로 다시 만든다.
   * 고칠 수 있는 것(빠진 필드, 이상한 값)은 기본값으로 채우고,
   * 운동 하나로 볼 수 없는 항목은 버린다. 몇 개를 버렸는지 함께 돌려준다. */
  function sanitize(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('백업 형식이 아닙니다.');
    }
    if (!Array.isArray(parsed.routines)) {
      throw new Error('백업에 루틴 목록이 없습니다. 이 앱에서 내보낸 백업이 맞는지 확인해 주세요.');
    }

    var dropped = 0;
    function str(v, fallback) { return typeof v === 'string' && v ? v : fallback; }
    function n(v, fallback) { var x = Number(v); return isFinite(x) ? x : fallback; }
    function optN(v, lo, hi) {                      // null 을 허용하는 숫자 (휴식·속도 등)
      if (v === null || v === undefined || v === '') return null;
      var x = Number(v);
      return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : null;
    }

    function cleanSet(raw, type, doneDefault) {
      if (!raw || typeof raw !== 'object') return null;
      var st = {};
      if (type === 'time') {
        st.sec = Math.max(0, n(raw.sec, 0));
        st.speed = optN(raw.speed, 0, 40);
        st.grade = optN(raw.grade, 0, 30);
        st.watt = optN(raw.watt, 0, 600);
        st.level = optN(raw.level, 0, 2);
      } else {
        st.reps = Math.max(0, Math.round(n(raw.reps, 0)));
        st.weight = Math.max(0, n(raw.weight, 0));
      }
      // 완료된 기록에 들어 있는 세트는 이미 체크된 세트다. done 이 없거나
      // boolean 이 아니면 true 로 확정해, 읽는 쪽마다 다르게 세지 않게 한다.
      if (typeof raw.done === 'boolean') st.done = raw.done;
      else if (doneDefault) st.done = true;
      if (raw.doneAt != null) st.doneAt = n(raw.doneAt, null);
      return st;
    }

    function cleanItem(raw, doneDefault) {
      if (!raw || typeof raw !== 'object') { dropped++; return null; }
      var type = raw.type === 'time' ? 'time' : 'reps';
      var sets = (Array.isArray(raw.sets) ? raw.sets : [])
        .map(function (x) { return cleanSet(x, type, doneDefault); })
        .filter(Boolean);
      if (!sets.length) sets = [type === 'time' ? { sec: 60 } : { reps: 10, weight: 0 }];
      return {
        id: str(raw.id, uid('it')),
        exerciseId: str(raw.exerciseId, ''),
        name: str(raw.name, '이름 없는 운동'),
        type: type,
        restSec: optN(raw.restSec, 0, 3600),
        memo: str(raw.memo, ''),
        sets: sets
      };
    }

    function cleanRoutine(raw) {
      if (!raw || typeof raw !== 'object') { dropped++; return null; }
      return {
        id: str(raw.id, uid('rt')),
        name: str(raw.name, '이름 없는 루틴'),
        memo: str(raw.memo, ''),
        createdAt: n(raw.createdAt, Date.now()),
        updatedAt: n(raw.updatedAt, Date.now()),
        items: (Array.isArray(raw.items) ? raw.items : [])
          .map(function (x) { return cleanItem(x, false); }).filter(Boolean)
      };
    }

    function cleanSession(raw) {
      if (!raw || typeof raw !== 'object') { dropped++; return null; }
      // 진행 중인 운동(active)은 체크 여부가 그대로 살아 있어야 하므로
      // 끝난 기록(finishedAt 이 있는 것)에만 done 기본값을 준다.
      var isDone = raw.finishedAt != null;
      var items = (Array.isArray(raw.items) ? raw.items : [])
        .map(function (x) { return cleanItem(x, isDone); }).filter(Boolean);
      if (!items.length) { dropped++; return null; }      // 내용 없는 기록은 버린다
      return {
        id: str(raw.id, uid('ss')),
        routineName: str(raw.routineName, '운동'),
        startedAt: n(raw.startedAt, Date.now()),
        finishedAt: n(raw.finishedAt, null),
        memo: str(raw.memo, ''),
        items: items
      };
    }

    function cleanCustom(raw) {
      if (!raw || typeof raw !== 'object' || !str(raw.name, '')) { dropped++; return null; }
      return {
        id: str(raw.id, uid('cx')),
        name: raw.name,
        en: str(raw.en, ''),
        part: str(raw.part, '기타'),
        equip: str(raw.equip, '기타'),
        muscles: Array.isArray(raw.muscles) ? raw.muscles.filter(function (m) { return typeof m === 'string'; }) : [],
        type: raw.type === 'time' ? 'time' : 'reps'
      };
    }

    var routines = parsed.routines.map(cleanRoutine).filter(Boolean);
    var sessions = (Array.isArray(parsed.sessions) ? parsed.sessions : []).map(cleanSession).filter(Boolean);
    var customs = (Array.isArray(parsed.customExercises) ? parsed.customExercises : []).map(cleanCustom).filter(Boolean);
    var active = parsed.active ? cleanSession(parsed.active) : null;
    if (active) active.routineId = str(parsed.active.routineId, '');

    var settings = Object.assign(clone(DEFAULT.settings), (parsed.settings && typeof parsed.settings === 'object') ? parsed.settings : {});
    settings.defaultRest = Math.min(3600, Math.max(0, n(settings.defaultRest, 90)));
    settings.bodyWeight = Math.min(250, Math.max(20, n(settings.bodyWeight, 70)));
    settings.unit = settings.unit === 'lb' ? 'lb' : 'kg';
    settings.sound = settings.sound !== false;
    settings.cueVolume = Math.min(100, Math.max(0, n(settings.cueVolume, 100)));

    var out = clone(DEFAULT);
    out.routines = routines;
    out.sessions = sessions;
    out.customExercises = customs;
    out.active = active;
    out.settings = settings;
    out.report = { routines: routines.length, sessions: sessions.length, dropped: dropped };
    return out;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      warnedFull = false;
    } catch (e) {
      if (!warnedFull) {
        warnedFull = true;
        alert('저장 공간이 부족해 데이터를 저장하지 못했습니다.\n설정 → 데이터 백업으로 내보낸 뒤 오래된 기록을 정리해 주세요.');
      }
    }
    listeners.forEach(function (fn) { fn(state); });
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 7);
  }

  // 첫 실행 시 예시 루틴 제공
  function seed(s) {
    var mk = function (exId, name, type, sets, reps, weight, rest) {
      var arr = [];
      for (var i = 0; i < sets; i++) {
        arr.push(type === 'time' ? { sec: reps } : { reps: reps, weight: weight });
      }
      return { id: uid('it'), exerciseId: exId, name: name, type: type, restSec: rest, memo: '', sets: arr };
    };
    s.routines = [
      {
        id: uid('rt'), name: '가슴 · 삼두 (예시)', memo: '푸시 데이',
        createdAt: Date.now(), updatedAt: Date.now(),
        items: [
          mk('x-barbell-bench-press', '벤치프레스', 'reps', 5, 8, 40, 120),
          mk('x-incline-dumbbell-press', '인클라인 덤벨 프레스', 'reps', 4, 10, 16, 90),
          mk('x-pec-deck-fly', '펙덱 플라이 머신', 'reps', 3, 12, 30, 60),
          mk('x-triceps-pushdown', '케이블 푸시다운', 'reps', 3, 12, 20, 60)
        ]
      },
      {
        id: uid('rt'), name: '등 · 이두 (예시)', memo: '풀 데이',
        createdAt: Date.now(), updatedAt: Date.now(),
        items: [
          mk('x-lat-pulldown', '랫 풀다운', 'reps', 4, 10, 45, 90),
          mk('x-seated-cable-row', '시티드 케이블 로우', 'reps', 4, 10, 40, 90),
          mk('x-one-arm-dumbbell-row', '덤벨 원암 로우', 'reps', 3, 12, 20, 60),
          mk('x-dumbbell-curl', '덤벨 컬', 'reps', 3, 12, 10, 60)
        ]
      }
    ];
    return s;
  }

  var Store = {
    uid: uid,
    clone: clone,

    get state() { return state; },
    get settings() { return state.settings; },

    // 운동에 개별 휴식 시간이 없으면(null) 설정의 기본값을 쓴다.
    // 그래야 설정을 바꿨을 때 기존 루틴에도 바로 반영된다.
    // 모든 루틴(과 진행 중인 운동)의 개별 휴식 시간을 지워 기본값을 따르게 한다.
    // 예전 버전에서 추가한 운동은 추가 당시의 값이 박혀 있어 설정을 바꿔도
    // 변하지 않는데, 이걸 한 번에 정리하는 용도다.
    resetAllRest: function () {
      var n = 0;
      state.routines.forEach(function (r) {
        r.items.forEach(function (it) { if (it.restSec != null) { it.restSec = null; n++; } });
      });
      if (state.active) {
        state.active.items.forEach(function (it) { if (it.restSec != null) it.restSec = null; });
      }
      save();
      return n;
    },

    restOf: function (item) {
      if (!item) return state.settings.defaultRest;
      return (item.restSec === null || item.restSec === undefined)
        ? state.settings.defaultRest : item.restSec;
    },

    subscribe: function (fn) { listeners.push(fn); },
    commit: save,

    // ── 운동 목록 ──────────────────────────────────────
    allExercises: function () {
      return global.ExerciseDB.builtIn.concat(
        state.customExercises.map(global.ExerciseDB.normalize)
      );
    },
    findExercise: function (id) {
      return this.allExercises().filter(function (e) { return e.id === id; })[0] || null;
    },
    addCustomExercise: function (data) {
      var ex = {
        id: uid('cx'),
        name: data.name,
        en: data.en || '',
        part: data.part,
        equip: data.equip,
        muscles: data.muscles || [],
        type: data.type || 'reps'
      };
      state.customExercises.push(ex);
      save();
      return global.ExerciseDB.normalize(ex);
    },
    removeCustomExercise: function (id) {
      state.customExercises = state.customExercises.filter(function (e) { return e.id !== id; });
      save();
    },

    // ── 루틴 ───────────────────────────────────────────
    routines: function () { return state.routines; },
    getRoutine: function (id) {
      return state.routines.filter(function (r) { return r.id === id; })[0] || null;
    },
    createRoutine: function (name) {
      var r = {
        id: uid('rt'), name: name || '새 루틴', memo: '',
        createdAt: Date.now(), updatedAt: Date.now(), items: []
      };
      state.routines.unshift(r);
      save();
      return r;
    },
    updateRoutine: function (id, patch) {
      var r = this.getRoutine(id);
      if (!r) return null;
      Object.assign(r, patch, { updatedAt: Date.now() });
      save();
      return r;
    },
    deleteRoutine: function (id) {
      state.routines = state.routines.filter(function (r) { return r.id !== id; });
      save();
    },
    duplicateRoutine: function (id) {
      var r = this.getRoutine(id);
      if (!r) return null;
      var copy = clone(r);
      copy.id = uid('rt');
      copy.name = r.name + ' 복사본';
      copy.createdAt = copy.updatedAt = Date.now();
      copy.items.forEach(function (it) { it.id = uid('it'); });
      state.routines.unshift(copy);
      save();
      return copy;
    },

    // ── 루틴 항목 ──────────────────────────────────────
    addItem: function (routineId, exercise, opts) {
      var r = this.getRoutine(routineId);
      if (!r) return null;
      opts = opts || {};
      var sets = opts.sets || 3;
      var reps = opts.reps || 10;
      var sec = opts.sec || 60;
      // 유산소는 세트로 끊지 않고 한 번에 쭉 한다. 20분 1세트로 시작하고,
      // 인터벌처럼 나눠 하고 싶으면 편집에서 세트를 더하면 된다.
      var isCardio = exercise.type === 'time' && exercise.part === '유산소';
      if (isCardio) {
        sets = opts.sets != null ? opts.sets : 1;
        sec = opts.sec || 1200;
      }
      var arr = [];
      for (var i = 0; i < sets; i++) {
        arr.push(exercise.type === 'time' ? { sec: sec } : { reps: reps, weight: opts.weight || 0 });
      }
      var item = {
        id: uid('it'),
        exerciseId: exercise.id,
        name: exercise.name,
        type: exercise.type,
        // null = 설정의 기본 휴식 시간을 따른다. 유산소 1세트는 끝나고
        // 쉬는 개념이 아니라서 0(휴식 없음)으로 둔다.
        restSec: isCardio ? 0 : null,
        memo: '',
        sets: arr
      };
      r.items.push(item);
      r.updatedAt = Date.now();
      save();
      return item;
    },
    updateItem: function (routineId, itemId, patch) {
      var r = this.getRoutine(routineId);
      if (!r) return;
      var it = r.items.filter(function (i) { return i.id === itemId; })[0];
      if (!it) return;
      Object.assign(it, patch);
      r.updatedAt = Date.now();
      save();
    },
    removeItem: function (routineId, itemId) {
      var r = this.getRoutine(routineId);
      if (!r) return;
      r.items = r.items.filter(function (i) { return i.id !== itemId; });
      r.updatedAt = Date.now();
      save();
    },
    moveItem: function (routineId, itemId, dir) {
      var r = this.getRoutine(routineId);
      if (!r) return;
      var idx = r.items.findIndex(function (i) { return i.id === itemId; });
      var next = idx + dir;
      if (idx < 0 || next < 0 || next >= r.items.length) return;
      var tmp = r.items[idx];
      r.items[idx] = r.items[next];
      r.items[next] = tmp;
      r.updatedAt = Date.now();
      save();
    },

    // ── 세션(운동 진행) ────────────────────────────────
    active: function () { return state.active; },
    startSession: function (routineId) {
      var r = this.getRoutine(routineId);
      if (!r) return null;
      state.active = {
        id: uid('ss'),
        routineId: r.id,
        routineName: r.name,
        startedAt: Date.now(),
        finishedAt: null,
        memo: '',
        items: r.items.map(function (it) {
          return {
            id: it.id,
            exerciseId: it.exerciseId,
            name: it.name,
            type: it.type,
            restSec: it.restSec,
            memo: it.memo,
            sets: it.sets.map(function (s) {
              return Object.assign({}, s, { done: false, doneAt: null });
            })
          };
        })
      };
      save();
      return state.active;
    },
    updateActive: function (mutator) {
      if (!state.active) return;
      mutator(state.active);
      save();
    },
    cancelSession: function () { state.active = null; save(); },
    finishSession: function () {
      if (!state.active) return null;
      var s = state.active;
      s.finishedAt = Date.now();
      // 체크하지 않은 세트는 기록에서 제외
      s.items.forEach(function (it) {
        it.sets = it.sets.filter(function (st) { return st.done; });
      });
      s.items = s.items.filter(function (it) { return it.sets.length > 0; });
      state.active = null;
      if (s.items.length) state.sessions.unshift(s);
      save();
      return s.items.length ? s : null;
    },

    // ── 기록 ───────────────────────────────────────────
    sessions: function () { return state.sessions; },
    getSession: function (id) {
      return state.sessions.filter(function (s) { return s.id === id; })[0] || null;
    },
    deleteSession: function (id) {
      state.sessions = state.sessions.filter(function (s) { return s.id !== id; });
      save();
    },

    // ── 백업 ───────────────────────────────────────────
    exportJSON: function () { return JSON.stringify(state, null, 2); },
    /* 백업을 들여올 때는 모양을 하나하나 확인한다. 예전에는 routines 가
     * 배열이기만 하면 통과시켜서, 항목이 깨진 백업이 그대로 저장되고
     * 루틴 화면이 렌더 도중 죽어 앱 안에서 되돌릴 방법이 없었다.
     * 이제 다 만들어 본 뒤에야 기존 데이터를 갈아 끼운다. */
    importJSON: function (text) {
      var parsed;
      try { parsed = JSON.parse(text); }
      catch (e) { throw new Error('JSON 형식이 아닙니다. 백업 내용을 그대로 붙여넣었는지 확인해 주세요.'); }
      var next = sanitize(parsed);          // 여기서 실패하면 state 는 그대로다
      var report = next.report;
      delete next.report;                   // 보고용이라 저장하지 않는다
      state = next;
      save();
      return report;
    },
    resetAll: function () {
      state = clone(DEFAULT);
      save();
    }
  };

  // ── 운동별 성장 기록 ────────────────────────────────
  // 한 세션에서 그 운동을 어떻게 했는지 한 줄로 요약한다.
  function summarize(session, item) {
    var sets = item.sets.filter(function (st) { return st.done !== false; });
    if (!sets.length) return null;
    var row = {
      sessionId: session.id, routineName: session.routineName,
      at: session.startedAt, type: item.type,
      setCount: sets.length, totalReps: 0, totalSec: 0, topSpeed: 0,
      volume: 0, topWeight: 0, topReps: 0, best: null, e1rm: 0
    };
    sets.forEach(function (st) {
      if (item.type === 'time') {
        row.totalSec += Number(st.sec) || 0;
        // 유산소는 같은 30분이라도 속도가 다르면 다른 운동이다
        row.topSpeed = Math.max(row.topSpeed, Number(st.speed) || 0);
        return;
      }
      var w = Number(st.weight) || 0, r = Number(st.reps) || 0;
      row.totalReps += r;
      row.volume += w * r;
      // 그 날 가장 무겁게 친 세트 (무게가 같으면 횟수가 많은 쪽)
      if (!row.best || w > row.best.weight || (w === row.best.weight && r > row.best.reps)) {
        row.best = { weight: w, reps: r };
      }
      if (r > row.topReps) row.topReps = r;
      // Epley 공식으로 1회 최대 무게를 추정한다
      if (w > 0 && r > 0) row.e1rm = Math.max(row.e1rm, w * (1 + r / 30));
    });
    if (row.best) row.topWeight = row.best.weight;
    row.volume = Math.round(row.volume);
    row.e1rm = Math.round(row.e1rm);
    return row;
  }

  // 그 운동을 한 세션들을 오래된 것 → 최근 순으로 돌려준다
  Store.progressOf = function (exerciseId) {
    var out = [];
    state.sessions.forEach(function (s) {
      s.items.forEach(function (it) {
        if (it.exerciseId !== exerciseId) return;
        var row = summarize(s, it);
        if (row) { row.name = it.name; out.push(row); }
      });
    });
    return out.sort(function (a, b) { return a.at - b.at; });
  };

  // 한 번이라도 한 운동들을 최근에 한 순서로 돌려준다
  Store.trainedExercises = function () {
    var map = {};
    state.sessions.forEach(function (s) {
      s.items.forEach(function (it) {
        if (!it.exerciseId) return;
        var row = summarize(s, it);
        if (!row) return;
        var e = map[it.exerciseId];
        if (!e) {
          e = map[it.exerciseId] = {
            exerciseId: it.exerciseId, name: it.name, type: it.type,
            days: 0, lastAt: 0, last: null, topWeight: 0
          };
        }
        e.days++;
        if (row.at > e.lastAt) { e.lastAt = row.at; e.last = row; e.name = it.name; }
        if (row.topWeight > e.topWeight) e.topWeight = row.topWeight;
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.lastAt - a.lastAt; });
  };

  // 직전에 이 운동을 했을 때의 기록. 진행 중인 세션은 제외한다.
  Store.lastRecordOf = function (exerciseId) {
    var rows = Store.progressOf(exerciseId);
    return rows.length ? rows[rows.length - 1] : null;
  };

  // ── 통계 헬퍼 ────────────────────────────────────────
  Store.volumeOf = function (session) {
    var v = 0;
    session.items.forEach(function (it) {
      it.sets.forEach(function (s) {
        if (s.done === false) return;
        if (it.type !== 'time') v += (Number(s.reps) || 0) * (Number(s.weight) || 0);
      });
    });
    return Math.round(v);
  };
  Store.countSets = function (session, onlyDone) {
    var total = 0, done = 0;
    session.items.forEach(function (it) {
      // 볼륨·총 횟수와 같은 기준으로 센다. done 이 명시적으로 false 일 때만
      // 안 한 세트다 (예전 백업에는 done 이 아예 없을 수 있다).
      it.sets.forEach(function (s) { total++; if (s.done !== false) done++; });
    });
    return onlyDone ? done : { total: total, done: done };
  };

  global.Store = Store;
})(window);
