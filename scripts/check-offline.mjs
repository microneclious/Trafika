#!/usr/bin/env node
// Fails if the built web app could talk to any other host. Run after `npm run build`.
// 1. Every absolute URL in dist/ must be on the allowlist below: strings that are never requested
//    (XML namespace names, React's error-help link text, pdf-lib's credit line).
// 2. index.html must carry the strict Content-Security-Policy (connect-src 'self', no remote scripts),
//    so even a URL that slipped past this check would be blocked by the browser.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const DIST = process.argv[2] ?? "dist";
const ALLOWED = [
  /^http:\/\/www\.w3\.org\/(2000\/svg|1999\/xlink|1998\/Math\/MathML|XML\/1998\/namespace|1999\/xhtml)$/,
  /^https:\/\/react\.dev\/errors\/$/,
  /^https:\/\/github\.com\/Hopding\/pdf-lib$/,
];

const files = [];
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); });
walk(DIST);

const bad = [];
for (const f of files.filter((f) => /\.(js|mjs|css|html|webmanifest|json)$/.test(f))) {
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(/\b(?:https?|wss?):\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?[^\s"'`)<>\\]*/gi)) {
    const url = m[0].replace(/[.,;]+$/, "");
    if (!ALLOWED.some((r) => r.test(url))) bad.push(`${relative(DIST, f)}: ${url}`);
  }
  // protocol-relative URLs in CSS (url(//host/...)) or HTML attributes
  for (const m of text.matchAll(/(?:url\(\s*["']?|(?:src|href)=["'])\/\/[a-z0-9.-]+/gi)) bad.push(`${relative(DIST, f)}: ${m[0]}`);
}

const html = readFileSync(join(DIST, "index.html"), "utf8");
const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1]?.replace(/&#39;/g, "'") ?? "";
for (const need of ["default-src 'self'", "script-src 'self'", "connect-src 'self'", "object-src 'none'"]) {
  if (!csp.includes(need)) bad.push(`index.html: CSP is missing "${need}"`);
}
if (/script-src[^;]*(https?:|\*|'unsafe-eval')/.test(csp)) bad.push("index.html: CSP allows remote or eval'd scripts");

if (bad.length) {
  console.error(`✗ ${bad.length} possible network reference(s) in ${DIST}:\n  ` + bad.join("\n  "));
  process.exit(1);
}
console.log(`✓ ${files.length} files in ${DIST}: no external hosts, strict CSP in place.`);
