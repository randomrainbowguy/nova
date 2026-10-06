#!/usr/bin/env node
// Contact sheet of screenshots, for eyeballing results quickly.
//   node contact.js OUT.png DIR id1 id2 ...      (uses DIR/<id>.png, labels with id + optional results.json name/status)
//   node contact.js OUT.png DIR --results results.json --status black,stuck_loading
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

(async () => {
  const [out, dir, ...rest] = process.argv.slice(2);
  let ids = [], results = null, statuses = null, cols = 5;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--results") results = JSON.parse(fs.readFileSync(rest[++i], "utf8"));
    else if (rest[i] === "--status") statuses = rest[++i].split(",");
    else if (rest[i] === "--cols") cols = Number(rest[++i]);
    else ids.push(rest[i]);
  }
  const byId = new Map((results || []).map((r) => [String(r.id), r]));
  if (!ids.length && results) ids = results.filter((r) => !statuses || statuses.includes(r.status)).map((r) => String(r.id));
  ids = ids.filter((id) => fs.existsSync(path.join(dir, `${id}.png`)));
  const cells = ids.map((id) => {
    const r = byId.get(id); const b64 = fs.readFileSync(path.join(dir, `${id}.png`)).toString("base64");
    const label = `${id}${r ? " " + r.name + " [" + r.status + "]" : ""}`.replace(/</g, "&lt;");
    return `<div class=c><img src="data:image/png;base64,${b64}"><div class=l>${label}</div></div>`;
  }).join("");
  const html = `<style>body{margin:0;background:#222;font:12px sans-serif;color:#fff;display:grid;grid-template-columns:repeat(${cols},260px);gap:4px;padding:4px}
    img{width:260px;height:162px;display:block;object-fit:contain;background:#000}.l{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:2px}</style>${cells}`;
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage({ viewport: { width: cols * 264 + 8, height: 200 } });
  await p.setContent(html); await p.screenshot({ path: out, fullPage: true });
  await b.close();
  console.log(`${ids.length} shots -> ${out}`);
})();
