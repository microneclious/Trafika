import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fontNames, namesFromFileName } from "./sfnt";
import { safeRel } from "./types";
import { sha256js } from "./web";
import { crc32, unzip, zip } from "./zip";

const enc = new TextEncoder();

/** a one-entry zip with a deflated (method 8) entry, as other zip tools write them */
function deflatedZip(name: string, data: Uint8Array) {
  const n = enc.encode(name);
  const comp = new Uint8Array(deflateRawSync(data));
  const crc = crc32(data);
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
  lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(n.length, 26);
  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
  ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(n.length, 28);
  const cdOff = 30 + n.length + comp.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + n.length, 12); end.writeUInt32LE(cdOff, 16);
  return new Uint8Array(Buffer.concat([lh, n, comp, ch, n, end]));
}

describe("zip", () => {
  it("crc32 matches the standard check value", () => {
    expect(crc32(enc.encode("123456789")).toString(16)).toBe("cbf43926");
  });
  it("round-trips text, binary and Cyrillic names", async () => {
    const bin = new Uint8Array(70_000).map((_, i) => (i * 31) & 255);
    const files = [
      { name: "trafika-backup.json", data: enc.encode('{"format":"trafika-backup"}') },
      { name: "012-транзит/issue.json", data: enc.encode('{"no":12}') },
      { name: "012-транзит/assets/abcd.jpg", data: bin },
      { name: "empty.txt", data: new Uint8Array(0) },
    ];
    const back = await unzip(zip(files));
    expect(back.map((f) => f.name)).toEqual(files.map((f) => f.name));
    back.forEach((f, i) => expect([...f.data]).toEqual([...files[i].data]));
  });
  it("reads deflated entries written by other tools", async () => {
    const data = enc.encode("hello hello hello hello zine ".repeat(50));
    const [e] = await unzip(deflatedZip("a/issue.json", data));
    expect(new TextDecoder().decode(e.data)).toBe(new TextDecoder().decode(data));
  });
  it("rejects damaged archives", async () => {
    const z = zip([{ name: "a.txt", data: enc.encode("abc") }]);
    z[30 + 5] ^= 0xff; // flip a data byte
    await expect(unzip(z)).rejects.toThrow(/checksum/);
    await expect(unzip(enc.encode("not a zip at all, sorry"))).rejects.toThrow(/not a zip/);
  });
  it("refuses duplicate names", () => {
    expect(() => zip([{ name: "a", data: new Uint8Array(1) }, { name: "a", data: new Uint8Array(1) }])).toThrow();
  });
});

describe("hashing and paths", () => {
  it("sha256 fallback matches node", () => {
    for (const len of [0, 1, 55, 56, 64, 1000, 100_003]) {
      const d = new Uint8Array(len).map((_, i) => (i * 7 + 3) & 255);
      expect(sha256js(d)).toBe(createHash("sha256").update(d).digest("hex"));
    }
  });
  it("refuses paths that escape the storage root", () => {
    expect(safeRel("012-x/assets/a.jpg")).toEqual(["012-x", "assets", "a.jpg"]);
    expect(() => safeRel("../etc/passwd")).toThrow();
    expect(() => safeRel("/etc/passwd")).toThrow();
    expect(() => safeRel("a/../../b")).toThrow();
    expect(() => safeRel("")).toThrow();
  });
  it("reads family and style from a WOFF name table", async () => {
    const b = new Uint8Array(readFileSync("node_modules/@fontsource/oswald/files/oswald-cyrillic-700-normal.woff"));
    expect(await fontNames(b, "x.woff")).toEqual({ family: "Oswald", style: "Bold" });
  });
  it("guesses font names from file names (WOFF2)", () => {
    expect(namesFromFileName("Montserrat-SemiBold.woff2")).toEqual({ family: "Montserrat", style: "SemiBold" });
    expect(namesFromFileName("MyFont.woff2")).toEqual({ family: "MyFont", style: "Regular" });
  });
});
