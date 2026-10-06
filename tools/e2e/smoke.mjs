// Logs in, opens every page, takes screenshots, and reports errors.
//   node tools/e2e/smoke.mjs [baseUrl] [email] [password] [outDir]
import { chromium } from "playwright-core";

const [base = "http://127.0.0.1:8787", email, password, out = "./shots"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const problems = [];

async function run(width, height, tag) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`[${tag}] pageerror ${page.url()}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") problems.push(`[${tag}] console ${page.url()}: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(base)) problems.push(`[${tag}] ${r.status()} ${r.url()}`); });

  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}/${tag}-landing.png` });
  await page.goto(base + "/login");
  await page.screenshot({ path: `${out}/${tag}-login.png` });
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await Promise.all([page.waitForNavigation(), page.click("button.btn")]);

  for (const path of ["/", "/polls", "/notifications", "/pro", "/chat", "/movies", "/account",
    "/admin?tab=users", "/admin?tab=games", "/admin?tab=import", "/admin?tab=polls", "/admin?tab=announce",
    "/admin?tab=pro", "/admin?tab=stats", "/admin?tab=settings", "/play/1", "/nope"]) {
    const res = await page.goto(base + path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(path.startsWith("/play") || path === "/chat" ? 2500 : 600);
    const name = path.replace(/[^a-z0-9]+/gi, "_") || "home";
    if (!res || (res.status() >= 400 && path !== "/nope")) problems.push(`[${tag}] ${res && res.status()} ${path}`);
    await page.screenshot({ path: `${out}/${tag}-${name}.png`, fullPage: !path.startsWith("/play") && path !== "/chat" });
  }
  // horizontal overflow check
  for (const path of ["/", "/polls", "/notifications", "/pro", "/admin?tab=users", "/admin?tab=games", "/chat"]) {
    await page.goto(base + path, { waitUntil: "domcontentloaded" });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) problems.push(`[${tag}] horizontal overflow ${over}px on ${path}`);
  }
  await ctx.close();
}

await run(1366, 900, "desk");
await run(390, 844, "phone");
await browser.close();
console.log(problems.length ? problems.join("\n") : "no problems");
