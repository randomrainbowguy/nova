#!/usr/bin/env node
// Compare two harness result files (e.g. without vs with the sanitizer).
//   node compare.js before.json after.json
const fs = require("fs");
const [a, b] = process.argv.slice(2).map((f) => new Map(JSON.parse(fs.readFileSync(f, "utf8")).map((r) => [r.id, r])));
const count = (m) => { const c = {}; for (const r of m.values()) c[r.status] = (c[r.status] || 0) + 1; return c; };
console.log("before", JSON.stringify(count(a)));
console.log("after ", JSON.stringify(count(b)));
const fixed = [], broke = [], changed = [];
for (const [id, rb] of b) {
  const ra = a.get(id); if (!ra) continue;
  if (ra.status !== "ok" && rb.status === "ok") fixed.push(rb);
  else if (ra.status === "ok" && rb.status !== "ok") broke.push([ra, rb]);
  else if (ra.status !== rb.status) changed.push([ra, rb]);
}
console.log(`\nfixed (${fixed.length}):`, fixed.map((r) => r.id).join(","));
console.log(`\nok before, NOT ok after (${broke.length}):`);
for (const [ra, rb] of broke) console.log(`  ${rb.id} ${rb.name}: ${rb.status} — ${rb.reason.slice(0, 120)}`);
console.log(`\nother status changes (${changed.length}):`);
for (const [ra, rb] of changed) console.log(`  ${rb.id} ${rb.name}: ${ra.status} -> ${rb.status}`);
