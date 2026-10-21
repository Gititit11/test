/* 앱 설치 버튼
 *
 * 안드로이드 크롬의 ⋮ → "앱 설치" 메뉴는 '이 주소(origin)에 깔린 앱이 하나라도
 * 있으면' 이미 설치됐다고 판단한다(WebappRegistry.isAppInstalledForUrl →
 * hasAtLeastOneWebApkForOrigin). 이 저장소는 짐메이트·스캔메이트가 같은 주소
 * (gititit11.github.io)에 있어서, 하나를 깔면 다른 하나는 메뉴로 설치할 수 없고
 * "열기" 를 누르면 '앱을 열 수 없음' 이 뜬다.
 *
 * 페이지가 직접 띄우는 설치(beforeinstallprompt → prompt())는 앱의 범위(scope)
 * 기준으로 판단하므로(WebappsUtils::IsWebApkInstalled) 이 문제가 없다.
 * 그래서 설치할 수 있을 때만 화면 위에 "앱 설치" 버튼을 띄운다.
 */
(function () {
  'use strict';
  var deferred = null, bar = null;

  function hide() { if (bar) { bar.remove(); bar = null; } }

  function show() {
    if (bar || !document.body) return;
    bar = document.createElement('div');
    bar.setAttribute('role', 'dialog');
    bar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);' +
      'top:calc(10px + env(safe-area-inset-top, 0px));z-index:2147483000;display:flex;' +
      'align-items:center;gap:6px;padding:6px 6px 6px 14px;border-radius:999px;' +
      'background:#eef1f6;color:#0f1115;box-shadow:0 6px 20px rgba(0,0,0,.45);' +
      'font:600 14px/1.2 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;' +
      'white-space:nowrap;max-width:calc(100% - 24px)';
    var label = document.createElement('span');
    label.textContent = '홈 화면에 앱으로 설치할 수 있어요';
    var go = document.createElement('button');
    go.type = 'button'; go.textContent = '앱 설치';
    go.style.cssText = 'border:0;border-radius:999px;padding:8px 14px;background:#4d7cff;' +
      'color:#fff;font:inherit;cursor:pointer';
    var x = document.createElement('button');
    x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', '닫기');
    x.style.cssText = 'border:0;background:transparent;color:#5b6577;font:inherit;' +
      'padding:8px 8px;cursor:pointer';
    go.addEventListener('click', function () {
      if (!deferred) return hide();
      var ev = deferred; deferred = null;
      ev.prompt();
      ev.userChoice.then(hide, hide);
    });
    x.addEventListener('click', hide);
    bar.appendChild(label); bar.appendChild(go); bar.appendChild(x);
    document.body.appendChild(bar);
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); // 크롬 기본 안내 대신 이 버튼을 쓴다
    deferred = e;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
    else show();
  });
  window.addEventListener('appinstalled', function () { deferred = null; hide(); });
})();
