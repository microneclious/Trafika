// Backups as .zip, the same format on desktop and web, so you can move between them.
//
//   trafika-backup.json            { format: "trafika-backup", version: 1, kind, created, issues }
//   <slug>/issue.json              the issue (any schema version; migrated when opened)
//   <slug>/printlog.json           print runs
//   <slug>/assets/<hash>.<ext>     full-resolution photos, untouched
//   profile.json, profile/assets/  (collection backups) the mock profile
//   fonts/<file>                   (collection backups) fonts you added
//
// Exports (IG slides, PDFs) are left out: they can be made again from the issue.
import type { CollectionEntry, Issue } from "../model/types";
import { platform, readJson, writeJson } from "./index";
import { FONT_EXT } from "./types";
import { unzip, zip, type ZipEntry } from "./zip";

export interface Manifest { format: "trafika-backup"; version: 1; kind: "issue" | "collection"; created: string; issues: string[] }
const MANIFEST = "trafika-backup.json";

const keep = (rel: string) =>
  !/(^|\/)exports\//.test(rel) && !rel.startsWith("calibration/") && !rel.startsWith("backups/") &&
  rel !== "settings.json" && rel !== "fonts/index.json" && rel !== ".probe" && !rel.endsWith(".tmp~");

async function entries(rels: string[]): Promise<ZipEntry[]> {
  const out: ZipEntry[] = [];
  for (const rel of rels.filter(keep)) out.push({ name: rel, data: await platform.readBytes(rel) });
  return out;
}

const today = () => new Date().toISOString().slice(0, 10);

export async function backupIssue(slug: string): Promise<{ name: string; data: Uint8Array }> {
  const files = await entries(await platform.listTree(slug));
  if (!files.some((f) => f.name === `${slug}/issue.json`)) throw new Error(`${slug} has no issue.json`);
  const m: Manifest = { format: "trafika-backup", version: 1, kind: "issue", created: new Date().toISOString(), issues: [slug] };
  return { name: `trafika-${slug}-${today()}.zip`, data: zip([{ name: MANIFEST, data: new TextEncoder().encode(JSON.stringify(m, null, 2)) }, ...files]) };
}

export async function backupCollection(): Promise<{ name: string; data: Uint8Array }> {
  const all = await platform.listTree("");
  const issues = [...new Set(all.filter((r) => /^[^/]+\/issue\.json$/.test(r)).map((r) => r.split("/")[0]))];
  const rels = all.filter((r) => issues.includes(r.split("/")[0]) || r === "profile.json" || r.startsWith("profile/") || (r.startsWith("fonts/") && FONT_EXT.test(r)) || r === "collection.json");
  const m: Manifest = { format: "trafika-backup", version: 1, kind: "collection", created: new Date().toISOString(), issues };
  return { name: `trafika-collection-${today()}.zip`, data: zip([{ name: MANIFEST, data: new TextEncoder().encode(JSON.stringify(m, null, 2)) }, ...(await entries(rels))]) };
}

/** Hand a backup to the user: desktop saves to ~/Zines/backups and opens it, web downloads it. */
export async function saveBackup(b: { name: string; data: Uint8Array }): Promise<string> {
  const rel = `backups/${b.name}`;
  await platform.writeExport(rel, b.data);
  if (platform.caps.folders) await platform.reveal("backups");
  else await platform.deliver([rel]);
  return rel;
}

export interface ImportResult { issues: { slug: string; no: number; title: string; replaced: boolean; renamedFrom?: string }[]; fonts: number; profile: boolean }

const safeName = (n: string) => !n.startsWith("/") && !n.split("/").some((p) => p === ".." || p === "") && !n.includes("\\");

/**
 * Restore a backup. An issue with the same id as one you already have replaces it (a restore). An
 * issue whose folder name is taken by a different issue gets a new folder name. `entryOf` builds
 * the collection row (passed in to keep this module free of the store).
 */
export async function importBackup(bytes: Uint8Array, entryOf: (i: Issue) => CollectionEntry, migrate: (raw: unknown) => Issue): Promise<ImportResult> {
  const files = (await unzip(bytes)).filter((f) => safeName(f.name));
  const byName = new Map(files.map((f) => [f.name, f.data]));
  const dec = new TextDecoder();
  const manifestRaw = byName.get(MANIFEST);
  if (manifestRaw) {
    const m = JSON.parse(dec.decode(manifestRaw)) as Partial<Manifest>;
    if (m.format !== "trafika-backup") throw new Error("This zip is not a Trafika backup.");
    if ((m.version ?? 1) > 1) throw new Error("This backup was made by a newer version of Trafika. Update the app first.");
  }
  const slugs = [...new Set(files.filter((f) => /^[^/]+\/issue\.json$/.test(f.name)).map((f) => f.name.split("/")[0]))];
  if (!slugs.length) throw new Error("No issues found in this zip.");

  const collection = (await readJson<CollectionEntry[]>("collection.json")) ?? [];
  const result: ImportResult = { issues: [], fonts: 0, profile: false };
  for (const slug of slugs) {
    const raw = JSON.parse(dec.decode(byName.get(`${slug}/issue.json`)!)) as Record<string, unknown>;
    const issue = migrate(raw);
    const sameId = collection.find((c) => c.id === issue.id);
    let target = sameId?.slug ?? slug;
    if (!sameId && collection.some((c) => c.slug === target)) {
      let n = 2;
      while (collection.some((c) => c.slug === `${slug}-${n}`)) n++;
      target = `${slug}-${n}`;
    }
    for (const f of files) {
      if (!f.name.startsWith(`${slug}/`) || f.name === `${slug}/issue.json`) continue;
      await platform.writeBytes(target + f.name.slice(slug.length), f.data);
    }
    // the issue file is written as-is (any version) unless its folder moved
    if (target !== slug) {
      issue.slug = target;
      issue.assets = issue.assets.map((a) => ({ ...a, file: a.file.startsWith(`${slug}/`) ? target + a.file.slice(slug.length) : a.file }));
      await writeJson(`${target}/issue.json`, issue);
    } else {
      await platform.writeBytes(`${target}/issue.json`, byName.get(`${slug}/issue.json`)!);
    }
    const e = entryOf({ ...issue, slug: target });
    const at = collection.findIndex((c) => c.id === e.id);
    if (at >= 0) collection[at] = e; else collection.push(e);
    result.issues.push({ slug: target, no: issue.no, title: issue.title, replaced: !!sameId, ...(target !== slug ? { renamedFrom: slug } : {}) });
  }
  collection.sort((a, b) => b.no - a.no);
  await writeJson("collection.json", collection);

  // profile: only fills in a profile you haven't set up here yet
  const prof = byName.get("profile.json");
  if (prof && !(await platform.readText("profile.json"))) {
    for (const f of files) if (f.name.startsWith("profile/")) await platform.writeBytes(f.name, f.data);
    await platform.writeBytes("profile.json", prof);
    result.profile = true;
  }
  // fonts: register through the platform so each side indexes them its own way
  const fonts = files.filter((f) => /^fonts\/[^/]+$/.test(f.name) && FONT_EXT.test(f.name));
  for (const f of fonts) {
    try {
      if (platform.kind === "web") await platform.importFont(new File([f.data as BlobPart], f.name.slice(6)));
      else await platform.writeBytes(f.name, f.data);
      result.fonts++;
    } catch (e) { console.warn("font", f.name, e); }
  }
  return result;
}
