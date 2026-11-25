// The one layout engine: issue + template → RenderList (mm) for any zine page, sheet side or IG slide.
import type { Asset, Bind, Border, Crop, FeedRatio, Issue, Item, Layer, PageAssign, TextFx } from "../model/types";
import { codesFor, pad3 } from "./codes";
import { cropFor } from "./crop";
import { type Bleed, type Imposition, NO_BLEED, type Rect, effectiveDpi, impose, panelBleed, panelOf } from "./geometry";

export const COLORS = {
  white: "#FFFFFF", black: "#0D0D0D", paper: "#F4F3EF", ink: "#121212",
  film: "#151515", guide: "#8A8A85", cut: "#E0301E", hatch: "#C9C6BD", test: "#1E5AE0", glue: "#E8B931",
};
export const MM_PER_PT = 25.4 / 72;
export const FEED_W = 75;
export const RATIOS: Record<FeedRatio, { r: number; px: [number, number]; name: string }> = {
  "1:1": { r: 1, px: [1080, 1080], name: "Square 1:1" },
  "4:5": { r: 0.8, px: [1080, 1350], name: "Portrait 4:5" },
  "3:4": { r: 0.75, px: [1080, 1440], name: "Tall 3:4" },
  "1.91:1": { r: 1.91, px: [1080, 566], name: "Landscape 1.91:1" },
};
/** The IG slide surface: 75 units wide (≈ a trimmed A4 mini page, so text sizes feel the same). */
export const feedSize = (i: Pick<Issue, "feedRatio">) => ({ W: FEED_W, H: FEED_W / RATIOS[i.feedRatio].r });

export type RI =
  | { t: "image"; assetId: string; x: number; y: number; w: number; h: number; src: Rect; photo: true }
  | { t: "rect"; x: number; y: number; w: number; h: number; fill: string }
  | { t: "hatch"; x: number; y: number; w: number; h: number; color: string }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number; dash?: number[] }
  | { t: "text"; x: number; y: number; w: number; text: string; font: string; weight: number; size: number;
      color: string; align: "left" | "center" | "right"; lineHeight: number; tracking: number; rotation: number;
      lang: string; fx?: TextFx; maxLines?: number }
  | { t: "code"; kind: "ean13" | "qr"; data: string; addon?: string | null; x: number; y: number; w: number; h: number; fg: string; bg: string; rotation: number; label?: string }
  | { t: "group"; x: number; y: number; w: number; h: number; rot: number; clip: Rect | null; items: RI[] };

export interface Slide { index: number; itemId: string; half?: "L" | "R" }

// ---------------------------------------------------------------- sequence

export function slidesOf(issue: Issue): Slide[] {
  const out: Slide[] = [];
  for (const it of issue.items) {
    if (it.kind === "pair") {
      out.push({ index: out.length, itemId: it.id, half: "L" });
      out.push({ index: out.length, itemId: it.id, half: "R" });
    } else out.push({ index: out.length, itemId: it.id });
  }
  return out;
}

export const impOf = (issue: Issue) => impose(issue.template);
export const pageKey = (page: number, n: number) => (page === 1 ? "zine:front" : page === n ? "zine:back" : `zine:${page}`);

export interface Flow { pages: PageAssign[]; overflow: string[]; warnings: string[] }

/**
 * Auto page-flow. Page 1 = cover, last page = back. Interior pages take the carousel in order;
 * a split pair lands where both halves sit side by side (or, in booklets, on any spread, with a warning).
 */
