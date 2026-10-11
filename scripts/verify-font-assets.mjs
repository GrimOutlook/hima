import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const files = readdirSync("dist/assets");
const stylesheets = files.filter((file) => file.endsWith(".css"));
assert.ok(stylesheets.length > 0, "Build the frontend before verifying fonts");
const css = stylesheets.map((file) => readFileSync(`dist/assets/${file}`, "utf8")).join("\n");
const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map((match) => match[1]);
const expected = new Set([
  "DM Sans:400", "DM Sans:500", "DM Sans:600", "DM Sans:700",
  "Manrope:600", "Manrope:700", "Manrope:800",
]);
assert.equal(faces.length, expected.size, "Only the seven audited font faces should ship");
for (const face of faces) {
  const family = /font-family:([^;]+)/.exec(face)?.[1].replace(/["']/g, "").trim();
  const weight = /font-weight:(\d+)/.exec(face)?.[1];
  assert.ok(expected.delete(`${family}:${weight}`), `Unexpected or duplicate face: ${family}:${weight}`);
  assert.match(face, /font-style:normal/);
  assert.match(face, /font-display:swap/);
  const urls = [...face.matchAll(/url\(([^)]+)\)/g)].map((match) => match[1].replace(/["']/g, ""));
  assert.equal(urls.length, 2, "Each face should provide WOFF2 and WOFF");
  for (const url of urls) {
    assert.ok(!url.includes(":"), "Fonts must remain self-hosted");
    const filename = url.split("/").at(-1);
    assert.match(filename, /-latin-\d+-normal-.*\.woff2?$/);
    assert.ok(files.includes(filename), `Missing font asset: ${filename}`);
  }
}
assert.equal(expected.size, 0);
const fonts = files.filter((file) => /\.woff2?$/.test(file));
assert.equal(fonts.length, 14, "No unused weights or subsets should ship");
const bytes = Buffer.byteLength(css);
const gzipBytes = gzipSync(css).length;
// Allow the six appearance palettes and shared themed component styles.
assert.ok(bytes < 45_000, `Stylesheet exceeds 45 KB budget: ${bytes}`);
assert.ok(gzipBytes < 11_000, `Gzipped stylesheet exceeds 11 KB budget: ${gzipBytes}`);
console.log(`Font assets verified: ${faces.length} faces, ${fonts.length} files; CSS ${bytes} bytes, gzip ${gzipBytes} bytes`);
