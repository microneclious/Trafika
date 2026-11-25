import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { pad3 } from "../engine/codes";
import { type GuideMode, RATIOS, impOf } from "../engine/layout";
import { exportCalibration, exportIG, exportPrint, recordPrintRun } from "../export/exports";
import { importFont, listPrinters, openLocal, printFile } from "../lib/backend";
import { useStore } from "../store/store";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="panel-head"><h2>{title}</h2><span className="spacer" /><button type="button" className="btn btn-sm" onClick={onClose}>Close</button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ export + print

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { issue, settings, notify, update } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<string[]>([]);
  const printed = issue ? issue.printRuns.reduce((n, r) => n + r.copies, 0) : 0;
  const [copies, setCopies] = useState(Math.max(1, (issue?.plannedCopies ?? 1) - printed) || 1);
  const [guides, setGuides] = useState<GuideMode>("marks");
  const [paperNote, setPaperNote] = useState("120 gsm matte");
  const [printers, setPrinters] = useState<string[]>([]);
  const [printer, setPrinter] = useState(settings.printer);
  const [lastPdf, setLastPdf] = useState<string | null>(null);
  useEffect(() => { listPrinters().then(setPrinters).catch(() => setPrinters([])); }, []);
  if (!issue) return null;
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e) { notify(`${label} failed: ${e}`); } finally { setBusy(null); }
  };
  const first = printed + 1;
  const total = Math.max(issue.plannedCopies, printed + copies);
  const imp = impOf(issue);
  const t = imp.t;
  return (
    <Modal title={`Export · No. ${pad3(issue.no)}`} onClose={onClose}>
      <span className="code">Instagram</span>
      <p className="note-line">Every slide as a {RATIOS[issue.feedRatio].px.join(" × ")} sRGB JPEG with no camera data, plus caption.txt. The caption is copied to the clipboard. You post it yourself.</p>
      <div className="row">
        <button type="button" className="btn btn-primary" disabled={!!busy || !issue.items.length} onClick={() => run("IG export", async () => {
          const r = await exportIG(issue);
          setOut(r.files);
          notify(`Saved ${r.files.length} slides to ${issue.slug}/exports/ig${r.copied ? ", caption copied" : ""}`);
        })}>{busy === "IG export" ? "Exporting…" : "Export IG slides"}</button>
        <button type="button" className="btn" onClick={() => void openLocal(`${issue.slug}/exports/ig`)}>Open folder</button>
      </div>
      <hr className="sep" />
      <span className="code">Print · {t.code} on {imp.paper}{imp.trimmed ? ", trimmed" : ""}, {imp.sheets > 1 ? `${imp.sheets} sheets, ` : ""}{t.sides === 1 ? "one side" : `both sides (flip on ${t.duplex ?? "short"} edge)`}</span>
      <div className="grid3">
        <div className="field"><label>Copies</label><input className="input" type="number" min={1} max={200} value={copies} onChange={(e) => setCopies(Math.max(1, Number(e.target.value)))} /></div>
        <div className="field"><label>Serials</label><span className="note-line">{String(first).padStart(2, "0")} to {String(first + copies - 1).padStart(2, "0")} of {String(total).padStart(2, "0")}</span></div>
        <div className="field"><label>Paper</label><input className="input" value={paperNote} onChange={(e) => setPaperNote(e.target.value)} /></div>
      </div>
      <div className="field"><label>Guides on the print</label>
        <div className="seg" role="group" aria-label="Guides">
          {([["marks", "Small marks (cut away)"], ["full", "Full fold lines"], ["none", "None"]] as const).map(([v, l]) =>
            <button key={v} type="button" aria-pressed={guides === v} onClick={() => setGuides(v)}>{l}</button>)}
        </div></div>
      <p className="note-line">Print brightness lift: +{Math.round(settings.printLift * 100)}% (Settings). Photos only; IG exports are never lifted.</p>
      <div className="row">
        <button type="button" className="btn btn-primary" disabled={!!busy || !issue.items.length} onClick={() => run("Print PDF", async () => {
          const rel = await exportPrint(issue, settings, { copies, firstSerial: first, total, guides });
          const r = await recordPrintRun(issue, copies, first, paperNote);
          update((d) => { d.printRuns.push(r); if (d.plannedCopies < total) d.plannedCopies = total; });
          setLastPdf(rel);
          notify(`Saved ${rel}. Logged ${copies} copies.`);
        })}>{busy === "Print PDF" ? "Rendering at 300 DPI…" : `Make print PDF (${copies} ${copies === 1 ? "copy" : "copies"})`}</button>
        <button type="button" className="btn" disabled={!!busy} onClick={() => run("Test print", async () => {
          const rel = await exportPrint(issue, settings, { copies: 1, firstSerial: 1, total: 1, guides: "full", test: true });
          setLastPdf(rel);
          notify(`Saved numbered test print: ${rel}`);
        })}>Numbered test print</button>
        <button type="button" className="btn" onClick={() => void openLocal(`${issue.slug}/exports/print`)}>Open folder</button>
      </div>
      {lastPdf && (
        <div className="row">
          <select className="select" value={printer} onChange={(e) => setPrinter(e.target.value)} aria-label="Printer">
            <option value="">Default printer</option>{printers.map((p) => <option key={p}>{p}</option>)}
          </select>
          <button type="button" className="btn" disabled={!!busy} onClick={() => run("Print", async () => {
            const job = await printFile(lastPdf, printer || null, t.sides > 1 && !lastPdf.includes("calibration") ? (t.duplex ?? "short") : null);
            notify(`Sent to printer: ${job || "ok"}`);
          })}>Print {lastPdf.split("/").pop()} (actual size)</button>
          <button type="button" className="btn" onClick={() => void openLocal(lastPdf)}>Open PDF</button>
        </div>
      )}
      {out.length > 0 && <p className="note-line">{out.map((f) => f.split("/").pop()).join(", ")}</p>}
    </Modal>
  );
}

