/* 오프라인 캐시 (헬스장 지하 등 네트워크가 끊겨도 동작) */
var CACHE = 'gymmate-v3';
var ASSETS = [
  './', './index.html', './manifest.json',
  './css/styles.css', './js/exercises.js', './js/store.js', './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () {
    return self.skipWaiting();
  }));
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
  e.respondWith(
    fetch(e.request).then(function (res) {
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
