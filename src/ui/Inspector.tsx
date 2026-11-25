import { useMemo, useRef } from "react";
import { codesFor, eanCheckDigit, eanWarning, pad3, yearOf } from "../engine/codes";
import { cropFor } from "../engine/crop";
import { PAPER, TEMPLATE_LIST } from "../engine/geometry";
import { GRIDS } from "../engine/grids";
import { autoFlow, borderBox, feedSize, impOf, pageChecks, pageItems, pageKey, resolvedPages, slidesOf, stackBoxes } from "../engine/layout";
import { COVER_PRESETS, backLayers } from "../engine/presets";
import { applyCoverPreset, newText, uid } from "../model/defaults";
import type { Bind, Crop, Fit, Issue, Item, Layer, PageAssign, Paper, TextFx } from "../model/types";
import { useStore, type Tab } from "../store/store";
import { BorderPicker, ColorField, Field, FontSelect, LangSelect, NumInput, Seg } from "./controls";
import { Surface } from "./Surface";

const TABS: { id: Tab; title: string }[] = [
  { id: "CRP", title: "Crop and photo" }, { id: "BRD", title: "Borders" }, { id: "LYR", title: "Layers: text, codes, bands" }, { id: "CVR", title: "Cover" },
  { id: "BCK", title: "Back page" }, { id: "TPL", title: "Format and pages" }, { id: "SER", title: "Issue, serials, codes" },
];

export function Inspector() {
  const { tab, set, issue } = useStore();
  if (!issue) return null;
  return (
    <aside className="panel" aria-label="Inspector">
      <div className="tabs-v" role="tablist" aria-label="Inspector sections">
        {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} title={t.title} onClick={() => set("tab", t.id)}>{t.id}</button>)}
      </div>
      <div className="panel-body insp" role="tabpanel">
        {tab === "CRP" && <CropTab />}
        {tab === "BRD" && <BorderTab />}
        {tab === "LYR" && <LayersTab />}
        {tab === "CVR" && <CoverTab />}
        {tab === "BCK" && <BackTab />}
        {tab === "TPL" && <TemplateTab />}
        {tab === "SER" && <SerialTab />}
      </div>
    </aside>
  );
}

function Head({ code, title }: { code: string; title: string }) {
  return <div><span className="code">{code}</span><h3>{title}</h3></div>;
}

// ------------------------------------------------------------ CRP

function useCurrentItem(): { item: Item | null; half?: "L" | "R" } {
  const { issue, slide } = useStore();
  if (!issue) return { item: null };
  const s = slidesOf(issue)[slide];
  return { item: issue.items.find((i) => i.id === s?.itemId) ?? null, half: s?.half };
}

