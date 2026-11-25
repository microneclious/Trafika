import { useEffect, useMemo, useRef, useState } from "react";
import { type Imposition, codexSpreads, spreadIndexOf } from "../engine/geometry";
import { type Ctx, impOf, pageItems, pageKey, sheetItems } from "../engine/layout";
import type { Border } from "../model/types";
import { useStore } from "../store/store";
import { BorderPicker } from "./controls";
import { Chevron } from "./Feed";
import { LayerOverlay } from "./LayerOverlay";
import { Surface } from "./Surface";
import { Viewport } from "./Viewport";

function useImp(): Imposition {
  const issue = useStore((s) => s.issue)!;
  return useMemo(() => impOf(issue), [issue.template.id, issue.template.paper, issue.template.trimmed, issue.template.pages]);
}

export function Zine() {
  const { issue, zineView, set, page, selectPage, update, active } = useStore();
  if (!issue) return null;
  return <ZineInner key={issue.template.id} view={zineView} setView={(v) => set("zineView", v)} page={page} selectPage={selectPage}
    onBorder={(b) => update((d) => { d.zineBorder = b; })} linked={issue.bordersLinked} border={issue.zineBorder}
    onLink={() => update((d) => { d.bordersLinked = !d.bordersLinked; })} active={active === "zine"} />;
}

function ZineInner({ view, setView, page, selectPage, onBorder, border, linked, onLink, active }: {
  view: "flip" | "sheet" | "fold"; setView: (v: "flip" | "sheet" | "fold") => void; page: number; selectPage: (p: number) => void;
  onBorder: (b: Border) => void; border: Border; linked: boolean; onLink: () => void; active: boolean;
}) {
  const imp = useImp();
  const n = imp.pageCount;
  const codex = imp.t.binding === "codex";
  const label = page === 1 ? "Front cover" : page === n ? "Back cover" : codex ? `Spread ${page % 2 ? page - 1 : page}–${page % 2 ? page : page + 1}` : `Panel ${page}`;
  const stepTo = (d: number) => {
    if (!codex) { selectPage(Math.min(n, Math.max(1, page + d))); return; }
    const t = spreadIndexOf(n, page) + d;
    if (t < 0 || t > n / 2) return;
    selectPage(t === 0 ? 1 : t === n / 2 ? n : 2 * t);
  };
  return (
    <section className={"panel" + (active ? " panel-active" : "")} aria-label="Zine" onPointerDown={() => useStore.getState().set("active", "zine")}>
      <div className="panel-head">
        <h2>Zine <span>{imp.t.code}</span></h2>
        <div className="seg" role="group" aria-label="Zine view">
          {(["flip", "sheet", "fold"] as const).map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{v === "flip" ? (codex ? "Flip" : "Unfold") : v[0].toUpperCase() + v.slice(1)}</button>)}
        </div>
        <span className="spacer" />
        <span className="code">{imp.paper}{imp.trimmed ? " trim" : ""} · page {imp.pageW.toFixed(1)} × {imp.pageH.toFixed(1)} mm</span>
      </div>
      {view === "flip" && (codex ? <Flip imp={imp} /> : imp.t.binding === "accordion" ? <Strip imp={imp} /> : <Trifold imp={imp} />)}
      {view === "sheet" && <Sheet imp={imp} />}
      {view === "fold" && <Fold imp={imp} />}
      <div className="stage-foot">
        <div className="pager">
          <button type="button" className="icon-btn" aria-label="Previous" onClick={() => stepTo(-1)}><Chevron dir="l" /></button>
          {label}
          <button type="button" className="icon-btn" aria-label="Next" onClick={() => stepTo(1)}><Chevron dir="r" /></button>
        </div>
        <div className="border-ctl">
          <button type="button" className="link-toggle" aria-pressed={linked} onClick={onLink}>Link borders</button>
          <span className="code">Border</span>
          <BorderPicker value={border} onChange={onBorder} compact />
        </div>
      </div>
    </section>
  );
}

