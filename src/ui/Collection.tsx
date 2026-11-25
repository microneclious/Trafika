import { useEffect, useMemo, useState } from "react";
import { parseCollectionEan, pad3 } from "../engine/codes";
import { readJson } from "../lib/backend";
import type { Issue } from "../model/types";
import { useStore } from "../store/store";

export function Collection() {
  const { collection, openIssue, createIssue } = useStore();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<Issue | null>(null);
  const match = useMemo(() => {
    const d = q.replace(/\D/g, "");
    const dec = d.length >= 5 ? parseCollectionEan(d) : null;
    return { dec, rows: collection.filter((c) => {
      if (!q.trim()) return true;
      if (dec?.issue !== undefined) return c.no === dec.issue;
      return c.title.toLowerCase().includes(q.toLowerCase()) || String(c.no).includes(q.trim()) || (c.ean ?? "").startsWith(d || "x");
    }) };
  }, [q, collection]);
  const selId = sel ?? match.rows[0]?.id ?? null;
  const selEntry = collection.find((c) => c.id === selId);
  useEffect(() => {
    if (!selEntry) { setDetail(null); return; }
    void readJson<Issue>(`${selEntry.slug}/issue.json`).then(setDetail);
  }, [selEntry?.slug]);
  const totalCopies = collection.reduce((n, c) => n + c.copiesPrinted, 0);

  return (
    <main className="coll">
      <section className="panel" aria-label="Ledger">
        <div className="coll-head">
          <div><span className="code">Case file <em>//</em> {collection.length} issues <em>//</em> {totalCopies} copies</span><h1>The ledger</h1></div>
          <div className="search">
            <label className="visually-hidden" htmlFor="q">Barcode, issue number or title</label>
            <input id="q" className="input" placeholder="Scan or type a barcode, no. or title" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          </div>
        </div>
        {match.dec?.issue !== undefined && <p className="note-line" style={{ padding: "0 24px 12px" }}>
          Barcode → issue {pad3(match.dec.issue)}{match.dec.copy !== undefined ? `, copy ${match.dec.copy}` : ""} (20{String(match.dec.yy).padStart(2, "0")})</p>}
        <div className="panel-body">
          {collection.length === 0 ? (
            <div className="coll-empty"><h2>No issues yet</h2><p>Each issue is one Instagram post and one printed zine, planned side by side. Start the first one.</p>
              <div><button type="button" className="btn btn-primary" onClick={() => void createIssue()}>New issue</button></div></div>
          ) : (
            <table className="ledger">
              <thead><tr><th>No.</th><th>Title</th><th>Date</th><th>Format</th><th>Pages</th><th>Copies</th><th>Barcode (copy 01)</th></tr></thead>
              <tbody>
                {match.rows.map((c) => (
                  <tr key={c.id} className={c.id === selId ? "is-sel" : ""} onClick={() => setSel(c.id)} onDoubleClick={() => void openIssue(c.slug)}>
                    <td className="no">{pad3(c.no)}</td><td className="title">{c.title}</td><td className="mono">{c.date}</td><td>{c.template}</td>
                    <td className="num">{c.pages}</td><td className="num">{c.copiesPrinted}</td>
                    <td className="mono">{c.ean ?? <em className="draft">on first print</em>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
      <aside className="panel" aria-label="Issue detail">
        {detail ? (
          <div className="panel-body detail">
            <div><span className="code">SER <em>//</em> No. {pad3(detail.no)}</span><h2>{detail.title}</h2><p className="note-line">{detail.date}, {selEntry?.template}, {selEntry?.pages} pages</p></div>
            <dl className="kv">
              <dt>Slides</dt><dd>{detail.items.reduce((n, i) => n + (i.kind === "pair" ? 2 : 1), 0)}</dd>
              <dt>Printed</dt><dd>{selEntry?.copiesPrinted ?? 0} of {detail.plannedCopies}</dd>
            </dl>
            <div><span className="code">Print log</span>
              {detail.printRuns.length ? <ul className="log" style={{ marginTop: 8 }}>{detail.printRuns.map((r, i) => (
                <li key={i}><time>{r.date}</time><span>{r.template}{r.paper ? `, ${r.paper}` : ""}, serials {r.firstSerial}–{r.firstSerial + r.copies - 1}</span><span className="n">{r.copies}</span></li>))}</ul>
                : <p className="note-line">Not printed yet.</p>}
            </div>
            <div className="row"><button type="button" className="btn btn-primary" onClick={() => void openIssue(detail.slug)}>Open issue</button></div>
          </div>
        ) : <div className="panel-body detail"><p className="note-line">Select an issue.</p></div>}
      </aside>
    </main>
  );
}
