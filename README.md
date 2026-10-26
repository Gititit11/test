# 앱 모음

앱마다 폴더 하나씩 들어 있습니다. 모든 앱은 `main` 갈래에서 함께 관리합니다.

| 폴더 | 앱 | 종류 |
| --- | --- | --- |
| `gymmate/` | **짐메이트** — 헬스 루틴 & 세트 체크 · [문서](gymmate/README.md) | 웹앱 · `/test/gymmate/` |
| `gyeopsajin/` | **겹사진** — 갤러리에서 같은 사진 묶기 · [문서](gyeopsajin/README.md) | 안드로이드 앱 (APK) |
| `scanner/` | **스캔메이트** — 문서 사진을 스캔본 PDF 로 · [문서](scanner/README.md) | 웹앱 · `/test/scanner/` |

`/test/` 는 앱으로 들어가는 안내 페이지입니다.

```bash
npx http-server . -p 8080 --silent
# → http://localhost:8080/          안내 페이지
# → http://localhost:8080/gymmate/  짐메이트
# → http://localhost:8080/scanner/  스캔메이트
```

## `gyeopsajin/` 은 무엇인가

웹앱이 아니라 **안드로이드 앱**입니다. 갤러리에서 같은 사진을 찾아 묶어 주는
[겹사진](gyeopsajin/README.md) 이며, 크기만 다른 사본도 같은 사진으로 봅니다.

웹앱으로 만들지 않은 이유는 지우기 때문입니다. 브라우저는 기기의 사진 파일을
지울 수 없어서, 웹으로 만들면 "이 사진들을 지우세요" 라는 목록을 보여 주는 데에서
멈춥니다. 안드로이드 앱은 시스템 확인창을 띄워 사용자가 그 자리에서 지울 수 있습니다.

APK 는 `.github/workflows/android.yml` 이 만들어 릴리스에 올립니다. 폰에서는
`https://github.com/Gititit11/test/releases/latest/download/gyeopsajin.apk` 로 바로 받습니다.
GitHub Pages 와는 상관이 없습니다.

## 왜 앱이 폴더 안에 있나

설치형 웹앱(PWA)은 자기 **영역(scope)** 을 매니페스트가 놓인 위치 기준으로 잡습니다.
짐메이트가 루트에 있으면 영역이 `/test/` 전체가 되어, 같은 저장소에 다른 앱을 두었을 때
그 앱이 짐메이트의 한 페이지로 취급되는 문제가 있었습니다. 그래서 앱을 폴더 안에
두어 영역을 명확히 합니다.

매니페스트의 `id` 는 적지 않습니다. 적지 않으면 `start_url` 이 그대로 앱의 신원이
되어 실제 주소와 항상 일치합니다.

### 안드로이드 크롬에서 두 번째 앱이 설치되지 않는 문제

안드로이드 크롬의 **⋮ → 앱 설치** 메뉴는 같은 주소(`gititit11.github.io`)에 깔린 앱이
**하나라도 있으면** 이미 설치됐다고 판단합니다 (크롬 소스
`WebappRegistry.isAppInstalledForUrl` → `hasAtLeastOneWebApkForOrigin`). 그래서
스캔메이트를 깔면 짐메이트는 메뉴로 설치할 수 없고, "열기" 를 누르면
'앱을 열 수 없음' 이 뜹니다. 반대 순서도 마찬가지입니다.

페이지가 직접 띄우는 설치(`beforeinstallprompt` → `prompt()`)는 앱 범위(scope)로
판단해서 이 문제가 없습니다. 그래서 각 앱의 `js/install.js` 가 설치할 수 있을 때
화면 위에 **"앱 설치"** 버튼을 띄웁니다. 두 앱의 `install.js` 는 같은 파일입니다.

> 짐메이트 주소가 `/test/` 에서 `/test/gymmate/` 로 바뀐 적이 있습니다.
> 예전 아이콘은 안내 페이지로 열리며, 거기서 다시 설치하면 됩니다. 기록은 그대로 남습니다.
> 루트의 `sw.js` 는 예전 주소에 남아 있던 서비스워커를 스스로 걷어내는 역할만 합니다.

## 배포

`main` 에 올라온 것만 배포합니다. 다른 갈래에 올려도 사이트나 APK 는 바뀌지 않습니다.

- `.github/workflows/pages.yml` — 저장소 전체를 GitHub Pages 로 올립니다 (웹앱)
- `.github/workflows/android.yml` — `gyeopsajin/` 이 바뀌면 APK 를 만들어 릴리스에 올립니다
