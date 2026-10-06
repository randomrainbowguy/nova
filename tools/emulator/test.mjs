#!/usr/bin/env node
// Headless smoke test for public/emulator.
//
//   node tools/emulator/test.mjs <outDir> <system>=<romPath> [<system>=<romPath> ...] [--iframe]
//
// For each ROM: opens /emulator/, picks the file through the real file input,
// presses Start, waits for EmulatorJS to boot, takes screenshots, and records
// every network request. Fails if anything is fetched from outside our origin
// (Google Fonts excepted). Test ROMs are NOT kept in the repo.
//
// Env: CHROME=/path/to/chrome (defaults to the macOS Google Chrome install).

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const useIframe = args.includes('--iframe');
const rest = args.filter(a => a !== '--iframe');
const outDir = path.resolve(rest.shift() || 'emulator-test-out');
const jobs = rest.map(a => { const i = a.indexOf('='); return { system: a.slice(0, i), rom: path.resolve(a.slice(i + 1)) }; });
if (!jobs.length) { console.error('usage: test.mjs <outDir> nes=/path/game.nes gba=/path/game.gba [--iframe]'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });

const PORT = 18787 + Math.floor(Math.random() * 1000);
const HOST = 'nova.test'; // not "localhost": avoids EmulatorJS's localhost-only update check
const ORIGIN = `http://${HOST}:${PORT}`;
const ALLOWED_EXTERNAL = [/^https:\/\/fonts\.googleapis\.com\//, /^https:\/\/fonts\.gstatic\.com\//];

const server = spawn(process.execPath, [path.join(here, 'serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => server.stdout.once('data', r));
process.on('exit', () => server.kill());

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: process.env.HEADED ? false : true,
  args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`, '--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    // Fake audio sink: EmulatorJS paces emulation off the audio clock, so a stalled/absent audio
    // device (e.g. sleeping Bluetooth headphones) freezes it after ~4 frames.
    '--disable-audio-output'],
});

let failed = false;
for (const job of jobs) {
  const tag = job.system + (useIframe ? '-iframe' : '');
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const page = await context.newPage();
  const requests = [];
  const external = [];
  const logs = [];
  page.on('request', req => {
    const u = req.url();
    if (u.startsWith('blob:') || u.startsWith('data:')) return;
    requests.push(u);
    if (!u.startsWith(ORIGIN) && !ALLOWED_EXTERNAL.some(rx => rx.test(u))) external.push(u);
  });
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', r => console.log('  requestfailed', r.url(), r.failure() && r.failure().errorText));

  let frame;
  if (useIframe) {
    // serve.mjs provides a same-origin page that frames /emulator/, like the site's player page.
    await page.goto(`${ORIGIN}/__frame_test.html`);
    for (let i = 0; i < 100 && !frame; i++) {
      frame = page.frames().find(f => f !== page.mainFrame() && /\/emulator\/$/.test(f.url()));
      if (!frame) await page.waitForTimeout(100);
    }
    if (!frame) throw new Error('iframe did not load /emulator/: ' + page.frames().map(f => f.url()).join(', '));
    await frame.waitForSelector('#rom', { state: 'attached' });
  } else {
    await page.goto(`${ORIGIN}/emulator/`);
    frame = page.mainFrame();
  }

  await page.screenshot({ path: path.join(outDir, `${tag}-0-setup.png`) });
  await frame.setInputFiles('#rom', job.rom);
  await frame.selectOption('#core', job.system);
  await page.screenshot({ path: path.join(outDir, `${tag}-1-picked.png`) });
  await frame.click('#start');

  let started = false;
  try {
    await frame.waitForFunction(() => document.body.getAttribute('data-emu') === 'running', null, { timeout: 60000 });
    started = true;
  } catch { /* fall through, screenshot shows what happened */ }
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(outDir, `${tag}-2-running.png`) });
  // Press Start/Enter a few times for ROMs that wait on input, then shoot again.
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(400); }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, `${tag}-3-later.png`) });

  const core = await frame.evaluate(() => window.EJS_emulator && window.EJS_emulator.getCore && window.EJS_emulator.getCore()).catch(() => null);
  const frameNum = () => frame.evaluate(() => { try { return window.EJS_emulator.gameManager.getFrameNum(); } catch (e) { return null; } }).catch(() => null);
  const probe = await frame.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else res({ rafPerSec: n,
      audio: (window.EJS_emulator && window.EJS_emulator.Module && window.EJS_emulator.Module.AL && window.EJS_emulator.Module.AL.currentCtx) ? window.EJS_emulator.Module.AL.currentCtx.audioCtx.state : 'n/a',
      paused: window.EJS_emulator && window.EJS_emulator.paused }); };
    requestAnimationFrame(tick);
  })).catch(e => ({ err: String(e) }));
  console.log(`${tag}: probe`, JSON.stringify(probe));
  const f1 = await frameNum(); await page.waitForTimeout(2000); const f2 = await frameNum();
  const advancing = typeof f1 === 'number' && f2 > f1;
  const fsOK = await frame.evaluate(() => document.fullscreenEnabled).catch(() => null);
  fs.writeFileSync(path.join(outDir, `${tag}-network.txt`), requests.join('\n') + '\n');
  fs.writeFileSync(path.join(outDir, `${tag}-console.txt`), logs.join('\n') + '\n');
  console.log(`${tag}: started=${started} core=${core} frames=${f1}->${f2} fullscreenEnabled=${fsOK} requests=${requests.length} external=${external.length}`);
  if (external.length) console.log('  EXTERNAL:', external.join('\n  '));
  if (!started || !advancing || external.length) failed = true;
  await context.close();
}

await browser.close();
server.kill();
process.exit(failed ? 1 : 0);