export function autoFlow(issue: Issue, imp: Imposition = impOf(issue)): Flow {
  const n = imp.pageCount;
  const pages: PageAssign[] = Array.from({ length: n }, () => ({ kind: "blank" }) as PageAssign);
  const warnings: string[] = [];
  const coverId = issue.cover.itemId ?? issue.items[0]?.id ?? null;
  const coverItem = issue.items.find((i) => i.id === coverId);
  if (coverItem) pages[0] = { kind: "item", itemId: coverItem.id, half: coverItem.kind === "pair" ? "R" : undefined };
  pages[n - 1] = { kind: "text" };
  const pairStarts = new Map(imp.spreads.filter((s) => s[2] !== "wrap-cover").map((s) => [s[0], s[2]]));
  const queue = issue.items.filter((i) => i.id !== coverId);
  const overflow: string[] = [];
  let pos = 2;
  const last = n - 1;
  while (queue.length) {
    const it = queue[0];
    if (pos > last) { overflow.push(...queue.map((q) => q.id)); break; }
    if (it.kind !== "pair") { pages[pos - 1] = { kind: "item", itemId: it.id }; queue.shift(); pos++; continue; }
    const kind = pairStarts.get(pos);
    if (kind && pos + 1 <= last) {
      pages[pos - 1] = { kind: "item", itemId: it.id, half: "L" };
      pages[pos] = { kind: "item", itemId: it.id, half: "R" };
      if (kind === "split") warnings.push(`"${it.label}" spans pages ${pos}–${pos + 1}, which print on different sheets: may not line up`);
      if (kind === "glued") warnings.push(`"${it.label}" spans the glue join (${pos}–${pos + 1})`);
      queue.shift(); pos += 2; continue;
    }
    const k = queue.findIndex((q) => q.kind !== "pair");
    if (k > 0) { const [s] = queue.splice(k, 1); pages[pos - 1] = { kind: "item", itemId: s.id }; pos++; continue; }
    warnings.push(`Page ${pos} left blank so the split pair "${it.label}" lands on a spread`);
    pages[pos - 1] = { kind: "blank" }; pos++;
  }
  if (overflow.length) warnings.push(`${overflow.length} photo(s) don't fit in ${n} pages`);
  return { pages, overflow, warnings };
}

export function resolvedPages(issue: Issue, imp?: Imposition): PageAssign[] {
  const auto = autoFlow(issue, imp).pages;
  if (!issue.pages) return auto;
  return auto.map((a, i) => (i === 0 || i === auto.length - 1 ? a : issue.pages![i] ?? a));
}

export function pageForSlide(issue: Issue, slide: Slide): number | null {
  const pages = resolvedPages(issue);
  const i = pages.findIndex((p) => p.kind === "item" && p.itemId === slide.itemId && (p.half ?? undefined) === slide.half);
  if (i >= 0) return i + 1;
  const j = pages.findIndex((p) => p.kind === "item" && p.itemId === slide.itemId);
  return j >= 0 ? j + 1 : null;
}
export function slideForPage(issue: Issue, page: number): number | null {
  const p = resolvedPages(issue)[page - 1];
  if (!p || p.kind !== "item") return null;
  const s = slidesOf(issue).find((s) => s.itemId === p.itemId && (s.half === p.half || !p.half));
  return s ? s.index : null;
}

// ---------------------------------------------------------------- borders

export function borderColor(b: Border) {
  return b.color === "white" ? COLORS.white : b.color === "black" ? COLORS.black : COLORS.paper;
}
interface BorderBox { bg: string; photo: Rect; strip: Rect | null; forceContain: boolean; film: boolean }
/** Lay a border preset into a W×H surface. The background extends into the bleed. */
export function borderBox(b: Border, W: number, H: number): BorderBox {
  const m = (b.size / 100) * Math.min(W, H);
  switch (b.preset) {
    case "none": return { bg: COLORS.paper, photo: { x: 0, y: 0, w: W, h: H }, strip: null, forceContain: false, film: false };
    case "mat": return { bg: borderColor(b), photo: { x: m, y: m, w: W - 2 * m, h: H - 2 * m }, strip: null, forceContain: false, film: false };
    case "caption": {
      const bottom = Math.max(m * 3.5, 6);
      return { bg: borderColor(b), photo: { x: m, y: m, w: W - 2 * m, h: H - m - bottom }, strip: { x: m, y: H - bottom, w: W - 2 * m, h: bottom }, forceContain: false, film: false };
    }
    case "film": {
      const bottom = Math.max(m * 2, 4);
      return { bg: COLORS.film, photo: { x: m, y: m, w: W - 2 * m, h: H - m - bottom }, strip: { x: m, y: H - bottom, w: W - 2 * m, h: bottom }, forceContain: false, film: true };
    }
    case "letterbox": return { bg: COLORS.black, photo: { x: 0, y: 0, w: W, h: H }, strip: null, forceContain: true, film: false };
  }
}
/** A full-bleed photo box stretches into the bleed so trimmed edges stay clean. */
function bleedPhoto(b: Border, photo: Rect, W: number, H: number, bl: Bleed): Rect {
  if (b.preset !== "none") return photo;
  return { x: -bl.l, y: -bl.t, w: W + bl.l + bl.r, h: H + bl.t + bl.b };
}

