// _core/download.ts — file-save helpers (save-picker + legacy anchor
// fallback), CSV / SVG / PNG / text downloads, filename utilities.

import { buildCsvString } from "./csv";
import { buildExportSvg, PLOTTR_ATTRIBUTION_PAD, serializeSvgForExport } from "./svg-export";
import { buildZip } from "./zip";

// ── Filename helpers ───────────────────────────────────────────────────────

export function fileBaseName(fileName: unknown, fallback?: string): string {
  if (typeof fileName === "string" && fileName.trim()) return fileName.replace(/\.[^.]+$/, "");
  return fallback || "data";
}

// Accepts any HTMLElement (call sites use either a button or a wider
// `EventTarget & HTMLElement` from React's MouseEvent.currentTarget).
// `disabled` is set only on elements that have the property — most
// commonly buttons; non-button calls just get the innerHTML swap.
export function flashSaved(btn: HTMLElement | null): void {
  if (!btn) return;
  const original = btn.innerHTML;
  btn.innerHTML = "✓ Saved";
  if ("disabled" in btn) (btn as HTMLButtonElement).disabled = true;
  setTimeout(() => {
    btn.innerHTML = original;
    if ("disabled" in btn) (btn as HTMLButtonElement).disabled = false;
  }, 1500);
}

// ── File-save picker ──────────────────────────────────────────────────────

interface SavePickerType {
  mime: string;
  description: string;
}
const _SAVE_PICKER_TYPES: Record<string, SavePickerType> = {
  ".svg": { mime: "image/svg+xml", description: "SVG image" },
  ".png": { mime: "image/png", description: "PNG image" },
  ".csv": { mime: "text/csv", description: "CSV file" },
  ".tsv": { mime: "text/tab-separated-values", description: "TSV file" },
  ".txt": { mime: "text/plain", description: "Text file" },
  ".r": { mime: "text/plain", description: "R script" },
  ".json": { mime: "application/json", description: "JSON file" },
};

interface FileSystemWritableLite {
  write: (b: Blob) => Promise<void>;
  close: () => Promise<void>;
}
interface FileSystemFileHandleLite {
  createWritable: () => Promise<FileSystemWritableLite>;
}
interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (opts: {
    suggestedName: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandleLite>;
}
interface FileSystemDirectoryHandleLite {
  getFileHandle: (name: string, opts?: { create?: boolean }) => Promise<FileSystemFileHandleLite>;
}
interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (opts?: {
    mode?: "read" | "readwrite";
  }) => Promise<FileSystemDirectoryHandleLite>;
}

// A blob paired with the filename it should be saved under. Batch saves
// (`saveBlobs`) operate on arrays of these.
export interface NamedBlob {
  blob: Blob;
  filename: string;
}

