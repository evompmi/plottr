// _core/zip.ts — minimal, dependency-free ZIP archive builder.
//
// Bundles several blobs into one `.zip` so a large multi-file export
// becomes a single download (one Save-As prompt, works on every browser
// including Firefox / Safari where there is no directory picker). Used by
// `_core/download.ts` once a batch grows past a few files.
//
// Files are stored with method 0 (STORE — no compression): the format is
// then trivially correct on every unzip tool, needs no `CompressionStream`
// (still patchy on older Safari), and the exports here (CSV / SVG / short
// text reports) are small enough that compression would save little. The
// archive carries no ZIP64 records — every plottr export sits far below the
// 4 GB / 65 535-entry classic-ZIP limits.

// A blob paired with the name it takes inside the archive. Structurally
// identical to `_core/download.ts`'s `NamedBlob`; declared locally so this
// module imports nothing (keeps it a leaf in the `_core` dependency graph —
// no cycle with download.ts).
export interface ZipEntry {
  blob: Blob;
  filename: string;
}

// CRC-32 (IEEE 802.3 polynomial), table-built lazily on first use.
let _crcTable: Uint32Array | null = null;
function crcTable(): Uint32Array {
  if (_crcTable) return _crcTable;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  _crcTable = t;
  return t;
}
function crc32(bytes: Uint8Array): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Little-endian byte accumulator — ZIP records are all little-endian.
class ByteWriter {
  private parts: Uint8Array[] = [];
  private len = 0;
  private push(b: Uint8Array): void {
    this.parts.push(b);
    this.len += b.length;
  }
  u16(v: number): void {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, v & 0xffff, true);
    this.push(b);
  }
  u32(v: number): void {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v >>> 0, true);
    this.push(b);
  }
  bytes(b: Uint8Array): void {
    this.push(b);
  }
  get length(): number {
    return this.len;
  }
  concat(): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(this.len);
    let o = 0;
    for (const p of this.parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}

// Fixed valid DOS timestamp (1980-01-01 00:00:00). Avoids leaking the
// user's clock into the archive and keeps the build deterministic; the
// month/day are 1 (not 0) so strict unzip tools don't choke.
const DOS_TIME = 0;
const DOS_DATE = 0x21;

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const UTF8_FLAG = 0x0800; // general-purpose bit 11: filename is UTF-8
const VERSION = 20; // 2.0 — the minimum that supports our records

// Build a STORE-method ZIP archive from the given entries. Async because
// reading each blob's bytes (`blob.arrayBuffer()`) is async.
export async function buildZip(entries: ZipEntry[]): Promise<Blob> {
  const enc = new TextEncoder();
  const local = new ByteWriter();
  const central = new ByteWriter();

  for (const entry of entries) {
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    // Defence-in-depth against Zip Slip: callers in `download.ts` already
    // sanitise, but normalise here too so no future caller can write a
    // central-directory entry with a traversal / absolute path. Strip path
    // separators and leading dots; never trust the name to be a clean leaf.
    const safeName =
      entry.filename
        .replace(/[/\\]/g, "_")
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x1f\x7f]/g, "")
        .replace(/^\.+/, "")
        .slice(0, 255) || "file";
    const nameBytes = enc.encode(safeName);
    const crc = crc32(data);
    const localOffset = local.length;

    // Local file header + name + stored data.
    local.u32(SIG_LOCAL);
    local.u16(VERSION);
    local.u16(UTF8_FLAG);
    local.u16(0); // method 0 = STORE
    local.u16(DOS_TIME);
    local.u16(DOS_DATE);
    local.u32(crc);
    local.u32(data.length); // compressed size (== uncompressed for STORE)
    local.u32(data.length); // uncompressed size
    local.u16(nameBytes.length);
    local.u16(0); // extra-field length
    local.bytes(nameBytes);
    local.bytes(data);

    // Matching central-directory record.
    central.u32(SIG_CENTRAL);
    central.u16(VERSION); // version made by
    central.u16(VERSION); // version needed
    central.u16(UTF8_FLAG);
    central.u16(0); // method
    central.u16(DOS_TIME);
    central.u16(DOS_DATE);
    central.u32(crc);
    central.u32(data.length);
    central.u32(data.length);
    central.u16(nameBytes.length);
    central.u16(0); // extra
    central.u16(0); // comment
    central.u16(0); // disk number start
    central.u16(0); // internal attrs
    central.u32(0); // external attrs
    central.u32(localOffset);
    central.bytes(nameBytes);
  }

  const localBytes = local.concat();
  const centralBytes = central.concat();

  const end = new ByteWriter();
  end.u32(SIG_EOCD);
  end.u16(0); // this disk number
  end.u16(0); // disk with central directory
  end.u16(entries.length); // entries on this disk
  end.u16(entries.length); // total entries
  end.u32(centralBytes.length); // central-directory size
  end.u32(localBytes.length); // central-directory offset (== size of local section)
  end.u16(0); // archive comment length

  return new Blob([localBytes, centralBytes, end.concat()], { type: "application/zip" });
}
