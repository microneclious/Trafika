// The one door to storage, files, fonts and printing. Desktop (Tauri) or web is decided once, here.
import { tauriPlatform } from "./tauri";
import type { Platform } from "./types";
import { webPlatform } from "./web";

export const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const platform: Platform = inTauri() ? tauriPlatform : webPlatform;

export async function readJson<T>(rel: string): Promise<T | null> {
  const s = await platform.readText(rel);
  return s ? (JSON.parse(s) as T) : null;
}
export const writeJson = (rel: string, v: unknown) => platform.writeText(rel, JSON.stringify(v, null, 2));

export type { Caps, DropEvent, FontInfo, Imported, Source, SystemFont } from "./types";
export { IMAGE_EXT, FONT_EXT } from "./types";
