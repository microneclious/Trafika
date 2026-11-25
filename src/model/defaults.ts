import { impose } from "../engine/geometry";
import { COVER_BINDS, COVER_PRESETS, backLayers } from "../engine/presets";
import type { Border, Crop, Issue, Layer, Profile, Settings } from "./types";

export const uid = () => Math.random().toString(36).slice(2, 10);
export const CROP: Crop = { fit: "cover", fx: 0.5, fy: 0.5, zoom: 1 };
export const FEED_BORDER: Border = { preset: "none", color: "white", size: 4 };
export const ZINE_BORDER: Border = { preset: "mat", color: "paper", size: 5 };

const MK: Record<string, string> = { а:"a",б:"b",в:"v",г:"g",д:"d",ѓ:"gj",е:"e",ж:"zh",з:"z",ѕ:"dz",и:"i",ј:"j",к:"k",л:"l",љ:"lj",м:"m",н:"n",њ:"nj",о:"o",п:"p",р:"r",с:"s",т:"t",ќ:"kj",у:"u",ф:"f",х:"h",ц:"c",ч:"ch",џ:"dzh",ш:"sh",й:"j",ы:"y",э:"e",ю:"ju",я:"ja",щ:"sht",ъ:"a",ь:"" };
export function slugify(no: number, title: string) {
  const ascii = title.toLowerCase().split("").map((c) => MK[c] ?? c).join("")
    .normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 40);
  return `${String(no).padStart(3, "0")}${ascii ? "-" + ascii : ""}`;
}

export function today() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

/** Cover layers from a preset, keeping any of your own (non-title) layers already on the cover. */
export function applyCoverPreset(issue: Issue, presetId: string, keep: Layer[] = []): Layer[] {
  const imp = impose(issue.template);
  const p = COVER_PRESETS.find((x) => x.id === presetId) ?? COVER_PRESETS[0];
  const own = keep.filter((l) => !(l.bind && COVER_BINDS.has(l.bind)) && !(l.kind === "band" && l.name === "Band"));
  const prev = keep.find((l) => l.bind === "title");
  const prevSub = keep.find((l) => l.bind === "subtitle");
  return [...p.make({ W: imp.pageW, H: imp.pageH, titleFont: prev?.font, subFont: prevSub?.font }), ...own];
}

export function newIssue(no: number, title = "Untitled"): Issue {
  const i: Issue = {
    version: 2, id: uid(), no, slug: slugify(no, title), title, subtitle: "", date: today(), caption: "", feedRatio: "3:4",
    assets: [], items: [],
    feedBorder: { ...FEED_BORDER }, zineBorder: { ...ZINE_BORDER }, bordersLinked: false,
    template: { id: "mini-8-onecut", paper: "A4", trimmed: true, pages: 8 },
    pages: null, layers: {}, pageNumbers: false,
    cover: { itemId: null, wraparound: false, preset: "band-bottom" },
    posterItemId: null, grid: "margins",
    back: { note: "", location: "", songTitle: "", songArtist: "", fields: [] },
    codes: { ean: "collection", eanCustom: "", addon: "issue", addonCustom: "", qr: "", qrLabel: "", songUrl: "" },
    printRuns: [], plannedCopies: 5,
  };
  const imp = impose(i.template);
  i.layers["zine:front"] = applyCoverPreset(i, "band-bottom");
  i.layers["zine:back"] = backLayers({ W: imp.pageW, H: imp.pageH });
  return i;
}

export function newText(lang = ""): Layer {
  return { id: uid(), kind: "text", name: "Text", text: "Text", font: "IBM Plex Sans", weight: 500, size: 10, color: "#FFFFFF", align: "left", x: 8, y: 8, w: 60, h: 0, rotation: 0, tracking: 0, lineHeight: 1.2, lang, fx: "none" };
}

/** Bring older saved issues up to the current format. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrate(raw: any): Issue {
  if (raw.version === 2) return raw as Issue;
  const v1 = raw;
  const base = newIssue(v1.no, v1.title);
  const i: Issue = {
    ...base,
    id: v1.id, slug: v1.slug, title: v1.cover?.title ?? v1.title, subtitle: v1.cover?.subtitle ?? "", date: v1.date, caption: v1.caption ?? "",
    assets: v1.assets ?? [],
    items: (v1.items ?? []).map((it: Issue["items"][number]) => ({
      ...it,
      feed: { ...it.feed, fit: it.feed.fit === "contain" ? "contain" : "cover" },
      print: { ...it.print, fit: it.print.fit === "contain" ? "contain" : "cover" },
    })),
    feedBorder: v1.feedBorder, zineBorder: v1.zineBorder, bordersLinked: !!v1.bordersLinked,
    template: { ...v1.template, pages: 8 },
    pages: v1.pages ?? null, pageNumbers: !!v1.pageCaptions,
    cover: { itemId: v1.cover?.itemId ?? null, wraparound: !!v1.cover?.wraparound, preset: v1.cover?.layout === "top" ? "band-top" : v1.cover?.layout === "spine" ? "spine" : v1.cover?.layout === "giant" ? "giant" : v1.cover?.layout === "center" ? "centred" : "band-bottom" },
    back: { note: v1.back?.note ?? "", location: v1.back?.location ?? "", songTitle: v1.back?.songTitle ?? "", songArtist: v1.back?.songArtist ?? "", fields: v1.back?.fields ?? [] },
    codes: v1.codes ?? base.codes, printRuns: v1.printRuns ?? [], plannedCopies: v1.plannedCopies ?? 5,
    layers: {},
  };
  // cover from the old layout + font
  const front = applyCoverPreset(i, i.cover.preset);
  for (const l of front) if (l.bind === "title" && v1.cover) Object.assign(l, { font: v1.cover.font, weight: v1.cover.weight, lang: v1.cover.lang === "mk" ? "mk" : "", fx: ["outline", "halftone", "xerox", "riso"].includes(v1.cover.effect) ? v1.cover.effect : "none" });
  if (v1.cover && v1.cover.effect !== "knockout") for (const l of front) if (l.kind === "band") l.hidden = true;
  const imp = impose(i.template);
  const back = backLayers({ W: imp.pageW, H: imp.pageH });
  for (const l of back) if (l.bind === "note" && v1.back) Object.assign(l, { font: v1.back.noteFont, size: v1.back.noteSize, lang: v1.back.noteLang === "mk" ? "mk" : "" });
  i.layers["zine:front"] = front;
  i.layers["zine:back"] = back;
  // old free text boxes become text layers
  for (const [key, boxes] of Object.entries((v1.texts ?? {}) as Record<string, Array<Record<string, unknown>>>)) {
    const m = /^zine:(\d+)$/.exec(key);
    const k = m ? (Number(m[1]) === 1 ? "zine:front" : Number(m[1]) === 8 ? "zine:back" : key) : key;
    const conv = boxes.filter((b) => String(b.text ?? "").trim()).map((b) => ({ ...newText(), ...b, kind: "text", h: 0, lang: b.lang === "mk" ? "mk" : "", fx: "none" }) as Layer);
    i.layers[k] = [...(i.layers[k] ?? []), ...conv];
  }
  return i;
}

export const DEFAULT_SETTINGS: Settings = { margins: { top: 4, right: 4, bottom: 4, left: 4 }, duplexOffset: { x: 0, y: 0 }, printLift: 0.12, printer: "" };
export const DEFAULT_PROFILE: Profile = { handle: "your.handle", name: "", bio: "", avatar: null, followers: "", following: "" };
