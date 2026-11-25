import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { RATIOS, type RI, feedSize, slideItems, slidesOf } from "../engine/layout";
import { importPhotos, readBytes } from "../lib/backend";
import type { Border, FeedRatio, Issue } from "../model/types";
import { useStore } from "../store/store";
import { BorderPicker } from "./controls";
import { LayerOverlay } from "./LayerOverlay";
import { Surface } from "./Surface";
import { Viewport } from "./Viewport";

export const Chevron = ({ dir }: { dir: "l" | "r" }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d={dir === "l" ? "M8 2 4 6l4 4" : "m4 2 4 4-4 4"} fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
);

const PHONE_W = 340;

export function Feed() {
  const { issue, slide, selectSlide, feedView, set, update, active } = useStore();
  if (!issue) return null;
  const n = slidesOf(issue).length;
  const cur = Math.min(slide, Math.max(0, n - 1));
  const r = RATIOS[issue.feedRatio].r;
  const phoneH = 14 + 46 + (PHONE_W - 20) / r + 128;
  return (
    <section className={"panel" + (active === "feed" ? " panel-active" : "")} aria-label="Feed" onPointerDown={() => set("active", "feed")}>
      <div className="panel-head">
                <div className="seg" role="group" aria-label="Feed view">
          <button type="button" aria-pressed={feedView === "post"} onClick={() => set("feedView", "post")}>Post</button>
          <button type="button" aria-pressed={feedView === "profile"} onClick={() => set("feedView", "profile")}>Profile</button>
        </div>
        <span className="spacer" />
        <select className="select select-sm" aria-label="Post aspect ratio" value={issue.feedRatio} onChange={(e) => update((d) => { d.feedRatio = e.target.value as FeedRatio; })}>
          {(Object.keys(RATIOS) as FeedRatio[]).map((k) => <option key={k} value={k}>{k} · {RATIOS[k].px.join("×")}</option>)}
        </select>
      </div>
      {feedView === "post" ? (
        <Viewport panel="feed" wheelPan={false} base={(bw, bh) => { const k = Math.min(1.6, bw / PHONE_W, bh / phoneH); return { w: PHONE_W * k, h: phoneH * k }; }}>
          {(_z, size) => <Post k={size.w / PHONE_W} />}
        </Viewport>
      ) : (
        <Viewport panel="feed" base={(bw, bh) => { const k = Math.min(1.4, bw / 360, Math.max(0.5, bh / 640)); return { w: 360 * k, h: 640 * k }; }}>
          {(_z, size) => <ProfileView k={size.w / 360} />}
        </Viewport>
      )}
      <div className="stage-foot">
        <div className="pager">
          <button type="button" className="icon-btn" aria-label="Previous slide" disabled={cur <= 0} onClick={() => selectSlide(cur - 1)}><Chevron dir="l" /></button>
          Slide {n ? cur + 1 : 0}/{n}
          <button type="button" className="icon-btn" aria-label="Next slide" disabled={cur >= n - 1} onClick={() => selectSlide(cur + 1)}><Chevron dir="r" /></button>
        </div>
        <div className="border-ctl"><span className="code">Border</span>
          <BorderPicker value={issue.feedBorder} disabled={issue.bordersLinked} onChange={(b: Border) => update((d) => { d.feedBorder = b; })} compact />
        </div>
      </div>
    </section>
  );
}

function useBlobUrl(rel: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!rel) { setUrl(null); return; }
    let u: string | null = null, alive = true;
    readBytes(rel).then((b) => { if (!alive) return; u = URL.createObjectURL(new Blob([b as BlobPart])); setUrl(u); }).catch(() => setUrl(null));
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [rel]);
  return url;
}

function Avatar({ size }: { size: number }) {
  const avatar = useStore((s) => s.profile.avatar);
  const url = useBlobUrl(avatar);
  return <span className="avatar" style={{ width: size, height: size }}>{url && <img src={url} alt="" />}</span>;
}

