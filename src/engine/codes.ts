// Barcode numbers (ZINE_SPEC §6). EAN-13 in the GS1 040–049 company-internal range:
// 049 + YY + IIII (issue) + CCC (copy) + check digit. Never 977/978/979.
import type { Issue } from "../model/types";

export function eanCheckDigit(d12: string): number {
  if (!/^\d{12}$/.test(d12)) throw new Error("need 12 digits");
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(d12[i]) * (i % 2 ? 3 : 1);
  return (10 - (s % 10)) % 10;
}

export function withCheck(d12: string): string {
  return d12 + eanCheckDigit(d12);
}

export function isValidEan13(d13: string): boolean {
  return /^\d{13}$/.test(d13) && eanCheckDigit(d13.slice(0, 12)) === Number(d13[12]);
}

/** Two-digit year from a typed date like 23.11.2026 / 2026-11-23, else the current year. */
export function yearOf(date: string, now = new Date()): number {
  const m = /(\d{4})/.exec(date);
  return (m ? Number(m[1]) : now.getFullYear()) % 100;
}

export function collectionEan(yy: number, issue: number, copy: number): string {
  const d12 = `049${String(yy).padStart(2, "0")}${String(issue % 10000).padStart(4, "0")}${String(copy % 1000).padStart(3, "0")}`;
  return withCheck(d12);
}

export interface Decoded { yy: number; issue: number; copy: number }
/** Read a collection number back (search by scanning). Accepts 10–13 digit prefixes. */
export function parseCollectionEan(digits: string): Partial<Decoded> | null {
  const d = digits.replace(/\D/g, "");
  if (!d.startsWith("049") || d.length < 5) return null;
  const out: Partial<Decoded> = { yy: Number(d.slice(3, 5)) };
  if (d.length >= 9) out.issue = Number(d.slice(5, 9));
  if (d.length >= 12) out.copy = Number(d.slice(9, 12));
  return out;
}

export type EanWarning = "reserved-isbn" | "reserved-issn" | "not-internal" | null;
export function eanWarning(d: string): EanWarning {
  if (/^97[89]/.test(d)) return "reserved-isbn";
  if (/^977/.test(d)) return "reserved-issn";
  if (!/^04\d/.test(d)) return "not-internal";
  return null;
}

export interface CodeSet {
  ean: string | null;
  addon: string | null;
  qr: string | null;
  songQr: string | null;
  human: string;
  serial: string;
}

export function pad3(n: number) { return String(n).padStart(3, "0"); }
export function serialText(no: number, copy: number, total: number) {
  return `${pad3(no)} · ${String(copy).padStart(2, "0")}/${String(total).padStart(2, "0")}`;
}

export function codesFor(issue: Issue, copy: number, total: number): CodeSet {
  const c = issue.codes;
  let ean: string | null = null;
  if (c.ean === "collection") ean = collectionEan(yearOf(issue.date), issue.no, copy);
  else if (c.ean === "custom" && /^\d{12}$/.test(c.eanCustom)) ean = withCheck(c.eanCustom);
  else if (c.ean === "custom" && isValidEan13(c.eanCustom)) ean = c.eanCustom;
  let addon: string | null = null;
  if (ean && c.addon === "issue") addon = String(issue.no % 100).padStart(2, "0");
  else if (ean && c.addon === "custom" && /^\d{2}$/.test(c.addonCustom)) addon = c.addonCustom;
  const human = ["FIXER", `No. ${pad3(issue.no)}`, issue.date, `${String(copy).padStart(2, "0")}/${String(total).padStart(2, "0")}`]
    .filter(Boolean).join(" // ");
  return {
    ean, addon,
    qr: c.qr.trim() || null,
    songQr: c.songUrl.trim() || null,
    human,
    serial: serialText(issue.no, copy, total),
  };
}
