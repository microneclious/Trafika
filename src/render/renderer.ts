// The one Canvas2D renderer. Draws a RenderList (mm) at any scale: previews, IG JPEGs, print rasters.
import { toCanvas } from "bwip-js/browser";
import type { RI } from "../engine/layout";
import { MM_PER_PT } from "../engine/layout";

export interface ImageProvider {
  /** best available bitmap for an asset, or null while loading */
  get(assetId: string): CanvasImageSource | null;
}

export interface DrawOpts {
  /** pixels per mm */
  scale: number;
  images: ImageProvider;
  /** print-only brightness lift, 0..0.5 (photos only, never codes/text) */
  lift?: number;
}

type C2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function draw(ctx: C2D, items: RI[], o: DrawOpts) {
  for (const it of items) drawItem(ctx, it, o);
}

function drawItem(ctx: C2D, it: RI, o: DrawOpts) {
  const s = o.scale;
  switch (it.t) {
    case "rect":
      ctx.fillStyle = it.fill;
      ctx.fillRect(it.x * s, it.y * s, it.w * s, it.h * s);
      return;
    case "hatch": {
      ctx.save();
      ctx.beginPath();
      ctx.rect(it.x * s, it.y * s, it.w * s, it.h * s);
      ctx.clip();
      ctx.strokeStyle = it.color;
      ctx.lineWidth = Math.max(1, 0.25 * s);
      const step = 2.2 * s;
      ctx.beginPath();
      for (let d = -it.h * s; d < it.w * s; d += step) {
        ctx.moveTo(it.x * s + d, (it.y + it.h) * s);
        ctx.lineTo(it.x * s + d + it.h * s, it.y * s);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }
    case "line":
      ctx.save();
      ctx.strokeStyle = it.color;
      ctx.lineWidth = Math.max(1, it.width * s);
      ctx.setLineDash(it.dash ? it.dash.map((d) => d * s) : []);
      ctx.beginPath();
      ctx.moveTo(it.x1 * s, it.y1 * s);
      ctx.lineTo(it.x2 * s, it.y2 * s);
      ctx.stroke();
      ctx.restore();
      return;
    case "image": {
      const img = o.images.get(it.assetId);
      if (!img) {
        ctx.fillStyle = "#C9C6BD";
        ctx.fillRect(it.x * s, it.y * s, it.w * s, it.h * s);
        return;
      }
      const { width: iw, height: ih } = img as { width: number; height: number };
      const sx = it.src.x * iw, sy = it.src.y * ih, sw = it.src.w * iw, sh = it.src.h * ih;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      if (o.lift && o.lift > 0) drawLifted(ctx, img, sx, sy, sw, sh, it.x * s, it.y * s, it.w * s, it.h * s, o.lift);
      else ctx.drawImage(img, sx, sy, sw, sh, it.x * s, it.y * s, it.w * s, it.h * s);
      return;
    }
    case "text":
      drawText(ctx, it, s);
      return;
    case "code": {
      const c = codeCanvas(it.kind, it.data, it.addon ?? null, it.fg, it.bg);
      ctx.save();
      if (it.rotation) {
        ctx.translate((it.x + it.w / 2) * s, (it.y + it.h / 2) * s);
        ctx.rotate((it.rotation * Math.PI) / 180);
        ctx.translate(-(it.x + it.w / 2) * s, -(it.y + it.h / 2) * s);
      }
      if (!c) {
        ctx.fillStyle = it.bg;
        ctx.fillRect(it.x * s, it.y * s, it.w * s, it.h * s);
        ctx.strokeStyle = "#E0301E";
        ctx.strokeRect(it.x * s, it.y * s, it.w * s, it.h * s);
        ctx.restore();
        return;
      }
      // keep aspect, never smooth: crisp modules
      const k = Math.min((it.w * s) / c.width, (it.h * s) / c.height);
      const w = c.width * k, h = c.height * k;
      const x = it.x * s + (it.w * s - w) / 2, y = it.y * s + (it.h * s - h) / 2;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = it.bg;
      ctx.fillRect(x, y, w, h);
      ctx.drawImage(c, x, y, w, h);
      if (it.label) {
        const px = Math.max(1, 1.6 * s);
        ctx.font = `400 ${px}px "IBM Plex Mono", monospace`;
        ctx.fillStyle = it.fg;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(it.label, x + w / 2, y + h + 0.6 * s);
      }
      ctx.restore();
      return;
    }
    case "group": {
      ctx.save();
      if (it.rot === 180) {
        ctx.translate((it.x + it.w / 2) * s, (it.y + it.h / 2) * s);
        ctx.rotate(Math.PI);
        ctx.translate((-it.w / 2) * s, (-it.h / 2) * s);
      } else {
        ctx.translate(it.x * s, it.y * s);
      }
      if (it.clip) {
        ctx.beginPath();
        ctx.rect(it.clip.x * s, it.clip.y * s, it.clip.w * s, it.clip.h * s);
        ctx.clip();
      }
      draw(ctx, it.items, o);
      ctx.restore();
      return;
    }
  }
}

// ------------------------------------------------------------ photos

/** Lift shadows/mids for print: v' = 255·(v/255)^(1/(1+lift)). Highlights never clip. */
function drawLifted(ctx: C2D, img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number, lift: number) {
  const w = Math.max(1, Math.round(dw)), h = Math.max(1, Math.round(dh));
  const oc = new OffscreenCanvas(w, h);
  const o = oc.getContext("2d")!;
  o.imageSmoothingQuality = "high";
  o.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  const d = o.getImageData(0, 0, w, h);
  const lut = new Uint8ClampedArray(256);
  const g = 1 / (1 + lift);
  for (let i = 0; i < 256; i++) lut[i] = Math.round(255 * Math.pow(i / 255, g));
  const a = d.data;
  for (let i = 0; i < a.length; i += 4) { a[i] = lut[a[i]]; a[i + 1] = lut[a[i + 1]]; a[i + 2] = lut[a[i + 2]]; }
  o.putImageData(d, 0, 0);
  ctx.drawImage(oc, dx, dy, dw, dh);
}

// ------------------------------------------------------------ codes

const codeCache = new Map<string, HTMLCanvasElement | null>();
export function codeCanvas(kind: "ean13" | "qr", data: string, addon: string | null, fg = "#000000", bg = "#FFFFFF"): HTMLCanvasElement | null {
  const key = `${kind}|${data}|${addon ?? ""}|${fg}|${bg}`;
  const F = fg.replace("#", "").slice(0, 6).toUpperCase(), B = bg.replace("#", "").slice(0, 6).toUpperCase();
  if (codeCache.has(key)) return codeCache.get(key)!;
  const c = document.createElement("canvas");
  try {
    if (kind === "ean13") {
      toCanvas(c, { bcid: "ean13", text: addon ? `${data} ${addon}` : data, scale: 8, height: 12, includetext: true, guardwhitespace: true, textxalign: "center", backgroundcolor: B, barcolor: F, textcolor: F });
    } else {
      toCanvas(c, { bcid: "qrcode", text: data, scale: 10, paddingwidth: 4, paddingheight: 4, backgroundcolor: B, barcolor: F, ...({ eclevel: "M" } as object) });
    }
    codeCache.set(key, c);
    return c;
  } catch {
    codeCache.set(key, null);
    return null;
  }
}

// ------------------------------------------------------------ text

function fontStr(weight: number, px: number, family: string) {
  return `${weight} ${px}px "${family}", "IBM Plex Sans", sans-serif`;
}

function wrapLines(ctx: C2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/(\s+)/);
    let line = "";
    for (const w of words) {
      const test = line + w;
      if (line && ctx.measureText(test.trimEnd()).width > maxW && w.trim()) {
        out.push(line.trimEnd());
        line = w.trimStart();
      } else line = test;
    }
    out.push(line.trimEnd());
  }
  return out;
}

