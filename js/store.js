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
    settings: {
      defaultRest: 90, sound: true, voice: true, unit: 'kg', bodyWeight: 70,
      voiceURI: '', voiceRate: 0.95, cueAudio: '', cueName: ''
    }
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

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      alert('저장 공간이 부족해 데이터를 저장하지 못했습니다.');
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
      var arr = [];
      for (var i = 0; i < sets; i++) {
        arr.push(exercise.type === 'time' ? { sec: sec } : { reps: reps, weight: opts.weight || 0 });
      }
      var item = {
        id: uid('it'),
        exerciseId: exercise.id,
        name: exercise.name,
        type: exercise.type,
        restSec: state.settings.defaultRest,
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
    importJSON: function (text) {
      var parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.routines)) throw new Error('형식이 올바르지 않습니다.');
      state = Object.assign(clone(DEFAULT), parsed, {
        settings: Object.assign(clone(DEFAULT.settings), parsed.settings || {})
      });
      save();
    },
    resetAll: function () {
      state = clone(DEFAULT);
      save();
    }
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
      it.sets.forEach(function (s) { total++; if (s.done) done++; });
    });
    return onlyDone ? done : { total: total, done: done };
  };

  global.Store = Store;
})(window);
