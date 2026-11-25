import { platform } from "../platform";
import { useRef, useState } from "react";
import { cropFor } from "../engine/crop";
import { slidesOf } from "../engine/layout";
import { newItem, useStore } from "../store/store";
import { Surface } from "./Surface";

export async function pickPhotos() {
  const r = await platform.pick("photos");
  if (r.length) await useStore.getState().addPhotos(r);
}

function Thumb({ assetId, w = 30, h = 40 }: { assetId: string; w?: number; h?: number }) {
  const a = useStore((s) => s.issue?.assets.find((x) => x.id === assetId));
  if (!a) return <span style={{ width: w, height: h }} />;
  const c = cropFor(a.w, a.h, w, h, { fit: "cover", fx: 0.5, fy: 0.5, zoom: 1 });
  return <Surface items={[{ t: "image", assetId: a.id, x: 0, y: 0, w, h, src: c.src, photo: true }]} w={w} h={h} width={w} />;
}

export function Rail() {
  const { issue, collection, slide, selectSlide, update, openIssue, createIssue } = useStore();
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const rows = useRef<HTMLOListElement>(null);
  if (!issue) return null;
  const slides = slidesOf(issue);
  const curItem = issue.items.findIndex((i) => i.id === slides[slide]?.itemId);
  const used = new Set(issue.items.flatMap((i) => [i.assetId, i.assetId2]));
  const unused = issue.assets.filter((a) => !used.has(a.id));
  const indexAt = (y: number) => {
    const lis = [...(rows.current?.children ?? [])] as HTMLElement[];
    for (let i = 0; i < lis.length; i++) { const r = lis[i].getBoundingClientRect(); if (y < r.top + r.height / 2) return i; }
    return lis.length;
  };
  const move = (from: number, to: number) => update((d) => {
    const [it] = d.items.splice(from, 1);
    d.items.splice(Math.max(0, Math.min(d.items.length, to > from ? to - 1 : to)), 0, it);
    d.pages = null;
  });

  return (
    <aside className="panel rail" aria-label="Issue and photos">
      <div className="panel-head"><h2>Issues <span>{collection.length}</span></h2><span className="spacer" />
        <button type="button" className="btn btn-sm" onClick={() => void createIssue()}>New</button></div>
      <div className="panel-body">
        <div className="rail-section">
          <ul className="issue-list">
            {collection.slice(0, 8).map((c) => (
              <li key={c.id}><a href="#" aria-current={c.id === issue.id ? "true" : undefined} onClick={(e) => { e.preventDefault(); void openIssue(c.slug); }}>
                <span className="num">{String(c.no).padStart(3, "0")}</span><span>{c.title}</span></a></li>
            ))}
          </ul>
        </div>
        <div className="rail-section">
          <span className="code">Carousel <strong>{slides.length} slides</strong></span>
          {issue.items.length === 0 ? (
            <div className="rail-empty"><p>Drop photos anywhere on this window, or add them here. They're copied full-res into the issue folder.</p>
              <button type="button" className="btn btn-primary" onClick={() => void pickPhotos()}>Add photos</button></div>
          ) : (
            <ol className="slides" ref={rows}
              onPointerMove={(e) => { if (drag) setDrag({ ...drag, over: indexAt(e.clientY) }); }}
              onPointerUp={() => { if (drag && drag.over !== drag.from && drag.over !== drag.from + 1) move(drag.from, drag.over); setDrag(null); }}>
              {issue.items.map((it, idx) => {
                const first = slides.findIndex((s) => s.itemId === it.id);
                return (
                  <li key={it.id} className={"slide-row" + (idx === curItem ? " is-sel" : "") + (drag?.over === idx && drag.from !== idx ? " drag-over" : "") + (drag?.from === idx ? " dragging" : "")}
                    onClick={() => selectSlide(first)}>
                    <span className="grip" title="Drag to reorder" onPointerDown={(e) => { e.stopPropagation(); (e.currentTarget.closest("ol") as HTMLElement).setPointerCapture(e.pointerId); setDrag({ from: idx, over: idx }); }}>⋮⋮</span>
                    <span className="idx">{String(first + 1).padStart(2, "0")}{it.kind === "pair" ? `–${String(first + 2).padStart(2, "0")}` : ""}</span>
                    <span className="thumbs"><Thumb assetId={it.assetId} />{it.kind === "stack" && it.assetId2 && <Thumb assetId={it.assetId2} />}</span>
                    <span className="lab">{it.label || "Photo"}</span>
                    {it.kind !== "single" && <span className="pair">{it.kind === "pair" ? "pair" : "stack"}</span>}
                  </li>
                );
              })}
              {drag && drag.over === issue.items.length && <li className="drop-end" />}
            </ol>
          )}
        </div>
        {issue.items.length > 0 && (
          <div className="rail-section">
            <span className="code">Photo tray <strong>{unused.length} unused</strong></span>
            <div className="tray">
              {unused.map((a) => (
                <button key={a.id} type="button" className="tray-item" title={`Add ${a.name} to the carousel`}
                  onClick={() => update((d) => { d.items.push(newItem(a.id, a.w, a.h, a.name.replace(/\.[^.]+$/, ""))); d.pages = null; })}>
                  <Thumb assetId={a.id} w={64} h={64} /></button>
              ))}
              <button type="button" className="add" onClick={() => void pickPhotos()}>+ Add</button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