const patternCache = new Map<string, CanvasPattern | null>();
function halftonePattern(ctx: C2D, cell: number, color: string): CanvasPattern | null {
  const k = Math.max(3, Math.round(cell));
  const key = `${k}|${color}`;
  if (patternCache.has(key)) return patternCache.get(key)!;
  const oc = new OffscreenCanvas(k, k);
  const o = oc.getContext("2d")!;
  o.fillStyle = color;
  o.beginPath();
  o.arc(k / 2, k / 2, k * 0.36, 0, Math.PI * 2);
  o.fill();
  const p = ctx.createPattern(oc, "repeat");
  patternCache.set(key, p);
  return p;
}

const RTL = /^(ar|he|fa|ur|yi|ps|sd|ug|dv)(-|$)/;
export const isRtl = (lang: string) => RTL.test(lang);

function layoutText(ctx: C2D, it: Extract<RI, { t: "text" }>, s: number) {
  const px = it.size * MM_PER_PT * s;
  ctx.font = fontStr(it.weight, px, it.font);
  const anyCtx = ctx as unknown as { letterSpacing?: string; lang?: string; direction?: string };
  if ("letterSpacing" in anyCtx) anyCtx.letterSpacing = `${it.tracking * px}px`;
  if ("lang" in anyCtx) anyCtx.lang = it.lang || "inherit";
  ctx.direction = isRtl(it.lang) ? "rtl" : "ltr";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const w = it.w * s;
  let lines = wrapLines(ctx, it.text, w);
  if (it.maxLines && lines.length > it.maxLines) lines = lines.slice(0, it.maxLines);
  const lh = px * it.lineHeight;
  // last line's height uses the font size so short single lines get a tight box
  const totalH = Math.max(px, (lines.length - 1) * lh + px * Math.max(1, Math.min(it.lineHeight, 1.2)));
  return { px, w, lines, lh, totalH };
}

