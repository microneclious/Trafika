// Desktop platform: the Rust commands in src-tauri/src/lib.rs. Files live under ~/Zines.
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import type { FontInfo, Imported, Platform, Source, SystemFont } from "./types";

const asPath = (s: Source) => {
  if (typeof s !== "string") throw new Error("expected a file path");
  return s;
};

const FILTERS = {
  photos: [{ name: "Photos", extensions: ["jpg", "jpeg", "png", "webp"] }],
  photo: [{ name: "Photos", extensions: ["jpg", "jpeg", "png", "webp"] }],
  fonts: [{ name: "Fonts", extensions: ["ttf", "otf", "woff", "woff2"] }],
  zip: [{ name: "Trafika backup", extensions: ["zip"] }],
};
const TITLES = { photos: "Add photos", photo: "Profile picture", fonts: "Add font files", zip: "Import a Trafika backup" };

const writeBytes = (rel: string, data: Uint8Array) =>
  invoke<void>("write_bytes", data, { headers: { "x-path": encodeURIComponent(rel) } });

export const tauriPlatform: Platform = {
  kind: "desktop",
  caps: { printers: true, systemFonts: true, folders: true, volatile: false },
  rootLabel: () => invoke<string>("zines_root"),

  readText: (rel) => invoke<string | null>("read_text", { rel }),
  writeText: (rel, content) => invoke<void>("write_text", { rel, content }),
  readBytes: async (rel) => new Uint8Array(await invoke<ArrayBuffer>("read_bytes", { rel })),
  writeBytes,
  listTree: (rel) => invoke<string[]>("list_tree", { rel }),

  async pick(kind) {
    const r = await open({ multiple: kind === "photos" || kind === "fonts", title: TITLES[kind], filters: FILTERS[kind] });
    if (!r) return [];
    return Array.isArray(r) ? r : [r];
  },
  sourceName: (s) => asPath(s).split("/").pop() ?? "",
  readSource: async (s) => new Uint8Array(await invoke<ArrayBuffer>("read_external", { path: asPath(s) })),
  importPhotos: (dir, sources) => invoke<Imported[]>("import_photos", { issueDir: dir, paths: sources.map(asPath) }),

  importFont: (s) => invoke<FontInfo>("import_font", { path: asPath(s) }),
  listImportedFonts: () => invoke<FontInfo[]>("list_imported_fonts"),
  listSystemFonts: () => invoke<SystemFont[]>("list_system_fonts"),
  fontMissing: (family, text) => invoke<string[]>("font_missing", { family, text }),

  listPrinters: () => invoke<string[]>("list_printers"),
  printFile: (rel, printer, duplex) => invoke<string>("print_file", { rel, printer, duplex }),

  writeExport: writeBytes,
  async deliver(rels) {
    if (!rels.length) return;
    const target = rels.length === 1 ? rels[0] : rels[0].split("/").slice(0, -1).join("/");
    await invoke<void>("open_local", { rel: target });
  },
  reveal: (rel) => invoke<void>("open_local", { rel }),

  onDrop(cb) {
    let un: (() => void) | undefined, dead = false;
    getCurrentWebview().onDragDropEvent((e) => {
      const p = e.payload;
      if (p.type === "enter" || p.type === "over") cb({ type: "over" });
      else if (p.type === "leave") cb({ type: "leave" });
      else if (p.type === "drop") cb({ type: "drop", sources: p.paths });
    }).then((f) => { if (dead) f(); else un = f; }).catch(() => {});
    return () => { dead = true; un?.(); };
  },
  persist: async () => null,
  isPersisted: async () => null,
};
