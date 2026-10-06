#!/usr/bin/env node
// Game-test harness runner. Loads each game through harness.html (fetch -> sanitize/base -> blob iframe)
// in headless Chrome, takes screenshots over ~20s, and classifies it.
//
//   node run.js [--ids 55,397] [--sanitize 0|1] [--concurrency 8] [--out results.json]
//               [--shots DIR] [--override 55=https://...] [--urls file.json] [--db ../../nova.db]
//               [--scale 2] [--port 8765] [--sanitizer path/to/alternative-game-sanitize.js]
//
// --urls file.json : JSON array of {id,name,url} to test instead of reading the DB.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { PNG } = require("pngjs");
const { start } = require("./server");

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) { const v = process.argv[i + 1]; if (!v || v.startsWith("--")) args[a.slice(2)] = "1"; else { args[a.slice(2)] = v; i++; } }
}
const HERE = __dirname;
const CONC = Number(args.concurrency || 8);
const SANITIZE = args.sanitize !== "0";
const OUT = path.resolve(args.out || path.join(HERE, "results.json"));
const SHOTS = path.resolve(args.shots || path.join(HERE, "shots"));
const PORT = Number(args.port || 8765);
const W = 800, H = 500;
const SCALE = Number(args.scale || 1);   // --scale 2 doubles every wait (for slow/large games)

function loadGames() {
  let games;
  if (args.urls) games = JSON.parse(fs.readFileSync(args.urls, "utf8"));
  else {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(path.resolve(args.db || path.join(HERE, "..", "..", "nova.db")), { readOnly: true });
    games = db.prepare("SELECT id, name, url FROM games WHERE url LIKE 'http%' ORDER BY id").all()
      .map((r) => ({ id: Number(r.id), name: r.name, url: r.url }));
    db.close();
  }
  if (args.ids) { const want = new Set(args.ids.split(",").map(Number)); games = games.filter((g) => want.has(g.id)); }
  for (const o of (args.override ? args.override.split(",") : [])) {
    const [id, u] = [Number(o.slice(0, o.indexOf("="))), o.slice(o.indexOf("=") + 1)];
    const g = games.find((x) => x.id === id); if (g) g.url = u;
  }
  return games;
}

// ---------- pixel statistics ----------
function stats(buf) {
  const png = PNG.sync.read(buf);
  const { width, height, data } = png;
  const lum = []; const counts = new Map(); let sum = 0, sum2 = 0, n = 0;
  for (let y = 0; y < height; y += 4) for (let x = 0; x < width; x += 4) {
    const i = (y * width + x) * 4; const r = data[i], g = data[i + 1], b = data[i + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b; lum.push(l); sum += l; sum2 += l * l; n++;
    const q = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4); counts.set(q, (counts.get(q) || 0) + 1);
  }
  const mean = sum / n; const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  let dom = 0; for (const c of counts.values()) if (c > dom) dom = c;
  return { lum, mean: +mean.toFixed(1), std: +std.toFixed(1), colors: counts.size, dominant: +(dom / n).toFixed(3) };
}
function diff(a, b) {
  let changed = 0, tot = 0;
  for (let i = 0; i < a.lum.length; i++) { const d = Math.abs(a.lum[i] - b.lum[i]); tot += d; if (d > 12) changed++; }
  return { frac: +(changed / a.lum.length).toFixed(4), mean: +(tot / a.lum.length).toFixed(2) };
}
// "blank" = essentially one flat colour (a small text line or button on black is NOT blank)
const isBlank = (s) => s.dominant >= 0.998 || s.colors <= 4 || s.std < 1.5;

// Things we never count as game errors (ads/analytics/etc).
const NOISE = /googletagmanager|google-analytics|googlesyndication|doubleclick|adsbygoogle|gtag|adservice|amazon-adsystem|cloudflareinsights|clarity\.ms|facebook|hotjar|favicon\.ico|imasdk|adinplay|gamemonetize|crazygames|poki|gamedistribution|cpmstar|playwire|venatus|ezoic|statcounter|histats|yandex/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probeDom(page) {
  // visible "loading" text / loading-bar elements across all frames
  const out = { text: "", indicator: false };
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    try {
      const r = await f.evaluate(() => {
        const body = document.body; if (!body) return { text: "", indicator: false };
        const text = (body.innerText || "").slice(0, 3000);
        let indicator = false;
        for (const el of document.querySelectorAll('[id*="load" i],[class*="load" i],[id*="progress" i],[class*="progress" i],[class*="spinner" i],progress')) {
          const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
          if (r.width > 20 && r.height > 2 && cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0") { indicator = true; break; }
        }
        return { text, indicator };
      });
      out.text += " " + r.text; out.indicator = out.indicator || r.indicator;
    } catch { /* cross-origin or detached */ }
  }
  const m = out.text.match(/[^\n]{0,40}(loading|downloading|please wait|\b\d{1,3}\s?%)[^\n]{0,40}/i);
  return { loadingText: m ? m[0].trim() : "", indicator: out.indicator, fullText: out.text.trim().slice(0, 300) };
}

