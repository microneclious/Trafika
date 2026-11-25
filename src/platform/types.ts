// One interface, two implementations: desktop (Tauri, files under ~/Zines) and web (browser storage).
// UI and engine code only ever talk to `platform` (src/platform/index.ts), never to Tauri or browser
// file APIs directly. Paths are always relative to the storage root, e.g. "012-transit/issue.json".

/** A file the user picked or dropped: a filesystem path on desktop, a File object on the web. */
export type Source = string | File;

export interface Imported { file: string; hash: string; name: string }
export interface FontInfo { file: string; family: string; style: string; langs: string[] }
export interface SystemFont { family: string; langs: string[] }

export interface Caps {
  /** printers via `lp` */
  printers: boolean;
  /** fonts installed on this computer */
  systemFonts: boolean;
  /** files live in a folder the user can open */
  folders: boolean;
  /** browser storage that can be wiped: show backup reminders */
  volatile: boolean;
}

export type DropEvent = { type: "over" } | { type: "leave" } | { type: "drop"; sources: Source[] };

export interface Platform {
  kind: "desktop" | "web";
  caps: Caps;
  /** where the collection lives, for display */
  rootLabel(): Promise<string>;

  readText(rel: string): Promise<string | null>;
  writeText(rel: string, content: string): Promise<void>;
  readBytes(rel: string): Promise<Uint8Array>;
  writeBytes(rel: string, data: Uint8Array): Promise<void>;
  /** every file under `rel`, recursively, as paths relative to the root */
  listTree(rel: string): Promise<string[]>;

  /** open a picker. Must be called straight from a click handler (browsers require a user gesture). */
  pick(kind: "photos" | "photo" | "fonts" | "zip"): Promise<Source[]>;
  sourceName(src: Source): string;
  readSource(src: Source): Promise<Uint8Array>;
  /** copy full-res photos into <dir>/assets/<sha256[..16]>.<ext>; files are never modified */
  importPhotos(dir: string, sources: Source[]): Promise<Imported[]>;

  importFont(src: Source): Promise<FontInfo>;
  listImportedFonts(): Promise<FontInfo[]>;
  listSystemFonts(): Promise<SystemFont[]>;
  /** characters a system font has no glyph for */
  fontMissing(family: string, text: string): Promise<string[]>;

  listPrinters(): Promise<string[]>;
  printFile(rel: string, printer: string | null, duplex: "short" | "long" | null): Promise<string>;

  /** write a finished export (desktop: into ~/Zines; web: kept in memory until handed over) */
  writeExport(rel: string, data: Uint8Array): Promise<void>;
  /** hand finished exports to the user: desktop opens the file or folder, web downloads (several files as one zip) */
  deliver(rels: string[], zipName?: string): Promise<void>;
  /** open a folder under the root (desktop only) */
  reveal(rel: string): Promise<void>;

  onDrop(cb: (e: DropEvent) => void): () => void;
  /** ask the browser not to wipe storage. null = not applicable (desktop). */
  persist(): Promise<boolean | null>;
  /** whether storage is already protected (never prompts). null = not applicable (desktop). */
  isPersisted(): Promise<boolean | null>;
}

export function safeRel(rel: string): string[] {
  const parts = rel.split("/").filter((p) => p && p !== ".");
  if (rel.startsWith("/") || parts.some((p) => p === "..") || !parts.length) throw new Error(`path not allowed: ${rel}`);
  return parts;
}

export const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
export const FONT_EXT = /\.(ttf|otf|woff2?)$/i;
