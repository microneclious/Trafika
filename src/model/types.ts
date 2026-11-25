// Trafika data model (v2). Everything is typed by the user; nothing is read from photo metadata.

export type Fit = "cover" | "contain";
export interface Crop {
  fit: Fit;
  /** focal point / window centre in the source, 0..1 */
  fx: number;
  fy: number;
  /** zoom into the photo, >= 1 (1 = the largest window that fits) */
  zoom: number;
}

export interface Asset {
  id: string;
  /** relative to ~/Zines */
  file: string;
  hash: string;
  name: string;
  w: number;
  h: number;
}

/**
 * One entry in the carousel sequence.
 * single = one photo on one slide/page; pair = one wide photo split across two slides/pages;
 * stack = two photos stacked on one slide/page.
 */
export interface Item {
  id: string;
  kind: "single" | "pair" | "stack";
  assetId: string;
  /** second photo for a stack */
  assetId2?: string;
  label: string;
  caption: string;
  feed: Crop;
  print: Crop;
  feed2?: Crop;
  print2?: Crop;
  /** gap between stacked photos, % of the short side (0 = touching) */
  stackGap?: number;
  stackGapColor?: string;
  /** feed and print crops move together */
  linked: boolean;
}

export type BorderPreset = "none" | "mat" | "caption" | "film" | "letterbox";
export type BorderColor = "white" | "black" | "paper";
export interface Border {
  preset: BorderPreset;
  color: BorderColor;
  /** border size, % of the short side */
  size: number;
}

export type TextAlign = "left" | "center" | "right";
export type TextFx = "none" | "outline" | "halftone" | "xerox" | "riso";
/** Text whose content comes from the issue (so serials change per printed copy). */
export type Bind = "title" | "subtitle" | "no" | "date" | "note" | "details" | "human" | "serial";

/** Anything placed on a page or slide: text, a barcode, a QR code, or a solid band. */
export interface Layer {
  id: string;
  kind: "text" | "ean" | "qr" | "band";
  name?: string;
  /** position and size, % of the page/slide (top-left corner) */
  x: number;
  y: number;
  w: number;
  /** height % (bands and codes; text grows to fit) */
  h: number;
  /** degrees, around the box centre */
  rotation: number;
  hidden?: boolean;
  // text
  text?: string;
  bind?: Bind;
  font?: string;
  weight?: number;
  size?: number;
  color?: string;
  align?: TextAlign;
  lineHeight?: number;
  tracking?: number;
  lang?: string;
  fx?: TextFx;
  // qr
  qr?: "custom" | "song";
  qrData?: string;
  // codes
  fg?: string;
  bg?: string;
  // band
  fill?: string;
}

export interface BackPage {
  note: string;
  location: string;
  songTitle: string;
  songArtist: string;
  fields: { label: string; value: string }[];
}

/** What the scannable codes contain. */
export interface Codes {
  ean: "collection" | "custom" | "none";
  /** 12 digits typed by you (check digit is computed), for ean = custom */
  eanCustom: string;
  addon: "issue" | "custom" | "none";
  addonCustom: string;
  /** QR content: a link, text, anything. Scanning it opens/shows this. */
  qr: string;
  qrLabel: string;
  /** song link QR */
  songUrl: string;
}

export type PageAssign =
  | { kind: "item"; itemId: string; half?: "L" | "R" }
  | { kind: "blank" }
  | { kind: "text" };

export interface PrintRun {
  date: string;
  copies: number;
  firstSerial: number;
  template: string;
  paper: string;
  note: string;
}

export type FeedRatio = "1:1" | "4:5" | "3:4" | "1.91:1";
export type Paper = "A4" | "A3" | "Letter";

export interface Issue {
  version: 2;
  id: string;
  no: number;
  slug: string;
  title: string;
  subtitle: string;
  /** typed date shown on the zine */
  date: string;
  caption: string;
  feedRatio: FeedRatio;
  assets: Asset[];
  items: Item[];
  feedBorder: Border;
  zineBorder: Border;
  bordersLinked: boolean;
  template: { id: string; paper: Paper; trimmed: boolean; pages: number };
  /** null = auto-flow from the carousel order */
  pages: (PageAssign | null)[] | null;
  /** layers keyed by "zine:<page>", "feed:<slide index>" */
  layers: Record<string, Layer[]>;
  pageNumbers: boolean;
  cover: { itemId: string | null; wraparound: boolean; preset: string };
  /** full-sheet poster on the back of the sheet (T2) */
  posterItemId: string | null;
  grid: string;
  back: BackPage;
  codes: Codes;
  printRuns: PrintRun[];
  plannedCopies: number;
}

export interface CollectionEntry {
  id: string;
  no: number;
  slug: string;
  title: string;
  date: string;
  template: string;
  pages: number;
  copiesPrinted: number;
  ean: string | null;
}

export interface Profile {
  handle: string;
  name: string;
  bio: string;
  /** relative to ~/Zines */
  avatar: string | null;
  followers: string;
  following: string;
}

export interface Settings {
  /** printer unprintable margins in mm */
  margins: { top: number; right: number; bottom: number; left: number };
  duplexOffset: { x: number; y: number };
  printLift: number;
  printer: string;
}
