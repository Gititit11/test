# 제3자 저작물 고지

## 인체 근육 도해 (js/bodyfigure.js)

기록 화면의 근육 지도에 쓰이는 인체 도해 경로는 아래 저작물에서 가져왔습니다.

- **body-muscles** v1.0.0
- Copyright 2024 Ivan Vulović
- https://github.com/vulovix/body-muscles
- 라이선스: Apache License 2.0 — 전문은 [`licenses/body-muscles-LICENSE.txt`](licenses/body-muscles-LICENSE.txt),
  원저작자 고지는 [`licenses/body-muscles-NOTICE.txt`](licenses/body-muscles-NOTICE.txt)

### 변경 사항

Apache License 2.0 제4조에 따라 변경 내용을 밝힙니다.

- 좌우로 나뉜 부위와 세부 갈래(예: `triceps-long-left`, `triceps-lateral-right`)를
  이 앱이 쓰는 14개 부위(승모근·어깨·가슴·광배·기립근·이두·삼두·전완·복근·
  복사근·둔근·대퇴사두·햄스트링·종아리)로 묶었습니다.
- 근육이 아닌 부분(머리·얼굴·목·손·발·무릎·팔꿈치·척추)을 하나의 실루엣
  그룹으로 모았습니다.
- 원본 TypeScript/ESM 데이터 모듈을 이 앱이 쓰는 형태의 단일 스크립트
  (`js/bodyfigure.js`)로 변환했습니다. 경로 데이터 자체는 수정하지 않았습니다.

변환 스크립트는 [`tools/build-bodyfigure.js`](tools/build-bodyfigure.js) 입니다.

```bash
npm pack body-muscles@1.0.0 && tar xzf body-muscles-1.0.0.tgz
node tools/build-bodyfigure.js ./package
```