/** A real-feeling post: wheel or drag scrolls the carousel continuously, then it settles on a slide. */
function Post({ k }: { k: number }) {
  const { issue, slide, selectSlide, profile, tool, picking } = useStore();
  const slides = issue ? slidesOf(issue) : [];
  const n = slides.length;
  const inner = (PHONE_W - 20) * k;
  const lists = useMemo(() => (issue ? slides.map((_, i) => slideItems(issue, i)) : []), [issue, n]);
  const [pos, setPos] = useState(slide);
  const [settling, setSettling] = useState(false);
  const posRef = useRef(slide);
  const timer = useRef<number>(0);
  const drag = useRef<{ x: number; p: number; t: number } | null>(null);
  const media = useRef<HTMLDivElement>(null);
  const moving = useRef(false);
  const settle = (p: number) => {
    const t = Math.max(0, Math.min(n - 1, Math.round(p)));
    setSettling(true); setPos(t); posRef.current = t; moving.current = false;
    if (t !== useStore.getState().slide) selectSlide(t);
    window.setTimeout(() => setSettling(false), 260);
  };
  useEffect(() => { if (!moving.current && !drag.current) { setPos(slide); posRef.current = slide; } }, [slide]);
  useEffect(() => {
    const el = media.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return; // zoom is handled by the viewport
      e.preventDefault();
      moving.current = true;
      const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * (e.deltaMode === 1 ? 30 : 1);
      const p = Math.max(-0.15, Math.min(n - 0.85, posRef.current + d / inner));
      posRef.current = p; setSettling(false); setPos(p);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => settle(posRef.current), 260);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });
  if (!issue) return null;
  const { W, H } = feedSize(issue);
  const [first, ...rest] = (issue.caption || "").split("\n");
  const still = !settling && Math.abs(pos - Math.round(pos)) < 0.001;
  const canDrag = tool === "move" && !picking;
  return (
    <div className="phone" style={{ width: PHONE_W * k, fontSize: 13 * k, padding: `${14 * k}px ${10 * k}px ${12 * k}px` }}>
      <div className="post-head" style={{ height: 46 * k }}><Avatar size={30 * k} /><b>{profile.handle || "your.handle"}</b><span className="count">{n ? Math.round(pos) + 1 : 0}/{n}</span></div>
      <div ref={media} className="post-media" style={{ width: inner, height: inner / RATIOS[issue.feedRatio].r }}
        onPointerDown={(e) => {
          if (!canDrag || (e.target as HTMLElement).closest(".layer-box,.swipe") || e.button !== 0) return;
          drag.current = { x: e.clientX, p: posRef.current, t: performance.now() };
          moving.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const p = Math.max(-0.2, Math.min(n - 0.8, d.p - (e.clientX - d.x) / inner));
          posRef.current = p; setSettling(false); setPos(p);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          if (!d) return;
          drag.current = null;
          const v = (e.clientX - d.x) / Math.max(1, performance.now() - d.t);
          settle(Math.abs(v) > 0.5 ? (v < 0 ? Math.floor(posRef.current) + 1 : Math.ceil(posRef.current) - 1) : posRef.current);
        }}>
        {n ? (
          <div className={"track" + (settling ? " settling" : "")} style={{ transform: `translateX(${-pos * inner}px)` }}>
            {lists.map((items, i) => (
              <div key={i} className="slide" style={{ width: inner }}>
                {Math.abs(i - pos) < 1.6 && <Surface items={items} w={W} h={H} width={inner} />}
                {still && i === Math.round(pos) && <LayerOverlay lkey={`feed:${i}`} W={W} H={H} width={inner} side="feed" />}
              </div>
            ))}
          </div>
        ) : <div className="post-empty">Add photos to start the post</div>}
        {Math.round(pos) > 0 && <button type="button" className="swipe l" aria-label="Previous slide" onClick={() => settle(Math.round(pos) - 1)}><Chevron dir="l" /></button>}
        {Math.round(pos) < n - 1 && <button type="button" className="swipe r" aria-label="Next slide" onClick={() => settle(Math.round(pos) + 1)}><Chevron dir="r" /></button>}
      </div>
      <div className="post-actions" style={{ height: 40 * k }}>
        <Icon d="M12 21s-7-4.5-9.5-9A5.3 5.3 0 0 1 12 6a5.3 5.3 0 0 1 9.5 6C19 16.5 12 21 12 21z" k={k} />
        <Icon d="M21 12a8.5 8.5 0 1 1-3.6-7A8.5 8.5 0 0 1 21 12zm0 0v8.5l-3.6-2.2" k={k} />
        <Icon d="M21.5 3 10 14M21.5 3l-7 18-4.5-7-7-4.5z" k={k} />
        <span className="dots" aria-hidden="true">{Array.from({ length: Math.min(n, 20) }, (_, i) => <i key={i} className={i === Math.round(pos) ? "on" : ""} />)}</span>
        <Icon d="M6 3h12v18l-6-5-6 5z" k={k} />
      </div>
      <p className="post-cap"><b>{profile.handle || "your.handle"}</b> {first || <span>Write the caption in SER</span>} {rest.length > 0 && <span>… more</span>}</p>
    </div>
  );
}
const Icon = ({ d, k }: { d: string; k: number }) => (
  <svg width={24 * k} height={24 * k} viewBox="0 0 24 24" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
);

