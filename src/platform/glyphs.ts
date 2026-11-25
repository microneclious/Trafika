// Glyph coverage for a loaded font, measured in the browser: draw a character with the font and two
// different fallbacks. If the font has the glyph the widths match; if not, the fallbacks show through.

let ctx: CanvasRenderingContext2D | null = null;
const c2d = () => (ctx ??= document.createElement("canvas").getContext("2d"));

export function hasGlyph(family: string, ch: string): boolean {
  const g = c2d();
  if (!g) return true;
  const w = (fb: string) => { g.font = `48px "${family}", ${fb}`; return g.measureText(ch).width; };
  const a = w("monospace"), b = w("serif"), c = w("cursive");
  return Math.abs(a - b) < 0.01 && Math.abs(a - c) < 0.01;
}

export function missingGlyphs(family: string, text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const ch of text) {
    if (/\s/.test(ch) || ch.charCodeAt(0) < 0x80 || seen.has(ch)) continue;
    seen.add(ch);
    if (seen.size > 200) break;
    if (!hasGlyph(family, ch)) out.push(ch);
  }
  return out;
}

const all = (family: string, s: string) => [...s].every((ch) => hasGlyph(family, ch));

/** language codes in the same style fontconfig reports (en, ru, mk), so both platforms share one check */
export function langsOf(family: string): string[] {
  const langs: string[] = [];
  if (all(family, "AaZzÉéßÆø")) langs.push("en");
  if (all(family, "АаЖжЯяЮю")) langs.push("ru");
  if (all(family, "ЃѓЌќЅѕЉљЊњЏџЈј")) langs.push("mk");
  return langs;
}
