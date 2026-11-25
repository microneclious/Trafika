// Crop windows: which part of the source shows in a box, for each fit mode.
import type { Crop } from "../model/types";
import type { Rect } from "./geometry";

export interface CropResult {
  /** normalized source rect, 0..1 */
  src: Rect;
  /** destination rect inside the box (box units) */
  dst: Rect;
  /** fraction of the original frame that is not shown */
  lost: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function cropFor(srcW: number, srcH: number, boxW: number, boxH: number, crop: Crop): CropResult {
  const s = srcW / srcH;
  const a = boxW / boxH;
  if (crop.fit === "contain") {
    const dst = s > a
      ? { x: 0, y: (boxH - boxW / s) / 2, w: boxW, h: boxW / s }
      : { x: (boxW - boxH * s) / 2, y: 0, w: boxH * s, h: boxH };
    return { src: { x: 0, y: 0, w: 1, h: 1 }, dst, lost: 0 };
  }
  let w: number, h: number;
  if (s > a) { h = 1; w = a / s; } else { w = 1; h = s / a; }
  const z = Math.max(1, crop.zoom || 1);
  w /= z; h /= z;
  const x = clamp(crop.fx - w / 2, 0, 1 - w);
  const y = clamp(crop.fy - h / 2, 0, 1 - h);
  return { src: { x, y, w, h }, dst: { x: 0, y: 0, w: boxW, h: boxH }, lost: 1 - w * h };
}

/** Inverse: the focal point that puts the window's top-left corner at (x, y) for a window of w × h. */
export function focalFor(x: number, y: number, w: number, h: number) {
  return { fx: x + w / 2, fy: y + h / 2 };
}