// Classic `<a download>` anchor click — routes the file to the browser's
// default Downloads folder. Used as the fallback for every save path when
// the File System Access API is unavailable or declines.
function anchorDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Disambiguate a filename against names already written in this batch so a
// directory save never silently overwrites an earlier file: "foo.csv" →
// "foo (2).csv". Mutates `used` to claim the returned name.
function uniqueFilename(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot >= 0 ? name.slice(0, dot) : name;
  const ext = dot >= 0 ? name.slice(dot) : "";
  let n = 2;
  let candidate = `${stem} (${n})${ext}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `${stem} (${n})${ext}`;
  }
  used.add(candidate);
  return candidate;
}

// Name a zip archive after the common prefix of the files it bundles, so a
// batch like "x_groupplot_Day1.svg" / "x_groupplot_Day2.svg" becomes
// "x_groupplot_Day.zip". Realistic plottr filenames differ in their stem
// before the extension, so the common prefix never reaches the ".ext" — but
// the leading `\.[^.]*$` strip handles the rare extension-only difference
// (e.g. "report.txt" / "report.R" → "report"). Falls back to a generic name
// when there is no shared prefix.
function archiveBaseName(names: string[]): string {
  if (names.length === 0) return "plottr-export";
  let prefix = names[0];
  for (let i = 1; i < names.length; i++) {
    const n = names[i];
    let j = 0;
    while (j < prefix.length && j < n.length && prefix[j] === n[j]) j += 1;
    prefix = prefix.slice(0, j);
  }
  prefix = prefix.replace(/\.[^.]*$/, "").replace(/[._\-\s(]+$/, "");
  return prefix || "plottr-export";
}

// More than this many files in one save → bundle into a single .zip instead
// of writing them out individually. Keeps a large export (every Venn region,
// a wide facet grid) to one download / one prompt.
const ZIP_THRESHOLD = 3;

// Save a Blob to disk. Tries the File System Access API
// (`window.showSaveFilePicker`) first so the user can pick a target folder
// + filename — supported in Chromium-based browsers (Chrome, Edge, Opera)
// on HTTPS / localhost. Falls back to the classic `<a download>` anchor
// click on Firefox / Safari, which routes the file to the browser's
// default Downloads folder.
//
// The fallback is also taken when the picker call throws anything other
// than the user-cancelled `AbortError`. User cancel returns silently; we
// don't downgrade to the fallback in that case because the user explicitly
// chose "Cancel".
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  if (
    typeof window !== "undefined" &&
    typeof (window as SaveFilePickerWindow).showSaveFilePicker === "function"
  ) {
    try {
      const dot = filename.lastIndexOf(".");
      const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
      const meta = _SAVE_PICKER_TYPES[ext] || {
        mime: blob.type || "application/octet-stream",
        description: "File",
      };
      const handle = await (window as SaveFilePickerWindow).showSaveFilePicker!({
        suggestedName: filename,
        types: [{ description: meta.description, accept: { [meta.mime]: [ext || ""] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err && (err as { name?: string }).name === "AbortError") return;
    }
  }
  anchorDownload(blob, filename);
}

// Save several blobs at once, tiered by count:
//
//   1 file          → `saveBlob` (familiar "save as" dialog).
//   2–3 files       → one `showDirectoryPicker` prompt, every file written
//                     into the chosen folder.
//   > ZIP_THRESHOLD → bundled into a single `.zip` and saved as one file.
//
// The single-picker flow `saveBlob` uses degrades badly for many files:
// only the first `showSaveFilePicker` call gets the user-gesture
// activation, so on Chromium (notably recent Windows) every subsequent file
// silently falls back to the Downloads folder — the first prompts for a
// location, the rest don't. The directory picker fixes that for a handful
// of files; past that, a zip is tidier than scattering many files and works
// on every browser (it's just one download). The directory-picker tier
// falls back to staggered anchor downloads on Firefox / Safari (no
// directory picker) or if the picker call fails for any reason other than
// user cancel.
export async function saveBlobs(files: NamedBlob[]): Promise<void> {
  const valid = files.filter((f) => f && f.blob);
  if (valid.length === 0) return;
  if (valid.length === 1) {
    await saveBlob(valid[0].blob, valid[0].filename);
    return;
  }
  // Large batch → one .zip. Dedupe names first so two files can't collide
  // into a single archive entry, then save the archive like any one file
  // (Save-As dialog, or anchor download where the picker is unavailable).
  if (valid.length > ZIP_THRESHOLD) {
    const used = new Set<string>();
    const entries = valid.map((f) => ({
      blob: f.blob,
      filename: uniqueFilename(f.filename, used),
    }));
    const zip = await buildZip(entries);
    await saveBlob(zip, `${archiveBaseName(entries.map((e) => e.filename))}.zip`);
    return;
  }
  const w = window as DirectoryPickerWindow;
  if (typeof window !== "undefined" && typeof w.showDirectoryPicker === "function") {
    try {
      const dir = await w.showDirectoryPicker!({ mode: "readwrite" });
      const used = new Set<string>();
      for (const f of valid) {
        const handle = await dir.getFileHandle(uniqueFilename(f.filename, used), {
          create: true,
        });
        const writable = await handle.createWritable();
        await writable.write(f.blob);
        await writable.close();
      }
      return;
    } catch (err) {
      if (err && (err as { name?: string }).name === "AbortError") return;
      // Any other failure (permission denied, unsupported) → anchor fallback.
    }
  }
  // Stagger so engines that batch `<a>.click()` in a single tick don't drop
  // everything after the first file.
  valid.forEach((f, i) => {
    setTimeout(() => anchorDownload(f.blob, f.filename), i * 60);
  });
}

// ── Format-specific downloaders ───────────────────────────────────────────

// Serialize a chart SVG to a Blob. Returns null when there is no element
// (so batch callers can filter empty refs).
export function svgToBlob(svgEl: SVGElement | null): Blob | null {
  if (!svgEl) return null;
  return new Blob([serializeSvgForExport(svgEl)], { type: "image/svg+xml" });
}

// Rasterize a chart SVG to a PNG Blob via an off-DOM canvas. Resolves null
// when there is no element or the SVG can't be rasterized.
export function svgToPngBlob(svgEl: SVGElement | null, scale?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!svgEl) {
      resolve(null);
      return;
    }
    const s = scale || 2;
    const exportSvg = buildExportSvg(svgEl);
    const svgStr = new XMLSerializer().serializeToString(exportSvg);
    const vb = exportSvg.getAttribute("viewBox");
    const parts = vb ? vb.split(/[\s,]+/) : [];
    const w =
      parts.length >= 4 ? parseFloat(parts[2]) : (svgEl as SVGSVGElement).clientWidth || 800;
    const h =
      parts.length >= 4
        ? parseFloat(parts[3])
        : ((svgEl as SVGSVGElement).clientHeight || 600) + PLOTTR_ATTRIBUTION_PAD;
    const canvas = document.createElement("canvas");
    canvas.width = w * s;
    canvas.height = h * s;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const img = new Image();
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = function () {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(function (pngBlob) {
        resolve(pngBlob);
      }, "image/png");
    };
    // Without this, a serialized SVG the rasterizer rejects leaves onload
    // unfired: no PNG, no feedback, and the object URL leaks.
    img.onerror = function () {
      URL.revokeObjectURL(url);
      console.error("[plottr] PNG export failed: the chart SVG could not be rasterized");
      resolve(null);
    };
    img.src = url;
  });
}

export function downloadSvg(svgEl: SVGElement | null, filename: string): void {
  const blob = svgToBlob(svgEl);
  if (blob) saveBlob(blob, filename);
}

export function downloadPng(svgEl: SVGElement | null, filename: string, scale?: number): void {
  svgToPngBlob(svgEl, scale).then((blob) => {
    if (blob) saveBlob(blob, filename);
  });
}

export function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: "text/plain" });
  saveBlob(blob, filename);
}

export function downloadCsv(headers: unknown[], rows: unknown[][], filename: string): void {
  const blob = new Blob([buildCsvString(headers, rows)], { type: "text/csv" });
  saveBlob(blob, filename);
}

// ── Batch downloaders ─────────────────────────────────────────────────────
// One folder prompt for the whole set (see `saveBlobs`). Each filters out
// empty refs / unrasterizable charts so a missing facet never aborts the
// batch.

export interface SvgDownloadItem {
  svgEl: SVGElement | null;
  filename: string;
}

export function downloadSvgs(items: SvgDownloadItem[]): Promise<void> {
  const files = items
    .map((it) => {
      const blob = svgToBlob(it.svgEl);
      return blob ? { blob, filename: it.filename } : null;
    })
    .filter((f): f is NamedBlob => f !== null);
  return saveBlobs(files);
}

export async function downloadPngs(items: SvgDownloadItem[], scale?: number): Promise<void> {
  const built = await Promise.all(
    items.map(async (it) => {
      const blob = await svgToPngBlob(it.svgEl, scale);
      return blob ? { blob, filename: it.filename } : null;
    })
  );
  await saveBlobs(built.filter((f): f is NamedBlob => f !== null));
}

export interface CsvDownloadItem {
  headers: unknown[];
  rows: unknown[][];
  filename: string;
}

export function downloadCsvs(items: CsvDownloadItem[]): Promise<void> {
  return saveBlobs(
    items.map((it) => ({
      blob: new Blob([buildCsvString(it.headers, it.rows)], { type: "text/csv" }),
      filename: it.filename,
    }))
  );
}

export interface TextDownloadItem {
  text: string;
  filename: string;
}

export function downloadTexts(items: TextDownloadItem[]): Promise<void> {
  return saveBlobs(
    items.map((it) => ({
      blob: new Blob([it.text], { type: "text/plain" }),
      filename: it.filename,
    }))
  );
}
