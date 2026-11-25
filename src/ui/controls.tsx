import { useEffect, useState } from "react";
import { fontMissing } from "../lib/backend";
import type { Border, BorderPreset } from "../model/types";
import { useStore } from "../store/store";

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return <div className="field"><label>{label}</label>{children}{hint && <span className="hint">{hint}</span>}</div>;
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return <div className="seg" role="group" aria-label={label}>{options.map(([v, l]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}</div>;
}

/**
 * Number field you can clear and retype. Commits on every valid number; on blur an empty or invalid
 * field snaps back. Arrow keys step (Shift = ×10), like design apps.
 */
export function NumInput({ value, onChange, min, max, step = 1, className = "input", label, suffix }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; className?: string; label?: string; suffix?: string;
}) {
  const [text, setText] = useState(String(round(value)));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(String(round(value))); }, [value, focus]);
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const commit = (s: string) => {
    const v = Number(s.replace(",", "."));
    if (s.trim() !== "" && Number.isFinite(v)) onChange(clamp(v));
  };
  return (
    <span className="num-wrap">
      <input className={className} inputMode="decimal" aria-label={label} value={text}
        onFocus={(e) => { setFocus(true); e.target.select(); }}
        onBlur={() => { setFocus(false); setText(String(round(value))); }}
        onChange={(e) => { setText(e.target.value); commit(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const d = (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            const v = clamp(round(value + d));
            onChange(v); setText(String(v));
          }
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }} />
      {suffix && <span className="num-suffix">{suffix}</span>}
    </span>
  );
}
const round = (v: number) => Math.round(v * 100) / 100;

const HEX = /^#[0-9a-f]{6}$/i;
/** Colour swatch + hex field + eyedropper (click any photo or page to sample). */
export function ColorField({ value, onChange, label }: { value: string; onChange: (hex: string) => void; label: string }) {
  const { picking, set, notify } = useStore();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const active = picking !== null && (picking as unknown as { owner?: string }).owner === label;
  return (
    <div className="color-field">
      <input type="color" className="swatch" aria-label={`${label} colour`} value={HEX.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} />
      <input className="input mono" aria-label={`${label} hex`} value={text} maxLength={7}
        onChange={(e) => { setText(e.target.value); if (HEX.test(e.target.value)) onChange(e.target.value.toUpperCase()); }}
        onBlur={() => setText(value)} />
      <button type="button" className={"icon-btn" + (active ? " on" : "")} title="Eyedropper (I): click a photo or page to pick a colour" aria-label="Eyedropper"
        onClick={() => {
          if (active) { set("picking", null); return; }
          const fn = Object.assign((hex: string) => onChange(hex), { owner: label });
          set("picking", fn);
          set("tool", "picker");
          notify("Eyedropper: click anywhere on a photo or page. Esc cancels.");
        }}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M11.5 1.5a2 2 0 0 1 2.8 2.8l-1.6 1.6.9.9-1.4 1.4-.9-.9-6 6H2.5v-2.8l6-6-.9-.9 1.4-1.4.9.9z" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
      </button>
    </div>
  );
}

export const LANGS: [string, string][] = [
  ["", "Auto"], ["en", "English"], ["mk", "Македонски"], ["sr", "Српски"], ["bg", "Български"], ["ru", "Русский"], ["uk", "Українська"],
  ["sq", "Shqip"], ["hr", "Hrvatski"], ["bs", "Bosanski"], ["sl", "Slovenščina"], ["el", "Ελληνικά"], ["tr", "Türkçe"],
  ["de", "Deutsch"], ["fr", "Français"], ["es", "Español"], ["it", "Italiano"], ["pt", "Português"], ["nl", "Nederlands"],
  ["pl", "Polski"], ["cs", "Čeština"], ["sk", "Slovenčina"], ["hu", "Magyar"], ["ro", "Română"], ["fi", "Suomi"], ["sv", "Svenska"],
  ["no", "Norsk"], ["da", "Dansk"], ["et", "Eesti"], ["lv", "Latviešu"], ["lt", "Lietuvių"], ["ka", "ქართული"], ["hy", "Հայերեն"],
  ["ar", "العربية"], ["he", "עברית"], ["fa", "فارسی"], ["ur", "اردو"], ["hi", "हिन्दी"], ["bn", "বাংলা"], ["th", "ไทย"], ["vi", "Tiếng Việt"],
  ["id", "Bahasa Indonesia"], ["ja", "日本語"], ["ko", "한국어"], ["zh-Hans", "中文 (简体)"], ["zh-Hant", "中文 (繁體)"],
];
/** Any language. Type freely with your system keyboard layout; this only tells the renderer which forms and direction to use. */
export function LangSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const known = LANGS.some(([v]) => v === value);
  return (
    <Field label="Language" hint="Type in any script with your keyboard layout. This sets letter forms and right-to-left.">
      <select className="select" value={known ? value : "__other"} onChange={(e) => onChange(e.target.value === "__other" ? value || "x" : e.target.value)}>
        {LANGS.map(([v, l]) => <option key={v} value={v}>{l}{v ? ` (${v})` : ""}</option>)}
        <option value="__other">Other code…</option>
      </select>
      {!known && <input className="input" placeholder="BCP 47 code, e.g. am, km, my" value={value} onChange={(e) => onChange(e.target.value.trim())} />}
    </Field>
  );
}

