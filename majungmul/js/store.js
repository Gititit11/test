/* 마중물 — localStorage 저장소
 *
 * 물을 마신 기록(logs)과 설정(settings), 알림 계획(remind)을 담는다.
 * 화면은 이 파일이 알려주는 값만 보고 그린다. 계산은 전부 여기서 한다.
 */
(function (global) {
  'use strict';

  var KEY = 'majungmul.v1';
  var listeners = [];

  var DEFAULT = {
    version: 1,
    logs: [],              // { id, at(ms), ml }
    settings: {
      goal: 2000,          // 하루 목표 (ml)
      presets: [100, 200, 350, 500],
      cup: 200,            // "몇 잔" 으로 보여줄 때의 한 잔 기준
      dayStart: 4,         // 하루의 시작 시각. 새벽 3시에 마신 물은 전날 것으로 친다
      sound: true,
      vibrate: true,
      intro: 'auto'        // 실행 인트로: auto = 기기의 동작 줄이기를 따름 / on / off
    },
    remind: {
      on: false,
      mode: 'interval',    // 'interval' = 일정 간격 / 'times' = 정해진 시각
      everyMin: 90,
      times: ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00', '21:00'],
      from: '08:00',
      to: '22:00',
      days: [0, 1, 2, 3, 4, 5, 6],   // 0=일 … 6=토
      afterDrink: true,    // 물을 마시면 간격을 다시 센다 (간격 모드)
      skipWhenDone: true,  // 목표를 채운 날은 더 부르지 않는다
      snoozeMin: 20,
      lastFired: 0,        // 마지막으로 알린 시각(ms)
      snoozeUntil: 0
    }
  };

  var state = load();

  /* ---------- 저장·복원 ---------- */

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULT);
      var p = JSON.parse(raw);
      var s = clone(DEFAULT);
      if (Array.isArray(p.logs)) s.logs = p.logs.filter(isLog).map(cleanLog);
      s.settings = Object.assign(s.settings, p.settings || {});
      if (['auto', 'on', 'off'].indexOf(s.settings.intro) < 0) s.settings.intro = 'auto';
      s.remind = Object.assign(s.remind, p.remind || {});
      return s;
    } catch (e) {
      console.warn('저장된 기록을 읽지 못해 새로 시작합니다.', e);
      return clone(DEFAULT);
    }
  }

  // 저장은 물을 기록할 때마다 일어난다. 공간이 찼다고 매번 창을 띄우면
  // 앱을 못 쓰게 되므로 한 번만 알리고 그 뒤로는 조용히 넘어간다.
  var warnedFull = false;
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      if (!warnedFull) {
        warnedFull = true;
        alert('저장 공간이 가득 차 기록을 남기지 못했습니다. 설정에서 오래된 기록을 정리해 주세요.');
      }
    }
    listeners.forEach(function (fn) { try { fn(state); } catch (e) { console.error(e); } });
  }

  function isLog(l) { return l && isFinite(Number(l.at)) && isFinite(Number(l.ml)); }
  function cleanLog(l) {
    return {
      id: String(l.id || uid()),
      at: Number(l.at),
      ml: Math.max(1, Math.min(5000, Math.round(Number(l.ml))))
    };
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------- 날짜 ---------- */

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /* 그 시각이 "며칠의 물" 인지. dayStart 시간만큼 당겨서 계산하므로
     새벽 2시에 마신 물은 전날 기록으로 들어간다. */
  function dayKey(ts) {
    var d = new Date(ts - state.settings.dayStart * 3600000);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* dayKey 가 가리키는 하루의 시작 시각(ms) */
  function dayStartMs(key) {
    var p = key.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2], state.settings.dayStart, 0, 0, 0).getTime();
  }

  function todayKey() { return dayKey(Date.now()); }

  function shiftKey(key, days) {
    return dayKey(dayStartMs(key) + days * 86400000 + state.settings.dayStart * 3600000);
  }

  /* ---------- 읽기 ---------- */

  function logsOf(key) {
    return state.logs.filter(function (l) { return dayKey(l.at) === key; })
      .sort(function (a, b) { return a.at - b.at; });
  }

  function totalOf(key) {
    return logsOf(key).reduce(function (s, l) { return s + l.ml; }, 0);
  }

  function today() {
    var key = todayKey(), list = logsOf(key);
    return {
      key: key,
      ml: list.reduce(function (s, l) { return s + l.ml; }, 0),
      count: list.length,
      logs: list,
      goal: state.settings.goal,
      lastAt: list.length ? list[list.length - 1].at : 0
    };
  }

  /* 최근 n 일을 오래된 → 최신 순으로 */
  function recent(n) {
    var out = [], key = todayKey();
    for (var i = n - 1; i >= 0; i--) {
      var k = shiftKey(key, -i);
      out.push({ key: k, ml: totalOf(k), goal: state.settings.goal });
    }
    return out;
  }

  /* 목표를 채운 날이 오늘(또는 어제)부터 며칠 이어졌는지.
     오늘은 아직 진행 중이라 못 채웠어도 연속이 끊긴 것으로 보지 않는다. */
  function streak() {
    var key = todayKey(), n = 0;
    if (totalOf(key) < state.settings.goal) key = shiftKey(key, -1);
    while (totalOf(key) >= state.settings.goal && n < 3650) { n++; key = shiftKey(key, -1); }
    return n;
  }

  /* 기록이 있는 날들만 모아 통계를 낸다 (평균에 안 마신 날을 넣으면 왜곡된다) */
  function summary(days) {
    var list = recent(days).filter(function (d) { return d.ml > 0; });
    var sum = list.reduce(function (s, d) { return s + d.ml; }, 0);
    var done = list.filter(function (d) { return d.ml >= d.goal; }).length;
    return {
      days: list.length,
      avg: list.length ? Math.round(sum / list.length) : 0,
      done: done,
      rate: list.length ? Math.round(done / list.length * 100) : 0,
      total: sum
    };
  }

  /* ---------- 쓰기 ---------- */

  var lastAdded = null;   // 되돌리기용

  function add(ml, at) {
    ml = Math.round(Number(ml));
    if (!isFinite(ml) || ml <= 0) return null;
    var log = { id: uid(), at: at || Date.now(), ml: Math.min(5000, ml) };
    state.logs.push(log);
    lastAdded = log.id;
    // 물을 마셨으니 미뤄둔 알림은 없던 일로 한다
    state.remind.snoozeUntil = 0;
    save();
    return log;
  }

  function remove(id) {
    var i = state.logs.findIndex(function (l) { return l.id === id; });
    if (i < 0) return false;
    state.logs.splice(i, 1);
    if (lastAdded === id) lastAdded = null;
    save();
    return true;
  }

  function undo() { return lastAdded ? remove(lastAdded) : false; }
  function canUndo() { return !!(lastAdded && state.logs.some(function (l) { return l.id === lastAdded; })); }

  function clearDay(key) {
    state.logs = state.logs.filter(function (l) { return dayKey(l.at) !== key; });
    save();
  }

  function setSettings(patch) { Object.assign(state.settings, patch); save(); }
  function setRemind(patch) { Object.assign(state.remind, patch); save(); }

  /* ---------- 백업 ---------- */

  function exportJSON() {
    return JSON.stringify({ app: 'majungmul', version: 1, exportedAt: Date.now(),
      logs: state.logs, settings: state.settings, remind: state.remind }, null, 2);
  }

  /* 들여온 백업을 쓸 수 있는 모양으로 다시 만든다.
     고칠 수 있는 건 기본값으로 채우고, 기록으로 볼 수 없는 항목은 버린다. */
  function importJSON(text) {
    var p = JSON.parse(text);
    if (!p || typeof p !== 'object' || !Array.isArray(p.logs)) {
      throw new Error('마중물에서 내보낸 백업이 아닙니다.');
    }
    var kept = p.logs.filter(isLog).map(cleanLog);
    var dropped = p.logs.length - kept.length;
    state.logs = kept;
    if (p.settings) state.settings = Object.assign(clone(DEFAULT.settings), p.settings);
    if (p.remind) state.remind = Object.assign(clone(DEFAULT.remind), p.remind);
    lastAdded = null;
    save();
    return { count: kept.length, dropped: dropped };
  }

  function reset() { state = clone(DEFAULT); lastAdded = null; save(); }

  global.Store = {
    state: function () { return state; },
    settings: function () { return state.settings; },
    remind: function () { return state.remind; },
    subscribe: function (fn) { listeners.push(fn); return function () {
      listeners = listeners.filter(function (f) { return f !== fn; }); }; },
    dayKey: dayKey, dayStartMs: dayStartMs, todayKey: todayKey, shiftKey: shiftKey,
    today: today, logsOf: logsOf, totalOf: totalOf, recent: recent, streak: streak, summary: summary,
    add: add, remove: remove, undo: undo, canUndo: canUndo, clearDay: clearDay,
    setSettings: setSettings, setRemind: setRemind,
    exportJSON: exportJSON, importJSON: importJSON, reset: reset,
    save: save
  };
})(window);
