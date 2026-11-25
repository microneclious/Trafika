import { create } from "zustand";
import { codesFor } from "../engine/codes";
import { impose } from "../engine/geometry";
import { pageForSlide, slideForPage, slidesOf } from "../engine/layout";
import { templateLabel } from "../export/exports";
import * as be from "../lib/backend";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS, migrate, newIssue, uid } from "../model/defaults";
import type { CollectionEntry, Issue, Item, Profile, Settings } from "../model/types";
import { loadAllFonts, type FontEntry } from "../render/fonts";
import { ensurePreview, measure } from "../render/images";

export type View = "issue" | "collection";
export type ZineView = "flip" | "sheet" | "fold";
export type FeedView = "post" | "profile";
export type Tab = "CRP" | "BRD" | "LYR" | "CVR" | "BCK" | "TPL" | "SER";
export type Tool = "move" | "hand" | "text" | "picker";
export type PanelId = "feed" | "zine";
export interface Cam { zoom: number; x: number; y: number }

interface State {
  ready: boolean;
  root: string;
  view: View;
  collection: CollectionEntry[];
  /** other issues, loaded for the profile grid */
  others: Issue[];
  issue: Issue | null;
  past: Issue[];
  future: Issue[];
  saving: "saved" | "saving" | "error";
  slide: number;
  page: number;
  feedView: FeedView;
  zineView: ZineView;
  sheetSel: { sheet: number; side: number };
  tab: Tab;
  fonts: FontEntry[];
  settings: Settings;
  profile: Profile;
  toast: string | null;
  /** selected layer */
  sel: { key: string; id: string } | null;
  active: PanelId;
  tool: Tool;
  cams: Record<PanelId, Cam>;
  showGrid: boolean;
  snap: boolean;
  /** eyedropper target: receives a #rrggbb colour */
  picking: ((hex: string) => void) | null;
  cropTarget: "feed" | "print";
  cropImage: 1 | 2;

  init(): Promise<void>;
  setView(v: View): void;
  set<K extends keyof State>(k: K, v: State[K]): void;
  notify(msg: string): void;
  update(fn: (i: Issue) => void, opts?: { history?: boolean }): void;
  undo(): void;
  redo(): void;
  createIssue(): Promise<void>;
  openIssue(slug: string): Promise<void>;
  addPhotos(paths: string[]): Promise<void>;
  selectSlide(i: number): void;
  selectPage(p: number): void;
  setCam(p: PanelId, c: Partial<Cam>): void;
  saveSettings(s: Settings): Promise<void>;
  saveProfile(p: Profile): Promise<void>;
  reloadFonts(): Promise<void>;
  loadOthers(): Promise<void>;
  saveNow(): Promise<void>;
}

const clone = <T,>(v: T): T => structuredClone(v);
let saveTimer: number | undefined;

export function entryOf(i: Issue): CollectionEntry {
  const imp = impose(i.template);
  const copies = i.printRuns.reduce((n, r) => n + r.copies, 0);
  return {
    id: i.id, no: i.no, slug: i.slug, title: i.title, date: i.date,
    template: templateLabel(i), pages: imp.pageCount, copiesPrinted: copies,
    ean: copies ? codesFor(i, 1, copies).ean : null,
  };
}

export function newItem(assetId: string, w: number, h: number, label: string): Item {
  const c = { fit: "cover" as const, fx: 0.5, fy: 0.5, zoom: 1 };
  return { id: uid(), kind: w / h > 1.2 ? "pair" : "single", assetId, label, caption: "", feed: { ...c }, print: { ...c }, linked: true };
}

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

