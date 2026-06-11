// Unit tests for the dependency-free ZIP builder (tools/_core/zip.ts).
// `buildZip` is what backs the "bundle a large multi-file export into one
// download" path in _core/download.ts, so these tests parse the archive it
// produces back out (a minimal STORE-method reader below) and assert the
// round trip: entry order, names, byte-exact contents, sizes, and CRC-32.

const { suite, test, assert, eq, summary } = require("./harness");
const { buildZip } = require("./helpers/zip-loader");

// ── Minimal STORE-zip reader (test-only) ──────────────────────────────────

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function readZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("no EOCD record");
  const total = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);

  const entries = [];
  let p = cdOffset;
  for (let e = 0; e < total; e++) {
    if (dv.getUint32(p, true) !== SIG_CENTRAL) throw new Error("bad central signature");
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const compSize = dv.getUint32(p + 20, true);
    const uncompSize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));

    if (dv.getUint32(localOff, true) !== SIG_LOCAL) throw new Error("bad local signature");
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const data = bytes.subarray(dataStart, dataStart + compSize);

    entries.push({ name, flags, method, crc, compSize, uncompSize, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { total, cdSize, cdOffset, entries };
}

async function zipBytes(items) {
  const blob = await buildZip(items);
  eq(blob.type, "application/zip");
  return new Uint8Array(await blob.arrayBuffer());
}

const textBlob = (s) => new Blob([new TextEncoder().encode(s)]);

// ── Tests ─────────────────────────────────────────────────────────────────

suite("buildZip — structure");

test("empty input produces a valid archive with zero entries", async () => {
  const z = readZip(await zipBytes([]));
  eq(z.total, 0);
  eq(z.entries.length, 0);
  eq(z.cdOffset, 0); // no local section precedes the (empty) central directory
});

test("bundles entries in order with names and contents preserved", async () => {
  const items = [
    { filename: "a.csv", blob: textBlob("one,two\n1,2\n") },
    { filename: "b.svg", blob: textBlob("<svg></svg>") },
    { filename: "c.txt", blob: textBlob("hello") },
  ];
  const z = readZip(await zipBytes(items));
  eq(z.total, 3);
  eq(
    z.entries.map((e) => e.name),
    ["a.csv", "b.svg", "c.txt"]
  );
  const dec = new TextDecoder();
  eq(dec.decode(z.entries[0].data), "one,two\n1,2\n");
  eq(dec.decode(z.entries[1].data), "<svg></svg>");
  eq(dec.decode(z.entries[2].data), "hello");
});

test("uses STORE (method 0) with equal compressed / uncompressed sizes", async () => {
  const payload = "x".repeat(500);
  const z = readZip(await zipBytes([{ filename: "f.txt", blob: textBlob(payload) }]));
  const entry = z.entries[0];
  eq(entry.method, 0);
  eq(entry.uncompSize, 500);
  eq(entry.compSize, 500);
});

suite("buildZip — integrity");

test("stores a CRC-32 that matches the file bytes", async () => {
  const data = new TextEncoder().encode("The quick brown fox\n");
  const z = readZip(await zipBytes([{ filename: "fox.txt", blob: new Blob([data]) }]));
  eq(z.entries[0].crc, crc32(data));
});

test("round-trips binary content across every byte value", async () => {
  const data = new Uint8Array(256);
  for (let i = 0; i < 256; i++) data[i] = i;
  const z = readZip(await zipBytes([{ filename: "bytes.bin", blob: new Blob([data]) }]));
  assert(bytesEqual(z.entries[0].data, data), "stored bytes differ from input");
  eq(z.entries[0].crc, crc32(data));
});

test("marks filenames UTF-8 and preserves non-ASCII names", async () => {
  const name = "résumé_α_Δσ.csv";
  const z = readZip(await zipBytes([{ filename: name, blob: textBlob("data") }]));
  eq(z.entries[0].name, name);
  assert((z.entries[0].flags & 0x0800) !== 0, "UTF-8 general-purpose flag not set");
});

suite("buildZip — Zip Slip defence");

test("neutralises path separators and traversal in entry names", async () => {
  const z = readZip(
    await zipBytes([
      { filename: "../../evil.svg", blob: textBlob("a") },
      { filename: "a/b/c.csv", blob: textBlob("b") },
      { filename: "..\\..\\windows\\system32.txt", blob: textBlob("c") },
    ])
  );
  // A Zip Slip needs a path separator or a leading-dot escape; a ".."
  // substring with no separator is just a harmless single filename.
  for (const e of z.entries) {
    assert(!e.name.includes("/"), `entry name still has forward slash: ${e.name}`);
    assert(!e.name.includes("\\"), `entry name still has backslash: ${e.name}`);
    assert(!e.name.startsWith("."), `entry name still starts with a dot: ${e.name}`);
  }
});

test("falls back to a non-empty name when sanitising leaves nothing", async () => {
  const z = readZip(await zipBytes([{ filename: "..", blob: textBlob("x") }]));
  assert(z.entries[0].name.length > 0, "empty entry name after sanitisation");
});

summary();
