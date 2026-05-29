// _core/download.ts — file-save helpers (save-picker + legacy anchor
// fallback), CSV / SVG / PNG / text downloads, filename utilities.

import { buildCsvString } from "./csv";
import { buildExportSvg, PLOTTR_ATTRIBUTION_PAD, serializeSvgForExport } from "./svg-export";

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

interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (opts: {
    suggestedName: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<{
    createWritable: () => Promise<{
      write: (b: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

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

// ── Format-specific downloaders ───────────────────────────────────────────

export function downloadSvg(svgEl: SVGElement | null, filename: string): void {
  if (!svgEl) return;
  const svgStr = serializeSvgForExport(svgEl);
  const blob = new Blob([svgStr], { type: "image/svg+xml" });
  saveBlob(blob, filename);
}

export function downloadPng(svgEl: SVGElement | null, filename: string, scale?: number): void {
  if (!svgEl) return;
  const s = scale || 2;
  const exportSvg = buildExportSvg(svgEl);
  const svgStr = new XMLSerializer().serializeToString(exportSvg);
  const vb = exportSvg.getAttribute("viewBox");
  const parts = vb ? vb.split(/[\s,]+/) : [];
  const w = parts.length >= 4 ? parseFloat(parts[2]) : (svgEl as SVGSVGElement).clientWidth || 800;
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
      if (pngBlob) saveBlob(pngBlob, filename);
    }, "image/png");
  };
  // Without this, a serialized SVG the rasterizer rejects leaves onload
  // unfired: no PNG, no feedback, and the object URL leaks.
  img.onerror = function () {
    URL.revokeObjectURL(url);
    console.error("[plottr] PNG export failed: the chart SVG could not be rasterized");
  };
  img.src = url;
}

export function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: "text/plain" });
  saveBlob(blob, filename);
}

export function downloadCsv(headers: unknown[], rows: unknown[][], filename: string): void {
  const blob = new Blob([buildCsvString(headers, rows)], { type: "text/csv" });
  saveBlob(blob, filename);
}
