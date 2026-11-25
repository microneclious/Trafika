// Read a font's family and style names from its 'name' table (TTF, OTF, WOFF). WOFF2 is Brotli
// compressed, which browsers can't decompress from script, so its names come from the file name.

const tag = (v: DataView, o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));

async function inflate(data: Uint8Array) {
  const s = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

async function nameTable(bytes: Uint8Array): Promise<Uint8Array | null> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sig = tag(v, 0);
  if (sig === "wOFF") {
    const n = v.getUint16(12);
    for (let i = 0; i < n; i++) {
      const o = 44 + i * 20;
      if (tag(v, o) !== "name") continue;
      const off = v.getUint32(o + 4), comp = v.getUint32(o + 8), orig = v.getUint32(o + 12);
      const raw = bytes.subarray(off, off + comp);
      return comp < orig ? inflate(raw) : raw;
    }
    return null;
  }
  if (sig === "OTTO" || sig === "true" || v.getUint32(0) === 0x00010000) {
    const n = v.getUint16(4);
    for (let i = 0; i < n; i++) {
      const o = 12 + i * 16;
      if (tag(v, o) === "name") { const off = v.getUint32(o + 8), len = v.getUint32(o + 12); return bytes.subarray(off, off + len); }
    }
  }
  return null;
}

function readNames(t: Uint8Array) {
  const v = new DataView(t.buffer, t.byteOffset, t.byteLength);
  const count = v.getUint16(2), strings = v.getUint16(4);
  // best record per nameID: Windows English (US) > any Windows > Mac Roman
  const best = new Map<number, { score: number; text: string }>();
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 12;
    const platform = v.getUint16(o), encoding = v.getUint16(o + 2), lang = v.getUint16(o + 4), id = v.getUint16(o + 6);
    const len = v.getUint16(o + 8), off = v.getUint16(o + 10);
    if (![1, 2, 16, 17].includes(id)) continue;
    const raw = t.subarray(strings + off, strings + off + len);
    let text = "", score = 0;
    if (platform === 3 && (encoding === 1 || encoding === 10)) {
      for (let j = 0; j + 1 < raw.length; j += 2) text += String.fromCharCode((raw[j] << 8) | raw[j + 1]);
      score = lang === 0x409 ? 3 : 2;
    } else if (platform === 1 && encoding === 0) {
      text = String.fromCharCode(...raw);
      score = 1;
    } else continue;
    if (text && (best.get(id)?.score ?? -1) < score) best.set(id, { score, text });
  }
  return {
    family: (best.get(16) ?? best.get(1))?.text.trim() ?? "",
    style: (best.get(17) ?? best.get(2))?.text.trim() ?? "",
  };
}

export function namesFromFileName(file: string) {
  const base = file.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ");
  const m = /^(.*?)[\s-]+(Thin|Hairline|ExtraLight|UltraLight|Light|Regular|Book|Medium|SemiBold|DemiBold|Bold|ExtraBold|UltraBold|Black|Heavy|Italic|BoldItalic|LightItalic|MediumItalic)$/i.exec(base);
  return m ? { family: m[1].trim(), style: m[2] } : { family: base.replace(/-/g, " ").trim(), style: "Regular" };
}

export async function fontNames(bytes: Uint8Array, fileName: string): Promise<{ family: string; style: string }> {
  try {
    const t = await nameTable(bytes);
    if (t) {
      const n = readNames(t);
      if (n.family) return { family: n.family, style: n.style || "Regular" };
    }
  } catch (e) {
    console.warn("font name table", e);
  }
  return namesFromFileName(fileName);
}
