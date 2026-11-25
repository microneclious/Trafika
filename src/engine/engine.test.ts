import { toSVG } from "bwip-js/browser";
import { describe, expect, it } from "vitest";
import { migrate, newIssue } from "../model/defaults";
import type { Issue, Item } from "../model/types";
import { codesFor, collectionEan, eanCheckDigit, eanWarning, isValidEan13, parseCollectionEan } from "./codes";
import { cropFor } from "./crop";
import { TEMPLATE_LIST, impose, panelBleed, panelOf } from "./geometry";
import { gridById, snapBox } from "./grids";
import { RATIOS, autoFlow, feedSize, flatten, layerItems, pageForSlide, pageItems, sheetItems, slideForPage, slidesOf } from "./layout";

const T1 = impose({ id: "mini-8-onecut", paper: "A4", trimmed: true, pages: 8 });

describe("trim maths (ZINE_SPEC §2)", () => {
  it("A4 trimmed to 3:2 gives 74.25 × 99 mm pages, exactly 3:4", () => {
    expect(T1.trim.w).toBeCloseTo(297); expect(T1.trim.h).toBeCloseTo(198); expect(T1.trim.y).toBeCloseTo(6);
    expect(T1.pageW).toBeCloseTo(74.25); expect(T1.pageH).toBeCloseTo(99);
    expect(T1.pageW / T1.pageH).toBeCloseTo(0.75, 6);
  });
  it("A3 trimmed: 105 × 140; Letter trimmed: 69.85 × 93.13; untrimmed A4: A7", () => {
    const a3 = impose({ id: "mini-8-onecut", paper: "A3", trimmed: true, pages: 8 });
    expect(a3.pageW).toBeCloseTo(105); expect(a3.pageH).toBeCloseTo(140);
    const l = impose({ id: "mini-8-onecut", paper: "Letter", trimmed: true, pages: 8 });
    expect(l.pageW).toBeCloseTo(69.85); expect(l.pageH).toBeCloseTo(93.13, 2);
    const u = impose({ id: "mini-8-onecut", paper: "A4", trimmed: false, pages: 8 });
    expect(u.pageH).toBeCloseTo(105);
  });
  it("A4 at 300 DPI trimmed page is 877 × 1169 px", () => {
    expect(Math.round((T1.pageW / 25.4) * 300)).toBe(877);
    expect(Math.round((T1.pageH / 25.4) * 300)).toBe(1169);
  });
});

describe("T1 page → panel mapping and rotation", () => {
  it("top row 5 4 3 2 upside down, bottom row 6 7 back front upright", () => {
    [5, 4, 3, 2].map((p) => panelOf(T1, p)).forEach((p, i) => { expect(p.rect.y).toBeCloseTo(6); expect(p.rect.x).toBeCloseTo(i * 74.25); expect(p.rot).toBe(180); });
    [6, 7, 8, 1].map((p) => panelOf(T1, p)).forEach((p, i) => { expect(p.rect.y).toBeCloseTo(105); expect(p.rect.x).toBeCloseTo(i * 74.25); expect(p.rot).toBe(0); });
  });
  it("bleed only on trim edges, flipped for rotated panels", () => {
    expect(panelBleed(T1, panelOf(T1, 5))).toEqual({ l: 0, r: 3, t: 0, b: 3 });
    expect(panelBleed(T1, panelOf(T1, 1))).toEqual({ l: 0, r: 3, t: 0, b: 3 });
    expect(panelBleed(impose({ id: "mini-8-onecut", paper: "A4", trimmed: false, pages: 8 }), panelOf(T1, 1))).toEqual({ l: 0, r: 0, t: 0, b: 0 });
  });
});

