// Exports: IG JPEGs (1080×1440, sRGB, no metadata) and print PDFs (300 DPI rasters + vector guides).
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { pad3 } from "../engine/codes";
import { PAPER } from "../engine/geometry";
import { RATIOS, feedSize, flatten, guideLines, type GuideMode, impOf, type RI, sheetItems, slideItems, slidesOf } from "../engine/layout";
import { writeBytes, writeJson, writeText } from "../lib/backend";
import type { Issue, Paper, Settings } from "../model/types";
import { ensureFonts } from "../render/fonts";
import { ensureFull, exportImages, releaseFull } from "../render/images";
import { renderToCanvas } from "../render/renderer";

const MM_TO_PT = 72 / 25.4;
export const PRINT_DPI = 300;

async function canvasBytes(c: HTMLCanvasElement, type: "image/jpeg" | "image/png", q = 0.92) {
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), type, q));
  return new Uint8Array(await blob.arrayBuffer());
}

function fontsIn(items: RI[]) {
  return [...new Set(flatten(items).flatMap((i) => (i.t === "text" ? [i.font] : [])))];
}
function assetsIn(issue: Issue, items: RI[]) {
  const ids = new Set(flatten(items).flatMap((i) => (i.t === "image" ? [i.assetId] : [])));
  return issue.assets.filter((a) => ids.has(a.id));
}

export async function copyToClipboard(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  }
}

export async function exportIG(issue: Issue): Promise<{ files: string[]; copied: boolean }> {
  const slides = slidesOf(issue);
  const lists = slides.map((_, i) => slideItems(issue, i));
  await ensureFull(assetsIn(issue, lists.flat()));
  await ensureFonts(fontsIn(lists.flat()));
  const files: string[] = [];
  try {
    for (let i = 0; i < lists.length; i++) {
      const { W, H } = feedSize(issue);
      const [pw, ph] = RATIOS[issue.feedRatio].px;
      const c = renderToCanvas(lists[i], W, H, { scale: pw / W, images: exportImages }, undefined, [pw, ph]);
      const rel = `${issue.slug}/exports/ig/${pad3(issue.no)}_${String(i + 1).padStart(2, "0")}.jpg`;
      await writeBytes(rel, await canvasBytes(c, "image/jpeg", 0.92));
      files.push(rel);
    }
  } finally { releaseFull(); }
  await writeText(`${issue.slug}/exports/ig/caption.txt`, issue.caption);
  const copied = issue.caption ? await copyToClipboard(issue.caption) : false;
  return { files, copied };
}

export interface PrintOpts { copies: number; firstSerial: number; total: number; guides: GuideMode; test?: boolean; bleed?: boolean }

