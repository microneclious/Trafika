// Starting layouts for the cover (title, subtitle, number, date) and the back page. Every element they
// create is an ordinary layer you can then drag, resize, recolour and snap to a grid.
import type { Layer } from "../model/types";

const uid = () => Math.random().toString(36).slice(2, 10);
const INK = "#121212", PAPER = "#F4F3EF", WHITE = "#FFFFFF";
const MONO = "IBM Plex Mono";

export interface PresetCtx { W: number; H: number; titleFont?: string; subFont?: string }
type Mk = (c: PresetCtx) => Layer[];

const text = (bind: Layer["bind"], x: number, y: number, w: number, o: Partial<Layer>): Layer => ({
  id: uid(), kind: "text", bind, x, y, w, h: 0, rotation: 0, font: "IBM Plex Sans", weight: 400, size: 8, color: INK,
  align: "left", lineHeight: 1.15, tracking: 0, lang: "", fx: "none", ...o,
});
const band = (x: number, y: number, w: number, h: number, fill = PAPER): Layer => ({ id: uid(), kind: "band", name: "Band", x, y, w, h, rotation: 0, fill });
/** text sizes are given for a 74 mm page and scale with the page */
const k = (c: PresetCtx) => c.W / 74.25;
const title = (c: PresetCtx, x: number, y: number, w: number, size: number, o: Partial<Layer> = {}) =>
  text("title", x, y, w, { font: c.titleFont ?? "Oswald", weight: 700, size: size * k(c), lineHeight: 0.95, tracking: -0.01, ...o });
const sub = (c: PresetCtx, x: number, y: number, w: number, o: Partial<Layer> = {}) =>
  text("subtitle", x, y, w, { font: c.subFont ?? "IBM Plex Sans", size: 7 * k(c), ...o });
const meta = (c: PresetCtx, bind: "no" | "date", x: number, y: number, w: number, o: Partial<Layer> = {}) =>
  text(bind, x, y, w, { font: MONO, weight: 500, size: 6.5 * k(c), tracking: 0.04, ...o });
/** a rotated text box centred on (cx, cy) % with length L % of the page height */
const along = (c: PresetCtx, l: Layer, cx: number, cy: number, L: number, rot: number): Layer => {
  const w = (L * c.H) / c.W;
  return { ...l, x: cx - w / 2, y: cy - (l.size! * 0.3528 * 100) / c.H / 2, w, rotation: rot };
};

export const COVER_PRESETS: { id: string; name: string; make: Mk }[] = [
  { id: "band-bottom", name: "Bottom band", make: (c) => [band(0, 68, 100, 24), title(c, 8, 70.5, 84, 30), sub(c, 8, 81, 84), meta(c, "no", 8, 87, 40), meta(c, "date", 52, 87, 40, { align: "right" })] },
  { id: "band-top", name: "Top band", make: (c) => [band(0, 0, 100, 24), title(c, 8, 3, 84, 30), sub(c, 8, 13.5, 84), meta(c, "no", 8, 19, 40), meta(c, "date", 52, 19, 40, { align: "right" })] },
  { id: "masthead", name: "Masthead", make: (c) => [title(c, 6, 5, 88, 40, { color: WHITE, align: "center" }), meta(c, "no", 6, 21, 44, { color: WHITE }), meta(c, "date", 50, 21, 44, { color: WHITE, align: "right" }), sub(c, 6, 90, 88, { color: WHITE, align: "center" })] },
  { id: "centred", name: "Centred", make: (c) => [band(0, 41, 100, 16), title(c, 8, 43.5, 84, 28, { align: "center" }), meta(c, "no", 8, 90, 40, { color: WHITE }), meta(c, "date", 52, 90, 40, { color: WHITE, align: "right" })] },
  { id: "corner", name: "Corner stack", make: (c) => [title(c, 8, 74, 70, 20, { color: WHITE, lineHeight: 0.9 }), sub(c, 8, 87, 70, { color: WHITE }), meta(c, "no", 60, 6, 32, { color: WHITE, align: "right" }), meta(c, "date", 60, 10, 32, { color: WHITE, align: "right" })] },
  { id: "split", name: "Title + big number", make: (c) => [title(c, 8, 6, 84, 22, { color: WHITE }), sub(c, 8, 15, 84, { color: WHITE }), meta(c, "no", 30, 70, 62, { color: WHITE, align: "right", font: c.titleFont ?? "Oswald", weight: 700, size: 46 * k(c), tracking: -0.02, lineHeight: 0.9 })] },
  { id: "giant", name: "Giant number", make: (c) => [band(0, 52, 100, 40), meta(c, "no", 6, 52, 94, { font: c.titleFont ?? "Oswald", weight: 700, size: 78 * k(c), tracking: -0.03, lineHeight: 0.85, color: INK }), title(c, 8, 6, 84, 14, { color: WHITE }), meta(c, "date", 8, 86, 84, { align: "right" })] },
  { id: "spine", name: "Along the spine", make: (c) => [band(0, 0, 16, 100), along(c, title(c, 0, 0, 0, 24), 8, 50, 90, -90), meta(c, "no", 22, 88, 70, { color: WHITE, align: "right" }), meta(c, "date", 22, 92, 70, { color: WHITE, align: "right" })] },
  { id: "edge-right", name: "Vertical, right edge", make: (c) => [along(c, title(c, 0, 0, 0, 26, { color: WHITE }), 88, 50, 90, 90), meta(c, "no", 8, 6, 50, { color: WHITE }), meta(c, "date", 8, 10, 50, { color: WHITE })] },
  { id: "label", name: "Museum label", make: (c) => [band(8, 74, 56, 18, WHITE), title(c, 11, 76, 50, 11), sub(c, 11, 83, 50, { size: 5.5 * k(c) }), meta(c, "no", 11, 87.5, 25, { size: 5 * k(c) }), meta(c, "date", 36, 87.5, 25, { size: 5 * k(c), align: "right" })] },
  { id: "framed", name: "Framed box", make: (c) => [band(16, 36, 68, 28, WHITE), title(c, 18, 40, 64, 20, { align: "center" }), sub(c, 18, 52, 64, { align: "center" }), meta(c, "no", 18, 58, 64, { align: "center" })] },
  { id: "clean", name: "Photo only", make: (c) => [meta(c, "no", 8, 92, 40, { color: WHITE, size: 5.5 * k(c) })] },
];
export const COVER_BINDS = new Set(["title", "subtitle", "no", "date"]);

export function backLayers(c: PresetCtx): Layer[] {
  const s = k(c);
  const qrW = Math.max(24, (19 / c.W) * 100);
  const qrH = (qrW * c.W) / c.H;
  const eanW = Math.min(84, (46 / c.W) * 100);
  const eanH = (eanW * c.W * 0.42) / c.H;
  return [
    text("note", 8, 7, 84, { size: 7.5 * s, lineHeight: 1.35 }),
    text("details", 8, 40, 52, { font: MONO, size: 5.8 * s, lineHeight: 1.45, tracking: 0.01 }),
    { id: uid(), kind: "qr", name: "QR", qr: "custom", x: 92 - qrW, y: 40, w: qrW, h: qrH, rotation: 0, fg: "#000000", bg: "#FFFFFF" },
    { id: uid(), kind: "ean", name: "Barcode", x: 8, y: 91 - eanH, w: eanW, h: eanH, rotation: 0, fg: "#000000", bg: "#FFFFFF" },
    text("human", 8, 92, 84, { font: MONO, size: 4.6 * s, tracking: 0.02 }),
  ];
}
