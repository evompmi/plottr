// _core/xlsx.ts — minimal, dependency-free .xlsx (SpreadsheetML) writer.
//
// Enough of the Office Open XML format to hand the user a fill-in template:
// several sheets of plain strings and numbers, a few cell styles (bold,
// title, shaded header), column widths, wrapped columns and a frozen first
// row. Strings are written inline (`t="inlineStr"`), so there is no
// sharedStrings part; the parts are packed with `buildZip` (STORE), which
// Excel, LibreOffice and Numbers all open. No formulas, merges or dates —
// cells are data, never code.

import { buildZip } from "./zip";

export type XlsxCell = string | number | null;
export type XlsxStyle = "normal" | "bold" | "title" | "header";

export interface XlsxSheet {
  // Tab name — trimmed to Excel's 31-character limit, `[]:*?/\` stripped.
  name: string;
  rows: XlsxCell[][];
  // Per-row style, keyed by 0-based row index; rows default to "normal".
  rowStyles?: Record<number, XlsxStyle>;
  // Column widths in Excel character units, by 0-based column index.
  colWidths?: number[];
  // 0-based columns whose cells wrap (top-aligned) instead of overflowing.
  wrapCols?: number[];
  // Freeze the first row so a header stays visible while scrolling.
  freezeHeader?: boolean;
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// cellXfs index = STYLE_BASE[style] * 2 + (wrapped ? 1 : 0); see STYLES_XML.
const STYLE_BASE: Record<XlsxStyle, number> = { normal: 0, bold: 1, title: 2, header: 3 };

const STYLES_XML =
  XML_HEAD +
  `<styleSheet xmlns="${NS_MAIN}">` +
  '<fonts count="3">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>' +
  "</fonts>" +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFDDE3F0"/><bgColor indexed="64"/></patternFill></fill>' +
  "</fills>" +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="8">' +
  [
    { font: 0, fill: 0 },
    { font: 1, fill: 0 },
    { font: 2, fill: 0 },
    { font: 1, fill: 2 },
  ]
    .map(({ font, fill }) => {
      const attrs = `numFmtId="0" fontId="${font}" fillId="${fill}" borderId="0" xfId="0"${
        font ? ' applyFont="1"' : ""
      }${fill ? ' applyFill="1"' : ""}`;
      return (
        `<xf ${attrs}/>` +
        `<xf ${attrs} applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`
      );
    })
    .join("") +
  "</cellXfs>" +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

// Escape text for an XML text node / attribute, dropping the control
// characters XML 1.0 forbids (Excel refuses the whole file otherwise).
export function xmlEscape(s: string): string {
  return (
    s
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f￾￿]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
}

// 0-based column index → Excel letters (0 → A, 25 → Z, 26 → AA).
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function sanitizeSheetName(name: string, fallback: string): string {
  const clean = name
    .replace(/[[\]:*?/\\]/g, "")
    .trim()
    .slice(0, 31);
  return clean || fallback;
}

function cellXml(ref: string, value: XlsxCell, xf: number): string {
  const s = xf ? ` s="${xf}"` : "";
  if (value === null || value === "") return xf ? `<c r="${ref}"${s}/>` : "";
  if (typeof value === "number") {
    // Non-finite numbers have no SpreadsheetML representation; write as text.
    if (!Number.isFinite(value)) return cellXml(ref, String(value), xf);
    return `<c r="${ref}"${s}><v>${value}</v></c>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function sheetXml(sheet: XlsxSheet, selected: boolean): string {
  const wrap = new Set(sheet.wrapCols ?? []);
  const pane = sheet.freezeHeader
    ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>'
    : "";
  const view =
    `<sheetViews><sheetView workbookViewId="0"${selected ? ' tabSelected="1"' : ""}` +
    (pane ? `>${pane}</sheetView>` : "/>") +
    "</sheetViews>";
  const widths = sheet.colWidths ?? [];
  const cols =
    widths.length > 0
      ? "<cols>" +
        widths
          .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
          .join("") +
        "</cols>"
      : "";
  const rows = sheet.rows
    .map((row, r) => {
      const base = STYLE_BASE[sheet.rowStyles?.[r] ?? "normal"];
      const cells = row
        .map((v, c) => cellXml(`${columnLetter(c)}${r + 1}`, v, base * 2 + (wrap.has(c) ? 1 : 0)))
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return (
    XML_HEAD +
    `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    view +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    cols +
    `<sheetData>${rows}</sheetData>` +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    "</worksheet>"
  );
}

// Build the workbook. The first sheet is the one Excel opens on.
export async function buildXlsx(sheets: XlsxSheet[]): Promise<Blob> {
  const used = new Set<string>();
  const names = sheets.map((sh, i) => {
    let name = sanitizeSheetName(sh.name, `Sheet${i + 1}`);
    // Excel compares sheet names case-insensitively.
    for (let k = 2; used.has(name.toLowerCase()); k++) {
      const suffix = ` (${k})`;
      name = sanitizeSheetName(sh.name, `Sheet${i + 1}`).slice(0, 31 - suffix.length) + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  });
  const n = sheets.length;
  const contentTypes =
    XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join("") +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    "</Types>";
  const rootRels =
    XML_HEAD +
    `<Relationships xmlns="${NS_PKG_REL}">` +
    `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
    "</Relationships>";
  const workbook =
    XML_HEAD +
    `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    '<bookViews><workbookView activeTab="0"/></bookViews>' +
    "<sheets>" +
    names
      .map((nm, i) => `<sheet name="${xmlEscape(nm)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("") +
    "</sheets></workbook>";
  const workbookRels =
    XML_HEAD +
    `<Relationships xmlns="${NS_PKG_REL}">` +
    sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
      )
      .join("") +
    `<Relationship Id="rId${n + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>` +
    "</Relationships>";

  // OOXML parts live in folders, so the zip keeps `/` in entry names.
  const parts: { path: string; xml: string }[] = [
    { path: "[Content_Types].xml", xml: contentTypes },
    { path: "_rels/.rels", xml: rootRels },
    { path: "xl/workbook.xml", xml: workbook },
    { path: "xl/_rels/workbook.xml.rels", xml: workbookRels },
    { path: "xl/styles.xml", xml: STYLES_XML },
    ...sheets.map((sh, i) => ({
      path: `xl/worksheets/sheet${i + 1}.xml`,
      xml: sheetXml(sh, i === 0),
    })),
  ];
  const zip = await buildZip(
    parts.map((p) => ({ blob: new Blob([p.xml]), filename: p.path })),
    { allowSubdirs: true }
  );
  return new Blob([zip], { type: XLSX_MIME });
}