function CropTab() {
  const { issue, update, page, slide, cropTarget, cropImage, set } = useStore();
  const { item } = useCurrentItem();
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; fx: number; fy: number; w: number; h: number } | null>(null);
  if (!issue) return null;
  if (!item) return <p className="note-line">Add photos first (drag them onto the window, or + Add), then pick a slide or page.</p>;
  const two = item.kind === "stack" && cropImage === 2;
  const a = issue.assets.find((x) => x.id === (two ? item.assetId2 : item.assetId));
  const imp = impOf(issue);
  const { W: FW, H: FH } = feedSize(issue);
  const pair = item.kind === "pair";
  const side = item.linked ? "print" : cropTarget;
  const key = (s: "feed" | "print") => (two ? (s === "feed" ? "feed2" : "print2") : s) as "feed" | "print" | "feed2" | "print2";
  const cropOf = (s: "feed" | "print"): Crop => item[key(s)] ?? item[s];
  // the photo window on each side, after borders (and stacking)
  const winBox = (s: "feed" | "print") => {
    const W = s === "feed" ? FW : imp.pageW, H = s === "feed" ? FH : imp.pageH;
    const bb = borderBox(s === "feed" ? issue.feedBorder : issue.zineBorder, pair ? 2 * W : W, H);
    const b = item.kind === "stack" ? stackBoxes(bb.photo, item, W, H)[two ? 1 : 0] : bb.photo;
    return { w: b.w, h: b.h, contain: bb.forceContain };
  };
  const fb = winBox("feed"), pb = winBox("print");
  if (!a) return <p className="note-line">{two ? "Pick the second photo for this stack below." : "Photo missing."}</p>;
  const feedC = cropFor(a.w, a.h, fb.w, fb.h, fb.contain ? { ...cropOf("feed"), fit: "contain" } : cropOf("feed"));
  const printC = cropFor(a.w, a.h, pb.w, pb.h, pb.contain ? { ...cropOf("print"), fit: "contain" } : cropOf("print"));
  const editC = side === "feed" ? feedC : printC;
  const boxW = 272;
  const boxH = Math.min(340, (boxW * a.h) / a.w);
  const bw = (boxH * a.w) / a.h;
  const setCrop = (patch: Partial<Crop>, history = true) => update((d) => {
    const it = d.items.find((x) => x.id === item.id)!;
    const sides: ("feed" | "print")[] = it.linked ? ["feed", "print"] : [side];
    for (const s of sides) { const k = key(s); it[k] = { ...(it[k] ?? it[s]), ...patch }; }
  }, { history });
  const zoom = cropOf(side).zoom || 1;
  const win = (src: { x: number; y: number; w: number; h: number }, cls: string) =>
    <div className={"win " + cls} style={{ left: `${src.x * 100}%`, top: `${src.y * 100}%`, width: `${src.w * 100}%`, height: `${src.h * 100}%` }} />;
  return (
    <>
      <Head code={`CRP · slide ${slide + 1} → page ${page}`} title={item.label || "Photo"} />
      <Field label="This slide is">
        <Seg label="Kind" value={item.kind} onChange={(k) => update((d) => {
          const it = d.items.find((x) => x.id === item.id)!;
          it.kind = k; d.pages = null;
          if (k === "stack" && !it.assetId2) { const other = d.assets.find((x) => x.id !== it.assetId); it.assetId2 = other?.id; it.stackGap = it.stackGap ?? 2; }
        })} options={[["single", "One photo"], ["pair", "Split pair"], ["stack", "Two stacked"]]} />
      </Field>
      {item.kind === "stack" && (
        <>
          <Seg label="Photo" value={String(cropImage) as "1" | "2"} onChange={(v) => set("cropImage", Number(v) as 1 | 2)} options={[["1", "Top photo"], ["2", "Bottom photo"]]} />
          <Field label="Bottom photo">
            <select className="select" value={item.assetId2 ?? ""} onChange={(e) => update((d) => { d.items.find((x) => x.id === item.id)!.assetId2 = e.target.value; })}>
              {issue.assets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="Gap between them (% · 0 = touching)"><NumInput value={item.stackGap ?? 0} min={0} max={20} step={0.5} onChange={(v) => update((d) => { d.items.find((x) => x.id === item.id)!.stackGap = v; })} /></Field>
          {(item.stackGap ?? 0) > 0 && <Field label="Gap colour"><ColorField label="Gap" value={item.stackGapColor ?? "#F4F3EF"} onChange={(c) => update((d) => { d.items.find((x) => x.id === item.id)!.stackGapColor = c; })} /></Field>}
        </>
      )}
      {!item.linked && <Seg label="Edit" value={cropTarget} onChange={(v) => set("cropTarget", v)} options={[["feed", "Instagram crop"], ["print", "Print crop"]]} />}
      <div ref={box} className="crop-box" style={{ width: bw, height: boxH, margin: "0 auto" }}
        onPointerDown={(e) => {
          const r = box.current!.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
          const s = editC.src;
          // click outside the window jumps it there; inside drags it
          const c = { fx: Math.min(1 - s.w / 2, Math.max(s.w / 2, s.x + s.w / 2)), fy: Math.min(1 - s.h / 2, Math.max(s.h / 2, s.y + s.h / 2)) };
          if (px < s.x || px > s.x + s.w || py < s.y || py > s.y + s.h) { c.fx = px; c.fy = py; setCrop({ fx: px, fy: py }); } else setCrop({ fx: c.fx, fy: c.fy });
          drag.current = { x: e.clientX, y: e.clientY, fx: c.fx, fy: c.fy, w: s.w, h: s.h };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const r = box.current!.getBoundingClientRect();
          const fx = Math.min(1 - d.w / 2, Math.max(d.w / 2, d.fx + (e.clientX - d.x) / r.width));
          const fy = Math.min(1 - d.h / 2, Math.max(d.h / 2, d.fy + (e.clientY - d.y) / r.height));
          setCrop({ fx, fy }, false);
        }}
        onPointerUp={() => { drag.current = null; }}
        onWheel={(e) => setCrop({ zoom: Math.min(5, Math.max(1, zoom * Math.exp(-e.deltaY * 0.0015))), fit: "cover" }, false)}
        title="Drag the window to move the crop. Scroll to zoom.">
        <Surface items={[{ t: "image", assetId: a.id, x: 0, y: 0, w: a.w, h: a.h, src: { x: 0, y: 0, w: 1, h: 1 }, photo: true }]} w={a.w} h={a.h} width={bw} />
        {(item.linked || side === "feed") && win(feedC.src, "feed" + (side === "feed" || item.linked ? " editing" : ""))}
        {win(printC.src, "print" + (side === "print" ? " editing" : ""))}
      </div>
      <span className="code">Drag the window · scroll to zoom · white = Instagram · red dashed = print</span>
      <Field label={`Zoom ${zoom.toFixed(2)}×`}>
        <input className="range" type="range" min={1} max={5} step={0.01} value={zoom} onChange={(e) => setCrop({ zoom: Number(e.target.value), fit: "cover" }, false)} />
      </Field>
      <div className="row">
        <Seg label="Fit" value={cropOf(side).fit} onChange={(f: Fit) => setCrop({ fit: f })} options={[["cover", "Fill"], ["contain", "Fit whole photo"]]} />
        <button type="button" className="btn btn-sm" onClick={() => setCrop({ fx: 0.5, fy: 0.5, zoom: 1, fit: "cover" })}>Reset</button>
      </div>
      <dl className="kv">
        <dt>Instagram {pair ? "(pair)" : ""}</dt><dd>shows {(100 - feedC.lost * 100).toFixed(0)}% of the photo</dd>
        <dt>Print</dt><dd>shows {(100 - printC.lost * 100).toFixed(0)}%</dd>
        <dt>Photo</dt><dd>{a.w} × {a.h}</dd>
      </dl>
      <button type="button" className="link-toggle" aria-pressed={item.linked} onClick={() => update((d) => { const it = d.items.find((x) => x.id === item.id)!; it.linked = !it.linked; if (it.linked) { it.feed = { ...it.print }; if (it.print2) it.feed2 = { ...it.print2 }; } })}>
        {item.linked ? "Instagram + print crops linked" : "Crops separate"}</button>
      <hr className="sep" />
      <Field label="Name"><input className="input" value={item.label} onChange={(e) => update((d) => { d.items.find((x) => x.id === item.id)!.label = e.target.value; }, { history: false })} /></Field>
      <Field label="Caption (caption strip / film frame border)"><input className="input" value={item.caption} onChange={(e) => update((d) => { d.items.find((x) => x.id === item.id)!.caption = e.target.value; }, { history: false })} /></Field>
      <button type="button" className="btn btn-sm btn-danger" onClick={() => update((d) => { d.items = d.items.filter((x) => x.id !== item.id); d.pages = null; if (d.cover.itemId === item.id) d.cover.itemId = null; })}>Remove from post</button>
    </>
  );
}