// ------------------------------------------------------------ fonts

export function FontsDialog({ onClose }: { onClose: () => void }) {
  const { fonts, reloadFonts, notify } = useStore();
  const [filter, setFilter] = useState("");
  const [sample, setSample] = useState("Trafika Трафика ЃЌЅЉЊЏЈ 012");
  const add = async () => {
    const r = await open({ multiple: true, title: "Add font files", filters: [{ name: "Fonts", extensions: ["ttf", "otf", "woff", "woff2"] }] });
    if (!r) return;
    const files = Array.isArray(r) ? r : [r];
    const done: string[] = [];
    for (const f of files) {
      try { const info = await importFont(f); done.push(`${info.family} ${info.style}`); } catch (e) { notify(`${f.split("/").pop()}: ${e}`); }
    }
    await reloadFonts();
    if (done.length) notify(`Added ${done.join(", ")}`);
  };
  const shown = fonts.filter((f) => !filter || f.family.toLowerCase().includes(filter.toLowerCase()));
  return (
    <Modal title="Fonts" onClose={onClose}>
      <p className="note-line">Add any .ttf, .otf or .woff2 file: Latin, Cyrillic or both. It's copied into ~/Zines/fonts so your issues keep working. Fonts installed on this computer show up too.</p>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={() => void add()}>Add font files…</button>
        <input className="input" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <input className="input" style={{ flex: 1 }} aria-label="Sample text" value={sample} onChange={(e) => setSample(e.target.value)} />
      </div>
      <table className="font-table">
        <tbody>
          {shown.slice(0, 300).map((f) => (
            <tr key={f.family}>
              <td>{f.family}<br /><span className="code">{f.source === "imported" ? "yours" : f.source}</span></td>
              <td><span className={"badge " + (f.latin ? "ok" : "no")}>Latin</span> <span className={"badge " + (f.macedonian ? "ok" : f.cyrillic ? "warn" : "no")}>{f.macedonian ? "МК" : "Cyr"}</span></td>
              <td className="sample" style={{ fontFamily: `"${f.family}"` }} lang="mk">{sample}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length > 300 && <p className="note-line">Showing 300 of {shown.length}. Filter to find more.</p>}
    </Modal>
  );
}

// ------------------------------------------------------------ settings

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { settings, saveSettings, issue, notify } = useStore();
  const [s, setS] = useState(settings);
  const m = s.margins;
  const num = (v: string) => Math.max(0, Math.min(30, Number(v) || 0));
  return (
    <Modal title="Printer" onClose={onClose}>
      <p className="note-line">Print the calibration page with scaling off, read the margins off the rulers, then type them here. They're hatched red in the Sheet view.</p>
      <div className="row">
        <button type="button" className="btn" onClick={async () => {
          try { const rel = await exportCalibration(issue?.template.paper ?? "A4"); notify(`Saved ${rel}`); void openLocal(rel); } catch (e) { notify(`${e}`); }
        }}>Make calibration page ({issue?.template.paper ?? "A4"})</button>
      </div>
      <div className="grid2">
        {(["top", "right", "bottom", "left"] as const).map((k) => (
          <div key={k} className="field"><label>Margin {k} mm</label><input className="input" type="number" step={0.5} value={m[k]} onChange={(e) => setS({ ...s, margins: { ...m, [k]: num(e.target.value) } })} /></div>
        ))}
        <div className="field"><label>Duplex offset x mm</label><input className="input" type="number" step={0.5} value={s.duplexOffset.x} onChange={(e) => setS({ ...s, duplexOffset: { ...s.duplexOffset, x: Number(e.target.value) } })} /></div>
        <div className="field"><label>Duplex offset y mm</label><input className="input" type="number" step={0.5} value={s.duplexOffset.y} onChange={(e) => setS({ ...s, duplexOffset: { ...s.duplexOffset, y: Number(e.target.value) } })} /></div>
      </div>
      <div className="field"><label>Print brightness lift +{Math.round(s.printLift * 100)}%</label>
        <input className="range" type="range" min={0} max={0.4} step={0.01} value={s.printLift} onChange={(e) => setS({ ...s, printLift: Number(e.target.value) })} />
        <span className="hint">Prints come out darker than screens. Lifts shadows and mid-tones of photos in print files only.</span></div>
      <div className="row"><button type="button" className="btn btn-primary" onClick={async () => { await saveSettings(s); onClose(); }}>Save</button></div>
    </Modal>
  );
}
