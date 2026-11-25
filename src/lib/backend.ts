// Thin wrappers over the Rust commands. Paths are relative to ~/Zines.
import { invoke } from "@tauri-apps/api/core";

export const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const zinesRoot = () => invoke<string>("zines_root");
export const readText = (rel: string) => invoke<string | null>("read_text", { rel });
export const writeText = (rel: string, content: string) => invoke<void>("write_text", { rel, content });
export const readBytes = async (rel: string) => new Uint8Array(await invoke<ArrayBuffer>("read_bytes", { rel }));
export const writeBytes = (rel: string, data: Uint8Array) =>
  invoke<void>("write_bytes", data, { headers: { "x-path": encodeURIComponent(rel) } });
export const listDir = (rel: string) => invoke<string[]>("list_dir", { rel });
export interface Imported { file: string; hash: string; name: string }
export const importPhotos = (issueDir: string, paths: string[]) => invoke<Imported[]>("import_photos", { issueDir, paths });
export interface FontInfo { file: string; family: string; style: string; langs: string[] }
export interface SystemFont { family: string; langs: string[] }
export const importFont = (path: string) => invoke<FontInfo>("import_font", { path });
export const listImportedFonts = () => invoke<FontInfo[]>("list_imported_fonts");
export const listSystemFonts = () => invoke<SystemFont[]>("list_system_fonts");
export const listPrinters = () => invoke<string[]>("list_printers");
export const printFile = (rel: string, printer: string | null, duplex: "short" | "long" | null) => invoke<string>("print_file", { rel, printer, duplex });
export const fontMissing = (family: string, text: string) => invoke<string[]>("font_missing", { family, text });
export const openLocal = (rel: string) => invoke<void>("open_local", { rel });

export async function readJson<T>(rel: string): Promise<T | null> {
  const s = await readText(rel);
  return s ? (JSON.parse(s) as T) : null;
}
export const writeJson = (rel: string, v: unknown) => writeText(rel, JSON.stringify(v, null, 2));