// ------------------------------------------------------------ BRD

function BorderTab() {
  const { issue, update } = useStore();
  if (!issue) return null;
  return (
    <>
      <Head code="BRD" title="Borders, per side" />
      <p className="note-line">Post full-bleed and print with a mat, or the other way round.</p>
      <button type="button" className="link-toggle" aria-pressed={issue.bordersLinked} onClick={() => update((d) => { d.bordersLinked = !d.bordersLinked; })}>
        {issue.bordersLinked ? "Linked: Instagram follows zine" : "Not linked"}</button>
      <Field label="Instagram"><BorderPicker value={issue.feedBorder} disabled={issue.bordersLinked} onChange={(b) => update((d) => { d.feedBorder = b; })} /></Field>
      <Field label="Zine"><BorderPicker value={issue.zineBorder} onChange={(b) => update((d) => { d.zineBorder = b; })} /></Field>
      <label className="check"><input type="checkbox" checked={issue.pageNumbers} onChange={(e) => update((d) => { d.pageNumbers = e.target.checked; })} /> Page numbers on zine pages</label>
    </>
  );
}

// ------------------------------------------------------------ LYR

const BIND_NAMES: Record<Bind, string> = { title: "Title", subtitle: "Subtitle", no: "Issue no.", date: "Date", note: "Back note", details: "Details", human: "Barcode line", serial: "Serial" };
export const layerName = (l: Layer) => l.name && l.kind !== "text" ? l.name : l.bind ? BIND_NAMES[l.bind] : l.kind === "text" ? (l.text || "Text").slice(0, 24) : l.kind === "ean" ? "Barcode" : l.kind === "qr" ? "QR code" : "Band";

/** The surface layers are edited on: whichever panel you're working in. */
export function useLayerKey(): { key: string; label: string; side: "zine" | "feed" } {
  const { issue, active, page, slide, sel } = useStore();
  if (sel) return { key: sel.key, label: sel.key.startsWith("feed") ? `IG slide ${Number(sel.key.split(":")[1]) + 1}` : labelOf(sel.key), side: sel.key.startsWith("feed") ? "feed" : "zine" };
  if (active === "feed") return { key: `feed:${slide}`, label: `IG slide ${slide + 1}`, side: "feed" };
  const n = issue ? impOf(issue).pageCount : 8;
  const k = pageKey(page, n);
  return { key: k, label: labelOf(k), side: "zine" };
}
const labelOf = (k: string) => (k === "zine:front" ? "Front cover" : k === "zine:back" ? "Back page" : `Page ${k.split(":")[1]}`);

function LayersTab() {
  const { issue, update, sel, set } = useStore();
  const { key, label, side } = useLayerKey();
  if (!issue) return null;
  const layers = issue.layers[key] ?? [];
  const cur = layers.find((l) => l.id === sel?.id);
  const add = (l: Layer) => { update((d) => { d.layers[key] = [...(d.layers[key] ?? []), l]; }); set("sel", { key, id: l.id }); };
  const edit = (patch: Partial<Layer>, history = true) => update((d) => { const l = (d.layers[key] ?? []).find((x) => x.id === cur?.id); if (l) Object.assign(l, patch); }, { history });
  const isCover = key === "zine:front";
  return (
    <>
      <Head code={`LYR · ${label}`} title="Layers" />
      <p className="note-line">Click a layer on the page to select it. Drag to move (snaps to the grid, hold Alt for free). Arrow keys nudge, Delete removes.</p>
      <div className="row">
        <button type="button" className="btn btn-sm" onClick={() => add({ ...newText(), color: side === "zine" ? "#121212" : "#FFFFFF" })}>+ Text</button>
        <button type="button" className="btn btn-sm" onClick={() => add({ id: uid(), kind: "qr", name: "QR", qr: "custom", qrData: "", x: 60, y: 60, w: 26, h: 26 * (side === "zine" ? 0.75 : 0.75), rotation: 0, fg: "#000000", bg: "#FFFFFF" })}>+ QR</button>
        {side === "zine" && <button type="button" className="btn btn-sm" onClick={() => add({ id: uid(), kind: "ean", name: "Barcode", x: 8, y: 75, w: 60, h: 18, rotation: 0, fg: "#000000", bg: "#FFFFFF" })}>+ Barcode</button>}
        <button type="button" className="btn btn-sm" onClick={() => add({ id: uid(), kind: "band", name: "Band", x: 0, y: 70, w: 100, h: 20, rotation: 0, fill: "#F4F3EF" })}>+ Band</button>
      </div>
      <ul className="layer-list">
        {[...layers].reverse().map((l) => {
          const i = layers.indexOf(l);
          return (
            <li key={l.id} className={sel?.id === l.id ? "is-sel" : ""} onClick={() => set("sel", { key, id: l.id })}>
              <button type="button" className="icon-btn" aria-label={l.hidden ? "Show" : "Hide"} onClick={(e) => { e.stopPropagation(); update((d) => { const t = d.layers[key].find((x) => x.id === l.id)!; t.hidden = !t.hidden; }); }}>{l.hidden ? "◌" : "●"}</button>
              <span className="kind">{l.kind === "text" ? "T" : l.kind === "ean" ? "EAN" : l.kind === "qr" ? "QR" : "▭"}</span>
              <span className="name">{layerName(l)}</span>
              <button type="button" className="icon-btn" aria-label="Bring forward" disabled={i === layers.length - 1} onClick={(e) => { e.stopPropagation(); update((d) => { const a = d.layers[key]; [a[i], a[i + 1]] = [a[i + 1], a[i]]; }); }}>↑</button>
              <button type="button" className="icon-btn" aria-label="Send backward" disabled={i === 0} onClick={(e) => { e.stopPropagation(); update((d) => { const a = d.layers[key]; [a[i], a[i - 1]] = [a[i - 1], a[i]]; }); }}>↓</button>
            </li>
          );
        })}
        {!layers.length && <li className="muted">Nothing on this {side === "zine" ? "page" : "slide"} yet. Use the Text tool (T) and click on it.</li>}
      </ul>
      {cur && <LayerProps l={cur} edit={edit} isCover={isCover} onDelete={() => { update((d) => { d.layers[key] = d.layers[key].filter((x) => x.id !== cur.id); }); set("sel", null); }} />}
    </>
  );
}

