/* 이 주소(/test/)에는 예전에 짐메이트가 있었다. 지금은 앱 고르는 안내 페이지뿐이다.
 *
 * 짐메이트를 쓰던 기기에는 이 경로로 등록된 서비스워커가 남아 있고, 그대로 두면
 * 캐시에 있던 옛 화면을 계속 내보낸다. 브라우저는 갱신할 때 이 파일을 다시 받아
 * 가므로, 여기서 스스로 등록을 지우고 옛 캐시도 함께 치운다.
 *
 * 새 짐메이트는 /test/gymmate/sw.js, 마중물은 /test/majungmul/sw.js 를 쓴다.
 * 이 파일은 그 둘과 아무 관계가 없다.
 */
self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys
          .filter(function (k) { return k.indexOf('gymmate') === 0; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll({ type: 'window' }); })
      .then(function (cs) { cs.forEach(function (c) { c.navigate(c.url); }); })
      .catch(function () { })
  );
});
