// node shot.mjs <path> <out.png> [scrollY] [width] [height]
import { chromium } from "playwright-core";
const [path, out, y = "0", w = "1366", h = "900"] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await (await b.newContext({ viewport: { width: +w, height: +h } })).newPage();
await p.goto("http://127.0.0.1:8787/login");
await p.fill("input[name=email]", process.env.E || "gengarsdreamland25@gmail.com");
await p.fill("input[name=password]", process.env.P || "legacypass");
await Promise.all([p.waitForNavigation(), p.click("button.btn")]);
await p.goto("http://127.0.0.1:8787" + path, { waitUntil: "networkidle" });
await p.evaluate((y) => window.scrollTo(0, y), +y);
await p.waitForTimeout(1500);
await p.screenshot({ path: out });
await b.close();