async function clickPlayButton(page) {
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    try {
      const h = await f.evaluateHandle(() => {
        const re = /^\s*(play|start|play now|start game|click to play|tap to play|play game)\s*!?\s*$/i;
        let best = null, bestArea = Infinity;   // the smallest visible element whose whole text is "play"
        for (const el of document.querySelectorAll("button, a, input[type=button], [role=button], div, span")) {
          const t = el.tagName === "INPUT" ? el.value : el.textContent;
          if (!t || !re.test(t)) continue;
          const r = el.getBoundingClientRect(), area = r.width * r.height;
          if (r.width > 10 && r.height > 8 && getComputedStyle(el).visibility !== "hidden" && area < bestArea) { best = el; bestArea = area; }
        }
        return best;
      });
      const el = h.asElement();
      if (el) {
        await el.click({ timeout: 2000 });
        // blur it, so the Space/Enter we press next doesn't "click" the button a second time
        await f.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur()).catch(() => {});
        await sleep(500); return true;
      }
    } catch {}
  }
  return false;
}

async function testGame(browser, g) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  ctx.on("page", (p) => { if (p !== page) p.close().catch(() => {}); });
  const errors = [], pageErrors = [], failed = [];
  let topNav = null;
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  page.on("pageerror", (e) => { const at = (String(e.stack || "").split("\n").find((l) => /^\s+at /.test(l)) || "").trim(); pageErrors.push((String(e.message || e).slice(0, 240) + (at ? " | " + at.slice(0, 160) : ""))); });
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text().slice(0, 300); if (!NOISE.test(t)) errors.push(t); } });
  page.on("requestfailed", (r) => { const u = r.url(); if (!NOISE.test(u) && !u.startsWith("data:")) failed.push(`${r.failure()?.errorText || "failed"} ${u.slice(0, 200)}`); });
  page.on("response", (r) => { const u = r.url(); if (r.status() >= 400 && !NOISE.test(u)) failed.push(`HTTP ${r.status()} ${u.slice(0, 200)}`); });
  page.on("framenavigated", (f) => { if (f === page.mainFrame() && !f.url().startsWith(`http://localhost:${PORT}/`)) topNav = f.url(); });

  const res = { id: g.id, name: g.name, url: g.url, status: "ok", reason: "", errors: [] };
  const shots = [];
  try {
    await page.goto(`http://localhost:${PORT}/?sanitize=${SANITIZE ? 1 : 0}&url=${encodeURIComponent(g.url)}`, { waitUntil: "domcontentloaded", timeout: 20000 });
    let h = null;
    for (let i = 0; i < 60; i++) { h = await page.evaluate(() => window.__harness).catch(() => null); if (h && h.state !== "fetching") break; await sleep(250); }
    if (!h || h.state !== "loaded") {
      res.status = "fetch_failed"; res.reason = h ? (h.error || "fetch timeout") : "harness did not load";
      throw null;
    }
    const snap = async (label) => {
      const buf = await page.screenshot({ type: "png", timeout: 8000 }).catch(() => null);
      if (!buf) return null;
      const s = stats(buf); s.label = label; s.buf = buf; s.dom = await probeDom(page); shots.push(s); return s;
    };
    const T = (ms) => sleep(ms * SCALE);
    await T(4000); await snap("t4");
    await T(4000); await snap("t8");
    // nudge: click center, Space, Enter
    try {
      await clickPlayButton(page);   // an HTML "PLAY"/"START" button, if the page has one
      await page.mouse.click(W / 2, H / 2); await sleep(300); await page.keyboard.press("Space"); await sleep(200); await page.keyboard.press("Enter");
    } catch {}
    await T(3500); await snap("t12");
    await T(3500); await snap("t16");
    await T(3000); await snap("t19");
  } catch (e) { if (e) { res.status = "error"; res.reason = "harness exception: " + String(e.message || e).slice(0, 200); } }

  res.metrics = shots.map((s) => ({ t: s.label, mean: s.mean, std: s.std, colors: s.colors, dominant: s.dominant, loading: s.dom.loadingText, ind: s.dom.indicator }));
  res.diffs = []; for (let i = 1; i < shots.length; i++) res.diffs.push(diff(shots[i - 1], shots[i]).frac);
  if (topNav) { res.status = "error"; res.reason = "game navigated the top window to " + topNav.slice(0, 120); }
  else if (res.status === "ok" && shots.length >= 3) classify(res, res.metrics, res.diffs, pageErrors);
  else if (res.status === "ok") { res.status = "error"; res.reason = "could not take screenshots (page hung?)"; }

  res.errors = [...pageErrors.map((e) => "pageerror: " + e), ...errors, ...failed].filter((v, i, a) => a.indexOf(v) === i).slice(0, 25);
  const last = shots[shots.length - 1];
  if (last) {
    fs.writeFileSync(path.join(SHOTS, `${g.id}.png`), last.buf);
    if (shots[0] && res.status !== "ok") fs.writeFileSync(path.join(SHOTS, `${g.id}-early.png`), shots[0].buf);
  }
  await ctx.close().catch(() => {});
  return res;
}