export async function exportPrint(issue: Issue, settings: Settings, o: PrintOpts): Promise<string> {
  const imp = impOf(issue);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Fixer No. ${pad3(issue.no)}${o.test ? " test print" : ""}`);
  pdf.setProducer("Fixer");
  pdf.setCreator("Fixer");
  const scale = PRINT_DPI / 25.4;
  const sides = imp.sides;
  const all = (copy: number) => {
    const out: ReturnType<typeof sheetItems>[] = [];
    for (let sh = 0; sh < imp.sheets; sh++) for (let side = 0; side < sides; side++)
      out.push(sheetItems(issue, { copy, total: o.total, sheet: sh, side, guides: "none", preview: false, test: o.test, bleed: o.bleed }));
    return out;
  };
  const first = all(o.firstSerial);
  await ensureFull(assetsIn(issue, first.flatMap((x) => x.content)));
  await ensureFonts(fontsIn(first.flatMap((x) => x.content)));
  try {
    for (let k = 0; k < o.copies; k++) {
      const copy = o.firstSerial + k;
      const list = k === 0 ? first : all(copy);
      for (let idx = 0; idx < list.length; idx++) {
        const s = list[idx];
        const side = idx % sides;
        const c = renderToCanvas(s.content, imp.sheetW, imp.sheetH, { scale, images: exportImages, lift: o.test ? 0 : settings.printLift });
        const img = await pdf.embedJpg(await canvasBytes(c, "image/jpeg", 0.95));
        const W = imp.sheetW * MM_TO_PT, H = imp.sheetH * MM_TO_PT;
        const page = pdf.addPage([W, H]);
        // duplex: shift the back side by the measured printer offset
        const dx = side === 1 ? settings.duplexOffset.x * MM_TO_PT : 0, dy = side === 1 ? -settings.duplexOffset.y * MM_TO_PT : 0;
        page.drawImage(img, { x: dx, y: dy, width: W, height: H });
        for (const l of guideLines(imp, side, o.guides, !!imp.t.poster && side === 1)) if (l.t === "line") {
          const [r, gg, b] = hex(l.color);
          page.drawLine({
            start: { x: l.x1 * MM_TO_PT + dx, y: H - l.y1 * MM_TO_PT + dy }, end: { x: l.x2 * MM_TO_PT + dx, y: H - l.y2 * MM_TO_PT + dy },
            thickness: l.width * MM_TO_PT, color: rgb(r, gg, b), dashArray: l.dash?.map((d) => d * MM_TO_PT),
          });
        }
      }
    }
  } finally { releaseFull(); }
  const name = o.test ? `${pad3(issue.no)}_${imp.t.code}_test-print.pdf` : `${pad3(issue.no)}_print_${String(o.firstSerial).padStart(2, "0")}-${String(o.firstSerial + o.copies - 1).padStart(2, "0")}.pdf`;
  const rel = `${issue.slug}/exports/print/${name}`;
  await writeBytes(rel, await pdf.save());
  return rel;
}

function hex(c: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Printer calibration: rulers from each edge (the first tick you can see = that margin) + duplex crosshair. */
export async function exportCalibration(paper: Paper): Promise<string> {
  const { w, h } = PAPER[paper];
  const pdf = await PDFDocument.create();
  pdf.setTitle("Fixer printer calibration"); pdf.setProducer("Fixer");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const side of [0, 1]) {
    const W = w * MM_TO_PT, H = h * MM_TO_PT;
    const p = pdf.addPage([W, H]);
    const k = rgb(0, 0, 0);
    const line = (x1: number, y1: number, x2: number, y2: number, t = 0.2) =>
      p.drawLine({ start: { x: x1 * MM_TO_PT, y: H - y1 * MM_TO_PT }, end: { x: x2 * MM_TO_PT, y: H - y2 * MM_TO_PT }, thickness: t * MM_TO_PT, color: k });
    const label = (s: string, x: number, y: number, size = 6) => p.drawText(s, { x: x * MM_TO_PT, y: H - y * MM_TO_PT, size, font, color: k });
    for (let mm = 0; mm <= 15; mm++) {
      const len = mm % 5 === 0 ? 6 : 3;
      // rulers measure distance from each paper edge, in several places along it
      for (const at of [0.25, 0.5, 0.75]) {
        line(mm, h * at - len / 2, mm, h * at + len / 2);            // left edge
        line(w - mm, h * at - len / 2, w - mm, h * at + len / 2);    // right edge
        line(w * at - len / 2, mm, w * at + len / 2, mm);            // top edge
        line(w * at - len / 2, h - mm, w * at + len / 2, h - mm);    // bottom edge
        if (mm % 5 === 0 && mm > 0) {
          label(String(mm), mm + 0.5, h * at - 4);
          label(String(mm), w - mm - 3, h * at - 4);
          label(String(mm), w * at + 4, mm + 1);
          label(String(mm), w * at + 4, h - mm - 0.5);
        }
      }
    }
    const cx = w / 2, cy = h / 2;
    line(cx - 20, cy, cx + 20, cy, 0.25); line(cx, cy - 20, cx, cy + 20, 0.25);
    for (let r = 2; r <= 10; r += 2) line(cx - r, cy - 1, cx - r, cy + 1, 0.15), line(cx + r, cy - 1, cx + r, cy + 1, 0.15), line(cx - 1, cy - r, cx + 1, cy - r, 0.15), line(cx - 1, cy + r, cx + 1, cy + r, 0.15);
    label(side === 0 ? "SIDE A (front)  —  Fixer printer calibration, " + paper : "SIDE B (back)", 30, 30, 10);
    if (side === 0) {
      const lines = [
        "1. Print this page with scaling OFF (actual size), both sides.",
        "2. On each edge, find the smallest number whose tick is fully printed: that is the unprintable margin (mm).",
        "3. Hold side A to a window: how far is side B's crosshair from side A's? Ticks are every 2 mm.",
        "4. Type those numbers into Fixer > Settings > Printer.",
      ];
      lines.forEach((s, i) => label(s, 30, 40 + i * 6, 8));
    }
  }
  const rel = `calibration/calibration_${paper}.pdf`;
  await writeBytes(rel, await pdf.save());
  return rel;
}

export function templateLabel(issue: Issue) {
  const imp = impOf(issue);
  return `${imp.t.code} ${imp.paper}${imp.trimmed ? " trim" : ""}${imp.t.generator === "saddle" ? ` ${imp.pageCount}p` : ""}`;
}
export async function recordPrintRun(issue: Issue, copies: number, first: number, paperNote: string) {
  const run = { date: new Date().toISOString().slice(0, 10), copies, firstSerial: first, template: templateLabel(issue), paper: paperNote, note: "" };
  await writeJson(`${issue.slug}/printlog.json`, [...issue.printRuns, run]);
  return run;
}
