import { useRef, useState } from "react";
import { gridById, snapBox } from "../engine/grids";
import { type Ctx, layerItems } from "../engine/layout";
import { newText } from "../model/defaults";
import type { Layer } from "../model/types";
import { measureTextMm } from "../render/renderer";
import { useStore } from "../store/store";

/** Height of a layer in % of the surface. Text measures itself; codes/bands use their box. */
export function layerHeightPct(ctx: Ctx, l: Layer, W: number, H: number): number {
  if (l.kind !== "text") return l.h;
  const it = layerItems(ctx, [{ ...l, hidden: false, rotation: 0 }], W, H)[0];
  if (!it || it.t !== "text") return 4;
  return (measureTextMm(it) / H) * 100;
}

/**
 * Direct manipulation on a page or slide: click to select, drag to move (snaps to the grid; hold Alt to
 * move freely), drag the handles to resize. Text tool: click to place new text.
 */
export function LayerOverlay({ lkey, W, H, width, side }: { lkey: string; W: number; H: number; width: number; side: "zine" | "feed" }) {
  const { issue, sel, tool, showGrid, snap, picking } = useStore();
  const [guides, setGuides] = useState<{ gx: number | null; gy: number | null } | null>(null);
  const drag = useRef<{ id: string; mode: "move" | "w" | "wh"; sx: number; sy: number; l: Layer; hPct: number } | null>(null);
  if (!issue) return null;
  const layers = issue.layers[lkey] ?? [];
  const height = (width * H) / W;
  const ctx: Ctx = { issue, side, copy: 1, total: Math.max(1, issue.plannedCopies) };
  const grid = gridById(issue.grid);
  const passive = tool === "hand" || !!picking;

  const start = (e: React.PointerEvent, l: Layer, mode: "move" | "w" | "wh") => {
    if (passive || e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const st = useStore.getState();
    st.set("sel", { key: lkey, id: l.id });
    st.update(() => {}); // one undo step for the whole drag
    drag.current = { id: l.id, mode, sx: e.clientX, sy: e.clientY, l: { ...l }, hPct: layerHeightPct(ctx, l, W, H) };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = ((e.clientX - d.sx) / width) * 100, dy = ((e.clientY - d.sy) / height) * 100;
    const free = e.altKey || !snap;
    let patch: Partial<Layer> = {};
    if (d.mode === "move") {
      let x = d.l.x + dx, y = d.l.y + dy;
      let g: { gx: number | null; gy: number | null } = { gx: null, gy: null };
      if (!free) { const s = snapBox(x, y, d.l.w, d.hPct, grid); x = s.x; y = s.y; g = { gx: s.gx, gy: s.gy }; }
      setGuides(g);
      patch = { x: round(x), y: round(y) };
    } else {
      let w = Math.max(3, d.l.w + dx);
      if (!free) { const s = snapBox(d.l.x, d.l.y, w, d.hPct, grid); if (s.gx !== null && Math.abs(s.gx - (d.l.x + w)) < 1.6) w = s.gx - d.l.x; setGuides({ gx: s.gx, gy: null }); }
      patch = { w: round(w) };
      if (d.mode === "wh") patch.h = d.l.kind === "qr" ? round((w * W) / H) : round(Math.max(2, d.l.h + dy));
    }
    useStore.getState().update((iss) => {
      const t = (iss.layers[lkey] ?? []).find((x) => x.id === d.id);
      if (t) Object.assign(t, patch);
    }, { history: false });
  };
  const end = () => { drag.current = null; setGuides(null); };

  const showLines = showGrid || !!guides;
  return (
    <div className={"layer-overlay" + (passive ? " passive" : "") + (tool === "text" ? " text-tool" : "")} style={{ width, height }}
      onPointerMove={move} onPointerUp={end}
      onPointerDown={(e) => {
        if (tool !== "text" || passive) return;
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        const nl = { ...newText(), x: round(((e.clientX - r.left) / r.width) * 100), y: round(((e.clientY - r.top) / r.height) * 100), color: side === "zine" ? "#121212" : "#FFFFFF" };
        const st = useStore.getState();
        st.update((iss) => { iss.layers[lkey] = [...(iss.layers[lkey] ?? []), nl]; });
        st.set("sel", { key: lkey, id: nl.id });
        st.set("tab", "LYR");
        st.set("tool", "move");
      }}>
      {showLines && (
        <svg className="grid-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {showGrid && grid.cells?.map((c, i) => <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} className="cell" />)}
          {showGrid && grid.xs.map((x, i) => <line key={"x" + i} x1={x} x2={x} y1={0} y2={100} />)}
          {showGrid && grid.ys.map((y, i) => <line key={"y" + i} y1={y} y2={y} x1={0} x2={100} />)}
          {guides?.gx != null && <line className="snap" x1={guides.gx} x2={guides.gx} y1={0} y2={100} />}
          {guides?.gy != null && <line className="snap" y1={guides.gy} y2={guides.gy} x1={0} x2={100} />}
        </svg>
      )}
      {layers.map((l) => {
        if (l.hidden) return null;
        const hp = layerHeightPct(ctx, l, W, H);
        const isSel = sel?.key === lkey && sel.id === l.id;
        return (
          <div key={l.id} className={"layer-box" + (isSel ? " is-sel" : "")} title={l.name ?? l.bind ?? l.kind}
            style={{ left: `${l.x}%`, top: `${l.y}%`, width: `${l.w}%`, height: `${hp}%`, transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined }}
            onPointerDown={(e) => start(e, l, "move")}
            onDoubleClick={() => useStore.getState().set("tab", "LYR")}>
            {isSel && <>
              <span className="handle e" onPointerDown={(e) => start(e, l, "w")} />
              {l.kind !== "text" && <span className="handle se" onPointerDown={(e) => start(e, l, "wh")} />}
            </>}
          </div>
        );
      })}
    </div>
  );
}
const round = (v: number) => Math.round(v * 100) / 100;