function LayerProps({ l, edit, isCover, onDelete }: { l: Layer; edit: (p: Partial<Layer>, h?: boolean) => void; isCover: boolean; onDelete: () => void }) {
  const { issue, update } = useStore();
  if (!issue) return null;
  const pos = (
    <div className="grid2">
      <Field label="X %"><NumInput value={l.x} step={0.5} onChange={(v) => edit({ x: v })} /></Field>
      <Field label="Y %"><NumInput value={l.y} step={0.5} onChange={(v) => edit({ y: v })} /></Field>
      <Field label="Width %"><NumInput value={l.w} min={1} step={0.5} onChange={(v) => edit({ w: v, ...(l.kind === "qr" ? { h: (v * 0.75) } : {}) })} /></Field>
      {l.kind !== "text" ? <Field label="Height %"><NumInput value={l.h} min={1} step={0.5} onChange={(v) => edit({ h: v })} /></Field>
        : <Field label="Rotate °"><NumInput value={l.rotation} step={1} onChange={(v) => edit({ rotation: v })} /></Field>}
    </div>
  );
  const bound = l.bind;
  const boundValue = bound === "title" ? issue.title : bound === "subtitle" ? issue.subtitle : bound === "note" ? issue.back.note : null;
  return (
    <>
      <hr className="sep" />
      <div className="row" style={{ justifyContent: "space-between" }}><span className="code">{layerName(l)}</span><button type="button" className="btn btn-sm btn-danger" onClick={onDelete}>Delete</button></div>
      {l.kind === "text" && (
        <>
          {bound ? (boundValue !== null
            ? <Field label={BIND_NAMES[bound]}><textarea className="input" lang={l.lang} rows={bound === "note" ? 5 : 2} value={boundValue} onChange={(e) => update((d) => { if (bound === "title") d.title = e.target.value; else if (bound === "subtitle") d.subtitle = e.target.value; else d.back.note = e.target.value; }, { history: false })} /></Field>
            : <p className="note-line">Filled in automatically ({BIND_NAMES[bound]}). Edit the content in SER / BCK.</p>)
            : <Field label="Text"><textarea className="input" lang={l.lang} value={l.text ?? ""} onChange={(e) => edit({ text: e.target.value }, false)} /></Field>}
          <FontSelect value={l.font ?? "IBM Plex Sans"} onChange={(f) => edit({ font: f })} text={bound === "title" ? issue.title : bound === "subtitle" ? issue.subtitle : bound === "note" ? issue.back.note : l.text ?? ""} />
          <div className="grid2">
            <Field label="Size pt"><NumInput value={l.size ?? 10} min={2} max={400} step={0.5} onChange={(v) => edit({ size: v })} /></Field>
            <Field label="Weight"><select className="select" value={l.weight ?? 400} onChange={(e) => edit({ weight: Number(e.target.value) })}>{[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => <option key={w}>{w}</option>)}</select></Field>
          </div>
          <Field label="Colour"><ColorField label="Text" value={l.color ?? "#121212"} onChange={(c) => edit({ color: c })} /></Field>
          <Seg label="Align" value={l.align ?? "left"} onChange={(a) => edit({ align: a })} options={[["left", "Left"], ["center", "Centre"], ["right", "Right"]]} />
          <div className="row">
            {([["Top", 6], ["Middle", 45], ["Bottom", 84]] as const).map(([lab, y]) => <button key={lab} type="button" className="btn btn-sm" onClick={() => edit({ y })}>{lab}</button>)}
            {([["⟲ −90", -90], ["0°", 0], ["⟳ 90", 90]] as const).map(([lab, r]) => <button key={lab} type="button" className="btn btn-sm" onClick={() => edit({ rotation: r })}>{lab}</button>)}
          </div>
          {pos}
          <div className="grid2">
            <Field label="Tracking"><NumInput value={l.tracking ?? 0} step={0.01} onChange={(v) => edit({ tracking: v })} /></Field>
            <Field label="Line height"><NumInput value={l.lineHeight ?? 1.2} min={0.5} step={0.05} onChange={(v) => edit({ lineHeight: v })} /></Field>
          </div>
          <LangSelect value={l.lang ?? ""} onChange={(v) => edit({ lang: v })} />
          {isCover && (
            <Field label="Effect (cover only, never on photos or codes)">
              <select className="select" value={l.fx ?? "none"} onChange={(e) => edit({ fx: e.target.value as TextFx })}>
                <option value="none">None</option><option value="outline">Outline</option><option value="halftone">Halftone</option><option value="xerox">Xerox / threshold</option><option value="riso">Riso duotone</option>
              </select>
            </Field>
          )}
        </>
      )}
      {(l.kind === "ean" || l.kind === "qr") && (
        <>
          {l.kind === "qr" && (
            <>
              <Seg label="QR content" value={l.qr ?? "custom"} onChange={(v) => edit({ qr: v })} options={[["custom", "My link / text"], ["song", "Song link"]]} />
              {(l.qr ?? "custom") === "custom" && <Field label="Content" hint="Empty = the issue QR from SER. A link opens on the phone; text is shown.">
                <input className="input" value={l.qrData ?? ""} placeholder={issue.codes.qr || "https://…"} onChange={(e) => edit({ qrData: e.target.value }, false)} /></Field>}
            </>
          )}
          <Field label="Bar colour"><ColorField label="Bars" value={l.fg ?? "#000000"} onChange={(c) => edit({ fg: c })} /></Field>
          <Field label="Background colour"><ColorField label="Background" value={l.bg ?? "#FFFFFF"} onChange={(c) => edit({ bg: c })} /></Field>
          <CodeChecks l={l} />
          {pos}
          <Field label="Rotate °"><NumInput value={l.rotation} step={90} onChange={(v) => edit({ rotation: v })} /></Field>
        </>
      )}
      {l.kind === "band" && (<><Field label="Fill"><ColorField label="Fill" value={l.fill ?? "#F4F3EF"} onChange={(c) => edit({ fill: c })} /></Field>{pos}</>)}
    </>
  );
}