/** Height of a text item in mm (for selection boxes and snapping). */
let measureCtx: CanvasRenderingContext2D | null = null;
export function measureTextMm(it: Extract<RI, { t: "text" }>): number {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  const s = 10;
  measureCtx!.save();
  const r = layoutText(measureCtx!, it, s).totalH / s;
  measureCtx!.restore();
  return r;
}

function drawText(ctx: C2D, it: Extract<RI, { t: "text" }>, s: number) {
  if (it.size * MM_PER_PT * s < 0.5) return;
  ctx.save();
  const { px, w, lines, lh, totalH } = layoutText(ctx, it, s);
  if (it.rotation) {
    const cx = it.x * s + w / 2, cy = it.y * s + totalH / 2;
    ctx.translate(cx, cy);
    ctx.rotate((it.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  ctx.translate(it.x * s, it.y * s);
  const y0 = 0;
  // textAlign "left" is absolute, so alignment is the same for any script direction
  const xOf = (line: string) => {
    const lw = ctx.measureText(line).width;
    return it.align === "center" ? (w - lw) / 2 : it.align === "right" ? w - lw : 0;
  };
  const fx = it.fx ?? "none";
  const each = (fn: (line: string, x: number, y: number) => void) => lines.forEach((l, i) => fn(l, xOf(l), y0 + i * lh));
  if (fx === "outline") {
    ctx.strokeStyle = it.color;
    ctx.lineWidth = Math.max(1, px * 0.035);
    each((l, x, y) => ctx.strokeText(l, x, y));
  } else if (fx === "halftone") {
    ctx.fillStyle = halftonePattern(ctx, px * 0.09, it.color) ?? it.color;
    each((l, x, y) => ctx.fillText(l, x, y));
  } else if (fx === "riso") {
    ctx.globalCompositeOperation = "multiply";
    const d = Math.max(1, px * 0.035);
    ctx.fillStyle = "#3255A4";
    each((l, x, y) => ctx.fillText(l, x + d, y + d));
    ctx.fillStyle = "#FF48B0";
    each((l, x, y) => ctx.fillText(l, x, y));
  } else if (fx === "xerox") {
    ctx.fillStyle = it.color;
    each((l, x, y) => { ctx.fillText(l, x, y); ctx.fillText(l, x + px * 0.012, y + px * 0.008); });
    ctx.globalCompositeOperation = "destination-out";
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = Math.min(4000, Math.round(((w * totalH) / (px * px)) * 60));
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.arc(rnd() * w, y0 + rnd() * totalH, px * (0.006 + rnd() * 0.018), 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = it.color;
    each((l, x, y) => ctx.fillText(l, x, y));
  }
  ctx.restore();
}

// ------------------------------------------------------------ helpers

/** Render items into a new canvas of W×H mm at `scale` px/mm, clipped to the surface. */
export function renderToCanvas(items: RI[], Wmm: number, Hmm: number, o: DrawOpts, canvas?: HTMLCanvasElement, exactPx?: [number, number]): HTMLCanvasElement {
  const c = canvas ?? document.createElement("canvas");
  c.width = exactPx ? exactPx[0] : Math.max(1, Math.round(Wmm * o.scale));
  c.height = exactPx ? exactPx[1] : Math.max(1, Math.round(Hmm * o.scale));
  const ctx = c.getContext("2d")!;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, c.width, c.height);
  ctx.clip();
  draw(ctx, items, o);
  ctx.restore();
  return c;
}