// ---------------------------------------------------------------- surfaces

export interface Ctx {
  issue: Issue;
  side: "zine" | "feed";
  copy: number;
  total: number;
  test?: boolean;
  imp?: Imposition;
  /** page-local bleed for any page (zine only) */
  bleedOf?: (page: number) => Bleed;
}

const asset = (issue: Issue, id?: string): Asset | undefined => (id ? issue.assets.find((a) => a.id === id) : undefined);
const itemOf = (issue: Issue, id: string): Item | undefined => issue.items.find((i) => i.id === id);

export function photo(a: Asset | undefined, crop: Crop, box: Rect, forceContain = false): RI[] {
  if (!a) return [{ t: "rect", ...box, fill: COLORS.hatch }];
  const c = cropFor(a.w, a.h, box.w, box.h, forceContain ? { ...crop, fit: "contain" } : crop);
  return [{ t: "image", assetId: a.id, x: box.x + c.dst.x, y: box.y + c.dst.y, w: c.dst.w, h: c.dst.h, src: c.src, photo: true }];
}

/** The two photo boxes of a stack inside a photo box. */
export function stackBoxes(box: Rect, it: Item, W: number, H: number): [Rect, Rect] {
  const g = ((it.stackGap ?? 0) / 100) * Math.min(W, H);
  const h = (box.h - g) / 2;
  return [{ x: box.x, y: box.y, w: box.w, h }, { x: box.x, y: box.y + h + g, w: box.w, h }];
}

const MONO = "IBM Plex Mono";

function stripText(bb: BorderBox, text: string): RI[] {
  if (!bb.strip || !text) return [];
  const s = bb.strip;
  const size = Math.min(7, (s.h / MM_PER_PT) * 0.42);
  return [{ t: "text", x: s.x, y: s.y + s.h / 2 - (size * MM_PER_PT) / 2, w: s.w, text, font: bb.film ? MONO : "IBM Plex Sans", weight: 400,
    size, color: bb.film ? "#E8E8E2" : COLORS.ink, align: bb.film ? "left" : "center", lineHeight: 1.1, tracking: bb.film ? 0.06 : 0, rotation: 0, lang: "", maxLines: 1 }];
}

