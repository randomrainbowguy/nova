#!/usr/bin/env node
// Re-apply the current classification rules (run.js classify) to a stored results file, in place or to OUT.
//   node reclassify.js results.json [out.json]
const fs = require("fs");
const { classify } = require("./run");
const [inp, out] = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(inp, "utf8"));
let n = 0;
for (const r of rows) {
  if (!r.metrics || r.metrics.length < 3 || !r.diffs || r.status === "fetch_failed" || /navigated|timed out|harness/.test(r.reason)) continue;
  const before = r.status;
  classify(r, r.metrics, r.diffs, (r.errors || []).filter((e) => e.startsWith("pageerror: ")).map((e) => e.slice(11)));
  if (r.status !== before) n++;
}
fs.writeFileSync(out || inp, JSON.stringify(rows, null, 1));
const c = {}; for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
console.log(`${n} changed;`, JSON.stringify(c));
