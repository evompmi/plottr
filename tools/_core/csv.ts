// _core/csv.ts — CSV / TSV parsing, tokenizing, separator detection, format
// reshaping, and formula-injection scanning.
//
import { isNumericValue, toNumericValue } from "./numeric";

// ── Separator detection ────────────────────────────────────────────────────
//
// Picks the delimiter most likely to produce a consistent column count. The
// naive "count occurrences across the first 2 kB" heuristic fails on TSVs
// whose header has commas in free-text ("Sample, Description, Notes") —
// those header-level commas can out-count the tabs in data rows and flip
// the detection to `,`, collapsing 20 data columns to 1.
//
// Strategy: for each candidate (`\t`, `;`, `,`), measure how uniform the
// per-line count is across the first ~50 non-empty lines. A real delimiter
// partitions every line into the SAME number of columns, so its per-line
// count has low variance and a median ≥ 1. A separator that sneaks into
// quoted text or headers only produces inconsistent per-line counts.

export function autoDetectSep(text: string, override: string = ""): string | RegExp {
  if (override !== "") return override;
  const h = text.slice(0, 2000);
  const lines = h.split(/\r?\n/).filter((l) => l.trim() !== "");
  const head = lines.slice(0, Math.min(50, lines.length));
  if (head.length === 0) return /\s+/;

  const CANDIDATES = ["\t", ";", ","];
  const scores = CANDIDATES.map((sep) => {
    const countPerLine = head.map((line) => {
      let n = 0;
      let inQuoted = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuoted = !inQuoted;
          continue;
        }
        if (!inQuoted && ch === sep) n++;
      }
      return n;
    });
    const total = countPerLine.reduce((a, b) => a + b, 0);
    const sorted = countPerLine.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const mean = total / countPerLine.length;
    let variance = 0;
    if (countPerLine.length > 1) {
      for (const n of countPerLine) variance += (n - mean) * (n - mean);
      variance /= countPerLine.length - 1;
    }
    const cv = mean > 0 ? Math.sqrt(variance) / mean : Infinity;
    return { sep, total, median, cv };
  });

  const viable = scores.filter((s) => s.median >= 1);
  if (viable.length === 0) {
    const best = scores.reduce((a, b) => (b.total > a.total ? b : a));
    return best.total === 0 ? /\s+/ : best.sep;
  }
  viable.sort((a, b) => a.cv - b.cv || b.total - a.total);
  return viable[0].sep;
}

// ── Delimited-text tokenizer ───────────────────────────────────────────────
//
// RFC 4180-style state machine. Handles quoted fields with embedded
// separators, embedded `\n` / `\r\n` inside quoted cells, escaped `""`
// pairs, a leading BOM, and mixed CRLF/LF line endings. A `"` in the
// middle of an unquoted field is preserved literally so `5"` as an inch
// measurement survives — only a leading `"` at the start of a field opens
// a quoted run.