/** One page, rendered flat at any size, with its layers editable on top. */
export function PageView({ page, width, edit = true }: { page: number; width: number; edit?: boolean }) {
  const issue = useStore((s) => s.issue)!;
  const imp = useImp();
  const items = useMemo(() => {
    const ctx: Ctx = { issue, side: "zine", copy: 1, total: Math.max(1, issue.plannedCopies), imp };
    return pageItems(ctx, page, imp.pageW, imp.pageH);
  }, [issue, page, imp]);
  return (
    <div className="page-view" style={{ width, height: (width * imp.pageH) / imp.pageW }}>
      <Surface items={items} w={imp.pageW} h={imp.pageH} width={width} />
      {edit && <LayerOverlay lkey={pageKey(page, imp.pageCount)} W={imp.pageW} H={imp.pageH} width={width} side="zine" />}
    </div>
  );
}

/** Codex flip: the open spread lies flat (pages line up exactly); a page-turn animates over it. */
function Flip({ imp }: { imp: Imposition }) {
  const { page, selectPage } = useStore();
  const n = imp.pageCount;
  const spreads = codexSpreads(n);
  const t = spreadIndexOf(n, page);
  const [anim, setAnim] = useState<{ from: number; to: number } | null>(null);
  const last = useRef(t);
  useEffect(() => {
    if (last.current !== t) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduce && Math.abs(last.current - t) === 1) { setAnim({ from: last.current, to: t }); const id = window.setTimeout(() => setAnim(null), 620); last.current = t; return () => window.clearTimeout(id); }
      last.current = t;
    }
  }, [t]);
  const go = (k: number) => { if (k < 0 || k > n / 2) return; selectPage(k === 0 ? 1 : k === n / 2 ? n : 2 * k); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if (st.active !== "zine" || st.sel || (e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable]")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); go(t + 1); }
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(t - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const aspect = imp.pageW / imp.pageH;
  return (
    <Viewport panel="zine" base={(bw, bh) => { const pw = Math.min(bw / 2, bh * aspect); return { w: 2 * pw, h: pw / aspect }; }}>
      {(_z, size) => {
        const pw = size.w / 2;
        const [L, R] = spreads[anim ? (anim.to > anim.from ? anim.from : anim.to) : t];
        const [L2, R2] = anim ? spreads[anim.to > anim.from ? anim.to : anim.from] : [null, null];
        const fwd = anim ? anim.to > anim.from : true;
        // base pages under the turning leaf
        const baseL = anim ? (fwd ? L : L) : L;
        const baseR = anim ? (fwd ? R2 : R2) : R;
        const shift = t === 0 ? -pw / 2 : t === n / 2 ? pw / 2 : 0;
        return (
          <div className="book" style={{ width: size.w, height: size.h, transform: `translateX(${shift}px)` }}>
            <div className="book-page left" onClick={(e) => { if (e.target === e.currentTarget || !useStore.getState().sel) void 0; }}>
              {baseL !== null && <PageView page={baseL} width={pw} edit={!anim} />}
              {baseL !== null && <button type="button" className="turn-zone l" aria-label="Previous page" onClick={() => go(t - 1)} />}
            </div>
            <div className="book-page right">
              {baseR !== null && <PageView page={baseR} width={pw} edit={!anim} />}
              {baseR !== null && <button type="button" className="turn-zone r" aria-label="Next page" onClick={() => go(t + 1)} />}
            </div>
            {anim && (
              <div className={"turning " + (fwd ? "fwd" : "back")} style={{ width: pw, height: size.h }}>
                <div className="face front">{R !== null && <PageView page={R} width={pw} edit={false} />}</div>
                <div className="face back">{L2 !== null && <PageView page={L2} width={pw} edit={false} />}</div>
              </div>
            )}
          </div>
        );
      }}
    </Viewport>
  );
}

/** Accordion: all panels in reading order as one strip, with the glue join marked. */
function Strip({ imp }: { imp: Imposition }) {
  const n = imp.pageCount;
  const aspect = imp.pageW / imp.pageH;
  return (
    <Viewport panel="zine" base={(bw, bh) => { const pw = Math.min(bw / n, bh * aspect); return { w: pw * n, h: pw / aspect }; }}>
      {(_z, size) => (
        <div className="strip" style={{ width: size.w, height: size.h }}>
          {Array.from({ length: n }, (_, i) => (
            <div key={i} className={"strip-panel" + (i % 2 ? " valley" : " mountain") + (i === n / 2 ? " glued" : "")}>
              <PageView page={i + 1} width={size.w / n} />
            </div>
          ))}
        </div>
      )}
    </Viewport>
  );
}

/** Tri-fold: outside and inside, as you see them flat. */
function Trifold({ imp }: { imp: Imposition }) {
  const rows = [{ name: "Outside", pages: imp.panels.filter((p) => p.side === 0).sort((a, b) => a.rect.x - b.rect.x).map((p) => p.page) },
    { name: "Inside", pages: imp.panels.filter((p) => p.side === 1).sort((a, b) => a.rect.x - b.rect.x).map((p) => p.page) }];
  const aspect = imp.pageW / imp.pageH;
  return (
    <Viewport panel="zine" base={(bw, bh) => { const pw = Math.min(bw / 3, ((bh - 40) / 2) * aspect); return { w: pw * 3, h: (2 * pw) / aspect + 40 }; }}>
      {(_z, size) => (
        <div className="trifold" style={{ width: size.w }}>
          {rows.map((r) => (
            <div key={r.name}><span className="code">{r.name}</span>
              <div className="strip">{r.pages.map((p) => <div key={p} className="strip-panel"><PageView page={p} width={size.w / 3} /></div>)}</div>
            </div>
          ))}
        </div>
      )}
    </Viewport>
  );
}

/** The real printed sheet(s) with fold/cut/trim guides; click a panel to select its page. */
function Sheet({ imp }: { imp: Imposition }) {
  const { issue, page, selectPage, settings, sheetSel, set } = useStore();
  const sheet = Math.min(sheetSel.sheet, imp.sheets - 1), side = Math.min(sheetSel.side, imp.sides - 1);
  const items = useMemo(() => {
    const s = sheetItems(issue!, { copy: 1, total: Math.max(1, issue!.plannedCopies), sheet, side, guides: "full", preview: true, margins: settings.margins });
    return [...s.content, ...s.guides];
  }, [issue, settings.margins, sheet, side]);
  const poster = imp.t.poster && side === 1;
  return (
    <>
      {(imp.sheets > 1 || imp.sides > 1) && (
        <div className="sheet-picker">
          {Array.from({ length: imp.sheets }, (_, sh) => Array.from({ length: imp.sides }, (_, sd) => (
            <button key={`${sh}-${sd}`} type="button" className="btn btn-sm" aria-pressed={sh === sheet && sd === side} onClick={() => set("sheetSel", { sheet: sh, side: sd })}>
              {imp.sheets > 1 ? `Sheet ${sh + 1} ` : ""}{imp.t.poster && sd === 1 ? "poster side" : sd === 0 ? (imp.sides > 1 ? "front" : "") : "back"}
            </button>
          )))}
          {imp.sides > 1 && <span className="code">Print both sides · flip on {imp.t.duplex ?? "short"} edge</span>}
        </div>
      )}
      <Viewport panel="zine" base={(bw, bh) => { const w = Math.min(bw, bh * (imp.sheetW / imp.sheetH)); return { w, h: (w * imp.sheetH) / imp.sheetW }; }}>
        {(_z, size) => {
          const k = size.w / imp.sheetW;
          return (
            <div className="sheet-live" style={{ width: size.w, height: size.h }}>
              <Surface items={items} w={imp.sheetW} h={imp.sheetH} width={size.w} />
              {poster && <svg className="poster-marks" viewBox={`0 0 ${imp.sheetW} ${imp.sheetH}`} preserveAspectRatio="none" aria-hidden="true">
                {imp.lines.map((l) => <line key={l.id} x1={imp.sheetW - l.x1} y1={l.y1} x2={imp.sheetW - l.x2} y2={l.y2} className={l.kind} />)}
              </svg>}
              {!poster && imp.panels.filter((p) => p.sheet === sheet && p.side === side).map((p) => (
                <button key={p.page} type="button" className={"hit" + (p.page === page ? " is-sel" : "")} aria-label={`Page ${p.page}${p.rot ? ", printed upside down" : ""}`}
                  style={{ left: p.rect.x * k, top: p.rect.y * k, width: p.rect.w * k, height: p.rect.h * k }} onClick={() => selectPage(p.page)}>
                  <span className="hit-no">{p.page}</span></button>
              ))}
            </div>
          );
        }}
      </Viewport>
    </>
  );
}

/** Step-by-step folding guide drawn from the template's own fold/cut/glue data. */
function Fold({ imp }: { imp: Imposition }) {
  const [step, setStep] = useState(0);
  const steps = imp.t.steps;
  const s = steps[Math.min(step, steps.length - 1)];
  const show = new Set(s?.show ?? []);
  const W = imp.sheetW, H = imp.sheetH;
  return (
    <div className="stage top">
      <div className="fold-steps">
        <div>
          <p className="note-line" style={{ marginBottom: 12 }}>{imp.t.blurb}</p>
          <ol>
            {steps.map((st, i) => (
              <li key={i}><button type="button" aria-current={i === step ? "step" : undefined} onClick={() => setStep(i)}>
                <span className="n">{String(i + 1).padStart(2, "0")}</span><span>{st.text}</span></button></li>
            ))}
          </ol>
          <p className="code" style={{ marginTop: 12 }}>{imp.t.code} · {imp.t.verified ? "verified" : "page order not checked yet: fold a test print"}</p>
        </div>
        <div className="fold-fig">
          <svg viewBox={`-8 -8 ${W + 16} ${H + 16}`} role="img" aria-label={`Step ${step + 1} diagram`}>
            <rect x="0" y="0" width={W} height={H} className="paper" />
            {imp.trimmed && <rect x={imp.trim.x} y={imp.trim.y} width={imp.trim.w} height={imp.trim.h} className="trim" />}
            {imp.panels.filter((p) => p.sheet === 0 && p.side === 0).map((p) => (
              <text key={p.page} x={p.rect.x + p.rect.w / 2} y={p.rect.y + p.rect.h / 2} className="pno" transform={p.rot ? `rotate(180 ${p.rect.x + p.rect.w / 2} ${p.rect.y + p.rect.h / 2})` : undefined}>{p.page}</text>
            ))}
            {imp.scrap.map((r, i) => <rect key={i} {...r} className="scrap" width={r.w} height={r.h} />)}
            {imp.glue.map((g) => <g key={g.id} className={show.has(g.id) ? "anim" : ""}><rect x={g.rect.x} y={g.rect.y} width={g.rect.w} height={g.rect.h} className="glue" /><text x={g.rect.x + g.rect.w / 2} y={g.rect.y + g.rect.h / 2} className="glue-t">GLUE</text></g>)}
            {imp.lines.filter((l) => l.side === 0).map((l) => (
              <line key={l.id} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className={`${l.kind}${show.has(l.id) ? " on anim" : ""}`} />
            ))}
          </svg>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
            <button type="button" className="btn btn-sm" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
            <span className="code">Step {step + 1}/{steps.length}</span>
            <button type="button" className="btn btn-sm" disabled={step === steps.length - 1} onClick={() => setStep(step + 1)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