/** Font picker grouped by source, with a live check that the font has every character you typed. */
export function FontSelect({ value, onChange, label = "Font", text = "" }: { value: string; onChange: (f: string) => void; label?: string; text?: string }) {
  const fonts = useStore((s) => s.fonts);
  const cur = fonts.find((f) => f.family === value);
  const [missing, setMissing] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(async () => {
      if (!text.trim() || !cur) { setMissing([]); return; }
      const m = cur.source === "system" ? await fontMissing(value, text).catch(() => []) : missingInFaces(value, text);
      if (alive) setMissing(m);
    }, 250);
    return () => { alive = false; window.clearTimeout(t); };
  }, [value, text, cur]);
  const groups: [string, string][] = [["bundled", "Bundled"], ["imported", "Your fonts"], ["system", "Installed on this computer"]];
  return (
    <Field label={label} hint={missing.length ? <span className="warn">No glyph for: {missing.slice(0, 12).join(" ")} (a fallback font draws them)</span> : cur ? `${cur.latin ? "Latin ✓" : "Latin ✗"}  ${cur.macedonian ? "Macedonian ✓" : cur.cyrillic ? "Cyrillic ✓" : "Cyrillic ✗"}` : "Font not found on this computer"}>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)} style={{ fontFamily: `"${value}"` }}>
        {!cur && <option value={value}>{value} (missing)</option>}
        {groups.map(([src, name]) => {
          const list = fonts.filter((f) => f.source === src);
          return list.length ? <optgroup key={src} label={name}>{list.map((f) => <option key={f.family} value={f.family}>{f.family}</option>)}</optgroup> : null;
        })}
      </select>
    </Field>
  );
}

/** For fonts loaded by the app (bundled/imported), read their unicode ranges. */
function missingInFaces(family: string, text: string): string[] {
  const ranges: [number, number][] = [];
  let any = false;
  document.fonts.forEach((f) => {
    if (f.family.replace(/"/g, "") !== family) return;
    any = true;
    for (const part of f.unicodeRange.split(",")) {
      const m = /U\+([0-9A-F?]+)(?:-([0-9A-F]+))?/i.exec(part.trim());
      if (!m) continue;
      const a = parseInt(m[1].replace(/\?/g, "0"), 16), b = m[2] ? parseInt(m[2], 16) : m[1].includes("?") ? parseInt(m[1].replace(/\?/g, "F"), 16) : a;
      ranges.push([a, b]);
    }
  });
  if (!any) return [];
  const out = new Set<string>();
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80 || /\s/.test(ch)) continue;
    if (!ranges.some(([a, b]) => c >= a && c <= b)) out.add(ch);
  }
  return [...out];
}

const PRESETS: [BorderPreset, string][] = [["none", "None / full bleed"], ["mat", "Mat"], ["caption", "Caption strip"], ["film", "Film frame"], ["letterbox", "Letterbox"]];
export function BorderPicker({ value, onChange, compact, disabled }: { value: Border; onChange: (b: Border) => void; compact?: boolean; disabled?: boolean }) {
  if (compact) return (
    <select className="select" aria-label="Border" value={value.preset} disabled={disabled} onChange={(e) => onChange({ ...value, preset: e.target.value as BorderPreset })}>
      {PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <select className="select" aria-label="Border preset" value={value.preset} disabled={disabled} onChange={(e) => onChange({ ...value, preset: e.target.value as BorderPreset })}>
        {PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {(value.preset === "mat" || value.preset === "caption") && (
        <Seg label="Mat colour" value={value.color} onChange={(c) => onChange({ ...value, color: c })} options={[["white", "White"], ["paper", "Paper"], ["black", "Black"]]} />
      )}
      {value.preset !== "none" && value.preset !== "letterbox" && (
        <Field label={`Size ${value.size}%`}><input className="range" type="range" min={1} max={15} step={0.5} value={value.size} disabled={disabled} onChange={(e) => onChange({ ...value, size: Number(e.target.value) })} /></Field>
      )}
    </div>
  );
}