describe("every template", () => {
  for (const t of TEMPLATE_LIST) for (const pages of t.pages) for (const paper of t.sizes) {
    const imp = impose({ id: t.id, paper, trimmed: true, pages });
    it(`${t.code} ${paper} ${pages}p: each page printed exactly once, inside the sheet`, () => {
      const seen = imp.panels.map((p) => p.page).sort((a, b) => a - b);
      expect(seen).toEqual(Array.from({ length: imp.pageCount }, (_, i) => i + 1));
      for (const p of imp.panels) {
        expect(p.rect.x).toBeGreaterThanOrEqual(-0.01); expect(p.rect.y).toBeGreaterThanOrEqual(-0.01);
        expect(p.rect.x + p.rect.w).toBeLessThanOrEqual(imp.sheetW + 0.01); expect(p.rect.y + p.rect.h).toBeLessThanOrEqual(imp.sheetH + 0.01);
        expect(p.side).toBeLessThan(imp.sides);
      }
      // same-sheet spreads sit side by side, left page on the reading left
      for (const [a, b, kind] of imp.spreads) {
        if (kind === "split" || kind === "glued") continue;
        const A = panelOf(imp, a), B = panelOf(imp, b);
        expect(A.sheet).toBe(B.sheet); expect(A.side).toBe(B.side); expect(A.rot).toBe(B.rot);
        expect(A.rect.y).toBeCloseTo(B.rect.y);
        const leftOfB = A.rect.x + A.rect.w;
        if (A.rot === 0) expect(leftOfB).toBeCloseTo(B.rect.x); else expect(B.rect.x + B.rect.w).toBeCloseTo(A.rect.x);
      }
      expect(t.steps.length).toBeGreaterThan(1);
    });
  }
  it("saddle stitch 16p: outer sheet [16|1] / [2|15], centre spread on one sheet", () => {
    const s = impose({ id: "saddle", paper: "A4", trimmed: true, pages: 16 });
    expect(s.sheets).toBe(4);
    const at = (page: number) => { const p = panelOf(s, page); return [p.sheet, p.side, p.rect.x < 100 ? "L" : "R"].join(); };
    expect(at(16)).toBe("0,0,L"); expect(at(1)).toBe("0,0,R"); expect(at(2)).toBe("0,1,L"); expect(at(15)).toBe("0,1,R");
    expect(at(8)).toBe("3,1,L"); expect(at(9)).toBe("3,1,R");
    expect(s.pageW / s.pageH).toBeCloseTo(0.75, 5);
  });
  it("accordion panels are 3:4 and the glue tab sits after panel 4", () => {
    const a = impose({ id: "accordion", paper: "A4", trimmed: true, pages: 8 });
    expect(a.pageW / a.pageH).toBeCloseTo(0.75, 5);
    expect(a.glue[0].rect.x).toBeCloseTo(panelOf(a, 4).rect.x + a.pageW);
  });
  it("French fold pages are 3:4 portrait when trimmed", () => {
    const f = impose({ id: "french-fold", paper: "A4", trimmed: true, pages: 4 });
    expect(f.pageW).toBeCloseTo(105); expect(f.pageH).toBeCloseTo(140);
  });
});