function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function CodeChecks({ l }: { l: Layer }) {
  const issue = useStore((s) => s.issue)!;
  const imp = impOf(issue);
  const fg = l.fg ?? "#000000", bg = l.bg ?? "#FFFFFF";
  const ratio = (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05);
  const wmm = (l.w / 100) * imp.pageW;
  const warn: string[] = [];
  if (lum(fg) > lum(bg)) warn.push("Light bars on dark background: most scanners can't read inverted codes.");
  else if (ratio < 4) warn.push(`Low contrast (${ratio.toFixed(1)}:1): may not scan. Dark bars on a pale background work best.`);
  if (l.kind === "ean" && wmm < 37) warn.push(`${wmm.toFixed(0)} mm wide: under 80% of normal size (≈37 mm with add-on). Test with your phone.`);
  if (l.kind === "qr" && wmm < 15) warn.push(`${wmm.toFixed(0)} mm: QR codes under ~15 mm get hard to scan.`);
  return warn.length ? <div className="warn-list">{warn.map((w) => <span key={w}>{w}</span>)}</div> : <span className="note-line">{wmm.toFixed(0)} mm wide · contrast {ratio.toFixed(1)}:1</span>;
}

// ------------------------------------------------------------ CVR

function CoverTab() {
  const { issue, update, showGrid, snap, set } = useStore();
  if (!issue) return null;
  const front = issue.layers["zine:front"] ?? [];
  const titleL = front.find((l) => l.bind === "title"), subL = front.find((l) => l.bind === "subtitle");
  const setBound = (bind: Bind, patch: Partial<Layer>) => update((d) => { for (const l of d.layers["zine:front"] ?? []) if (l.bind === bind) Object.assign(l, patch); });
  return (
    <>
      <Head code="CVR" title="Cover" />
      <Field label="Title"><input className="input" lang={titleL?.lang} value={issue.title} onChange={(e) => update((d) => { d.title = e.target.value; }, { history: false })} /></Field>
      <Field label="Subtitle"><input className="input" lang={subL?.lang} value={issue.subtitle} onChange={(e) => update((d) => { d.subtitle = e.target.value; }, { history: false })} /></Field>
      <div className="grid2">
        <FontSelect label="Title font" value={titleL?.font ?? "Oswald"} text={issue.title} onChange={(f) => setBound("title", { font: f })} />
        <FontSelect label="Subtitle font" value={subL?.font ?? "IBM Plex Sans"} text={issue.subtitle} onChange={(f) => setBound("subtitle", { font: f })} />
      </div>
      <Field label="Title layout" hint="A starting point: then drag any part on the page.">
        <div className="preset-grid">
          {COVER_PRESETS.map((p) => <PresetThumb key={p.id} id={p.id} name={p.name} on={issue.cover.preset === p.id}
            onPick={() => update((d) => { d.cover.preset = p.id; d.layers["zine:front"] = applyCoverPreset(d, p.id, d.layers["zine:front"] ?? []); })} />)}
        </div>
      </Field>
      <Field label="Cover photo">
        <select className="select" value={issue.cover.itemId ?? ""} onChange={(e) => update((d) => { d.cover.itemId = e.target.value || null; d.pages = null; })}>
          <option value="">First slide</option>
          {issue.items.map((it) => <option key={it.id} value={it.id}>{it.label || "Photo"}{it.kind === "pair" ? " (wide)" : ""}</option>)}
        </select>
      </Field>
      <label className="check"><input type="checkbox" checked={issue.cover.wraparound} onChange={(e) => update((d) => { d.cover.wraparound = e.target.checked; })} /> Wraparound: one photo across back + front</label>
      <GridControls showGrid={showGrid} snap={snap} set={set} />
    </>
  );
}