export function tokenizeDelimited(text: string, sep: string | RegExp): string[][] {
  if (typeof text !== "string" || text.length === 0) return [];
  let s = text;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  if (typeof sep !== "string") {
    return s
      .split(/\r?\n/)
      .filter((l) => l.trim() !== "")
      .map((l) => l.trim().split(sep));
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuoted = false;
  let fieldStarted = false;
  const flushRow = (): void => {
    row.push(field);
    if (!(row.length === 1 && row[0] === "")) {
      for (let c = 0; c < row.length; c++) row[c] = row[c].trim();
      rows.push(row);
    }
    row = [];
    field = "";
    fieldStarted = false;
  };
  const n = s.length;
  let i = 0;
  while (i < n) {
    const ch = s[i];
    if (inQuoted) {
      if (ch === '"') {
        if (i + 1 < n && s[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuoted = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else if (!fieldStarted && ch === '"') {
      inQuoted = true;
      fieldStarted = true;
      i++;
    } else if (ch === sep) {
      row.push(field);
      field = "";
      fieldStarted = false;
      i++;
    } else if (ch === "\n" || ch === "\r") {
      flushRow();
      if (ch === "\r" && i + 1 < n && s[i + 1] === "\n") i += 2;
      else i++;
    } else {
      field += ch;
      fieldStarted = true;
      i++;
    }
  }
  if (field !== "" || row.length > 0) {
    flushRow();
  }
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) rows[r][c] = rows[r][c].trim();
  }
  return rows;
}

// ── Decimal comma fix (per-column) ────────────────────────────────────────

export function fixDecimalCommas(
  text: string,
  sep: string | RegExp
): { text: string; commaFixed: boolean; count: number } {
  if (typeof text !== "string" || text.length === 0) {
    return { text, commaFixed: false, count: 0 };
  }
  if (typeof sep !== "string") return { text, commaFixed: false, count: 0 };
  if (sep === ",") return { text, commaFixed: false, count: 0 };
  if (sep === "") return { text, commaFixed: false, count: 0 };
  const rows = tokenizeDelimited(text, sep);
  if (rows.length < 2) return { text, commaFixed: false, count: 0 };
  const nCols = Math.max(...rows.map((r) => r.length));
  const decimalCommaCols = new Set<number>();
  for (let c = 0; c < nCols; c++) {
    let numericAsIs = 0;
    let numericIfFixed = 0;
    let hasComma = 0;
    let nonEmpty = 0;
    let anyNonThousandish = false;
    for (let r = 1; r < rows.length; r++) {
      const v = rows[r][c];
      if (v == null || v === "") continue;
      nonEmpty++;
      if (v.indexOf(",") !== -1) {
        hasComma++;
        const last = v.lastIndexOf(",");
        const after = v.slice(last + 1);
        const m = after.match(/^\d+/);
        if (!m || m[0].length !== 3) anyNonThousandish = true;
      }
      if (isNumericValue(v)) numericAsIs++;
      if (isNumericValue(v.replace(/,/g, "."))) numericIfFixed++;
    }
    if (nonEmpty > 0 && hasComma > 0 && numericIfFixed > numericAsIs && anyNonThousandish) {
      decimalCommaCols.add(c);
    }
  }
  if (decimalCommaCols.size === 0) return { text, commaFixed: false, count: 0 };
  let count = 0;
  for (let r = 0; r < rows.length; r++) {
    for (const c of decimalCommaCols) {
      const v = rows[r][c];
      if (v && v.indexOf(",") !== -1) {
        const fixed = v.replace(/,/g, ".");
        if (isNumericValue(fixed)) {
          rows[r][c] = fixed;
          count++;
        }
      }
    }
  }
  if (count === 0) return { text, commaFixed: false, count: 0 };
  const q = (cell: string): string => {
    if (
      cell.indexOf(sep as string) !== -1 ||
      cell.indexOf('"') !== -1 ||
      cell.indexOf("\n") !== -1 ||
      cell.indexOf("\r") !== -1
    ) {
      return '"' + cell.replace(/"/g, '""') + '"';
    }
    return cell;
  };
  const rebuilt = rows.map((r) => r.map(q).join(sep as string)).join("\n");
  return { text: rebuilt, commaFixed: true, count };
}

// ── Parsing helpers ────────────────────────────────────────────────────────

export function detectHeader(rows: string[][]): boolean {
  if (rows.length < 2) return true;
  const a = rows[0].filter((v) => !isNumericValue(v) && v.trim() !== "").length;
  const b = rows[1].filter((v) => !isNumericValue(v) && v.trim() !== "").length;
  if (a > b) return true;
  if (a === b && a > 0) {
    let reps = 0;
    for (let i = 1; i < Math.min(rows.length, 20); i++)
      for (let c = 0; c < rows[0].length; c++)
        if (rows[i][c] && rows[i][c].trim() === rows[0][c].trim()) reps++;
    return reps < rows[0].length;
  }
  return a > 0;
}

export interface FormulaInjectionWarning {
  count: number;
  headers: Array<{ idx: number; value: string }>;
  cells: Array<{ row: number; col: number; header: string | null; value: string }>;
}

export interface ParseRawResult {
  headers: string[];
  rows: string[][];
  hasHeader: boolean;
  injectionWarnings: FormulaInjectionWarning | null;
}

export function parseRaw(text: string, sepOv: string = ""): ParseRawResult {
  const sep = autoDetectSep(text, sepOv);
  const all = tokenizeDelimited(text, sep);
  if (all.length < 1) return { headers: [], rows: [], hasHeader: false, injectionWarnings: null };
  const mx = Math.max(...all.map((r) => r.length));
  const pad = all.map((r) => {
    while (r.length < mx) r.push("");
    return r;
  });
  const hh = detectHeader(pad);
  let headers: string[], rows: string[][];
  if (hh) {
    headers = pad[0];
    rows = pad.slice(1);
  } else {
    headers = pad[0].map((_, i) => `Col_${i + 1}`);
    rows = pad;
  }
  const scan = scanForFormulaInjection(headers, rows);
  return {
    headers,
    rows,
    hasHeader: !!hh,
    injectionWarnings: scan.count > 0 ? scan : null,
  };
}

export type ColumnRole = "group" | "value" | "filter" | "ignore";

export function guessColumnType(vals: string[]): ColumnRole {
  const ne = vals.filter((v) => v != null && v !== "");
  if (ne.length === 0) return "ignore";
  if (ne.filter((v) => isNumericValue(v)).length / ne.length > 0.8) {
    const u = new Set(ne);
    if (u.size <= 12 && u.size < ne.length * 0.3) {
      const allIntegers = ne.every((v) => {
        const n = Number(String(v).trim());
        return Number.isFinite(n) && Number.isInteger(n);
      });
      if (allIntegers) return "group";
    }
    return "value";
  }
  const u = new Set(ne);
  if (u.size <= 20 && u.size < ne.length * 0.5) return "group";
  return "filter";
}

export function detectWideFormat(headers: string[], rows: string[][]): boolean {
  if (headers.length < 2 || rows.length < 2) return false;
  const numericCols = headers.map((_, ci) => {
    const vals = rows.map((r) => r[ci]).filter((v) => v !== "");
    return vals.length > 0 && vals.filter((v) => isNumericValue(v)).length / vals.length > 0.8;
  });
  return numericCols.every(Boolean);
}

export interface ParseWideMatrixResult {
  rowLabels: string[];
  colLabels: string[];
  matrix: number[][];
  warnings: { nonNumeric: number };
  injectionWarnings: FormulaInjectionWarning | null;
}

export function parseWideMatrix(text: string, sepOv: string = ""): ParseWideMatrixResult {
  const parsed = parseRaw(text, sepOv);
  const { headers, rows, injectionWarnings } = parsed;
  if (headers.length < 2 || rows.length < 1) {
    return {
      rowLabels: [],
      colLabels: [],
      matrix: [],
      warnings: { nonNumeric: 0 },
      injectionWarnings: null,
    };
  }
  const colLabels = headers.slice(1);
  const rowLabels: string[] = [];
  const matrix: number[][] = [];
  let nonNumeric = 0;
  rows.forEach((r) => {
    const label = r[0] == null ? "" : String(r[0]);
    const values: number[] = new Array(colLabels.length);
    for (let ci = 0; ci < colLabels.length; ci++) {
      const raw = r[ci + 1];
      if (raw == null || raw === "") {
        values[ci] = NaN;
      } else if (isNumericValue(raw)) {
        values[ci] = toNumericValue(raw);
      } else {
        values[ci] = NaN;
        nonNumeric++;
      }
    }
    rowLabels.push(label);
    matrix.push(values);
  });
  return { rowLabels, colLabels, matrix, warnings: { nonNumeric }, injectionWarnings };
}

// ── Unified data parsing ──────────────────────────────────────────────────

export interface ParseDataResult {
  headers: string[];
  data: (number | null)[][];
  rawData: string[][];
  injectionWarnings: FormulaInjectionWarning | null;
}

export function parseData(text: string, sepOv: string = ""): ParseDataResult {
  const sep = autoDetectSep(text, sepOv);
  const all = tokenizeDelimited(text, sep);
  if (all.length < 2) return { headers: [], data: [], rawData: [], injectionWarnings: null };
  const headers = all[0];
  const nCols = headers.length;
  const data: (number | null)[][] = [];
  const rawData: string[][] = [];
  for (let i = 1; i < all.length; i++) {
    const rawVals = all[i].slice();
    while (rawVals.length < nCols) rawVals.push("");
    if (rawVals.every((v) => v === "")) continue;
    data.push(rawVals.map((s) => (isNumericValue(s) ? toNumericValue(s) : null)));
    rawData.push(rawVals);
  }
  const scan = scanForFormulaInjection(headers, rawData);
  return { headers, data, rawData, injectionWarnings: scan.count > 0 ? scan : null };
}

export function dataToColumns(data: (number | null)[][], nCols: number): number[][] {
  const columns: number[][] = Array.from({ length: nCols }, () => []);
  for (const row of data) {
    for (let c = 0; c < nCols; c++) {
      if (row[c] != null) columns[c].push(row[c] as number);
    }
  }
  return columns;
}

// ── Wide / long format helpers ────────────────────────────────────────────

export function wideToLong(
  headers: string[],
  rows: string[][]
): { headers: string[]; rows: string[][]; skipped: number } {
  const longRows: string[][] = [];
  let skipped = 0;
  rows.forEach((r) => {
    headers.forEach((h, ci) => {
      if (r[ci] !== "" && isNumericValue(r[ci])) {
        longRows.push([h, r[ci]]);
      } else {
        skipped++;
      }
    });
  });
  return { headers: ["Group", "Value"], rows: longRows, skipped };
}

export function reshapeWide(
  rows: string[][],
  gi: number,
  vi: number
): { headers: string[]; rows: string[][]; unlabelled: number } {
  const g: Record<string, string[]> = {};
  let unlabelled = 0;
  rows.forEach((r) => {
    const raw = r[gi];
    if (raw === "" || raw == null) unlabelled++;
    const k = raw || "?";
    if (!g[k]) g[k] = [];
    g[k].push(r[vi]);
  });
  const vals = Object.values(g);
  if (vals.length === 0) return { headers: [], rows: [], unlabelled };
  const mx = Math.max(...vals.map((v) => v.length));
  const names = Object.keys(g);
  const w: string[][] = [];
  for (let i = 0; i < mx; i++) w.push(names.map((n) => (g[n][i] != null ? g[n][i] : "")));
  return { headers: names, rows: w, unlabelled };
}

// ── Set-membership parsing (Venn / UpSet) ─────────────────────────────────

export function parseSetData(
  headers: string[],
  rows: string[][]
): { setNames: string[]; sets: Map<string, Set<string>> } {
  const sets = new Map<string, Set<string>>();
  for (let ci = 0; ci < headers.length; ci++) {
    const s = new Set<string>();
    for (const r of rows) {
      const v = (r[ci] || "").trim();
      if (v) s.add(v);
    }
    if (s.size > 0) sets.set(headers[ci], s);
  }
  const setNames = [...sets.keys()];
  return { setNames, sets };
}

export function parseLongFormatSets(
  headers: string[],
  rows: string[][]
): { setNames: string[]; sets: Map<string, Set<string>> } {
  if (!headers || headers.length !== 2) {
    throw new Error("Long format requires exactly 2 columns (item, set).");
  }
  const sets = new Map<string, Set<string>>();
  for (const r of rows) {
    const item = (r[0] || "").trim();
    const setName = (r[1] || "").trim();
    if (!item || !setName) continue;
    if (!sets.has(setName)) sets.set(setName, new Set());
    sets.get(setName)!.add(item);
  }
  const setNames = [...sets.keys()];
  return { setNames, sets };
}

// ── CSV building + formula-injection scanning ─────────────────────────────
//
// Cells whose first character is one of these get a leading single-quote
// before the CSV escape. Excel / LibreOffice / Google Sheets all treat `=`,
// `+`, `-`, `@` (and a leading tab / CR before any of those) as a formula
// trigger; the prepended `'` tells the spreadsheet engine to treat the cell
// as text. This is the standard OWASP CSV-injection mitigation.

const _CSV_FORMULA_LEAD = /^[=+\-@\t\r]/;

function _isFormulaInjection(s: string): boolean {
  return _CSV_FORMULA_LEAD.test(s) && !isNumericValue(s);
}

function _escapeCsvCell(v: unknown): string {
  let s = String(v);
  if (_isFormulaInjection(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function buildCsvString(headers: unknown[], rows: unknown[][]): string {
  return [
    headers.map(_escapeCsvCell).join(","),
    ...rows.map((r) => r.map(_escapeCsvCell).join(",")),
  ].join("\n");
}

export function scanForFormulaInjection(
  headers: unknown[] | null | undefined,
  rows: unknown[][] | null | undefined,
  opts?: { cap?: number }
): FormulaInjectionWarning {
  const cap = (opts && opts.cap) || 8;
  const out: FormulaInjectionWarning = { count: 0, headers: [], cells: [] };
  if (Array.isArray(headers)) {
    for (let i = 0; i < headers.length; i++) {
      const v = headers[i];
      if (typeof v !== "string" || !_isFormulaInjection(v)) continue;
      out.count++;
      if (out.headers.length < cap) out.headers.push({ idx: i, value: v });
    }
  }
  if (Array.isArray(rows)) {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < row.length; c++) {
        const v = row[c];
        if (typeof v !== "string" || !_isFormulaInjection(v)) continue;
        out.count++;
        if (out.cells.length < cap) {
          out.cells.push({
            row: r,
            col: c,
            header: headers && headers[c] != null ? String(headers[c]) : null,
            value: v,
          });
        }
      }
    }
  }
  return out;
}