/** Photo content of one surface (zine page or IG slide) showing one item, or half of a pair. */
function itemSurface(ctx: Ctx, it: Item, W: number, H: number, half: "L" | "R" | undefined, bleed: Bleed, label: string): RI[] {
  const border = ctx.side === "zine" ? ctx.issue.zineBorder : ctx.issue.feedBorder;
  const crop = ctx.side === "zine" ? it.print : it.feed;
  const crop2 = (ctx.side === "zine" ? it.print2 : it.feed2) ?? crop;
  const a = asset(ctx.issue, it.assetId);
  if (it.kind === "pair") {
    const h = half ?? "L";
    // lay the whole spread out once, then show this half through an offset group (the caller clips)
    const sb: Bleed = { l: h === "L" ? bleed.l : siblingBleed(ctx, it, "L").l, r: h === "R" ? bleed.r : siblingBleed(ctx, it, "R").r, t: bleed.t, b: bleed.b };
    const bb = borderBox(border, 2 * W, H);
    const box = bleedPhoto(border, bb.photo, 2 * W, H, sb);
    const items: RI[] = [{ t: "rect", x: -sb.l, y: -sb.t, w: 2 * W + sb.l + sb.r, h: H + sb.t + sb.b, fill: bb.bg }, ...photo(a, crop, box, bb.forceContain), ...stripText(bb, it.caption || label)];
    return [{ t: "group", x: h === "L" ? 0 : -W, y: 0, w: 2 * W, h: H, rot: 0, clip: null, items }];
  }
  const bb = borderBox(border, W, H);
  const out: RI[] = [{ t: "rect", x: -bleed.l, y: -bleed.t, w: W + bleed.l + bleed.r, h: H + bleed.t + bleed.b, fill: bb.bg }];
  if (it.kind === "stack") {
    const [b1, b2] = stackBoxes(bb.photo, it, W, H);
    if (border.preset === "none") { b1.x -= bleed.l; b1.w += bleed.l + bleed.r; b1.y -= bleed.t; b1.h += bleed.t; b2.x -= bleed.l; b2.w += bleed.l + bleed.r; b2.h += bleed.b; }
    if ((it.stackGap ?? 0) > 0) out.push({ t: "rect", x: b1.x, y: b1.y + b1.h, w: b1.w, h: b2.y - b1.y - b1.h, fill: it.stackGapColor ?? bb.bg });
    out.push(...photo(a, crop, b1, bb.forceContain), ...photo(asset(ctx.issue, it.assetId2), crop2, b2, bb.forceContain));
  } else {
    out.push(...photo(a, crop, bleedPhoto(border, bb.photo, W, H, bleed), bb.forceContain));
  }
  out.push(...stripText(bb, it.caption || label));
  return out;
}
function siblingBleed(ctx: Ctx, it: Item, half: "L" | "R"): Bleed {
  if (ctx.side !== "zine" || !ctx.bleedOf) return NO_BLEED;
  const pages = resolvedPages(ctx.issue, ctx.imp);
  const i = pages.findIndex((p) => p.kind === "item" && p.itemId === it.id && p.half === half);
  return i >= 0 ? ctx.bleedOf(i + 1) : NO_BLEED;
}

// ---------------------------------------------------------------- layers

export function bindText(ctx: Ctx, bind: Bind): string {
  const { issue } = ctx;
  const b = issue.back;
  switch (bind) {
    case "title": return issue.title;
    case "subtitle": return issue.subtitle;
    case "no": return `No. ${pad3(issue.no)}`;
    case "date": return issue.date;
    case "note": return b.note;
    case "details": return [
      `No. ${pad3(issue.no)}`, issue.date, issue.title, b.location,
      b.songTitle ? `Song: ${b.songTitle}${b.songArtist ? `, ${b.songArtist}` : ""}` : "",
      ...b.fields.filter((f) => f.label || f.value).map((f) => `${f.label}${f.label && f.value ? ": " : ""}${f.value}`),
    ].filter(Boolean).join("\n");
    case "human": return codesFor(issue, ctx.copy, ctx.total).human;
    case "serial": return codesFor(issue, ctx.copy, ctx.total).serial;
  }
}

export function layerText(ctx: Ctx, l: Layer): string {
  return l.bind ? bindText(ctx, l.bind) : l.text ?? "";
}

