import { useEffect, useState } from "react";
import { autoFlow, impOf, pageChecks, slidesOf } from "./engine/layout";
import { platform } from "./platform";
import { type Tool, useStore, type View } from "./store/store";
import { Collection } from "./ui/Collection";
import { ExportDialog, FontsDialog, SettingsDialog } from "./ui/Dialogs";
import { Feed } from "./ui/Feed";
import { Inspector, useLayerKey } from "./ui/Inspector";
import { Rail } from "./ui/Rail";
import { Zine } from "./ui/Zine";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";
import "./styles/extra.css";
import "./render/fonts";

const TOOLS: { id: Tool; key: string; name: string; d: string }[] = [
  { id: "move", key: "V", name: "Move / select", d: "M5 3l13 8-6 1.5L9 19z" },
  { id: "hand", key: "H", name: "Hand: pan (or hold Space)", d: "M8 12V6a1.5 1.5 0 0 1 3 0v5V4.5a1.5 1.5 0 0 1 3 0V11V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 6-6 6s-5-2-6.5-4.5L3 12a1.5 1.5 0 0 1 2.5-1.5z" },
  { id: "text", key: "T", name: "Text: click a page to add", d: "M5 5h14M12 5v14M9 19h6" },
  { id: "picker", key: "I", name: "Eyedropper: pick a colour for the field you choose", d: "M14.5 4.5a2.1 2.1 0 0 1 3 3L15.8 9.2l1 1-1.5 1.5-1-1L8 17H6v-2l6.3-6.3-1-1 1.5-1.5 1 1z" },
];

