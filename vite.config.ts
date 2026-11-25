import { createHash } from "node:crypto";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;
/** `tauri dev` / `tauri build` set TAURI_ENV_PLATFORM; a plain `vite build` is the web version. */
const isWeb = !process.env.TAURI_ENV_PLATFORM;

/**
 * Web build only. Tauri has its own CSP (src-tauri/tauri.conf.json) and doesn't need any of this.
 *  - a strict Content-Security-Policy: scripts, styles, fonts and requests only from this site
 *  - the PWA manifest + icons
 *  - a service worker that precaches the whole app, so it works offline after the first visit
 */
function webShell(): Plugin {
  const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join("; ");
  return {
    name: "trafika-web-shell",
    apply: "build",
    transformIndexHtml() {
      return [
        { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
        { tag: "meta", attrs: { name: "referrer", content: "no-referrer" }, injectTo: "head" },
        { tag: "link", attrs: { rel: "manifest", href: "./manifest.webmanifest" }, injectTo: "head" },
      ];
    },
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith(".map") && !f.endsWith(".woff")); // every browser we target uses .woff2
      const statics = ["manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/favicon-32.png", "icons/apple-touch-icon.png"];
      const list = ["./", ...[...files, ...statics].filter((f) => f !== "index.html").map((f) => `./${f}`)];
      const version = createHash("sha256").update(list.join("\n")).digest("hex").slice(0, 12);
      this.emitFile({ type: "asset", fileName: "sw.js", source: swSource(version, list) });
    },
  };
}

function swSource(version: string, assets: string[]) {
  return `// Trafika service worker: caches the app itself so it runs offline. Your photos never pass
// through here; they stay in the browser's private storage. Generated at build time.
const CACHE = "trafika-${version}";
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("trafika-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put("./", copy)); return r; }).catch(() => caches.match("./")));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
`;
}

// https://vite.dev/config/
export default defineConfig(() => ({
  // relative paths: the same build works at https://<user>.github.io/Trafika/, on localhost, and in Tauri
  base: "./",
  plugins: [react(), ...(isWeb ? [webShell()] : [])],
  build: { sourcemap: false },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