export function layerItems(ctx: Ctx, layers: Layer[] | undefined, W: number, H: number): RI[] {
  const out: RI[] = [];
  const codes = codesFor(ctx.issue, ctx.copy, ctx.total);
  for (const l of layers ?? []) {
    if (l.hidden) continue;
    const x = (l.x / 100) * W, y = (l.y / 100) * H, w = (l.w / 100) * W, h = (l.h / 100) * H;
    if (l.kind === "band") out.push({ t: "rect", x, y, w, h, fill: l.fill ?? COLORS.paper });
    if (l.kind === "text") {
      const text = layerText(ctx, l);
      if (!text.trim()) continue;
      out.push({ t: "text", x, y, w, text, font: l.font ?? "IBM Plex Sans", weight: l.weight ?? 400, size: l.size ?? 8, color: l.color ?? COLORS.ink,
        align: l.align ?? "left", lineHeight: l.lineHeight ?? 1.2, tracking: l.tracking ?? 0, rotation: l.rotation, lang: l.lang ?? "", fx: l.fx });
    }
    if (l.kind === "ean" && codes.ean) out.push({ t: "code", kind: "ean13", data: codes.ean, addon: codes.addon, x, y, w, h, fg: l.fg ?? "#000000", bg: l.bg ?? "#FFFFFF", rotation: l.rotation });
    if (l.kind === "qr") {
      const data = l.qr === "song" ? codes.songQr : (l.qrData?.trim() || codes.qr);
      if (data) out.push({ t: "code", kind: "qr", data, x, y, w, h, fg: l.fg ?? "#000000", bg: l.bg ?? "#FFFFFF", rotation: l.rotation,
        label: l.qr === "song" ? "song" : ctx.issue.codes.qrLabel || undefined });
    }
  }
  return out;
}

// ---------------------------------------------------------------- pages

/** Items for one zine page in page-local mm (0,0 = page top-left, upright). */
export function pageItems(ctx: Ctx, page: number, W: number, H: number, bleed: Bleed = NO_BLEED): RI[] {
  const { issue } = ctx;
  const imp = ctx.imp ?? impOf(issue);
  ctx = { ...ctx, imp };
  const pages = resolvedPages(issue, imp);
  const n = pages.length;
  const a = pages[page - 1];
  const out: RI[] = [];
  const full: Rect = { x: -bleed.l, y: -bleed.t, w: W + bleed.l + bleed.r, h: H + bleed.t + bleed.b };
  const coverIt = pages[0]?.kind === "item" ? itemOf(issue, pages[0].itemId) : undefined;
  const wrap = !!coverIt && (issue.cover.wraparound || coverIt.kind === "pair");
  if (page === n) {
    if (wrap && coverIt) out.push(...wrapPhoto(ctx, coverIt, W, H, "L", bleed));
    else out.push({ t: "rect", ...full, fill: COLORS.paper });
  } else if (page === 1) {
    if (coverIt) out.push(...(wrap ? wrapPhoto(ctx, coverIt, W, H, "R", bleed) : itemSurface(ctx, coverIt, W, H, undefined, bleed, "1")));
    else out.push({ t: "rect", ...full, fill: COLORS.paper });
  } else if (a?.kind === "item") {
    const it = itemOf(issue, a.itemId);
    out.push(...(it ? itemSurface(ctx, it, W, H, it.kind === "pair" ? a.half ?? "L" : undefined, bleed, String(page)) : [{ t: "rect", ...full, fill: COLORS.paper } as RI]));
  } else out.push({ t: "rect", ...full, fill: COLORS.paper });
  out.push(...layerItems(ctx, issue.layers[pageKey(page, n)], W, H));
  if (issue.pageNumbers && page !== 1 && page !== n && issue.zineBorder.preset !== "caption" && issue.zineBorder.preset !== "film")
    out.push({ t: "text", x: W * 0.08, y: H - 4, w: W * 0.84, text: String(page), font: MONO, weight: 400, size: 5, color: COLORS.guide, align: page % 2 ? "right" : "left", lineHeight: 1, tracking: 0, rotation: 0, lang: "" });
  if (ctx.test) out.push(...testOverlay(imp, page, W, H));
  return out;
}

