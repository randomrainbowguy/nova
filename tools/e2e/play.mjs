// Opens /play/<id> for each id, waits, screenshots the game frame. node play.mjs outDir id...
import { chromium } from "playwright-core";
const [out, ...ids] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--autoplay-policy=no-user-gesture-required"] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await p.goto("http://127.0.0.1:8787/login");
await p.fill("input[name=email]", "gengarsdreamland25@gmail.com"); await p.fill("input[name=password]", "legacypass");
await Promise.all([p.waitForNavigation(), p.click("button.btn")]);
for (const id of ids) {
  const errs = [];
  const onErr = (e) => errs.push(e.message);
  p.on("pageerror", onErr);
  await p.goto(`http://127.0.0.1:8787/play/${id}`);
  await p.waitForTimeout(15000);
  const status = await p.evaluate(() => document.getElementById("game-status")?.textContent?.trim() || "loaded");
  await p.screenshot({ path: `${out}/play-${id}.png` });
  console.log(id, status.slice(0, 80), errs.length ? "errors: " + errs.slice(0, 2).join(" | ") : "");
  p.off("pageerror", onErr);
}
await b.close();
