#!/usr/bin/env node
/* 알림이 제때 울리는지 스스로 확인한다.
 *
 *   node majungmul/tools/check-remind.js          빠른 검사 (몇 초)
 *   node majungmul/tools/check-remind.js --slow   진짜 시계로 1분 기다리는 검사까지
 *
 * 왜 이 파일이 있나: "다음 알림 시각" 계산만 맞으면 된다고 여기고 그것만 확인한
 * 적이 있는데, 정작 발사 판단이 그 값과 어긋나 정한 시각 모드가 한 번도 울리지
 * 않았다. 계산이 아니라 "이 순간 울리는가" 를 확인해야 한다.
 *
 * 앱을 그대로 브라우저에 띄워 검사하므로 별도의 흉내 내기가 필요 없다.
 */
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');   // 저장소 루트
const SLOW = process.argv.includes('--slow');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function serve() {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      fs.readFile(p, (err, buf) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
        res.end(buf);
      });
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = got === want;
  console.log((ok ? '  OK   ' : '  실패 ') + name + (ok ? '' : `  (기대 ${want}, 실제 ${got})`));
  ok ? pass++ : fail++;
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/majungmul/`;
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ locale: 'ko-KR' })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('' + e.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  console.log('\n정한 시각 모드');
  // 이번에 놓쳤던 바로 그 지점 — 시각이 막 지났는데 울리지 않던 문제
  const times = await page.evaluate(() => {
    const at = (min) => { const d = new Date(Date.now() + min * 60000);
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    const set = (o) => { Store.reset(); Store.setRemind(Object.assign({
      on: true, mode: 'times', from: '00:00', to: '23:59', days: [0,1,2,3,4,5,6],
      lastFired: 0, snoozeUntil: 0, skipWhenDone: false }, o)); };
    const out = {};
    set({ times: [at(-2)] });                      // 2분 전 시각
    out.justPast = Remind.due(Date.now());
    set({ times: [at(-2)], lastFired: Date.now() });   // 이미 알린 뒤
    out.alreadyFired = Remind.due(Date.now());
    set({ times: [at(2)] });                      // 아직 안 온 시각
    out.future = Remind.due(Date.now());
    set({ times: [at(-90)] });                    // 한참 지난 시각
    out.stale = Remind.due(Date.now());
    set({ times: [at(-2)], skipWhenDone: true });
    Store.setSettings({ goal: 100 }); Store.add(200);   // 목표를 채운 날
    out.goalDone = Remind.due(Date.now());
    Store.reset();
    return out;
  });
  check('시각이 막 지나면 울린다', times.justPast, true);
  check('이미 알린 시각은 다시 안 울린다', times.alreadyFired, false);
  check('아직 안 온 시각에는 안 울린다', times.future, false);
  check('한참 지난 시각은 뒤늦게 안 울린다', times.stale, false);
  check('목표를 채운 날은 안 울린다', times.goalDone, false);

  console.log('\n간격 모드');
  const iv = await page.evaluate(() => {
    const set = (o) => { Store.reset(); Store.setRemind(Object.assign({
      on: true, mode: 'interval', everyMin: 60, from: '00:00', to: '23:59', days: [0,1,2,3,4,5,6],
      lastFired: 0, snoozeUntil: 0, afterDrink: false, skipWhenDone: false }, o)); };
    const out = {};
    set({ lastFired: Date.now() - 61 * 60000 });
    out.overdue = Remind.due(Date.now());
    set({ lastFired: Date.now() - 30 * 60000 });
    out.tooEarly = Remind.due(Date.now());
    set({ lastFired: Date.now() - 61 * 60000, from: '23:00', to: '23:30' });  // 시간대 밖
    out.outsideWindow = Remind.due(new Date().setHours(12, 0, 0, 0));
    set({ lastFired: Date.now() - 61 * 60000, snoozeUntil: Date.now() + 600000 });
    out.snoozed = Remind.due(Date.now());
    Store.reset();
    return out;
  });
  check('간격이 지나면 울린다', iv.overdue, true);
  check('간격 전에는 안 울린다', iv.tooEarly, false);
  check('부르는 시간대 밖에서는 안 울린다', iv.outsideWindow, false);
  check('미뤄 둔 동안에는 안 울린다', iv.snoozed, false);

  if (SLOW) {
    console.log('\n진짜 시계로 1분 기다리기 (정한 시각 모드)');
    await page.evaluate(async () => {
      Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true });
      Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
      document.hasFocus = () => false;
      const reg = await navigator.serviceWorker.ready;
      window.__sent = [];
      reg.showNotification = () => { window.__sent.push(Date.now()); return Promise.resolve(); };
      const d = new Date(Date.now() + 60000);
      Store.reset();
      Store.setRemind({ on: true, mode: 'times', from: '00:00', to: '23:59', days: [0,1,2,3,4,5,6],
        times: [String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')],
        lastFired: 0, snoozeUntil: 0, skipWhenDone: false });
    });
    for (let i = 0; i < 10 && !(await page.evaluate(() => window.__sent.length)); i++) {
      await page.waitForTimeout(10000);
      process.stdout.write('.');
    }
    console.log('');
    const n = await page.evaluate(() => window.__sent.length);
    check('정한 시각에 알림이 실제로 나간다', n, 1);
  }

  if (errs.length) { console.log('\n화면 오류:\n' + errs.join('\n')); fail += errs.length; }
  console.log(`\n${pass}개 통과, ${fail}개 실패`);
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})();