/** Wraparound cover: one photo across back (left) + front (right), no border. */
function wrapPhoto(ctx: Ctx, it: Item, W: number, H: number, half: "L" | "R", bleed: Bleed): RI[] {
  const a = asset(ctx.issue, it.assetId);
  const n = resolvedPages(ctx.issue, ctx.imp).length;
  const other = ctx.bleedOf ? ctx.bleedOf(half === "L" ? 1 : n) : NO_BLEED;
  const sb: Bleed = { l: half === "L" ? bleed.l : other.l, r: half === "R" ? bleed.r : other.r, t: bleed.t, b: bleed.b };
  const box: Rect = { x: -sb.l, y: -sb.t, w: 2 * W + sb.l + sb.r, h: H + sb.t + sb.b };
  return [{ t: "group", x: half === "L" ? 0 : -W, y: 0, w: 2 * W, h: H, rot: 0, clip: null, items: [{ t: "rect", ...box, fill: COLORS.paper }, ...photo(a, it.print, box)] }];
}

function testOverlay(imp: Imposition, page: number, W: number, H: number): RI[] {
  const n = imp.pageCount;
  const spread = imp.spreads.find((s) => s[0] === page || s[1] === page);
  const isLeft = spread ? spread[0] === page : false;
  const big = Math.min(H * 0.45, W * 0.8) / MM_PER_PT;
  const blue = COLORS.test;
  const name = page === 1 ? "FRONT" : page === n ? "BACK" : `PAGE ${page}`;
  const lab = Math.min(9, W / 8);
  return [
    { t: "rect", x: 0, y: 0, w: W, h: H, fill: "rgba(255,255,255,0.55)" },
    { t: "text", x: 0, y: 3, w: W, text: "TOP ↑", font: MONO, weight: 600, size: lab, color: blue, align: "center", lineHeight: 1, tracking: 0.05, rotation: 0, lang: "" },
    { t: "text", x: 0, y: H / 2 - (big * MM_PER_PT) / 2, w: W, text: String(page), font: "Oswald", weight: 700, size: big, color: blue, align: "center", lineHeight: 1, tracking: 0, rotation: 0, lang: "" },
    { t: "text", x: 0, y: H - 9, w: W, text: name, font: MONO, weight: 600, size: lab * 0.8, color: blue, align: "center", lineHeight: 1, tracking: 0.05, rotation: 0, lang: "" },
    spread
      ? { t: "line", x1: 0, y1: isLeft ? H * 0.15 : H * 0.5, x2: W, y2: isLeft ? H * 0.5 : H * 0.85, color: blue, width: 0.6 }
      : { t: "line", x1: 0, y1: H * 0.5, x2: W, y2: H * 0.5, color: blue, width: 0.6 },
  ];
}

// ---------------------------------------------------------------- sheet

export type GuideMode = "full" | "marks" | "none";
export interface SheetOpts {
  copy: number; total: number;
  sheet: number; side: number;
  guides: GuideMode;
  /** show unprintable margins, trimmed-off strips and glue (preview only) */
  preview: boolean;
  test?: boolean;
  margins?: { top: number; right: number; bottom: number; left: number };
  bleed?: boolean;
}
export interface SheetOut { imp: Imposition; content: RI[]; guides: RI[] }

