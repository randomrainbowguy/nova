// Two people in Pro chat: messages arrive live, deletes propagate, XSS is shown as text.
import { chromium } from "playwright-core";
const base = process.argv[2] || "http://127.0.0.1:8787";
const browser = await chromium.launch({ channel: "chrome", headless: true });
async function login(email, pw) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("pageerror", e.message));
  await p.goto(base + "/login");
  await p.fill("input[name=email]", email); await p.fill("input[name=password]", pw);
  await Promise.all([p.waitForNavigation(), p.click("button.btn")]);
  await p.goto(base + "/chat");
  await p.waitForSelector(".conn-dot.on", { timeout: 10000 });
  return p;
}
const a = await login("gengarsdreamland25@gmail.com", "legacypass");
const b = await login("1234@abc.com", "bobpass1");
await a.waitForFunction(() => document.querySelectorAll("#chat-online li").length >= 2, null, { timeout: 5000 });
console.log("online on A:", await a.$$eval("#chat-online li", (l) => l.map((x) => x.textContent)));
const evil = `<img src=x onerror="window.pwned=1">hello from A`;
await a.fill("#chat-input", evil); await a.press("#chat-input", "Enter");
await b.waitForFunction((t) => [...document.querySelectorAll(".chat-text")].some((e) => e.textContent === t), evil, { timeout: 5000 });
console.log("B received A's message as text; pwned:", await b.evaluate(() => !!window.pwned));
await b.fill("#chat-input", "hey owner!"); await b.press("#chat-input", "Enter");
await a.waitForFunction(() => [...document.querySelectorAll(".chat-text")].some((e) => e.textContent === "hey owner!"), null, { timeout: 5000 });
console.log("A received B's reply");
// owner deletes bob's message
a.once("dialog", (d) => d.accept());
const row = (await a.$$(".chat-msg")).pop();
await row.hover(); await (await row.$(".chat-del")).click();
await b.waitForFunction(() => ![...document.querySelectorAll(".chat-text")].some((e) => e.textContent === "hey owner!"), null, { timeout: 5000 });
console.log("delete propagated to B");
// bob can't delete owner's message: no delete button on others' messages
const bobRows = await b.$$eval(".chat-msg:not(.mine) .chat-del", (x) => x.length);
console.log("delete buttons B sees on others' messages:", bobRows);
// rate limit
for (let i = 0; i < 8; i++) { await b.fill("#chat-input", "spam " + i); await b.press("#chat-input", "Enter"); }
await b.waitForSelector(".flash.error", { timeout: 5000 });
console.log("rate limit flash:", await b.textContent(".flash.error"));
// reload keeps history
await b.reload(); await b.waitForSelector(".conn-dot.on");
console.log("history after reload:", await b.$$eval(".chat-text", (x) => x.length), "messages");
await b.screenshot({ path: process.argv[3] || "chat.png" });
await browser.close();
