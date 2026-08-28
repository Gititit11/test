/* CSS·JS 를 index.html 에 모두 끼워 넣어 파일 한 개짜리 앱을 만든다.
 *   node tools/build-single.js            → dist/gymmate.html (그대로 열면 되는 완성본)
 *   node tools/build-single.js --fragment → dist/gymmate.fragment.html (<head>·<body> 없이 내용만)
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fragment = process.argv.includes('--fragment');

let html = read('index.html');

// 외부 스타일시트 → <style> 인라인
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g,
  (_, href) => '<style>\n' + read(href) + '\n</style>');

// 외부 스크립트 → <script> 인라인
html = html.replace(/<script src="([^"]+)"><\/script>/g,
  (_, src) => '<script>\n' + read(src) + '\n</script>');

// 파일 하나로 쓰는 버전에는 매니페스트·서비스워커·외부 아이콘이 필요 없다
html = html
  .replace(/[ \t]*<link rel="manifest"[^>]*>\n?/g, '')
  .replace(/[ \t]*<link rel="(icon|apple-touch-icon)"[^>]*>\n?/g, '')
  .replace(/[ \t]*<script>\s*if \('serviceWorker' in navigator[\s\S]*?<\/script>\n?/g, '');

if (fragment) {
  // Artifact 처럼 <head>·<body> 를 감싸주는 환경용: 내용만 남긴다
  html = html
    .replace(/^[\s\S]*?<head>/, '')
    .replace(/<\/head>\s*<body>/, '')
    .replace(/<\/body>[\s\S]*$/, '')
    .replace(/[ \t]*<meta[^>]*>\n?/g, '')
    .trim();
}

const out = path.join(root, 'dist', fragment ? 'gymmate.fragment.html' : 'gymmate.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(out, (fs.statSync(out).size / 1024).toFixed(0) + 'KB');
