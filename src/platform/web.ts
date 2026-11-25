// Web platform: everything stays in this browser (OPFS or IndexedDB). No uploads, no network.
import { langsOf, missingGlyphs } from "./glyphs";
import { fontNames } from "./sfnt";
import { FONT_EXT, IMAGE_EXT, type DropEvent, type FontInfo, type Imported, type Platform, type Source } from "./types";
import { openStore } from "./webStore";
import { zip } from "./zip";

const enc = new TextEncoder();
const dec = new TextDecoder();

async function sha256hex(data: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const d = await crypto.subtle.digest("SHA-256", data as BufferSource);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return sha256js(data); // insecure contexts (plain http on a LAN) have no crypto.subtle
}

const asFile = (s: Source) => {
  if (typeof s === "string") throw new Error("expected a file");
  return s;
};

const ACCEPT = {
  photos: "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp",
  photo: "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp",
  fonts: ".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2",
  zip: ".zip,application/zip",
};

/** exports made this session, waiting to be downloaded (kept out of storage to save space) */
const outbox = new Map<string, Uint8Array>();

function download(name: string, data: Uint8Array, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const MIME: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", txt: "text/plain", zip: "application/zip", json: "application/json" };

const FONT_INDEX = "fonts/index.json";

export const webPlatform: Platform = {
  kind: "web",
  caps: { printers: false, systemFonts: false, folders: false, volatile: true },
  async rootLabel() {
    const s = await openStore();
    return s.kind === "opfs" ? "this browser (private file storage)" : "this browser (IndexedDB)";
  },

  async readText(rel) {
    const b = await (await openStore()).read(rel);
    return b ? dec.decode(b) : null;
  },
  async writeText(rel, content) { await (await openStore()).write(rel, enc.encode(content)); },
  async readBytes(rel) {
    const b = outbox.get(rel) ?? (await (await openStore()).read(rel));
    if (!b) throw new Error(`missing ${rel}`);
    return b;
  },
  async writeBytes(rel, data) { await (await openStore()).write(rel, data); },
  async listTree(rel) { return (await openStore()).tree(rel); },

  pick(kind) {
    // no awaits before click(): browsers only open pickers inside the user's click
    return new Promise<Source[]>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ACCEPT[kind];
      input.multiple = kind === "photos" || kind === "fonts";
      input.style.display = "none";
      const done = (files: Source[]) => { input.remove(); resolve(files); };
      input.addEventListener("change", () => done([...(input.files ?? [])]));
      input.addEventListener("cancel", () => done([]));
      document.body.appendChild(input);
      input.click();
    });
  },
  sourceName: (s) => (typeof s === "string" ? s.split("/").pop() ?? s : s.name),
  readSource: async (s) => new Uint8Array(await asFile(s).arrayBuffer()),

  async importPhotos(dir, sources) {
    const store = await openStore();
    const out: Imported[] = [];
    for (const s of sources) {
      const f = asFile(s);
      if (!IMAGE_EXT.test(f.name) && !/^image\/(jpeg|png|webp)$/.test(f.type)) throw new Error(`${f.name}: only JPEG, PNG and WebP photos can be added`);
      const data = new Uint8Array(await f.arrayBuffer());
      const hash = await sha256hex(data);
      const ext = (/\.([a-z0-9]+)$/i.exec(f.name)?.[1] ?? f.type.split("/")[1] ?? "jpg").toLowerCase();
      const rel = `${dir}/assets/${hash.slice(0, 16)}.${ext}`;
      if (!(await store.read(rel))) await store.write(rel, data);
      out.push({ file: rel, hash, name: f.name });
    }
    return out;
  },

  async importFont(s) {
    const f = asFile(s);
    if (!FONT_EXT.test(f.name)) throw new Error("Only .ttf, .otf, .woff and .woff2 font files can be added.");
    const data = new Uint8Array(await f.arrayBuffer());
    const { family, style } = await fontNames(data, f.name);
    const face = new FontFace(family, data.slice().buffer as ArrayBuffer);
    try { await face.load(); } catch { throw new Error(`${f.name}: the browser can't read this font file.`); }
    document.fonts.add(face);
    const store = await openStore();
    const file = `fonts/${f.name.replace(/[\\/]/g, "_")}`;
    await store.write(file, data);
    const info: FontInfo = { file, family, style, langs: langsOf(family) };
    const index = await webPlatform.listImportedFonts();
    await store.write(FONT_INDEX, enc.encode(JSON.stringify([...index.filter((x) => x.file !== file), info], null, 2)));
    return info;
  },
  async listImportedFonts() {
    const b = await (await openStore()).read(FONT_INDEX);
    if (!b) return [];
    try { return (JSON.parse(dec.decode(b)) as FontInfo[]).sort((a, b) => a.family.localeCompare(b.family) || a.style.localeCompare(b.style)); } catch { return []; }
  },
  listSystemFonts: async () => [],
  fontMissing: async (family, text) => missingGlyphs(family, text),

  listPrinters: async () => [],
  printFile: async () => { throw new Error("Printing straight to a printer needs the Linux app. Open the PDF and print it at 100 % (actual size)."); },

  async writeExport(rel, data) { outbox.set(rel, data); },
  async deliver(rels, zipName) {
    const files = rels.map((r) => ({ rel: r, data: outbox.get(r) })).filter((f): f is { rel: string; data: Uint8Array } => !!f.data);
    if (!files.length) {
      // not an export from this session: try storage
      for (const r of rels) { const d = await (await openStore()).read(r); if (d) files.push({ rel: r, data: d }); }
    }
    if (!files.length) throw new Error("Nothing to download. Export again.");
    if (files.length === 1 || !zipName) {
      for (const f of files) { const name = f.rel.split("/").pop()!; download(name, f.data, MIME[name.split(".").pop() ?? ""]); }
      return;
    }
    download(zipName, zip(files.map((f) => ({ name: f.rel.split("/").pop()!, data: f.data }))), MIME.zip);
  },
  reveal: async () => {},

  onDrop(cb: (e: DropEvent) => void) {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    let depth = 0;
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; cb({ type: "over" }); };
    const over = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer!.dropEffect = "copy"; };
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) cb({ type: "leave" }); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      cb({ type: "drop", sources: [...(e.dataTransfer?.files ?? [])] });
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  },

  async persist() {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return navigator.storage.persist();
  },
  async isPersisted() {
    try { return !!(await navigator.storage?.persisted?.()); } catch { return false; }
  },
};

// ---- SHA-256 fallback (FIPS 180-4), only used without crypto.subtle
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
export function sha256js(msg: Uint8Array): string {
  const len = msg.length, bitLen = len * 8;
  const total = ((len + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(total);
  m.set(msg);
  m[len] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(total - 8, Math.floor(bitLen / 2 ** 32));
  dv.setUint32(total - 4, bitLen >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const r = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = r(W[i - 15], 7) ^ r(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = r(W[i - 2], 17) ^ r(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return [...H].map((x) => x.toString(16).padStart(8, "0")).join("");
}