/** First slide of an issue as it appears in the profile grid: a 3:4 tile, centre-cropped from the post. */
function tileOf(i: Issue): { items: RI[]; w: number; h: number; cropped: boolean } {
  const { W, H } = feedSize(i);
  const items = slideItems(i, 0);
  if (W / H > 0.75) {
    const tw = H * 0.75, ox = (W - tw) / 2;
    return { items: [{ t: "group", x: -ox, y: 0, w: W, h: H, rot: 0, clip: null, items }], w: tw, h: H, cropped: ox > 0.3 };
  }
  const th = W / 0.75, oy = (H - th) / 2;
  return { items: [{ t: "group", x: 0, y: -oy, w: W, h: H, rot: 0, clip: null, items }], w: W, h: th, cropped: oy > 0.3 };
}

/** Your profile: every issue is a post, newest first, as IG shows them (3:4 tiles). */
function ProfileView({ k }: { k: number }) {
  const { issue, others, profile, collection } = useStore();
  const [editing, setEditing] = useState(false);
  const all = useMemo(() => [...(issue ? [issue] : []), ...others.filter((o) => o.id !== issue?.id)].sort((a, b) => b.no - a.no), [issue, others]);
  const tiles = useMemo(() => all.map((i) => ({ i, ...tileOf(i) })), [all]);
  const tw = (360 * k - 4) / 3;
  return (
    <div className="profile" style={{ width: 360 * k, fontSize: 13 * k }}>
      <div className="profile-head">
        <Avatar size={78 * k} />
        <div className="stats">
          <div><b>{collection.length}</b><span>posts</span></div>
          <div><b>{profile.followers || "–"}</b><span>followers</span></div>
          <div><b>{profile.following || "–"}</b><span>following</span></div>
        </div>
      </div>
      <div className="profile-bio">
        <b>{profile.name || profile.handle}</b>
        {profile.bio && <p>{profile.bio}</p>}
        <button type="button" className="btn btn-sm" style={{ width: "100%", justifyContent: "center", marginTop: 8 * k }} onClick={() => setEditing(true)}>Edit profile</button>
      </div>
      <div className="profile-grid" style={{ gridTemplateColumns: `repeat(3, ${tw}px)` }}>
        {tiles.map(({ i, items, w, h, cropped }) => (
          <div key={i.id} className={"tile" + (i.id === issue?.id ? " new" : "")} title={`No. ${String(i.no).padStart(3, "0")} ${i.title}${cropped ? " (cropped to 3:4 in the grid)" : ""}`}>
            {i.items.length ? <Surface items={items} w={w} h={h} width={tw} /> : <div className="tile-empty" style={{ height: tw / 0.75 }}>{String(i.no).padStart(3, "0")}</div>}
            {cropped && <span className="crop-badge">3:4</span>}
          </div>
        ))}
      </div>
      {editing && <ProfileForm onClose={() => setEditing(false)} />}
    </div>
  );
}

function ProfileForm({ onClose }: { onClose: () => void }) {
  const { profile, saveProfile, notify } = useStore();
  const [p, setP] = useState(profile);
  return (
    <div className="popover" onPointerDown={(e) => e.stopPropagation()}>
      <div className="field"><label>Username</label><input className="input" value={p.handle} onChange={(e) => setP({ ...p, handle: e.target.value })} /></div>
      <div className="field"><label>Name</label><input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></div>
      <div className="field"><label>Bio</label><textarea className="input" value={p.bio} onChange={(e) => setP({ ...p, bio: e.target.value })} /></div>
      <div className="grid2">
        <div className="field"><label>Followers</label><input className="input" value={p.followers} onChange={(e) => setP({ ...p, followers: e.target.value })} placeholder="as you like" /></div>
        <div className="field"><label>Following</label><input className="input" value={p.following} onChange={(e) => setP({ ...p, following: e.target.value })} /></div>
      </div>
      <div className="row">
        <button type="button" className="btn" onClick={async () => {
          const r = await open({ multiple: false, title: "Profile picture", filters: [{ name: "Photos", extensions: ["jpg", "jpeg", "png", "webp"] }] });
          if (!r || Array.isArray(r)) return;
          try { const [im] = await importPhotos("profile", [r]); setP({ ...p, avatar: im.file }); } catch (e) { notify(String(e)); }
        }}>Choose profile picture…</button>
        {p.avatar && <button type="button" className="btn" onClick={() => setP({ ...p, avatar: null })}>Remove</button>}
      </div>
      <div className="row"><button type="button" className="btn btn-primary" onClick={async () => { await saveProfile(p); onClose(); }}>Save</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
    </div>
  );
}