// m = res.metrics (one entry per screenshot), diffs = fraction of pixels changed between consecutive shots.
// Exported so reclassify.js can re-apply the rules to stored results.
function classify(res, m, diffs, pageErrors) {
  const late = m.slice(-3);                   // after the click/keypress
  const moving = diffs.slice(-3).some((x) => x > 0.003);   // t8->t12, t12->t16, t16->t19
  const movingEnd = diffs.slice(-2).some((x) => x > 0.003);
  const last = m[m.length - 1];
  const fatal = pageErrors.length > 0;
  if (late.every(isBlank)) {
    res.status = fatal ? "error" : "black";
    res.reason = `uniform frame (mean lum ${last.mean}, ${last.colors} colors, dominant ${last.dominant})` + (fatal ? `; ${pageErrors[0].slice(0, 120)}` : "");
    return res;
  }
  // stuck loading: loading text/indicator visible at the end and earlier, and the frame no longer moves
  const loadingAtEnd = !!last.loading || last.ind;
  const loadingEarlier = m.slice(1, -1).some((s) => s.loading || s.ind);
  if (loadingAtEnd && loadingEarlier && !movingEnd) {
    res.status = "stuck_loading"; res.reason = `loading screen never finished${last.loading ? ` ("${last.loading.slice(0, 60)}")` : " (loading indicator still visible)"}`; return res;
  }
  res.static = false;
  if (!diffs.some((x) => x > 0.003)) {
    res.status = "ok"; res.reason = "static frame - no change over 19s (title screen? check screenshot)"; res.static = true; return res;
  }
  res.status = "ok"; res.reason = moving ? "animated" : "changed early, static later";
  return res;
}
module.exports = { classify, isBlank };
if (require.main !== module) return;

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const games = loadGames();
  const server = await start(PORT, args.sanitizer || null);
  const browser = await chromium.launch({
    channel: "chrome", headless: true,
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
  });
  const results = []; let next = 0, done = 0; const t0 = Date.now();
  async function worker() {
    while (next < games.length) {
      const g = games[next++];
      let r;
      try { r = await Promise.race([testGame(browser, g), sleep(70000 * SCALE).then(() => ({ id: g.id, name: g.name, url: g.url, status: "error", reason: "test timed out (page hung)", errors: [] }))]); }
      catch (e) { r = { id: g.id, name: g.name, url: g.url, status: "error", reason: "runner: " + e.message, errors: [] }; }
      results.push(r); done++;
      console.log(`[${done}/${games.length} ${((Date.now() - t0) / 1000).toFixed(0)}s] ${g.id} ${g.name}: ${r.status} ${r.reason}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, games.length) }, worker));
  results.sort((a, b) => a.id - b.id);
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  const c = {}; for (const r of results) c[r.status] = (c[r.status] || 0) + 1;
  console.log("summary", JSON.stringify(c), "->", OUT);
  await browser.close(); server.close();
})();