export function sheetItems(issue: Issue, o: SheetOpts): SheetOut {
  const imp = impOf(issue);
  const bleedOf = (page: number) => (o.bleed === false ? NO_BLEED : panelBleed(imp, panelOf(imp, page)));
  const ctx: Ctx = { issue, side: "zine", copy: o.copy, total: o.total, test: o.test, bleedOf, imp };
  const content: RI[] = [{ t: "rect", x: 0, y: 0, w: imp.sheetW, h: imp.sheetH, fill: COLORS.white }];
  if (imp.t.poster && o.side === 1) {
    content.push(...posterItems(issue, imp));
  } else {
    for (const p of imp.panels.filter((q) => q.sheet === o.sheet && q.side === o.side)) {
      const r = p.rect;
      const b = bleedOf(p.page);
      content.push({ t: "group", x: r.x, y: r.y, w: r.w, h: r.h, rot: p.rot, clip: { x: -b.l, y: -b.t, w: r.w + b.l + b.r, h: r.h + b.t + b.b }, items: pageItems(ctx, p.page, r.w, r.h, b) });
    }
  }
  const guides: RI[] = [];
  if (o.preview) {
    const T = imp.trim;
    const dead = [
      { x: 0, y: 0, w: imp.sheetW, h: T.y }, { x: 0, y: T.y + T.h, w: imp.sheetW, h: imp.sheetH - T.y - T.h },
      { x: 0, y: T.y, w: T.x, h: T.h }, { x: T.x + T.w, y: T.y, w: imp.sheetW - T.x - T.w, h: T.h }, ...imp.scrap,
    ].filter((r) => r.w > 0.3 && r.h > 0.3);
    if (!(imp.t.poster && o.side === 1)) for (const r of dead) guides.push({ t: "hatch", ...r, color: COLORS.hatch });
    for (const gl of imp.glue.filter((x) => x.side === o.side)) {
      guides.push({ t: "rect", ...gl.rect, fill: "rgba(232,185,49,0.35)" });
      guides.push({ t: "text", x: gl.rect.x, y: gl.rect.y + gl.rect.h / 2 - 2, w: gl.rect.w, text: "GLUE", font: MONO, weight: 600, size: 5, color: COLORS.ink, align: "center", lineHeight: 1, tracking: 0.05, rotation: 0, lang: "" });
    }
    const m = o.margins;
    if (m) {
      const c = "rgba(224,48,30,0.5)";
      if (m.top) guides.push({ t: "hatch", x: 0, y: 0, w: imp.sheetW, h: m.top, color: c });
      if (m.bottom) guides.push({ t: "hatch", x: 0, y: imp.sheetH - m.bottom, w: imp.sheetW, h: m.bottom, color: c });
      if (m.left) guides.push({ t: "hatch", x: 0, y: 0, w: m.left, h: imp.sheetH, color: c });
      if (m.right) guides.push({ t: "hatch", x: imp.sheetW - m.right, y: 0, w: m.right, h: imp.sheetH, color: c });
    }
  }
  guides.push(...guideLines(imp, o.side, o.guides, imp.t.poster && o.side === 1));
  return { imp, content, guides };
}

/** T2: one photo over the whole back of the sheet, with the slit and creases shown in previews. */
function posterItems(issue: Issue, imp: Imposition): RI[] {
  const it = issue.items.find((i) => i.id === issue.posterItemId) ?? issue.items[0];
  if (!it) return [];
  return photo(asset(issue, it.assetId), it.print, { x: 0, y: 0, w: imp.sheetW, h: imp.sheetH });
}