export const useStore = create<State>((set, get) => ({
  ready: false, root: "", view: "collection", collection: [], others: [], issue: null, past: [], future: [], saving: "saved",
  slide: 0, page: 1, feedView: "post", zineView: "flip", sheetSel: { sheet: 0, side: 0 }, tab: "CRP", fonts: [],
  settings: DEFAULT_SETTINGS, profile: DEFAULT_PROFILE, toast: null, sel: null, active: "zine", tool: "move",
  cams: { feed: { zoom: 1, x: 0, y: 0 }, zine: { zoom: 1, x: 0, y: 0 } }, showGrid: false, snap: true, picking: null,
  cropTarget: "print", cropImage: 1,

  async init() {
    const root = await be.zinesRoot();
    const collection = (await be.readJson<CollectionEntry[]>("collection.json")) ?? [];
    const settings = { ...DEFAULT_SETTINGS, ...((await be.readJson<Settings>("settings.json")) ?? {}) };
    const profile = { ...DEFAULT_PROFILE, ...((await be.readJson<Profile>("profile.json")) ?? {}) };
    set({ root, collection, settings, profile });
    const fonts = await loadAllFonts();
    set({ fonts, ready: true });
    const last = localStorage.getItem("trafika:last");
    if (last && collection.some((c) => c.slug === last)) await get().openIssue(last);
    void get().loadOthers();
  },
  setView(v) { set({ view: v }); },
  set(k, v) { set({ [k]: v } as Partial<State>); },
  notify(msg) { set({ toast: msg }); window.setTimeout(() => { if (get().toast === msg) set({ toast: null }); }, 4200); },

  update(fn, opts) {
    const cur = get().issue;
    if (!cur) return;
    const next = clone(cur);
    fn(next);
    if (next.bordersLinked) next.feedBorder = { ...next.zineBorder };
    set({ issue: next, ...(opts?.history === false ? {} : { past: [...get().past.slice(-149), cur], future: [] }), saving: "saving" });
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void get().saveNow(), 700);
  },
  undo() {
    const { past, issue, future } = get();
    if (!past.length || !issue) return;
    set({ issue: past[past.length - 1], past: past.slice(0, -1), future: [issue, ...future] });
    window.clearTimeout(saveTimer); saveTimer = window.setTimeout(() => void get().saveNow(), 700);
  },
  redo() {
    const { past, issue, future } = get();
    if (!future.length || !issue) return;
    set({ issue: future[0], future: future.slice(1), past: [...past, issue] });
    window.clearTimeout(saveTimer); saveTimer = window.setTimeout(() => void get().saveNow(), 700);
  },
  async saveNow() {
    const i = get().issue;
    if (!i) return;
    try {
      await be.writeJson(`${i.slug}/issue.json`, i);
      const e = entryOf(i);
      const collection = [...get().collection.filter((c) => c.id !== i.id), e].sort((a, b) => b.no - a.no);
      await be.writeJson("collection.json", collection);
      set({ collection, saving: "saved" });
    } catch (e) {
      set({ saving: "error" });
      get().notify(`Could not save: ${e}`);
    }
  },
  async createIssue() {
    await get().saveNow();
    const no = Math.max(0, ...get().collection.map((c) => c.no)) + 1;
    const i = newIssue(no);
    set({ issue: i, past: [], future: [], slide: 0, page: 1, view: "issue", zineView: "flip", sel: null });
    localStorage.setItem("trafika:last", i.slug);
    await get().saveNow();
    void get().loadOthers();
  },
  async openIssue(slug) {
    await get().saveNow();
    const raw = await be.readJson<unknown>(`${slug}/issue.json`);
    if (!raw) { get().notify(`Issue folder ${slug} has no issue.json`); return; }
    const i = migrate(raw);
    const oldHandle = (raw as { handle?: string }).handle;
    if (oldHandle && get().profile.handle === DEFAULT_PROFILE.handle && oldHandle !== DEFAULT_PROFILE.handle) void get().saveProfile({ ...get().profile, handle: oldHandle.replace(/^@/, "") });
    set({ issue: i, past: [], future: [], slide: 0, page: 1, view: "issue", sel: null });
    localStorage.setItem("trafika:last", slug);
    i.assets.forEach((a) => void ensurePreview(a));
    if ((raw as { version?: number }).version !== 2) {
      await be.writeJson(`${slug}/issue.v1-backup.json`, raw);
      await get().saveNow();
    }
  },
  async addPhotos(paths) {
    const i = get().issue;
    const imgs = paths.filter((p) => IMAGE_EXT.test(p));
    if (!i || !imgs.length) { if (paths.length) get().notify("Only JPEG, PNG and WebP photos can be added."); return; }
    try {
      const imported = await be.importPhotos(i.slug, imgs);
      const assets = await Promise.all(imported.map(async (im) => {
        const existing = get().issue!.assets.find((a) => a.hash === im.hash);
        if (existing) return existing;
        const { w, h } = await measure(await be.readBytes(im.file));
        return { id: uid(), file: im.file, hash: im.hash, name: im.name, w, h };
      }));
      get().update((d) => {
        for (const a of assets) {
          if (!d.assets.some((x) => x.id === a.id)) d.assets.push(a);
          d.items.push(newItem(a.id, a.w, a.h, a.name.replace(/\.[^.]+$/, "")));
        }
        d.pages = null;
      });
      assets.forEach((a) => void ensurePreview(a));
      get().notify(`Added ${assets.length} photo${assets.length === 1 ? "" : "s"} (full-res copies in ${i.slug}/assets)`);
    } catch (e) {
      get().notify(`Import failed: ${e}`);
    }
  },
  selectSlide(idx) {
    const i = get().issue;
    if (!i) return;
    const s = slidesOf(i)[idx];
    const p = s ? pageForSlide(i, s) : null;
    set({ slide: Math.max(0, idx), ...(p ? { page: p } : {}) });
  },
  selectPage(p) {
    const i = get().issue;
    if (!i) return;
    const s = slideForPage(i, p);
    set({ page: p, ...(s !== null ? { slide: s } : {}) });
  },
  setCam(p, c) { set({ cams: { ...get().cams, [p]: { ...get().cams[p], ...c } } }); },
  async saveSettings(s) { set({ settings: s }); await be.writeJson("settings.json", s); },
  async saveProfile(p) { set({ profile: p }); await be.writeJson("profile.json", p); },
  async reloadFonts() { set({ fonts: await loadAllFonts() }); },
  async loadOthers() {
    const cur = get().issue?.id;
    const out: Issue[] = [];
    for (const c of get().collection) {
      if (c.id === cur) continue;
      try {
        const raw = await be.readJson<unknown>(`${c.slug}/issue.json`);
        if (raw) { const i = migrate(raw); out.push(i); const f = i.items[0]; i.assets.filter((a) => a.id === f?.assetId || a.id === f?.assetId2).forEach((a) => void ensurePreview(a)); }
      } catch { /* skip unreadable */ }
    }
    set({ others: out });
  },
}));
