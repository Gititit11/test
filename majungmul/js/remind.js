/* 마중물 — 물 마실 시간 알림
 *
 * 브라우저에는 "이 시각에 깨워 줘" 하고 예약해 둘 방법이 없다.
 * (Notification Triggers 는 아직 어느 브라우저에도 없다.)
 * 그래서 알림은 두 갈래로 굴린다.
 *
 *   1) 앱이 켜져 있을 때  — 여기 있는 시계가 15초마다 시각을 확인해서 알린다.
 *      화면을 보고 있으면 알림 대신 앱 안에 살짝 띄운다(문서가 보이는데
 *      시스템 알림까지 울리면 성가시다).
 *   2) 앱을 껐을 때        — 서비스워커의 주기 동기화(periodicSync)에 기댄다.
 *      안드로이드 크롬에서 홈 화면에 설치한 경우에만 동작하고, 시각도
 *      정확하지 않다. 되면 좋고 안 되면 앱을 열 때 따라잡는 정도로 본다.
 *
 * 알림 계획은 서비스워커도 읽어야 해서 localStorage 가 아니라
 * Cache Storage('majungmul-state')에 같이 넣어 둔다. 서비스워커는
 * localStorage 를 볼 수 없기 때문이다.
 */
(function (global) {
  'use strict';

  var STATE_CACHE = 'majungmul-state';
  var SCHED_URL = './__sched';    // 알림 계획 (페이지 → 서비스워커)
  var PEND_URL = './__pending';   // 알림에서 누른 것 (서비스워커 → 페이지)
  var TAG = 'majungmul-remind';

  var timer = null;
  var onNudge = null;    // 화면이 켜져 있을 때 앱 안에서 알릴 방법

  /* ---------- 시각 계산 ---------- */

  function hm(s) {                          // '08:30' → 510(분)
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
    if (!m) return 0;
    return Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]);
  }

  function atMin(dayMs, minutes) {          // 그 날 0시 기준으로 분을 더한 시각
    var d = new Date(dayMs);
    d.setHours(0, 0, 0, 0);
    return d.getTime() + minutes * 60000;
  }

  function midnight(ts) {
    var d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime();
  }

  /* 그 날의 알림 시간대. to 가 from 보다 이르면 자정을 넘긴 것으로 본다. */
  function windowOf(dayMs, r) {
    var f = hm(r.from), t = hm(r.to);
    var start = atMin(dayMs, f);
    var end = atMin(dayMs, t <= f ? t + 1440 : t);
    return { start: start, end: end };
  }

  function dayOn(dayMs, r) {
    var days = Array.isArray(r.days) && r.days.length ? r.days : [0, 1, 2, 3, 4, 5, 6];
    return days.indexOf(new Date(dayMs).getDay()) >= 0;
  }

  function inWindow(now, r) {
    for (var i = -1; i <= 0; i++) {                 // 어제 시간대가 자정을 넘겼을 수도 있다
      var day = midnight(now) + i * 86400000;
      if (!dayOn(day, r)) continue;
      var w = windowOf(day, r);
      if (now >= w.start && now <= w.end) return true;
    }
    return false;
  }

  /* 다음 알림 시각(ms). 0 이면 예정된 알림이 없다. */
  function nextAt(now) {
    var r = Store.remind();
    if (!r.on) return 0;
    now = now || Date.now();
    if (r.snoozeUntil > now) return r.snoozeUntil;

    var t = Store.today();
    if (r.skipWhenDone && t.ml >= t.goal) {
      // 오늘 목표를 채웠으면 내일 시간대가 열릴 때까지 쉰다
      for (var d = 1; d <= 8; d++) {
        var day = midnight(now) + d * 86400000;
        if (dayOn(day, r)) return windowOf(day, r).start;
      }
      return 0;
    }

    for (var i = 0; i <= 8; i++) {
      var dayMs = midnight(now) + i * 86400000;
      if (!dayOn(dayMs, r)) continue;
      var w = windowOf(dayMs, r);
      if (w.end < now) continue;

      if (r.mode === 'times') {
        var times = (r.times || []).map(hm).sort(function (a, b) { return a - b; });
        for (var j = 0; j < times.length; j++) {
          var ts = atMin(dayMs, times[j]);
          if (ts > now && ts >= r.lastFired + 60000) return ts;
        }
      } else {
        var since = Math.max(r.lastFired || 0, r.afterDrink ? t.lastAt : 0);
        var cand = since >= w.start ? since + r.everyMin * 60000 : w.start;
        if (cand < w.start) cand = w.start;
        if (cand <= w.end) return cand;
      }
    }
    return 0;
  }

  /* 지금 알려야 하는가. 늦게 깨어난 시계가 한참 지난 알림을 뒤늦게
     울리지 않도록, 지난 알림은 유예 시간 안일 때만 인정한다. */
  function due(now) {
    var r = Store.remind();
    if (!r.on) return false;
    var at = nextAt(now);
    if (!at || at > now) return false;
    if (!inWindow(now, r) && r.snoozeUntil <= 0) return false;
    var grace = r.mode === 'times' ? 30 * 60000 : 6 * 3600000;
    return now - at <= grace;
  }

  /* ---------- 알림 보내기 ---------- */

  function body() {
    var t = Store.today();
    var left = Math.max(0, t.goal - t.ml);
    if (t.ml === 0) return '오늘 아직 한 모금도 안 마셨어. 한 잔 어때?';
    return '오늘 ' + t.ml + " / " + t.goal + ' mL · ' + left + ' mL 남았어';
  }

  function ready() {
    return typeof Notification !== 'undefined' && Notification.permission === 'granted';
  }

  function swReg() {
    return (navigator.serviceWorker && navigator.serviceWorker.ready) || Promise.reject();
  }

  function show(text) {
    var opts = {
      body: text || body(),
      tag: TAG,
      renotify: true,
      icon: './icons/icon-192.png',
      badge: './icons/badge.png',
      lang: 'ko',
      vibrate: Store.settings().vibrate ? [120, 60, 120] : undefined,
      data: { url: './', preset: Store.settings().cup }
    };
    // 알림 버튼은 안드로이드만 지원한다. 아이폰(maxActions 0)에는 아예 넣지 않는다 —
    // 지원하지 않는 옵션 하나 때문에 알림이 통째로 막히는 일을 만들지 않는다.
    if (typeof Notification !== 'undefined' && Notification.maxActions > 0) {
      opts.actions = [
        { action: 'drink', title: '한 잔 마셨어' },
        { action: 'snooze', title: '조금 뒤에' }
      ];
    }
    // 안드로이드 크롬은 서비스워커를 거친 알림만 허용한다(버튼도 이쪽만 된다).
    return swReg().then(function (reg) { return reg.showNotification('마중물 💧', opts); })
      .catch(function () {
        try { new Notification('마중물 💧', { body: opts.body, tag: TAG, icon: opts.icon }); }
        catch (e) { /* 알림을 못 띄우는 환경 */ }
      });
  }

  function beep() {
    if (!Store.settings().sound) return;
    try {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      var ctx = beep.ctx || (beep.ctx = new AC());
      if (ctx.state === 'suspended') ctx.resume();
      // 물방울 떨어지는 소리에 가깝게 — 높은음에서 아래로 짧게 떨어뜨린다
      var o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime;
      o.type = 'sine';
      o.frequency.setValueAtTime(880, t0);
      o.frequency.exponentialRampToValueAtTime(320, t0 + 0.18);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(t0); o.stop(t0 + 0.32);
    } catch (e) { /* 소리는 없어도 그만 */ }
  }

  // 모바일은 첫 터치 전에는 소리를 못 낸다. 아무 데나 한 번 누르면 열어 둔다.
  function unlockAudio() {
    try {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      var ctx = beep.ctx || (beep.ctx = new AC());
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { /* 무시 */ }
  }

  function fire() {
    var now = Date.now();
    var away = document.hidden || !document.hasFocus();

    /* 화면을 안 보고 있는데 알림 권한도 없으면 알릴 방법이 아예 없다.
       그런데도 "알렸다" 고 표시해 버리면 그 알림은 조용히 사라지고 다음 알림까지
       또 한 참을 기다리게 된다. 그러지 말고 그대로 남겨 둔다 — 앱으로 돌아오는
       순간 화면 안에서 알려 준다. */
    if (away && !ready()) return;

    Store.setRemind({ lastFired: now, snoozeUntil: 0 });
    if (away) {
      show();
    } else {
      // 앱을 보고 있는데 시스템 알림까지 띄우면 성가시다. 화면 안에서만 알린다.
      beep();
      if (Store.settings().vibrate && navigator.vibrate) navigator.vibrate([80, 50, 80]);
      if (onNudge) onNudge(body());
    }
    sync();
  }

  function test() {
    if (!ready()) return Promise.resolve(false);
    return show('알림은 이렇게 와. 이 화면이 안 보일 때 울려.').then(function () { return true; });
  }

  function snooze(min) {
    var m = min || Store.remind().snoozeMin || 20;
    Store.setRemind({ snoozeUntil: Date.now() + m * 60000 });
    sync();
    return m;
  }

  /* ---------- 권한 ---------- */

  function permission() {
    return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  }

  function request() {
    if (typeof Notification === 'undefined') return Promise.resolve('unsupported');
    return Notification.requestPermission().then(function (p) {
      if (p === 'granted') { registerPeriodic(); sync(); }
      return p;
    });
  }

  /* 앱이 꺼져 있는 동안에도 깨워 달라고 등록해 둔다.
     안드로이드 크롬에 설치된 경우에만 받아 주고, 시각은 보장되지 않는다. */
  function registerPeriodic() {
    if (!navigator.serviceWorker || !('permissions' in navigator)) return;
    navigator.permissions.query({ name: 'periodic-background-sync' }).then(function (st) {
      if (st.state !== 'granted') return;
      return swReg().then(function (reg) {
        if (reg.periodicSync) return reg.periodicSync.register(TAG, { minInterval: 15 * 60000 });
      });
    }).catch(function () { /* 지원하지 않는 브라우저 */ });
  }

  /* ---------- 서비스워커와 나눠 갖는 계획 ---------- */

  function sync() {
    if (!global.caches) return Promise.resolve();
    var t = Store.today();
    var plan = {
      remind: Store.remind(),
      settings: { goal: t.goal, cup: Store.settings().cup, vibrate: Store.settings().vibrate },
      today: { key: t.key, ml: t.ml, lastAt: t.lastAt },
      nextAt: nextAt(Date.now()),
      savedAt: Date.now()
    };
    return caches.open(STATE_CACHE).then(function (c) {
      return c.put(SCHED_URL, new Response(JSON.stringify(plan),
        { headers: { 'content-type': 'application/json' } }));
    }).catch(function () { /* 캐시를 못 쓰는 환경 */ });
  }

  /* 알림에서 "한 잔 마셨어" 를 누른 것들을 가져와 기록에 넣는다.
     앱이 꺼져 있을 때 누른 것은 서비스워커가 여기에 쌓아 둔다. */
  function drainPending() {
    if (!global.caches) return Promise.resolve(0);
    return caches.open(STATE_CACHE).then(function (c) {
      return c.match(PEND_URL).then(function (res) {
        if (!res) return 0;
        return res.json().then(function (list) {
          return c.delete(PEND_URL).then(function () {
            var n = 0;
            (list || []).forEach(function (p) {
              if (p && p.type === 'drink' && p.ml > 0) { Store.add(p.ml, p.at); n++; }
              if (p && p.type === 'snooze') Store.setRemind({ snoozeUntil: p.until || 0 });
              // 앱이 꺼져 있는 동안 서비스워커가 대신 알린 것.
              // 이걸 옮겨 적어야 앱을 열자마자 같은 알림이 또 울리지 않는다.
              if (p && p.type === 'fired') Store.setRemind({ lastFired: p.at || Date.now() });
            });
            return n;
          });
        });
      });
    }).catch(function () { return 0; });
  }

  /* ---------- 시계 ---------- */

  function tick() {
    if (due(Date.now())) fire();
  }

  function start(nudge) {
    onNudge = nudge || null;
    if (timer) clearInterval(timer);
    // 15초마다 확인한다. 화면이 꺼지면 브라우저가 이 간격을 늦추지만,
    // 시각을 직접 비교하므로 돌아왔을 때 곧바로 따라잡는다.
    timer = setInterval(tick, 15000);
    tick();
    sync();
  }

  function label(ts) {
    if (!ts) return '';
    var d = new Date(ts), h = d.getHours();
    var ampm = h < 12 ? '오전' : '오후';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return ampm + ' ' + h12 + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }

  function untilText(ts) {
    var ms = ts - Date.now();
    if (ms <= 0) return '곧';
    var min = Math.round(ms / 60000);
    if (min < 60) return min + '분 뒤';
    var h = Math.floor(min / 60), m = min % 60;
    return h + '시간' + (m ? ' ' + m + '분' : '') + ' 뒤';
  }

  /* ---------- 이 기기에서 알림이 되는가 ---------- */

  function standalone() {
    try {
      return (matchMedia('(display-mode: standalone)').matches ||
              matchMedia('(display-mode: fullscreen)').matches ||
              navigator.standalone === true);
    } catch (e) { return false; }
  }

  function isIOS() {
    var ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);   // 아이패드
  }

  /* 앱을 완전히 닫은 동안에도 부를 수 있는 수단이 있는가.
     안드로이드 크롬의 주기 동기화가 유일한데, 그마저 시각을 보장하지 않는다. */
  function background() {
    try {
      return !isIOS() && 'periodicSync' in ServiceWorkerRegistration.prototype;
    } catch (e) { return false; }
  }

  function diagnose() {
    var r = Store.remind();
    return {
      on: !!r.on,
      permission: permission(),           // granted / denied / default / unsupported
      installed: standalone(),
      ios: isIOS(),
      sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      background: background(),
      secure: window.isSecureContext !== false,
      lastFired: r.lastFired || 0,
      nextAt: r.on ? nextAt(Date.now()) : 0
    };
  }

  /* ---------- 캘린더로 내보내기 ---------- */

  /* 알림을 부를 시각들(분 단위)을 뽑는다.
     간격 모드는 "마시면 다시 셈" 때문에 실제로는 유동적이지만,
     캘린더는 고정된 시각만 다룰 수 있으므로 시간대를 균등하게 나눈 격자를 쓴다. */
  function plannedTimes() {
    var r = Store.remind(), out = [];
    if (r.mode === 'times') {
      out = (r.times || []).map(hm);
    } else {
      var f = hm(r.from), t = hm(r.to);
      if (t <= f) t += 1440;
      var step = Math.max(10, r.everyMin || 90);
      for (var m = f + step; m <= t; m += step) out.push(m % 1440);
    }
    return out.sort(function (a, b) { return a - b; });
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* 휴대폰 캘린더에 넣을 수 있는 파일을 만든다.
     시각은 시간대를 붙이지 않는 "떠 있는 시각" 으로 적는다. 그래야 기기의
     현지 시각 그대로 울리고, 여행을 가도 그 지역 시각에 맞춰 울린다. */
  function ics() {
    var r = Store.remind();
    var times = plannedTimes();
    var days = (r.days || []).slice().sort();
    var DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    var byday = (days.length && days.length < 7)
      ? ';BYDAY=' + days.map(function (d) { return DAY[d]; }).join(',') : '';
    var now = new Date();
    var ymd = now.getFullYear() + pad2(now.getMonth() + 1) + pad2(now.getDate());
    var stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

    var L = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//majungmul//water//KO',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:마중물 물 알림'
    ];
    times.forEach(function (m, i) {
      var hhmm = pad2(Math.floor(m / 60)) + pad2(m % 60) + '00';
      L.push('BEGIN:VEVENT');
      L.push('UID:majungmul-' + hhmm + '-' + i + '@majungmul');
      L.push('DTSTAMP:' + stamp);
      L.push('DTSTART:' + ymd + 'T' + hhmm);
      L.push('DURATION:PT5M');
      L.push('RRULE:FREQ=DAILY' + byday);
      L.push('SUMMARY:💧 물 마실 시간');
      L.push('DESCRIPTION:마중물 — 한 잔 마시고 기록해요');
      L.push('TRANSP:TRANSPARENT');
      L.push('BEGIN:VALARM');
      L.push('TRIGGER:PT0S');
      L.push('ACTION:DISPLAY');
      L.push('DESCRIPTION:💧 물 마실 시간');
      L.push('END:VALARM');
      L.push('END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.join('\r\n') + '\r\n';
  }

  global.Remind = {
    start: start, tick: tick, sync: sync, fire: fire, test: test, snooze: snooze,
    nextAt: nextAt, due: due, inWindow: inWindow, hm: hm,
    permission: permission, request: request, ready: ready,
    drainPending: drainPending, registerPeriodic: registerPeriodic,
    unlockAudio: unlockAudio, beep: beep,
    label: label, untilText: untilText,
    diagnose: diagnose, standalone: standalone, isIOS: isIOS, background: background,
    plannedTimes: plannedTimes, ics: ics
  };
})(window);
