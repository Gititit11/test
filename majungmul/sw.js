/* 마중물은 종료됐다. 이 파일은 앱을 대신하지 않고, 앱이 남긴 것을 걷어내기만 한다.
 *
 * 마중물을 홈 화면에 설치한 기기에는 이 경로로 등록된 서비스워커가 남아 있다.
 * 브라우저는 갱신할 때 이 파일을 다시 받아 가므로, 여기서 스스로 등록을 지우고
 * 캐시도 함께 치운다. 그래야 앱이 사라진 뒤에도 낡은 화면이 계속 뜨는 일이 없다.
 *
 * 물 마신 기록(localStorage)은 건드리지 않는다. 종료 안내 페이지에서 내려받을 수
 * 있어야 하기 때문이다. 그건 사용자가 직접 지우거나 앱을 지우면 함께 사라진다.
 */
self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys
          .filter(function (k) { return k.indexOf('majungmul') === 0; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll({ type: 'window' }); })
      .then(function (cs) { cs.forEach(function (c) { c.navigate(c.url); }); })
      .catch(function () { })
  );
});
