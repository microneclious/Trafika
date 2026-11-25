// Font registry: bundled OFL fonts, fonts you import (any script), and installed system fonts.
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/oswald/400.css";
import "@fontsource/oswald/500.css";
import "@fontsource/oswald/700.css";
import { listImportedFonts, listSystemFonts, readBytes, type FontInfo } from "../lib/backend";

export interface FontEntry {
  family: string;
  source: "bundled" | "imported" | "system";
  latin: boolean;
  cyrillic: boolean;
  macedonian: boolean;
  styles?: string[];
}

export const BUNDLED: FontEntry[] = [
  { family: "IBM Plex Sans", source: "bundled", latin: true, cyrillic: true, macedonian: true },
  { family: "IBM Plex Mono", source: "bundled", latin: true, cyrillic: true, macedonian: true },
  { family: "Oswald", source: "bundled", latin: true, cyrillic: true, macedonian: true },
];

export function coverage(langs: string[]) {
  const set = new Set(langs);
  return { latin: set.has("en"), cyrillic: set.has("ru") || set.has("sr") || set.has("bg") || set.has("mk"), macedonian: set.has("mk") };
}

const loaded = new Set<string>();
function weightOf(style: string) {
  const s = style.toLowerCase();
  if (/black|heavy/.test(s)) return "900";
  if (/extra ?bold|ultra ?bold/.test(s)) return "800";
  if (/semi ?bold|demi/.test(s)) return "600";
  if (/bold/.test(s)) return "700";
  if (/medium/.test(s)) return "500";
  if (/extra ?light|ultra ?light/.test(s)) return "200";
  if (/light/.test(s)) return "300";
  if (/thin|hairline/.test(s)) return "100";
  return "400";
}

/** Register an imported font file with the webview so canvas and UI can use it. */
export async function registerImported(f: FontInfo) {
  if (loaded.has(f.file)) return;
  const bytes = await readBytes(f.file);
  const face = new FontFace(f.family, bytes.buffer as ArrayBuffer, {
    weight: weightOf(f.style), style: /italic|oblique/i.test(f.style) ? "italic" : "normal",
  });
  await face.load();
  document.fonts.add(face);
  loaded.add(f.file);
}

export async function loadAllFonts(): Promise<FontEntry[]> {
  const out: FontEntry[] = [...BUNDLED];
  try {
    const imported = await listImportedFonts();
    const byFam = new Map<string, FontInfo[]>();
    for (const f of imported) {
      await registerImported(f).catch((e) => console.warn("font", f.file, e));
      byFam.set(f.family, [...(byFam.get(f.family) ?? []), f]);
    }
    for (const [family, fs] of byFam) out.push({ family, source: "imported", ...coverage(fs.flatMap((f) => f.langs)), styles: fs.map((f) => f.style) });
  } catch (e) { console.warn(e); }
  try {
    const sys = await listSystemFonts();
    for (const f of sys) if (!out.some((o) => o.family === f.family)) out.push({ family: f.family, source: "system", ...coverage(f.langs) });
  } catch (e) { console.warn(e); }
  await document.fonts.ready;
  return out;
}

/** Make sure a family is ready before rasterising (system fonts load lazily). */
export async function ensureFonts(families: string[], weights = [400, 700]) {
  await Promise.all(families.flatMap((f) => weights.map((w) => document.fonts.load(`${w} 20px "${f}"`, "AaЃЌЅЉЊЏЈ").catch(() => []))));
}