describe("crop windows", () => {
  it("2:3 portrait into 3:4 cover loses 11.1%", () => {
    const c = cropFor(1280, 1920, 3, 4, { fit: "cover", fx: 0.5, fy: 0.5, zoom: 1 });
    expect(c.src.w).toBe(1); expect(c.src.h).toBeCloseTo(0.8889, 3); expect(c.lost).toBeCloseTo(0.1111, 3);
  });
  it("3:2 landscape into a 3:2 spread loses nothing", () => {
    expect(cropFor(6000, 4000, 148.5, 99, { fit: "cover", fx: 0.5, fy: 0.5, zoom: 1 }).lost).toBeCloseTo(0, 6);
  });
  it("focal point is clamped inside the frame", () => {
    expect(cropFor(4000, 2000, 1, 1, { fit: "cover", fx: 0, fy: 0.5, zoom: 1 }).src.x).toBe(0);
    const d = cropFor(4000, 2000, 1, 1, { fit: "cover", fx: 1, fy: 0.5, zoom: 1 });
    expect(d.src.x + d.src.w).toBeCloseTo(1);
  });
  it("contain letterboxes inside the box", () => {
    const c = cropFor(3000, 2000, 75, 100, { fit: "contain", fx: 0.5, fy: 0.5, zoom: 1 });
    expect(c.dst.w).toBe(75); expect(c.dst.h).toBeCloseTo(50); expect(c.dst.y).toBeCloseTo(25);
  });
  it("zoom works on any fill crop (lets a 4:3 pair be moved inside a 3:2 spread)", () => {
    expect(cropFor(3000, 4000, 3, 4, { fit: "cover", fx: 0.5, fy: 0.5, zoom: 2 }).src.w).toBeCloseTo(0.5);
    const a = cropFor(3264, 2448, 148.5, 99, { fit: "cover", fx: 0.2, fy: 0.5, zoom: 1.5 });
    expect(a.src.x).toBeCloseTo(0); expect(a.src.w).toBeLessThan(0.67);
  });
});

function demo(kinds: ("single" | "pair" | "stack")[]): Issue {
  const i = newIssue(12, "Транзит");
  kinds.forEach((k, n) => {
    i.assets.push({ id: "a" + n, file: "", hash: "", name: "", w: k === "pair" ? 3000 : 3000, h: k === "pair" ? 2000 : 4000 });
    const it: Item = { id: "i" + n, kind: k, assetId: "a" + n, assetId2: k === "stack" ? "a0" : undefined, stackGap: 4, label: "p" + n, caption: "", feed: { fit: "cover", fx: .5, fy: .5, zoom: 1 }, print: { fit: "cover", fx: .5, fy: .5, zoom: 1 }, linked: true };
    i.items.push(it);
  });
  return i;
}

describe("auto page-flow", () => {
  it("7 slides → 8 pages: cover, 6 interior, back", () => {
    const f = autoFlow(demo(Array(7).fill("single")));
    expect(f.pages.map((p) => (p.kind === "item" ? p.itemId : p.kind))).toEqual(["i0", "i1", "i2", "i3", "i4", "i5", "i6", "text"]);
  });
  it("a split pair lands on a contiguous spread (moves a single forward)", () => {
    const f = autoFlow(demo(["single", "single", "pair", "single", "single"]));
    expect(f.pages[2]).toMatchObject({ itemId: "i3" });
    expect(f.pages[3]).toMatchObject({ itemId: "i2", half: "L" });
    expect(f.pages[4]).toMatchObject({ itemId: "i2", half: "R" });
  });
  it("too many photos are reported, not dropped silently", () => {
    const f = autoFlow(demo(Array(9).fill("single")));
    expect(f.overflow.length).toBe(2);
  });
  it("slides and pages link both ways; a stack is one slide", () => {
    const i = demo(["single", "pair", "stack", "single"]);
    const s = slidesOf(i);
    expect(s.length).toBe(5);
    expect(pageForSlide(i, s[1])).toBe(2);
    expect(slideForPage(i, 3)).toBe(2);
    expect(pageForSlide(i, s[3])).toBe(4);
  });
});

describe("stacked photos", () => {
  it("two images on one page with the gap between", () => {
    const i = demo(["single", "stack"]);
    const items = flatten(pageItems({ issue: i, side: "zine", copy: 1, total: 1 }, 2, T1.pageW, T1.pageH));
    const imgs = items.filter((x) => x.t === "image");
    expect(imgs).toHaveLength(2);
    const [a, b] = imgs as Extract<(typeof items)[number], { t: "image" }>[];
    expect(b.y).toBeGreaterThan(a.y + a.h);
  });
});