export default function App() {
  const s = useStore();
  const [dialog, setDialog] = useState<null | "export" | "fonts" | "settings">(null);
  const [error, setError] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    s.init().catch((e) => setError(String(e)));
    return platform.onDrop((e) => {
      if (e.type === "over") setDropping(true);
      else if (e.type === "leave") setDropping(false);
      else {
        setDropping(false);
        const st = useStore.getState();
        if (!st.issue || st.view === "collection") { st.notify("Open or create an issue first, then drop photos on it."); return; }
        void st.addPhotos(e.sources);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const st = useStore.getState();
      const typing = (e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable]");
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { if (!typing) { e.preventDefault(); st.undo(); } return; }
      if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { if (!typing) { e.preventDefault(); st.redo(); } return; }
      if (mod && (e.key === "0" || e.key === "1")) { e.preventDefault(); st.setCam(st.active, { zoom: 1, x: 0, y: 0 }); return; }
      if (mod && (e.key === "=" || e.key === "+" || e.key === "-")) { e.preventDefault(); const c = st.cams[st.active]; st.setCam(st.active, { zoom: Math.min(8, Math.max(0.25, c.zoom * (e.key === "-" ? 1 / 1.25 : 1.25))) }); return; }
      if (typing || mod) return;
      if (e.key === "Escape") { st.set("picking", null); st.set("sel", null); if (st.tool === "picker") st.set("tool", "move"); return; }
      const tool = TOOLS.find((t) => t.key.toLowerCase() === e.key.toLowerCase());
      if (tool && tool.id !== "picker") { st.set("tool", tool.id); return; }
      if (e.key.toLowerCase() === "g") { st.set("showGrid", !st.showGrid); return; }
      if (st.sel && (e.key === "Delete" || e.key === "Backspace")) {
        const { key, id } = st.sel;
        st.update((d) => { d.layers[key] = (d.layers[key] ?? []).filter((l) => l.id !== id); });
        st.set("sel", null);
        return;
      }
      if (st.sel && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 2 : 0.25;
        const [dx, dy] = e.key === "ArrowLeft" ? [-step, 0] : e.key === "ArrowRight" ? [step, 0] : e.key === "ArrowUp" ? [0, -step] : [0, step];
        const { key, id } = st.sel;
        st.update((d) => { const l = (d.layers[key] ?? []).find((x) => x.id === id); if (l) { l.x = Math.round((l.x + dx) * 100) / 100; l.y = Math.round((l.y + dy) * 100) / 100; } });
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  if (error) return <div className="shell"><div className="stage"><p className="note-line">{error}</p></div></div>;
  if (!s.ready) return <div className="shell"><div className="stage"><span className="code">Loading fonts and collection…</span></div></div>;

  const issue = s.issue;
  const nav: [View, string][] = [["issue", "Issue"], ["collection", "Collection"]];
  return (
    <div className={"shell tool-" + s.tool}>
      <header className="topbar">
        <span className="wordmark">TRAFIKA<b>.</b></span>
        <nav className="topnav" aria-label="Main">
          {nav.map(([v, l]) => (
            <a key={v} href="#" aria-current={s.view === v || (v === "issue" && s.view !== "collection" && !!issue) ? "page" : undefined}
              onClick={(e) => { e.preventDefault(); if (v === "issue" && !issue) return; s.setView(v); }}>{l}{v === "issue" && issue ? ` ${String(issue.no).padStart(3, "0")}` : ""}</a>
          ))}
        </nav>
        {issue && s.view === "issue" && (
          <div className="toolbar" role="toolbar" aria-label="Tools">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" className="tool" aria-pressed={s.tool === t.id} title={`${t.name} (${t.key})`}
                onClick={() => { if (t.id === "picker" && !s.picking) { s.notify("Eyedropper: first click the dropper next to a colour field, then click a photo."); return; } s.set("tool", t.id); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d={t.d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg>
              </button>
            ))}
            <span className="tool-sep" />
            <button type="button" className="tool" aria-pressed={s.showGrid} title="Show layout grid (G)" onClick={() => s.set("showGrid", !s.showGrid)}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4zM9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
            </button>
            <button type="button" className="tool" aria-pressed={s.snap} title="Snap to grid (hold Alt while dragging to skip)" onClick={() => s.set("snap", !s.snap)}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4v8a6 6 0 0 0 12 0V4M6 4h4v8a2 2 0 0 0 4 0V4h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
            </button>
          </div>
        )}
        <span className="spacer" />
        {issue && s.view === "issue" && (
          <>
            <button type="button" className="btn" disabled={!s.past.length} onClick={s.undo} title="Undo (Ctrl+Z)">Undo</button>
            <button type="button" className="btn" disabled={!s.future.length} onClick={s.redo} title="Redo (Ctrl+Shift+Z)">Redo</button>
          </>
        )}
        <button type="button" className="btn" onClick={() => setDialog("fonts")}>Fonts</button>
        <button type="button" className="btn" onClick={() => setDialog("settings")}>Printer</button>
        {s.view === "collection" || !issue
          ? <button type="button" className="btn btn-primary" onClick={() => void s.createIssue()}>New issue</button>
          : <button type="button" className="btn btn-primary" onClick={() => setDialog("export")}>Export</button>}
      </header>

      {s.view === "collection" || !issue ? <Collection /> : (
        <main className="split">
          <Rail />
          <Feed />
          <div className="divider" role="separator" aria-orientation="vertical" />
          <Zine />
          <Inspector />
        </main>
      )}

      <StatusBar />
      {dropping && <div className="drop-veil"><span>Drop photos to add them to {issue ? `issue ${String(issue.no).padStart(3, "0")}` : "an issue"}</span></div>}
      {dialog === "export" && <ExportDialog onClose={() => setDialog(null)} />}
      {dialog === "fonts" && <FontsDialog onClose={() => setDialog(null)} />}
      {dialog === "settings" && <SettingsDialog onClose={() => setDialog(null)} />}
      {s.toast && <div className="toast" role="status">{s.toast}</div>}
    </div>
  );
}

function StatusBar() {
  const { issue, saving, root, active, cams, tool, view } = useStore();
  const lk = useLayerKey();
  if (!issue || view === "collection") return <footer className="status"><span>{root}</span><StorageNote /><span className="spacer" /><span>Offline. Nothing is ever posted.</span></footer>;
  const imp = impOf(issue);
  const slides = slidesOf(issue).length;
  const warn = autoFlow(issue, imp).warnings.length + pageChecks(issue).reduce((n, c) => n + c.warnings.length, 0);
  return (
    <footer className="status">
      <span className="ok">{imp.t.code} {imp.paper}{imp.trimmed ? " trim" : ""}</span>
      <span>{slides} slides → {imp.pageCount} pages</span>
      <span>{active === "feed" ? "Instagram" : "Zine"} {Math.round(cams[active].zoom * 100)}%</span>
      <span>{tool === "move" ? lk.label : tool}</span>
      <span className="spacer" />
      <StorageNote />
      {warn > 0 && <span className="warn">{warn} warning{warn > 1 ? "s" : ""} (TPL)</span>}
      <span>{saving === "saved" ? "Saved" : saving === "saving" ? "Saving…" : "Save failed"}</span>
    </footer>
  );
}

/** Web only: is browser storage protected, and when was the last backup? Quiet, one line. */
function StorageNote() {
  const { persisted, settings, collection, askPersist, backup } = useStore();
  if (!platform.caps.volatile) return null;
  const days = settings.lastBackup ? Math.floor((Date.now() - Date.parse(settings.lastBackup)) / 86_400_000) : null;
  const stale = collection.length > 0 && (days === null || days > 14);
  return (
    <>
      {persisted
        ? <span title="The browser won't clear Trafika's storage on its own">Storage kept</span>
        : <button type="button" className="status-btn" onClick={() => void askPersist()} title="Ask the browser not to clear Trafika's storage when space runs low">Storage may be cleared: keep it</button>}
      {stale && <button type="button" className="status-btn warn" onClick={() => void backup("collection")}>{days === null ? "No backup yet" : `Last backup ${days} days ago`}: back up now</button>}
    </>
  );
}
