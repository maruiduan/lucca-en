// Run: node tests/lesson-regression.cjs (requires Playwright and Chromium).
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../site');
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) file = root;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  try { res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox']});
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      window.testMedia = {requests: 0, starts: 0, stops: 0, pending: [], defer: false};
      Object.defineProperty(navigator, 'mediaDevices', {value: {getUserMedia() {
        const t = window.testMedia; t.requests++;
        const stream = {getTracks: () => [{stop() {t.stops++;}}]};
        return t.defer ? new Promise(resolve => t.pending.push(() => resolve(stream))) : Promise.resolve(stream);
      }}});
      window.MediaRecorder = class {
        constructor(stream) {this.stream=stream; this.state='inactive'; this.mimeType='audio/webm';}
        start() {this.state='recording';window.testMedia.starts++;}
        stop() {this.state='inactive';setTimeout(() => {this.ondataavailable({data:new Blob(['test'])});this.onstop();}, 40);}
      };
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base + '/jobs/?src=mock');
    await page.waitForFunction(() => window.__M && window.__lesson);
    await page.evaluate(() => {__lesson.S[0].en='I was eighteen.';__lesson.selStep(1);});
    await page.locator('#dIn').fill('I was eighteen.'); await page.locator('#dChk').click();
    assert.match(await page.locator('#dRes').innerText(), /100%/);
    await page.locator('#dIn').fill('I was 18.');
    assert.equal(await page.locator('#dChk').innerText(), '核对');
    await page.locator('#dChk').click();
    assert.match(await page.locator('#dRes').innerText(), /100%/);
    assert.equal(await page.evaluate(() => __lesson.st.dictId), 0, 'editing an answer must recheck, not advance');
    console.log('PASS symmetric number-word grading and edited-answer recheck');

    await page.evaluate(() => {__lesson.selStep(3);testMedia.defer=true;});
    await page.locator('#sRec').click(); await page.locator('#sRec').click();
    assert.equal(await page.evaluate(() => testMedia.requests), 1, 'pending permission must not spawn duplicate requests');
    await page.evaluate(() => {__lesson.selStep(2);testMedia.pending.shift()();});
    await page.waitForFunction(() => testMedia.stops===1);
    assert.equal(await page.evaluate(() => testMedia.starts), 0, 'leaving before permission must not start recording');
    console.log('PASS pending microphone request cancellation and deduplication');

    await page.evaluate(() => {testMedia.defer=false;__lesson.selStep(3);});
    await page.locator('#sRec').click();
    await page.waitForFunction(() => testMedia.starts===1);
    await page.evaluate(() => __lesson.selSeg(1));
    await page.waitForFunction(() => __lesson.REC.has(0));
    assert.equal(await page.evaluate(() => testMedia.stops), 2);
    assert.equal(await page.evaluate(() => __M.paused()), true, 'navigation must suppress automatic preview');
    assert.equal(await page.evaluate(() => __lesson.st.seg), 1);
    console.log('PASS recording stop on navigation, correct original key and no stale playback');

    await page.evaluate(() => {__lesson.selSeg(0);__lesson.selStep(3);});
    await page.locator('#sCmp').click();
    await page.evaluate(() => {__lesson.st.onStop();__lesson.selStep(2);window.playedMine=0;HTMLMediaElement.prototype.play=function(){playedMine++;return Promise.resolve()};});
    await page.waitForTimeout(450);
    assert.equal(await page.evaluate(() => playedMine), 0, 'navigation must cancel queued comparison audio');
    console.log('PASS delayed comparison cancellation');

    await page.evaluate(() => localStorage.setItem('en.jobs.p',JSON.stringify({seg:-5,step:88,done:{1:'corrupt'}})));
    await page.reload();await page.waitForFunction(() => window.__M && window.__lesson);
    assert.equal(await page.evaluate(() => __lesson.st.seg), 0);
    assert.equal(await page.evaluate(() => __lesson.st.step), 0);
    assert.equal(await page.locator('#tabs button').count(), 5);
    for(const slug of ['feifei','robinson','urban','cuddy']) {
      await page.goto(base + `/${slug}/?src=mock`);await page.waitForFunction(() => window.__M && window.__lesson);
      for(let step=0;step<5;step++) await page.evaluate(step => __lesson.selStep(step), step);
    }
    assert.deepEqual(errors, []);
    console.log('PASS corrupt progress recovery and all five lessons/five steps without JS errors');
  } finally {await browser.close();server.close();}
})().catch(e => {console.error(e);server.close();process.exitCode=1;});