describe("Instagram sizes", () => {
  it("every ratio IG accepts, at 1080 px wide", () => {
    expect(RATIOS["1:1"].px).toEqual([1080, 1080]);
    expect(RATIOS["4:5"].px).toEqual([1080, 1350]);
    expect(RATIOS["3:4"].px).toEqual([1080, 1440]);
    expect(RATIOS["1.91:1"].px).toEqual([1080, 566]);
    const i = newIssue(1); i.feedRatio = "4:5";
    expect(feedSize(i).H).toBeCloseTo(93.75);
  });
});

describe("layers + grids", () => {
  it("snaps an edge to the nearest grid line", () => {
    const s = snapBox(7.2, 40, 30, 10, gridById("margins"));
    expect(s.x).toBe(8); expect(s.gx).toBe(8);
  });
  it("bound text follows the issue (serial changes per copy)", () => {
    const i = newIssue(12); i.date = "23.11.2026";
    const human = (copy: number) => layerItems({ issue: i, side: "zine", copy, total: 5 }, i.layers["zine:back"], 74.25, 99).find((x) => x.t === "text" && x.text.startsWith("FIXER"));
    expect(human(3)).toMatchObject({ text: "FIXER // No. 012 // 23.11.2026 // 03/05" });
  });
  it("migrates a v1 issue: cover title, back page, free text", () => {
    const v1 = { version: 1, id: "x", no: 3, slug: "003-x", title: "t", date: "1.1.2026", handle: "@me", caption: "c", assets: [], items: [],
      feedBorder: { preset: "none", color: "white", size: 4 }, zineBorder: { preset: "mat", color: "paper", size: 5 }, bordersLinked: false,
      template: { id: "mini-8-onecut", paper: "A4", trimmed: true }, pages: null, pageCaptions: true,
      texts: { "zine:6": [{ id: "a", text: "KUR", font: "DejaVu Sans Mono", weight: 400, size: 21, color: "#000000", align: "center", x: 10, y: 8, w: 84, rotation: 0, tracking: 0, lineHeight: 1.2, lang: "en" }] },
      cover: { itemId: null, wraparound: false, title: "test", subtitle: "sub", layout: "bottom", effect: "knockout", font: "Noto Serif", weight: 900, size: 20, lang: "mk" },
      back: { note: "hi", noteFont: "IBM Plex Sans", noteSize: 7.5, noteLang: "en", location: "", songTitle: "", songArtist: "", fields: [] },
      codes: { ean: "collection", eanCustom: "", addon: "issue", addonCustom: "", qr: "", qrLabel: "", songUrl: "" }, printRuns: [], plannedCopies: 1 };
    const m = migrate(v1);
    expect(m.version).toBe(2); expect(m.title).toBe("test"); expect(m.subtitle).toBe("sub");
    expect(m.layers["zine:front"].find((l) => l.bind === "title")).toMatchObject({ font: "Noto Serif", weight: 900 });
    expect(m.layers["zine:6"][0]).toMatchObject({ kind: "text", text: "KUR" });
    expect(m.pageNumbers).toBe(true);
  });
});

describe("sheet render list", () => {
  it("T1: 8 panel groups, top row rotated", () => {
    const s = sheetItems(demo(["single", "single"]), { copy: 1, total: 5, sheet: 0, side: 0, guides: "full", preview: false });
    const groups = s.content.filter((x) => x.t === "group");
    expect(groups.length).toBe(8);
    expect(groups.filter((g) => g.t === "group" && g.rot === 180).length).toBe(4);
  });
  it("the back page carries this copy's barcode", () => {
    const s = sheetItems(demo(["single"]), { copy: 3, total: 5, sheet: 0, side: 0, guides: "none", preview: false });
    const codes = flatten(s.content).filter((x) => x.t === "code");
    expect(codes).toHaveLength(1);
    expect(codes[0]).toMatchObject({ kind: "ean13", data: "0492600120033", addon: "12" });
  });
});

