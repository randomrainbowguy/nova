#!/usr/bin/env node
// Debug one game: logs every console message, page error and request (with status), then saves a screenshot.
//   node debug.js <game url> [--sanitize 0] [--wait 20] [--shot out.png] [--click]
const { chromium } = require("playwright-core");
const { start } = require("./server");

(async () => {
  const a = process.argv.slice(2); const url = a[0];
  const opt = (k, d) => { const i = a.indexOf("--" + k); return i === -1 ? d : (a[i + 1] && !a[i + 1].startsWith("--") ? a[i + 1] : "1"); };
  const port = Number(opt("port", 8790));
  const server = await start(port, opt("sanitizer", null));
  const b = await chromium.launch({ channel: "chrome", headless: !opt("headed", null), args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio", "--enable-unsafe-swiftshader"] });
  const ctx = await b.newContext({ viewport: { width: 800, height: 500 } });
  const p = await ctx.newPage();
  const t0 = Date.now(); const ts = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
  p.on("console", (m) => console.log(ts(), "CONSOLE", m.type(), m.text().slice(0, 400)));
  p.on("pageerror", (e) => console.log(ts(), "PAGEERROR", String(e.stack || e).slice(0, 600)));
  p.on("requestfailed", (r) => console.log(ts(), "REQFAIL", r.failure()?.errorText, r.url().slice(0, 300)));
  p.on("response", (r) => { if (opt("all", null) || r.status() >= 300) console.log(ts(), "RESP", r.status(), r.headers()["content-type"] || "", r.url().slice(0, 300)); });
  p.on("worker", (w) => { console.log(ts(), "WORKER", w.url().slice(0, 150)); try { w.on("console", (m) => console.log(ts(), "WCONSOLE", m.type(), m.text().slice(0, 400))); } catch (e) {} w.on("close", () => console.log(ts(), "WORKER CLOSED")); });
  p.on("dialog", (d) => { console.log(ts(), "DIALOG", d.message()); d.dismiss().catch(() => {}); });
  await p.goto(`http://localhost:${port}/?sanitize=${opt("sanitize", "1")}&top=${opt("top", "0")}&url=${encodeURIComponent(url)}`);
  const wait = Number(opt("wait", 20)) * 1000;
  if (opt("click", null)) {
    await p.waitForTimeout(wait / 2);
    const [cx, cy] = opt("click", "1") === "1" ? [400, 250] : opt("click").split(",").map(Number);   // --click X,Y
    await p.mouse.click(cx, cy); if (opt("click") === "1") await p.keyboard.press("Space");
  }
  await p.waitForTimeout(opt("click", null) ? wait / 2 : wait);
  await p.screenshot({ path: opt("shot", "debug.png") });
  for (const f of p.frames()) console.log("FRAME", f.url().slice(0, 150));
  await b.close(); server.close();
})();
