// Paper, trim, imposition. All units are millimetres. Templates are JSON data (./templates);
// two of them (saddle stitch, accordion) give parameters to a generator instead of a fixed panel list.
import type { Paper } from "../model/types";
import t1 from "./templates/t1.json";
import t2 from "./templates/t2.json";
import t4 from "./templates/t4.json";
import t6 from "./templates/t6.json";
import t7 from "./templates/t7.json";
import t8 from "./templates/t8.json";

export interface Rect { x: number; y: number; w: number; h: number }
export interface Bleed { l: number; r: number; t: number; b: number }
export const NO_BLEED: Bleed = { l: 0, r: 0, t: 0, b: 0 };
export const BLEED_MM = 3;

export const PAPER: Record<Paper, { w: number; h: number; label: string }> = {
  A4: { w: 297, h: 210, label: "A4" },
  A3: { w: 420, h: 297, label: "A3" },
  Letter: { w: 279.4, h: 215.9, label: "US Letter" },
};

type SpreadKind = "contiguous" | "wrap-cover" | "split" | "glued";
interface JsonPanel { page: number; side: number; col: number; row: number; rot: number }
interface JsonLine { id: string; kind: "fold" | "cut"; axis: "x" | "y"; at: number; from?: number; to?: number; side?: number }
export interface TemplateDef {
  id: string; code: string; name: string; blurb: string;
  binding: "codex" | "accordion" | "trifold";
  orientation: "landscape" | "portrait";
  sizes: Paper[];
  trimRatio: number | null;
  sides: number;
  duplex?: "short" | "long";
  poster?: boolean;
  generator?: "saddle" | "accordion";
  grid?: { cols: number; rows: number };
  panels?: JsonPanel[];
  spreads?: [number, number, string][];
  lines?: JsonLine[];
  pages: number[];
  panelsPerRow?: number;
  tabMm?: number;
  steps: { text: string; show: string[] }[];
  verified: boolean;
}

export const TEMPLATE_LIST: TemplateDef[] = [t1, t2, t4, t6, t7, t8] as unknown as TemplateDef[];
export const TEMPLATES: Record<string, TemplateDef> = Object.fromEntries(TEMPLATE_LIST.map((t) => [t.id, t]));
export function getTemplate(id: string): TemplateDef {
  const t = TEMPLATES[id];
  if (!t) throw new Error(`unknown template ${id}`);
  return t;
}

export interface Panel { page: number; sheet: number; side: number; rect: Rect; rot: 0 | 180 }
export interface Line { id: string; kind: "fold" | "cut"; x1: number; y1: number; x2: number; y2: number; side: number }
export interface Glue { id: string; rect: Rect; side: number }
export interface Imposition {
  t: TemplateDef;
  paper: Paper;
  sheetW: number;
  sheetH: number;
  /** the area that becomes the zine (after trimming), on every sheet */
  trim: Rect;
  trimmed: boolean;
  pageW: number;
  pageH: number;
  pageCount: number;
  sheets: number;
  sides: number;
  panels: Panel[];
  lines: Line[];
  glue: Glue[];
  /** waste areas that get cut off (hatched in previews) */
  scrap: Rect[];
  spreads: [number, number, SpreadKind][];
}

export interface TemplateSel { id: string; paper: Paper; trimmed: boolean; pages: number }