describe("barcode numbers (ZINE_SPEC §6)", () => {
  it("check digit", () => {
    expect(eanCheckDigit("049260012003")).toBe(3);
    expect(isValidEan13("4006381333931")).toBe(true);
  });
  it("layout 049 + YY + IIII + CCC + check", () => {
    expect(collectionEan(26, 12, 3)).toBe("0492600120033");
    const i = newIssue(12); i.date = "23.11.2026";
    const c = codesFor(i, 3, 5);
    expect(c.ean).toBe("0492600120033"); expect(c.addon).toBe("12");
    expect(c.serial).toBe("012 · 03/05");
  });
  it("never the 977/978/979 ranges; custom numbers warn", () => {
    expect(eanWarning("978123456789")).toBe("reserved-isbn");
    expect(eanWarning("041234567890")).toBe(null);
    expect(eanWarning("501234567890")).toBe("not-internal");
  });
  it("a scanned number finds the issue and copy", () => {
    expect(parseCollectionEan("0492600120033")).toEqual({ yy: 26, issue: 12, copy: 3 });
  });
});

// ---- decode the real bwip-js symbol back to digits

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PAR = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

function modulesFromSvg(svg: string): number[] {
  const width = Number(/viewBox="0 0 (\d+)/.exec(svg)![1]);
  const m = new Array(width).fill(0);
  for (const p of svg.matchAll(/stroke-width="([\d.]+)" d="([^"]+)"/g)) {
    const w = Number(p[1]);
    for (const seg of p[2].matchAll(/M([\d.]+) [\d.]+L/g)) {
      const x = Number(seg[1]);
      for (let k = Math.round(x - w / 2); k < Math.round(x + w / 2); k++) m[k] = 1;
    }
  }
  return m;
}
function decodeEan13(m: number[]): { code: string; addon: string } {
  const s = m.indexOf(1);
  const bits = (a: number, n: number) => m.slice(a, a + n).join("");
  if (bits(s, 3) !== "101" || bits(s + 45, 5) !== "01010" || bits(s + 92, 3) !== "101") throw new Error("guards");
  let parity = "", left = "";
  for (let i = 0; i < 6; i++) {
    const b = bits(s + 3 + 7 * i, 7);
    const li = L.indexOf(b), gi = G.indexOf(b);
    if (li >= 0) { parity += "L"; left += li; } else if (gi >= 0) { parity += "G"; left += gi; } else throw new Error("left digit " + i);
  }
  let right = "";
  for (let i = 0; i < 6; i++) { const r = R.indexOf(bits(s + 50 + 7 * i, 7)); if (r < 0) throw new Error("right digit " + i); right += r; }
  const first = PAR.indexOf(parity);
  const code = `${first}${left}${right}`;
  // add-on
  const a = m.indexOf(1, s + 95);
  let addon = "";
  if (a > 0) {
    if (bits(a, 4) !== "1011") throw new Error("addon guard");
    const d1 = bits(a + 4, 7), d2 = bits(a + 13, 7);
    const v1 = L.includes(d1) ? L.indexOf(d1) : G.indexOf(d1);
    const v2 = L.includes(d2) ? L.indexOf(d2) : G.indexOf(d2);
    addon = `${v1}${v2}`;
    const par = `${L.includes(d1) ? "L" : "G"}${L.includes(d2) ? "L" : "G"}`;
    if (["LL", "LG", "GL", "GG"][Number(addon) % 4] !== par) throw new Error("addon parity");
  }
  return { code, addon };
}

describe("generated barcode decodes back to the same number", () => {
  for (const [no, copy] of [[12, 3], [1, 1], [99, 250], [345, 17]]) {
    it(`issue ${no} copy ${copy}`, () => {
      const ean = collectionEan(26, no, copy);
      const addon = String(no % 100).padStart(2, "0");
      const svg = toSVG({ bcid: "ean13", text: `${ean} ${addon}`, scale: 1, height: 10, includetext: false, guardwhitespace: true });
      const d = decodeEan13(modulesFromSvg(svg));
      expect(d.code).toBe(ean);
      expect(isValidEan13(d.code)).toBe(true);
      expect(d.addon).toBe(addon);
    });
  }
});
