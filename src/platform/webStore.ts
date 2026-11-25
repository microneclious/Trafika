// Browser storage for the web build. Primary: the Origin Private File System (Firefox, Chromium,
// Safari 18+). Fallback: IndexedDB, e.g. Firefox private windows or older Safari. Nothing here ever
// leaves the device.
import { safeRel } from "./types";

export interface Store {
  kind: "opfs" | "indexeddb";
  read(rel: string): Promise<Uint8Array | null>;
  write(rel: string, data: Uint8Array): Promise<void>;
  /** every file under rel, recursively */
  tree(rel: string): Promise<string[]>;
}

const isNotFound = (e: unknown) => e instanceof DOMException && (e.name === "NotFoundError" || e.name === "TypeMismatchError");

async function opfs(): Promise<Store> {
  const root = await navigator.storage.getDirectory();
  async function dir(parts: string[], create: boolean) {
    let d = root;
    for (const p of parts) d = await d.getDirectoryHandle(p, { create });
    return d;
  }
  const store: Store = {
    kind: "opfs",
    async read(rel) {
      const parts = safeRel(rel);
      try {
        const d = await dir(parts.slice(0, -1), false);
        const f = await (await d.getFileHandle(parts[parts.length - 1])).getFile();
        return new Uint8Array(await f.arrayBuffer());
      } catch (e) {
        if (isNotFound(e)) return null;
        throw e;
      }
    },
    async write(rel, data) {
      const parts = safeRel(rel);
      const d = await dir(parts.slice(0, -1), true);
      const h = await d.getFileHandle(parts[parts.length - 1], { create: true });
      const w = await h.createWritable(); // writes to a swap file, committed atomically on close
      await w.write(data as unknown as FileSystemWriteChunkType);
      await w.close();
    },
    async tree(rel) {
      const parts = rel ? safeRel(rel) : [];
      let start: FileSystemDirectoryHandle;
      try { start = await dir(parts, false); } catch (e) { if (isNotFound(e)) return []; throw e; }
      const out: string[] = [];
      const walk = async (d: FileSystemDirectoryHandle, prefix: string) => {
        // entries() is async-iterable in every browser with OPFS
        for await (const [name, h] of (d as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
          const path = prefix ? `${prefix}/${name}` : name;
          if (h.kind === "directory") await walk(h as FileSystemDirectoryHandle, path);
          else if (!name.endsWith(".crswap")) out.push(path);
        }
      };
      await walk(start, parts.join("/"));
      return out.sort();
    },
  };
  // probe: some browsers expose getDirectory but not writable streams, or refuse in private mode
  await store.write(".probe", new Uint8Array([1]));
  return store;
}

function idb(): Promise<Store> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("trafika", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) =>
        new Promise<T>((res, rej) => {
          const t = db.transaction("files", mode);
          const r = fn(t.objectStore("files"));
          t.oncomplete = () => res(r.result);
          t.onerror = () => rej(t.error);
          t.onabort = () => rej(t.error ?? new Error("storage transaction aborted"));
        });
      resolve({
        kind: "indexeddb",
        async read(rel) {
          const v = await tx<Uint8Array | undefined>("readonly", (s) => s.get(safeRel(rel).join("/")));
          return v ? new Uint8Array(v) : null;
        },
        async write(rel, data) {
          await tx("readwrite", (s) => s.put(data.slice(), safeRel(rel).join("/")));
        },
        async tree(rel) {
          const prefix = rel ? safeRel(rel).join("/") + "/" : "";
          const keys = await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys());
          return (keys as string[]).filter((k) => k.startsWith(prefix)).sort();
        },
      });
    };
  });
}

let pending: Promise<Store> | null = null;
export function openStore(): Promise<Store> {
  pending ??= (async () => {
    try {
      if (typeof navigator.storage?.getDirectory === "function" && typeof FileSystemFileHandle !== "undefined" && "createWritable" in FileSystemFileHandle.prototype) return await opfs();
    } catch (e) {
      console.warn("OPFS unavailable, using IndexedDB", e);
    }
    return idb();
  })();
  return pending;
}