function trimRect(W: number, H: number, ratio: number | null, trimmed: boolean): Rect {
  if (!trimmed || !ratio) return { x: 0, y: 0, w: W, h: H };
  let w = W, h = W / ratio;
  if (h > H) { h = H; w = H * ratio; }
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

export function impose(sel: TemplateSel): Imposition {
  const t = getTemplate(sel.id);
  const paper = t.sizes.includes(sel.paper) ? sel.paper : t.sizes[0];
  const P = PAPER[paper];
  const [W, H] = t.orientation === "landscape" ? [P.w, P.h] : [P.h, P.w];
  if (t.generator === "accordion") return accordion(t, paper, W, H);
  const trimmed = !!t.trimRatio && sel.trimmed;
  const trim = trimRect(W, H, t.trimRatio, trimmed);
  const lineOf = (l: JsonLine): Line => l.axis === "x"
    ? { id: l.id, kind: l.kind, side: l.side ?? 0, x1: trim.x + l.at * trim.w, y1: trim.y + (l.from ?? 0) * trim.h, x2: trim.x + l.at * trim.w, y2: trim.y + (l.to ?? 1) * trim.h }
    : { id: l.id, kind: l.kind, side: l.side ?? 0, x1: trim.x + (l.from ?? 0) * trim.w, y1: trim.y + l.at * trim.h, x2: trim.x + (l.to ?? 1) * trim.w, y2: trim.y + l.at * trim.h };
  const lines = (t.lines ?? []).map(lineOf);
  if (t.generator === "saddle") {
    const N = t.pages.includes(sel.pages) ? sel.pages : t.pages[0];
    const S = N / 4;
    const half = trim.w / 2;
    const panels: Panel[] = [];
    for (let s = 0; s < S; s++) {
      const put = (page: number, side: number, left: boolean) =>
        panels.push({ page, sheet: s, side, rot: 0, rect: { x: trim.x + (left ? 0 : half), y: trim.y, w: half, h: trim.h } });
      put(N - 2 * s, 0, true); put(1 + 2 * s, 0, false);
      put(2 + 2 * s, 1, true); put(N - 1 - 2 * s, 1, false);
    }
    const spreads: [number, number, SpreadKind][] = [];
    for (let k = 1; k < N / 2; k++) spreads.push([2 * k, 2 * k + 1, 2 * k === N / 2 ? "contiguous" : "split"]);
    spreads.push([N, 1, "wrap-cover"]);
    return { t, paper, sheetW: W, sheetH: H, trim, trimmed, pageW: half, pageH: trim.h, pageCount: N, sheets: S, sides: 2, panels, lines, glue: [], scrap: [], spreads };
  }
  const g = t.grid!;
  const pw = trim.w / g.cols, ph = trim.h / g.rows;
  const panels: Panel[] = t.panels!.map((p) => ({
    page: p.page, sheet: 0, side: p.side, rot: (p.rot === 180 ? 180 : 0) as 0 | 180,
    rect: { x: trim.x + p.col * pw, y: trim.y + p.row * ph, w: pw, h: ph },
  }));
  return {
    t, paper, sheetW: W, sheetH: H, trim, trimmed, pageW: pw, pageH: ph,
    pageCount: Math.max(...panels.map((p) => p.page)), sheets: 1, sides: t.sides, panels, lines, glue: [], scrap: [],
    spreads: (t.spreads ?? []).map(([a, b, k]) => [a, b, k as SpreadKind]),
  };
}

/** Accordion: two strips of 3:4 panels; strip 1 ends in a glue tab that goes behind panel 5. */
function accordion(t: TemplateDef, paper: Paper, W: number, H: number): Imposition {
  const n = t.panelsPerRow ?? 4;
  const tab = t.tabMm ?? 10;
  let pw = (W - tab) / n, ph = (pw * 4) / 3;
  if (2 * ph > H - 8) { ph = (H - 8) / 2; pw = (ph * 3) / 4; }
  const x0 = (W - (n * pw + tab)) / 2, y0 = (H - 2 * ph) / 2;
  const trim: Rect = { x: x0, y: y0, w: n * pw + tab, h: 2 * ph };
  const panels: Panel[] = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < n; c++)
    panels.push({ page: r * n + c + 1, sheet: 0, side: 0, rot: 0, rect: { x: x0 + c * pw, y: y0 + r * ph, w: pw, h: ph } });
  const lines: Line[] = [];
  for (let c = 1; c <= n; c++) lines.push({ id: c === n ? "tab" : `f${c}`, kind: "fold", side: 0, x1: x0 + c * pw, y1: y0, x2: x0 + c * pw, y2: y0 + ph });
  for (let c = 1; c < n; c++) lines.push({ id: `f${n + c}`, kind: "fold", side: 0, x1: x0 + c * pw, y1: y0 + ph, x2: x0 + c * pw, y2: y0 + 2 * ph });
  lines.push({ id: "cut-top", kind: "cut", side: 0, x1: x0, y1: y0, x2: x0 + trim.w, y2: y0 });
  lines.push({ id: "cut-mid", kind: "cut", side: 0, x1: x0, y1: y0 + ph, x2: x0 + trim.w, y2: y0 + ph });
  lines.push({ id: "cut-bot", kind: "cut", side: 0, x1: x0, y1: y0 + 2 * ph, x2: x0 + n * pw, y2: y0 + 2 * ph });
  lines.push({ id: "cut-scrap", kind: "cut", side: 0, x1: x0 + n * pw, y1: y0 + ph, x2: x0 + n * pw, y2: y0 + 2 * ph });
  const spreads: [number, number, SpreadKind][] = [];
  for (let p = 1; p < 2 * n; p++) spreads.push([p, p + 1, p === n ? "glued" : "contiguous"]);
  return {
    t, paper, sheetW: W, sheetH: H, trim, trimmed: true, pageW: pw, pageH: ph, pageCount: 2 * n, sheets: 1, sides: 1, panels, lines,
    glue: [{ id: "glue", side: 0, rect: { x: x0 + n * pw, y: y0, w: tab, h: ph } }],
    scrap: [{ x: x0 + n * pw, y: y0 + ph, w: tab, h: ph }],
    spreads,
  };
}

