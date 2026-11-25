import { useEffect, useRef, useState } from "react";
import type { RI } from "../engine/layout";
import { onImagesChanged, previewImages } from "../render/images";
import { renderToCanvas } from "../render/renderer";
import { useStore } from "../store/store";

const fontListeners = new Set<() => void>();
if (typeof document !== "undefined") {
  document.fonts.addEventListener?.("loadingdone", () => fontListeners.forEach((f) => f()));
}
const MAX_PX = 7000;

/** Live preview of a RenderList. Same renderer as every export. Width in CSS px. Eyedropper-aware. */
export function Surface({ items, w, h, width, className, title, style }: { items: RI[]; w: number; h: number; width: number; className?: string; title?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  const picking = useStore((s) => s.picking);
  useEffect(() => onImagesChanged(() => setTick((t) => t + 1)), []);
  useEffect(() => { const f = () => setTick((t) => t + 1); fontListeners.add(f); return () => { fontListeners.delete(f); }; }, []);
  useEffect(() => {
    const c = ref.current;
    if (!c || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.min(width * dpr, MAX_PX, (MAX_PX * w) / h);
    const id = requestAnimationFrame(() => renderToCanvas(items, w, h, { scale: px / w, images: previewImages }, c));
    return () => cancelAnimationFrame(id);
  }, [items, w, h, width, tick]);
  return (
    <canvas ref={ref} className={"surface " + (className ?? "") + (picking ? " picking" : "")} style={{ width, height: (width * h) / w, ...style }} title={title}
      onPointerDown={(e) => {
        const pick = useStore.getState().picking;
        if (!pick) return;
        e.preventDefault(); e.stopPropagation();
        const c = e.currentTarget;
        const r = c.getBoundingClientRect();
        const x = Math.floor(((e.clientX - r.left) / r.width) * c.width), y = Math.floor(((e.clientY - r.top) / r.height) * c.height);
        const d = c.getContext("2d")!.getImageData(x, y, 1, 1).data;
        pick("#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase());
        useStore.setState({ picking: null, tool: "move" });
      }} />
  );
}

/** Track an element's content box size. */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export const fit = (boxW: number, boxH: number, aspect: number) => Math.max(0, Math.min(boxW, boxH * aspect));
