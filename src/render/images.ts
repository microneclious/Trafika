// Photo bitmaps: a preview copy (max 2048 px) for the screen, full resolution on demand for export.
import { readBytes } from "../lib/backend";
import type { Asset } from "../model/types";
import type { ImageProvider } from "./renderer";

const PREVIEW_MAX = 2048;
const preview = new Map<string, ImageBitmap>();
const full = new Map<string, ImageBitmap>();
const pending = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

export function onImagesChanged(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
const notify = () => listeners.forEach((f) => f());

async function blobOf(a: Asset) {
  const bytes = await readBytes(a.file);
  return new Blob([bytes as BlobPart]);
}

/** Decode a file's real pixel size (EXIF orientation applied, nothing else read). */
export async function measure(bytes: Uint8Array): Promise<{ w: number; h: number }> {
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart]), { imageOrientation: "from-image" });
  const r = { w: bmp.width, h: bmp.height };
  bmp.close();
  return r;
}

export function ensurePreview(a: Asset): Promise<void> {
  if (preview.has(a.id)) return Promise.resolve();
  const k = "p:" + a.id;
  if (!pending.has(k)) {
    pending.set(k, (async () => {
      const blob = await blobOf(a);
      const long = Math.max(a.w, a.h);
      const f = Math.min(1, PREVIEW_MAX / long);
      const bmp = await createImageBitmap(blob, {
        imageOrientation: "from-image",
        resizeWidth: Math.round(a.w * f), resizeHeight: Math.round(a.h * f), resizeQuality: "high",
      });
      preview.set(a.id, bmp);
      pending.delete(k);
      notify();
    })().catch((e) => { pending.delete(k); console.error("image", a.file, e); }));
  }
  return pending.get(k)!;
}

export async function ensureFull(assets: Asset[]) {
  await Promise.all(assets.map(async (a) => {
    if (full.has(a.id)) return;
    const bmp = await createImageBitmap(await blobOf(a), { imageOrientation: "from-image" });
    full.set(a.id, bmp);
  }));
}
export function releaseFull() { full.forEach((b) => b.close()); full.clear(); }

export const previewImages: ImageProvider = { get: (id) => preview.get(id) ?? null };
export const exportImages: ImageProvider = { get: (id) => full.get(id) ?? preview.get(id) ?? null };
