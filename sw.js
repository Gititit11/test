/* 오프라인 캐시 (헬스장 지하 등 네트워크가 끊겨도 동작) */
var CACHE = 'gymmate-v24';
var ASSETS = [
  './', './index.html', './manifest.json',
  './css/styles.css', './js/exercises.js', './js/store.js', './js/calories.js', './js/bodyfigure.js', './js/bodymap.js', './js/app.js',
  './audio/ash.mp3', './audio/ivy.mp3', './audio/winter.mp3',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'
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
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// 네트워크 우선: 온라인이면 항상 최신 파일을 받고, 받은 것을 캐시에 갱신해 둔다.
// (캐시 우선으로 두면 앱을 고쳐도 폰에는 예전 버전이 계속 남는다)
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return;
  // 브라우저 HTTP 캐시(Pages 는 max-age=600)를 건너뛰고 항상 최신을 받는다.
  // 이걸 안 하면 앱을 고쳐도 폰에는 한동안 예전 화면이 그대로 남는다.
  var req = e.request.mode === 'navigate'
    ? e.request
    : new Request(e.request, { cache: 'no-store' });
  e.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      // 오프라인일 때만 캐시 사용
      return caches.match(e.request).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
