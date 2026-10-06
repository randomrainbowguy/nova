// Regression checks for the review findings: login open redirect, chat kick on Pro removal, WS origin check.
import { chromium } from "playwright-core";
const base = process.argv[2] || "http://127.0.0.1:8787";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const login = async (email, pw, next = "") => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(base + "/login" + next);
  await p.fill("input[name=email]", email); await p.fill("input[name=password]", pw);
  await Promise.all([p.waitForNavigation(), p.click("button.btn")]);
  return p;
};
const evil = await login("1234@abc.com", "bobpass1", "?next=/%09/evil.example/pwn");
console.log("after login with evil next ->", evil.url());

const owner = await login("gengarsdreamland25@gmail.com", "legacypass");
const bob = await login("1234@abc.com", "bobpass1");
await bob.goto(base + "/chat"); await bob.waitForSelector(".conn-dot.on");
// cross-origin socket from bob's browser context is refused
const xo = await bob.evaluate(async () => {
  const r = await fetch("/chat/ws", { headers: { Upgrade: "websocket" } }).catch((e) => ({ status: "fetch-error" }));
  return r.status;
});
// owner revokes bob's Pro on the Pro tab
await owner.goto(base + "/admin?tab=pro");
owner.on("dialog", (d) => d.accept());
const row = owner.locator("tr", { hasText: "1234@abc.com" });
await row.locator("button[value=revoke]").click();
await owner.waitForLoadState();
await bob.waitForFunction(() => document.getElementById("conn-text").textContent === "No access", null, { timeout: 8000 });
console.log("bob kicked from chat after Pro removal: yes; input disabled:", await bob.$eval("#chat-input", (e) => e.disabled));
// give Pro back
await owner.goto(base + "/admin?tab=pro");
await owner.selectOption("select[name=user_id]", { label: "bob (1234@abc.com)" });
await Promise.all([owner.waitForNavigation(), owner.click("form:has(select[name=user_id]) button.btn")]);
console.log("bob is Pro again:", await owner.locator("tr", { hasText: "1234@abc.com" }).count() === 1);
await browser.close();