export function panelOf(imp: Imposition, page: number): Panel {
  const p = imp.panels.find((q) => q.page === page);
  if (!p) throw new Error(`page ${page} not in ${imp.t.id}`);
  return p;
}

/**
 * Bleed for a panel, in page-local directions: only on edges that are a trim cut.
 * A panel rotated 180° has its local left on the sheet's right.
 */
export function panelBleed(imp: Imposition, p: Panel, mm = BLEED_MM): Bleed {
  if (!imp.trimmed) return NO_BLEED;
  const T = imp.trim, r = p.rect, e = 0.01;
  const s: Bleed = {
    l: Math.abs(r.x - T.x) < e && T.x > 0.5 ? mm : 0,
    r: Math.abs(r.x + r.w - (T.x + T.w)) < e && T.x + T.w < imp.sheetW - 0.5 ? mm : 0,
    t: Math.abs(r.y - T.y) < e && T.y > 0.5 ? mm : 0,
    b: Math.abs(r.y + r.h - (T.y + T.h)) < e && T.y + T.h < imp.sheetH - 0.5 ? mm : 0,
  };
  // full-width trims (the A4 sheet edge is the trim) still bleed off the paper edge: harmless, keeps edges clean
  if (Math.abs(r.x - T.x) < e) s.l = mm;
  if (Math.abs(r.x + r.w - (T.x + T.w)) < e) s.r = mm;
  return p.rot === 180 ? { l: s.r, r: s.l, t: s.b, b: s.t } : s;
}

/** Effective print resolution of a crop: source pixels per inch of printed width. */
export function effectiveDpi(srcPxW: number, destMmW: number): number {
  return destMmW > 0 ? srcPxW / (destMmW / 25.4) : 0;
}

/** Reading-order spreads for the flip view of a codex: [left page | null, right page | null]. */
export function codexSpreads(n: number): [number | null, number | null][] {
  const out: [number | null, number | null][] = [[null, 1]];
  for (let k = 1; k < n / 2; k++) out.push([2 * k, 2 * k + 1]);
  out.push([n, null]);
  return out;
}
export function spreadIndexOf(n: number, page: number): number {
  return page === 1 ? 0 : page === n ? n / 2 : Math.floor(page / 2);
}
