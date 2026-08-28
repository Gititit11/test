/* body-muscles(Apache-2.0) 패키지의 인체 도해 경로를 앱의 14개 부위로 묶어
 * js/bodyfigure.js 를 생성한다.
 *
 *   npm pack body-muscles@1.0.0 && tar xzf body-muscles-1.0.0.tgz
 *   node tools/build-bodyfigure.js ./package
 *
 * 출처와 라이선스는 THIRD_PARTY_NOTICES.md 참고.
 */
const fs = require('fs');
const path = require('path');

const pkg = process.argv[2];
if (!pkg) {
  console.error('사용법: node tools/build-bodyfigure.js <body-muscles 패키지 경로>');
  process.exit(1);
}

// ESM 데이터 파일을 그대로 평가해 배열을 얻는다
function load(file) {
  const src = fs.readFileSync(path.join(pkg, 'dist/esm/data', file), 'utf8')
    .replace(/^import[^\n]*\n/m, 'const ViewSide = new Proxy({}, { get: () => "v" });\n')
    .replace(/export const (\w+)/, 'module.exports.$1');
  const mod = { exports: {} };
  new Function('module', 'exports', src)(mod, mod.exports);
  return Object.values(mod.exports)[0];
}

// 부위 id → 앱의 근육 그룹 (좌우·세부 갈래는 하나로 합친다)
const GROUP_OF = [
  [/^shoulder-(front|side)|^deltoid-rear/, 'shoulders'],
  [/^chest-/, 'chest'],
  [/^abs-|^hip-flexor/, 'abs'],
  [/^obliques|^serratus/, 'obliques'],
  [/^biceps/, 'biceps'],
  [/^triceps/, 'triceps'],
  [/^forearm/, 'forearms'],
  [/^traps-/, 'traps'],
  [/^lats-/, 'lats'],
  [/^lower-back-/, 'lowerback'],
  [/^gluteus-/, 'glutes'],
  [/^hamstrings-/, 'hamstrings'],
  [/^quads|^adductors/, 'quads'],
  [/^calves-|^tibialis/, 'calves']
];
// 근육이 아닌 부분은 실루엣으로
const SKIN = /^head|^face|^neck|^nape|^spine|^hand|^foot|^knee|^elbow/;

function groupFor(id) {
  for (const [re, g] of GROUP_OF) if (re.test(id)) return g;
  return SKIN.test(id) ? 'skin' : null;
}

function build(list, label) {
  const merged = {};
  const unknown = [];
  for (const m of list) {
    const g = groupFor(m.id);
    if (!g) { unknown.push(m.id); continue; }
    // 각 경로는 상대좌표('m')로 시작하므로 이어붙이면 위치가 어긋난다. 따로 보관한다.
    (merged[g] || (merged[g] = [])).push(m.path.trim());
  }
  if (unknown.length) console.warn(`  [${label}] 분류되지 않은 부위:`, unknown.join(', '));
  console.log(`  [${label}] ${list.length}개 → ${Object.keys(merged).length}개 그룹`);
  return merged;
}

const front = build(load('muscles.front.js'), 'front');
const back = build(load('muscles.back.js'), 'back');

const out = `/* 이 파일은 자동 생성됩니다 — 직접 수정하지 마세요.
 * 생성: node tools/build-bodyfigure.js <body-muscles 패키지 경로>
 *
 * 인체 도해 경로 출처: body-muscles v1.0.0 (Apache License 2.0)
 *   Copyright 2024 Ivan Vulović — https://github.com/vulovix/body-muscles
 * 변경 사항: 좌우·세부 갈래를 앱의 14개 부위로 묶고, 근육이 아닌
 *   부분(머리·손·발·관절 등)을 실루엣으로 모았습니다.
 * 전체 라이선스 고지는 THIRD_PARTY_NOTICES.md 를 참고하세요.
 */
(function (global) {
  'use strict';
  global.BodyFigure = {
    viewBox: { front: '0 0 35 93', back: '37 0 35 93' },
    front: ${JSON.stringify(front, null, 2).replace(/\n/g, '\n    ')},
    back: ${JSON.stringify(back, null, 2).replace(/\n/g, '\n    ')}
  };
})(window);
`;
fs.writeFileSync(path.join(__dirname, '../js/bodyfigure.js'), out);
console.log('js/bodyfigure.js 생성 완료:', Math.round(out.length / 1024) + 'KB');