export function GridControls({ showGrid, snap, set }: { showGrid: boolean; snap: boolean; set: ReturnType<typeof useStore.getState>["set"] }) {
  const { issue, update } = useStore();
  if (!issue) return null;
  return (
    <Field label="Layout grid">
      <select className="select" value={issue.grid} onChange={(e) => update((d) => { d.grid = e.target.value; })}>
        {GRIDS.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
      <div className="row">
        <label className="check"><input type="checkbox" checked={showGrid} onChange={(e) => set("showGrid", e.target.checked)} /> Show (G)</label>
        <label className="check"><input type="checkbox" checked={snap} onChange={(e) => set("snap", e.target.checked)} /> Snap</label>
      </div>
    </Field>
  );
}

function PresetThumb({ id, name, on, onPick }: { id: string; name: string; on: boolean; onPick: () => void }) {
  const issue = useStore((s) => s.issue)!;
  const imp = impOf(issue);
  const items = useMemo(() => {
    const layers = COVER_PRESETS.find((p) => p.id === id)!.make({ W: imp.pageW, H: imp.pageH });
    const d = { ...issue, layers: { ...issue.layers, "zine:front": layers } } as Issue;
    return pageItemsMemo(d, imp);
  }, [issue.title, issue.subtitle, issue.items, imp, id]);
  return (
    <button type="button" className="preset" aria-pressed={on} onClick={onPick} title={name}>
      <Surface items={items} w={imp.pageW} h={imp.pageH} width={62} />
      <span>{name}</span>
    </button>
  );
}
function pageItemsMemo(issue: Issue, imp: ReturnType<typeof impOf>) {
  return pageItems({ issue, side: "zine", copy: 1, total: 1, imp }, 1, imp.pageW, imp.pageH);
}

// ------------------------------------------------------------ BCK

function BackTab() {
  const { issue, update, showGrid, snap, set } = useStore();
  if (!issue) return null;
  const b = issue.back;
  const ed = (patch: Partial<Issue["back"]>, history = true) => update((d) => { Object.assign(d.back, patch); }, { history });
  const noteL = (issue.layers["zine:back"] ?? []).find((l) => l.bind === "note");
  return (
    <>
      <Head code="BCK" title="Back page" />
      <Field label="What I was doing (note)"><textarea className="input" lang={noteL?.lang} rows={6} value={b.note} onChange={(e) => ed({ note: e.target.value }, false)} /></Field>
      <div className="grid2">
        <FontSelect label="Note font" value={noteL?.font ?? "IBM Plex Sans"} text={b.note} onChange={(f) => update((d) => { for (const l of d.layers["zine:back"] ?? []) if (l.bind === "note") l.font = f; })} />
        <Field label="Note size pt"><NumInput value={noteL?.size ?? 7.5} min={4} max={40} step={0.5} onChange={(v) => update((d) => { for (const l of d.layers["zine:back"] ?? []) if (l.bind === "note") l.size = v; })} /></Field>
      </div>
      <Field label="Location (optional)"><input className="input" value={b.location} onChange={(e) => ed({ location: e.target.value }, false)} /></Field>
      <div className="grid2">
        <Field label="Song"><input className="input" value={b.songTitle} onChange={(e) => ed({ songTitle: e.target.value }, false)} /></Field>
        <Field label="Artist"><input className="input" value={b.songArtist} onChange={(e) => ed({ songArtist: e.target.value }, false)} /></Field>
      </div>
      <Field label="Song link (QR)" hint="Add a QR layer set to 'Song link' to print it.">
        <input className="input" value={issue.codes.songUrl} onChange={(e) => update((d) => { d.codes.songUrl = e.target.value; }, { history: false })} placeholder="https://…" /></Field>
      <span className="code">Your own fields</span>
      {b.fields.map((f, i) => (
        <div key={i} className="row" style={{ flexWrap: "nowrap" }}>
          <input className="input" style={{ width: 90 }} placeholder="Label" value={f.label} onChange={(e) => update((d) => { d.back.fields[i].label = e.target.value; }, { history: false })} />
          <input className="input" style={{ flex: 1, minWidth: 0 }} placeholder="Value" value={f.value} onChange={(e) => update((d) => { d.back.fields[i].value = e.target.value; }, { history: false })} />
          <button type="button" className="icon-btn" aria-label="Remove field" onClick={() => update((d) => { d.back.fields.splice(i, 1); })}>×</button>
        </div>
      ))}
      <button type="button" className="btn btn-sm" onClick={() => update((d) => { d.back.fields.push({ label: "", value: "" }); })}>+ Add field</button>
      <hr className="sep" />
      <p className="note-line">Move, resize and recolour the note, barcode and QR right on the page (select them, or use LYR).</p>
      <GridControls showGrid={showGrid} snap={snap} set={set} />
      <button type="button" className="btn btn-sm" onClick={() => update((d) => { const imp = impOf(d); d.layers["zine:back"] = backLayers({ W: imp.pageW, H: imp.pageH }); })}>Reset back page layout</button>
    </>
  );
}

// ------------------------------------------------------------ TPL

function TemplateTab() {
  const { issue, update, page, selectPage } = useStore();
  const checks = useMemo(() => (issue ? pageChecks(issue) : []), [issue]);
  if (!issue) return null;
  const imp = impOf(issue);
  const flow = autoFlow(issue, imp);
  const pages = resolvedPages(issue, imp);
  const n = imp.pageCount;
  const setPage = (p: number, v: string) => update((d) => {
    const cur = resolvedPages(d);
    const arr: (PageAssign | null)[] = d.pages ? [...d.pages] : cur.map(() => null);
    while (arr.length < cur.length) arr.push(null);
    if (v === "blank") arr[p - 1] = { kind: "blank" };
    else { const [id, half] = v.split(":"); arr[p - 1] = { kind: "item", itemId: id, half: (half || undefined) as "L" | "R" | undefined }; }
    d.pages = arr;
  });
  const valueOf = (a: PageAssign) => a.kind === "item" ? `${a.itemId}${a.half ? ":" + a.half : ""}` : "blank";
  const switchTo = (id: string, pagesCount?: number) => update((d) => {
    const t = TEMPLATE_LIST.find((x) => x.id === id)!;
    const n0 = impOf(d).pageCount;
    d.template = { ...d.template, id, pages: pagesCount ?? t.pages[0], paper: t.sizes.includes(d.template.paper) ? d.template.paper : t.sizes[0] };
    d.pages = null;
    // interior page layers keep their numbers; cover and back move with the template
    void n0;
  });
  return (
    <>
      <Head code={`TPL · ${imp.t.code}`} title="Format" />
      <div className="tpl-list">
        {TEMPLATE_LIST.map((t) => (
          <button key={t.id} type="button" className="tpl" aria-pressed={t.id === issue.template.id} onClick={() => switchTo(t.id)}>
            <b>{t.code} · {t.name}</b><span>{t.blurb}</span>
          </button>
        ))}
      </div>
      {imp.t.pages.length > 1 && <Field label="Pages"><Seg label="Pages" value={String(imp.pageCount)} onChange={(v) => switchTo(issue.template.id, Number(v))} options={imp.t.pages.map((p) => [String(p), String(p)] as [string, string])} /></Field>}
      <Field label="Paper"><Seg label="Paper" value={imp.paper} onChange={(p: Paper) => update((d) => { d.template.paper = p; })} options={imp.t.sizes.map((s) => [s, s] as [Paper, string])} /></Field>
      {imp.t.trimRatio && <label className="check"><input type="checkbox" checked={issue.template.trimmed} onChange={(e) => update((d) => { d.template.trimmed = e.target.checked; })} />
        Trim before folding (pages exactly {imp.t.trimRatio === 0.75 || imp.t.trimRatio === 1.5 ? "3:4" : "to ratio"})</label>}
      {imp.t.poster && (
        <Field label="Poster photo (back of the sheet)">
          <select className="select" value={issue.posterItemId ?? ""} onChange={(e) => update((d) => { d.posterItemId = e.target.value || null; })}>
            <option value="">First photo</option>{issue.items.map((it) => <option key={it.id} value={it.id}>{it.label}</option>)}
          </select>
        </Field>
      )}
      <dl className="kv">
        <dt>Sheet</dt><dd>{PAPER[imp.paper].w} × {PAPER[imp.paper].h} mm{imp.sheets > 1 ? ` × ${imp.sheets}` : ""}{imp.sides > 1 ? ", both sides" : ""}</dd>
        <dt>Page</dt><dd>{imp.pageW.toFixed(1)} × {imp.pageH.toFixed(1)} mm</dd>
        <dt>Checked</dt><dd className={imp.t.verified ? "" : "warn"}>{imp.t.verified ? "Folded and verified" : "Fold a test print first"}</dd>
      </dl>
      <hr className="sep" />
      <div className="row" style={{ justifyContent: "space-between" }}><span className="code">Pages</span>
        <button type="button" className="btn btn-sm" disabled={!issue.pages} onClick={() => update((d) => { d.pages = null; })}>Auto-flow again</button></div>
      {pages.map((a, i) => {
        const p = i + 1;
        const fixed = p === 1 || p === n;
        const c = checks[i];
        return (
          <div key={p} className="row" style={{ flexWrap: "nowrap" }}>
            <button type="button" className="btn btn-sm" style={{ width: 54, ...(p === page ? { borderColor: "var(--color-accent)" } : {}) }} onClick={() => selectPage(p)}>p{p}</button>
            {fixed ? <span className="note-line" style={{ flex: 1 }}>{p === 1 ? "Front cover" : "Back page"}</span> : (
              <select className="select" style={{ flex: 1, minWidth: 0 }} value={valueOf(a)} onChange={(e) => setPage(p, e.target.value)}>
                <option value="blank">Blank / text page</option>
                {issue.items.flatMap((it) => it.kind === "pair"
                  ? [<option key={it.id + "L"} value={`${it.id}:L`}>{it.label} (left half)</option>, <option key={it.id + "R"} value={`${it.id}:R`}>{it.label} (right half)</option>]
                  : [<option key={it.id} value={it.id}>{it.label}{it.kind === "stack" ? " (stack)" : ""}</option>])}
              </select>
            )}
            <span className={"badge " + (c?.dpi && c.dpi < 200 ? "warn" : "")} title="Effective print resolution">{c?.dpi ? `${Math.round(c.dpi)} dpi` : "–"}</span>
          </div>
        );
      })}
      {(flow.warnings.length > 0 || checks.some((c) => c.warnings.length)) && <div className="warn-list">{[...flow.warnings, ...checks.flatMap((c) => c.warnings)].map((w) => <span key={w}>{w}</span>)}</div>}
    </>
  );
}

// ------------------------------------------------------------ SER

function SerialTab() {
  const { issue, update } = useStore();
  if (!issue) return null;
  const c = issue.codes;
  const codes = codesFor(issue, 1, Math.max(1, issue.plannedCopies));
  const custom12 = c.eanCustom.replace(/\D/g, "").slice(0, 12);
  const w = custom12.length === 12 ? eanWarning(custom12) : null;
  return (
    <>
      <Head code={`SER · No. ${pad3(issue.no)}`} title="Issue, serials, codes" />
      <div className="grid2">
        <Field label="Issue no."><NumInput value={issue.no} min={1} max={9999} onChange={(v) => update((d) => { d.no = Math.round(v); })} /></Field>
        <Field label="Date (as printed)"><input className="input" value={issue.date} onChange={(e) => update((d) => { d.date = e.target.value; }, { history: false })} /></Field>
      </div>
      <Field label="Copies in this edition"><NumInput value={issue.plannedCopies} min={1} max={500} onChange={(v) => update((d) => { d.plannedCopies = Math.round(v); })} /></Field>
      <Field label="IG caption"><textarea className="input" rows={4} value={issue.caption} onChange={(e) => update((d) => { d.caption = e.target.value; }, { history: false })} /></Field>
      <hr className="sep" />
      <span className="code">Barcode (EAN-13 + 2)</span>
      <Seg label="Barcode number" value={c.ean} onChange={(v) => update((d) => { d.codes.ean = v; })} options={[["collection", "Collection no."], ["custom", "My own"], ["none", "None"]]} />
      {c.ean === "collection" && <p className="explain">Number = <b>049 · {String(yearOf(issue.date)).padStart(2, "0")} · {String(issue.no).padStart(4, "0")} · copy · check</b>. Every printed copy gets its own number. A phone just shows the digits; scan or type them into <b>Collection</b> search to jump to this issue and copy.</p>}
      {c.ean === "custom" && (
        <>
          <Field label="12 digits (check digit added for you)">
            <input className="input" inputMode="numeric" value={custom12} maxLength={12} onChange={(e) => update((d) => { d.codes.eanCustom = e.target.value.replace(/\D/g, "").slice(0, 12); }, { history: false })} />
          </Field>
          {custom12.length === 12 ? <span className="note-line">Full number: {custom12}{eanCheckDigit(custom12)}</span> : <span className="note-line warn">{12 - custom12.length} more digits</span>}
          {w === "reserved-isbn" && <span className="note-line warn">978/979 are book (ISBN) numbers. Don't use them.</span>}
          {w === "reserved-issn" && <span className="note-line warn">977 is for real magazines (ISSN). Don't use it.</span>}
          {w === "not-internal" && <span className="note-line warn">Outside 040–049 this could match a real product in shops. Starting with 04 is safe.</span>}
        </>
      )}
      {c.ean !== "none" && (
        <Field label="2-digit add-on">
          <Seg label="Add-on" value={c.addon} onChange={(v) => update((d) => { d.codes.addon = v; })} options={[["issue", "Issue no."], ["custom", "Custom"], ["none", "None"]]} />
          {c.addon === "custom" && <input className="input" inputMode="numeric" maxLength={2} value={c.addonCustom} onChange={(e) => update((d) => { d.codes.addonCustom = e.target.value.replace(/\D/g, "").slice(0, 2); })} />}
        </Field>
      )}
      <hr className="sep" />
      <span className="code">QR code: does something when scanned</span>
      <Field label="QR content" hint="A link opens in the phone's browser (your post, a playlist, a page). Plain text is shown. WIFI:… joins a network.">
        <input className="input" value={c.qr} onChange={(e) => update((d) => { d.codes.qr = e.target.value; }, { history: false })} placeholder="https://…" />
      </Field>
      <Field label="Label under the QR"><input className="input" value={c.qrLabel} onChange={(e) => update((d) => { d.codes.qrLabel = e.target.value; }, { history: false })} placeholder="scan" /></Field>
      <dl className="kv">
        <dt>Copy 1</dt><dd>{codes.serial}</dd>
        <dt>EAN</dt><dd>{codes.ean ? `${codes.ean}${codes.addon ? " + " + codes.addon : ""}` : "none"}</dd>
      </dl>
      <span className="code">Print runs</span>
      {issue.printRuns.length === 0 ? <p className="note-line">Nothing printed yet.</p> : (
        <ul className="log">{issue.printRuns.map((r, i) => <li key={i}><time>{r.date}</time><span>{r.template}, copies {r.firstSerial}–{r.firstSerial + r.copies - 1}</span><span className="n">{r.copies}</span></li>)}</ul>
      )}
    </>
  );
}
