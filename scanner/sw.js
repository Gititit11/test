/* 오프라인 캐시 — 스캔은 전부 기기 안에서 하므로 네트워크 없이도 돌아간다 */
var CACHE = 'scanner-v2';
var ASSETS = [
  './', './index.html', './manifest.json',
  './css/styles.css', './js/scan.js', './js/pdf.js', './js/app.js', './js/install.js',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(ASSETS.map(function (url) {
      return fetch(new Request(url, { cache: 'reload' }))
        .then(function (res) { return res.ok ? c.put(url, res) : null; })
        .catch(function () { return null; });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    // 같은 주소에 다른 앱(gymmate)도 있으니 내 캐시만 정리한다
    return Promise.all(keys
      .filter(function (k) { return k.indexOf('scanner') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// 네트워크 우선, 끊겼을 때만 캐시
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return;
  var req = e.request.mode === 'navigate'
    ? e.request
    : new Request(e.request, { cache: 'no-store' });
  e.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
