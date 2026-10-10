import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("dist/.vite/manifest.json", "utf8"));
const entry = Object.values(manifest).find((chunk) => chunk.isEntry);
const chart = manifest["src/BalanceChart.tsx"];
assert.ok(entry, "Build must contain an entry chunk");
assert.ok(chart?.isDynamicEntry, "BalanceChart must remain a dynamic entry");
const staticFiles = new Set();
function visit(chunk) {
  if (staticFiles.has(chunk.file)) return;
  staticFiles.add(chunk.file);
  for (const key of chunk.imports ?? []) visit(manifest[key]);
}
visit(entry);
assert.ok(!staticFiles.has(chart.file), "Entry must not statically depend on the chart");
assert.ok(entry.dynamicImports?.includes("src/BalanceChart.tsx"), "Entry must dynamically import the chart");
const html = await readFile("dist/index.html", "utf8");
assert.ok(!html.includes(chart.file), "HTML must not preload the chart");
console.log(`Verified: ${entry.file} dynamically imports ${chart.file}; no static chart dependency or HTML preload.`);
