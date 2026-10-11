import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const mode = process.argv[2];
assert.ok(["production", "pages"].includes(mode), "Usage: node scripts/verify-csp.mjs production|pages");
const html = readFileSync("dist/index.html", "utf8");
const document = new JSDOM(html).window.document;
const policies = [...document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')];
if (mode === "production") {
  assert.equal(policies.length, 0, "Self-hosted HTML must use nginx's response-header CSP");
} else {
  assert.equal(policies.length, 1, "Pages HTML must have exactly one CSP meta tag");
  const meta = policies[0];
  assert.equal(meta.parentElement, document.head);
  const nginx = readFileSync("deploy/nginx.conf", "utf8");
  const header = nginx.match(/add_header Content-Security-Policy "([^"]+)"/)[1];
  const expected = header.split("; ").filter((directive) => !directive.startsWith("frame-ancestors ")).join("; ");
  assert.equal(meta.content, expected, "Pages must mirror all meta-compatible nginx directives");
  // Meta policies only protect content parsed after them, including module preloads.
  for (const resource of document.querySelectorAll("script, link, style, img, base, form")) {
    assert.ok(meta.compareDocumentPosition(resource) & 4, "CSP must precede every resource/active element");
  }
  const entry = document.querySelector('script[type="module"][src]');
  assert.ok(entry?.getAttribute("src").startsWith("/hima/assets/"), "Verify the actual Pages build");
  assert.equal(document.querySelectorAll("script:not([src])").length, 0, "Inline scripts would be blocked");
}
console.log(`Verified ${mode} built HTML CSP`);
