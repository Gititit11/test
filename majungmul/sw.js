/* 마중물 서비스워커
 *
 * 하는 일 두 가지.
 *   1) 오프라인 캐시 — 지하철에서도 열리게
 *   2) 알림 — 앱이 꺼져 있을 때 대신 부르고, 알림에서 누른 것을 받아 둔다
 *
 * 알림 계획(언제 부를지)은 페이지가 Cache Storage 에 넣어 둔다.
 * 서비스워커는 localStorage 를 볼 수 없어서 이렇게 나눠 갖는다.
 */
var CACHE = 'majungmul-v7';
var STATE = 'majungmul-state';
var SCHED = './__sched';
var PEND = './__pending';
var TAG = 'majungmul-remind';

var ASSETS = [
  './', './index.html', './manifest.json',
  './css/styles.css', './js/store.js', './js/remind.js', './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/badge.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // addAll 은 브라우저 캐시를 타서 오래된 파일이 그대로 저장될 수 있다
    return Promise.all(ASSETS.map(function (url) {
      return fetch(new Request(url, { cache: 'reload' }))
        .then(function (res) { return res.ok ? c.put(url, res) : null; })
        .catch(function () { return null; });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    // 알림 계획(STATE)은 지우면 안 되고, 같은 주소에 함께 올라간
    // 다른 앱의 캐시도 건드리지 않는다. 내 옛 버전만 정리한다.
    return Promise.all(keys
      .filter(function (k) { return k.indexOf('majungmul') === 0 && k !== CACHE && k !== STATE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// 네트워크 우선. 온라인이면 항상 최신 파일을 받고 캐시를 갱신해 둔다.
// (캐시 우선이면 앱을 고쳐도 폰에는 예전 버전이 계속 남는다)
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('__sched') >= 0 || url.pathname.indexOf('__pending') >= 0) return;
  var req = e.request.mode === 'navigate' ? e.request : new Request(e.request, { cache: 'no-store' });
  e.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) { return hit || caches.match('./index.html'); });
    })
  );
});

/* ---------- 페이지와 나눠 갖는 계획 ---------- */

function readPlan() {
  return caches.open(STATE).then(function (c) {
    return c.match(SCHED).then(function (res) { return res ? res.json() : null; });
  }).catch(function () { return null; });
}

function writePlan(plan) {
  return caches.open(STATE).then(function (c) {
    return c.put(SCHED, new Response(JSON.stringify(plan), { headers: { 'content-type': 'application/json' } }));
  }).catch(function () { });
}

/* 페이지가 다음에 열릴 때 처리할 일을 쌓아 둔다 */
function push(item) {
  return caches.open(STATE).then(function (c) {
    return c.match(PEND).then(function (res) {
      return (res ? res.json() : Promise.resolve([])).then(function (list) {
        list = Array.isArray(list) ? list : [];
        list.push(item);
        return c.put(PEND, new Response(JSON.stringify(list), { headers: { 'content-type': 'application/json' } }));
      });
    });
  }).then(function () {
    // 열려 있는 화면이 있으면 바로 알려 준다
    return self.clients.matchAll({ type: 'window' }).then(function (cs) {
      cs.forEach(function (c) { c.postMessage({ type: 'majungmul-pending' }); });
    });
  }).catch(function () { });
}

function hm(s) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  return m ? Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]) : 0;
}

/* 알림을 한 번 보내고 나서 다음 시각을 어림해 둔다.
   정확한 계산은 앱이 열릴 때 페이지가 다시 해 준다. */
function bump(plan, now) {
  var r = plan.remind || {};
  if (r.mode === 'times') {
    var times = (r.times || []).map(hm).sort(function (a, b) { return a - b; });
    var base = new Date(now); base.setHours(0, 0, 0, 0);
    for (var d = 0; d <= 1; d++) {
      for (var i = 0; i < times.length; i++) {
        var ts = base.getTime() + d * 86400000 + times[i] * 60000;
        if (ts > now) { plan.nextAt = ts; return plan; }
      }
    }
    plan.nextAt = now + 86400000;
  } else {
    plan.nextAt = now + Math.max(10, r.everyMin || 90) * 60000;
  }
  plan.remind = r;
  plan.remind.lastFired = now;
  return plan;
}

function notify(plan) {
  var goal = (plan.settings && plan.settings.goal) || 2000;
  var ml = (plan.today && plan.today.ml) || 0;
  var body = ml === 0
    ? '오늘 아직 한 모금도 안 마셨어. 한 잔 어때?'
    : '오늘 ' + ml + ' / ' + goal + ' mL · ' + Math.max(0, goal - ml) + ' mL 남았어';
  return self.registration.showNotification('마중물 💧', {
    body: body, tag: TAG, renotify: true, lang: 'ko',
    icon: './icons/icon-192.png', badge: './icons/badge.png',
    vibrate: plan.settings && plan.settings.vibrate === false ? undefined : [120, 60, 120],
    data: { preset: (plan.settings && plan.settings.cup) || 200,
            snoozeMin: (plan.remind && plan.remind.snoozeMin) || 20 },
    actions: [
      { action: 'drink', title: '한 잔 마셨어' },
      { action: 'snooze', title: '조금 뒤에' }
    ]
  });
}

/* 앱이 꺼져 있는 동안 브라우저가 가끔 깨워 준다(안드로이드 크롬 · 설치된 경우).
   시각이 정확하지 않으므로 "지났으면 부른다" 정도로만 쓴다. */
function check() {
  return readPlan().then(function (plan) {
    if (!plan || !plan.remind || !plan.remind.on || !plan.nextAt) return;
    var now = Date.now();
    if (now < plan.nextAt) return;
    if (now - plan.nextAt > 6 * 3600000) {          // 너무 오래된 예정은 흘려보낸다
      return writePlan(bump(plan, now));
    }
    return notify(plan)
      .then(function () { return push({ type: 'fired', at: now }); })
      .then(function () { return writePlan(bump(plan, now)); });
  });
}

self.addEventListener('periodicsync', function (e) {
  if (e.tag === TAG) e.waitUntil(check());
});
self.addEventListener('sync', function (e) {
  if (e.tag === TAG) e.waitUntil(check());
});
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'majungmul-check') e.waitUntil(check());
});

/* ---------- 알림에서 누른 것 ---------- */

self.addEventListener('notificationclick', function (e) {
  var n = e.notification, act = e.action;
  n.close();

  if (act === 'drink') {
    var amount = (n.data && n.data.preset) || 200;
    e.waitUntil(push({ type: 'drink', ml: amount, at: Date.now() }).then(function () {
      return readPlan().then(function (plan) {
        if (!plan) return;
        plan.today = plan.today || { ml: 0 };
        plan.today.ml += amount;
        plan.today.lastAt = Date.now();
        return writePlan(bump(plan, Date.now()));
      });
    }));
    return;
  }

  if (act === 'snooze') {
    var min = (n.data && n.data.snoozeMin) || 20;
    var until = Date.now() + min * 60000;
    e.waitUntil(push({ type: 'snooze', until: until }).then(function () {
      return readPlan().then(function (plan) {
        if (!plan) return;
        plan.nextAt = until;
        if (plan.remind) plan.remind.snoozeUntil = until;
        return writePlan(plan);
      });
    }));
    return;
  }

  // 알림 본문을 누르면 앱을 연다 (이미 떠 있으면 그 창으로)
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) {
      if (cs[i].url.indexOf(self.registration.scope) === 0 && 'focus' in cs[i]) return cs[i].focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow('./');
  }));
});