export function guideLines(imp: Imposition, side: number, mode: GuideMode, poster = false): RI[] {
  if (mode === "none") return [];
  const out: RI[] = [];
  const T = imp.trim;
  const mine = imp.lines.filter((l) => l.side === side || (poster && side === 1));
  if (mode === "full") {
    for (const l of mine) {
      // the poster side is the mirror of side 1: flip x
      const L = poster ? { ...l, x1: imp.sheetW - l.x1, x2: imp.sheetW - l.x2 } : l;
      out.push(l.kind === "cut"
        ? { t: "line", x1: L.x1, y1: L.y1, x2: L.x2, y2: L.y2, color: COLORS.cut, width: 0.4 }
        : { t: "line", x1: L.x1, y1: L.y1, x2: L.x2, y2: L.y2, color: COLORS.guide, width: 0.25, dash: [2, 1.5] });
    }
  } else if (!poster) {
    // small marks only, outside the zine area where possible (they get cut away)
    const tick = 4;
    for (const l of mine) {
      const color = l.kind === "cut" ? COLORS.cut : COLORS.guide;
      if (l.x1 === l.x2) {
        if (T.y > 4) {
          out.push({ t: "line", x1: l.x1, y1: Math.max(0.5, T.y - tick - 3.2), x2: l.x1, y2: T.y - 3.2, color, width: 0.25 });
          out.push({ t: "line", x1: l.x1, y1: T.y + T.h + 3.2, x2: l.x1, y2: Math.min(imp.sheetH - 0.5, T.y + T.h + 3.2 + tick), color, width: 0.25 });
        } else {
          out.push({ t: "line", x1: l.x1, y1: 5, x2: l.x1, y2: 9, color, width: 0.25 });
          out.push({ t: "line", x1: l.x1, y1: imp.sheetH - 9, x2: l.x1, y2: imp.sheetH - 5, color, width: 0.25 });
        }
      } else if (l.kind === "cut") {
        out.push({ t: "line", x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, color, width: 0.25, dash: [1, 1.5] });
      }
    }
  }
  if (imp.trimmed && !poster) {
    for (const y of [T.y, T.y + T.h]) if (y > 0.5 && y < imp.sheetH - 0.5) {
      out.push({ t: "line", x1: Math.max(0, T.x - 10) + 2, y1: y, x2: Math.max(0, T.x - 10) + 10, y2: y, color: COLORS.ink, width: 0.2 });
      out.push({ t: "line", x1: Math.min(imp.sheetW, T.x + T.w + 10) - 10, y1: y, x2: Math.min(imp.sheetW, T.x + T.w + 10) - 2, y2: y, color: COLORS.ink, width: 0.2 });
    }
    for (const x of [T.x, T.x + T.w]) if (x > 0.5 && x < imp.sheetW - 0.5) {
      out.push({ t: "line", x1: x, y1: 2, x2: x, y2: 8, color: COLORS.ink, width: 0.2 });
      out.push({ t: "line", x1: x, y1: imp.sheetH - 8, x2: x, y2: imp.sheetH - 2, color: COLORS.ink, width: 0.2 });
    }
  }
  return out;
}

// ---------------------------------------------------------------- feed slides

/** Items for one IG slide on the feed surface (75 units wide, height from the chosen ratio). */
export function slideItems(issue: Issue, index: number): RI[] {
  const { W, H } = feedSize(issue);
  const s = slidesOf(issue)[index];
  const ctx: Ctx = { issue, side: "feed", copy: 1, total: 1 };
  if (!s) return [{ t: "rect", x: 0, y: 0, w: W, h: H, fill: COLORS.paper }];
  const it = itemOf(issue, s.itemId)!;
  return [...itemSurface(ctx, it, W, H, s.half, NO_BLEED, String(index + 1)), ...layerItems(ctx, issue.layers[`feed:${index}`], W, H)];
}

// ---------------------------------------------------------------- checks

export interface PageCheck { page: number; dpi: number | null; warnings: string[] }
export function pageChecks(issue: Issue): PageCheck[] {
  const imp = impOf(issue);
  const out: PageCheck[] = [];
  for (let page = 1; page <= imp.pageCount; page++) {
    const items = flatten(pageItems({ issue, side: "zine", copy: 1, total: 1, imp }, page, imp.pageW, imp.pageH));
    let dpi: number | null = null;
    for (const it of items) if (it.t === "image") {
      const a = issue.assets.find((x) => x.id === it.assetId);
      if (a) { const d = effectiveDpi(a.w * it.src.w, it.w); dpi = dpi === null ? d : Math.min(dpi, d); }
    }
    out.push({ page, dpi, warnings: dpi !== null && dpi < 200 ? [`Page ${page}: ${Math.round(dpi)} effective DPI (under 200)`] : [] });
  }
  return out;
}
export function flatten(items: RI[]): RI[] {
  return items.flatMap((i) => (i.t === "group" ? flatten(i.items) : [i]));
}
