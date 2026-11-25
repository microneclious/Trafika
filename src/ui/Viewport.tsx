import { useEffect, useRef, useState } from "react";
import { type PanelId, useStore } from "../store/store";

const MIN = 0.25, MAX = 8;
export const clampZoom = (z: number) => Math.min(MAX, Math.max(MIN, z));

let spaceDown = false;
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => { if (e.code === "Space" && !(e.target as HTMLElement)?.closest("input,textarea,select,button")) { spaceDown = true; } });
  window.addEventListener("keyup", (e) => { if (e.code === "Space") spaceDown = false; });
}

/**
 * Zoom/pan canvas area, design-app style: Ctrl+wheel zooms at the cursor, wheel pans when zoomed in
 * (Shift = sideways), Space-drag / middle-drag / Hand tool pans. Children re-render at the zoomed size,
 * so text and photos stay sharp instead of being scaled up.
 */
export function Viewport({ panel, base, wheelPan = true, children, className }: {
  panel: PanelId;
  /** content size at zoom 1 for a given box (fit to the box) */
  base: (boxW: number, boxH: number) => { w: number; h: number };
  wheelPan?: boolean;
  children: (zoom: number, size: { w: number; h: number }) => React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const cam = useStore((s) => s.cams[panel]);
  const tool = useStore((s) => s.tool);
  const active = useStore((s) => s.active === panel);
  const setCam = useStore((s) => s.setCam);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [panning, setPanning] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const b = base(Math.max(0, box.w - 48), Math.max(0, box.h - 48));
  const size = { w: b.w * cam.zoom, h: b.h * cam.zoom };
  const left = box.w / 2 + cam.x - size.w / 2;
  const top = box.h / 2 + cam.y - size.h / 2;

  // native wheel listener (non-passive) so Ctrl+wheel never zooms the whole webview
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const st = useStore.getState();
      const c = st.cams[panel];
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const r = el.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        const bb = base(Math.max(0, r.width - 48), Math.max(0, r.height - 48));
        const z0 = c.zoom, z1 = clampZoom(z0 * Math.exp(-e.deltaY * 0.0018));
        const l0 = r.width / 2 + c.x - (bb.w * z0) / 2, t0 = r.height / 2 + c.y - (bb.h * z0) / 2;
        const ux = (px - l0) / z0, uy = (py - t0) / z0;
        const l1 = px - ux * z1, t1 = py - uy * z1;
        st.setCam(panel, { zoom: z1, x: l1 - r.width / 2 + (bb.w * z1) / 2, y: t1 - r.height / 2 + (bb.h * z1) / 2 });
        return;
      }
      if (!wheelPan || c.zoom <= 1.001) return;
      e.preventDefault();
      const dx = e.shiftKey ? e.deltaY : e.deltaX, dy = e.shiftKey ? 0 : e.deltaY;
      st.setCam(panel, { x: c.x - dx, y: c.y - dy });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [panel, base, wheelPan]);

  const handMode = tool === "hand";
  return (
    <div ref={ref} className={"viewport " + (className ?? "") + (handMode || panning ? " hand" : "") + (active ? " is-active" : "")}
      onPointerDownCapture={(e) => {
        if (useStore.getState().active !== panel) useStore.getState().set("active", panel);
        if (e.button === 1 || ((handMode || spaceDown) && e.button === 0)) {
          e.preventDefault(); e.stopPropagation();
          drag.current = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
          setPanning(true);
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }
      }}
      onPointerMove={(e) => { const d = drag.current; if (d) setCam(panel, { x: d.cx + e.clientX - d.x, y: d.cy + e.clientY - d.y }); }}
      onPointerUp={() => { drag.current = null; setPanning(false); }}
      onDoubleClick={(e) => { if (e.target === e.currentTarget) setCam(panel, { zoom: 1, x: 0, y: 0 }); }}>
      <div className="viewport-content" style={{ left, top, width: size.w, height: size.h }}>
        {box.w > 0 && children(cam.zoom, size)}
      </div>
    </div>
  );
}
