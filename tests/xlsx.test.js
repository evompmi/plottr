// Unit tests for the dependency-free .xlsx writer (tools/_core/xlsx.ts).
// The archive is unpacked with the test-only STORE reader and each OOXML
// part is checked as text: part list, content types, relationships, sheet
// names, cell encoding (numbers, inline strings, escaping, empties) and the
// style indices the writer promises. The files were also opened in
// Microsoft Excel and read back with openpyxl when the writer landed.

const { suite, test, assert, eq, summary } = require("./harness");
const X = require("./helpers/xlsx-loader");
const { readZip } = require("./helpers/zip-reader");

async function parts(sheets) {
  const blob = await X.buildXlsx(sheets);
  eq(blob.type, X.XLSX_MIME);
  const z = readZip(new Uint8Array(await blob.arrayBuffer()));
  const dec = new TextDecoder();
  const out = {};
  for (const e of z.entries) out[e.name] = dec.decode(e.data);
  return { names: z.entries.map((e) => e.name), part: out };
}

suite("xlsx — helpers");

test("columnLetter maps 0-based indices to Excel letters", () => {
  eq([0, 1, 25, 26, 27, 51, 52, 701, 702].map(X.columnLetter), [
    "A",
    "B",
    "Z",
    "AA",
    "AB",
    "AZ",
    "BA",
    "ZZ",
    "AAA",
  ]);
});

test("xmlEscape escapes markup and drops XML-illegal control characters", () => {
  eq(X.xmlEscape(`a & b <c> "d"`), "a &amp; b &lt;c&gt; &quot;d&quot;");
  eq(X.xmlEscape("x\u0000y\u0007z\tw\nv"), "xyz\tw\nv");
  eq(X.xmlEscape("Δ ΔΔCt · “q”"), "Δ ΔΔCt · “q”");
});

test("sanitizeSheetName strips forbidden characters and caps at 31", () => {
  eq(X.sanitizeSheetName("a[b]:c*d?e/f\\g", "S"), "abcdefg");
  eq(X.sanitizeSheetName("x".repeat(40), "S"), "x".repeat(31));
  eq(X.sanitizeSheetName("  ?? ", "Sheet1"), "Sheet1");
});

suite("xlsx — package structure");

test("writes the OOXML parts with one worksheet per sheet", async () => {
  const { names, part } = await parts([
    { name: "One", rows: [["a"]] },
    { name: "Two", rows: [[1]] },
  ]);
  eq(names, [
    "[Content_Types].xml",
    "_rels/.rels",
    "xl/workbook.xml",
    "xl/_rels/workbook.xml.rels",
    "xl/styles.xml",
    "xl/worksheets/sheet1.xml",
    "xl/worksheets/sheet2.xml",
  ]);
  const ct = part["[Content_Types].xml"];
  for (const p of ["/xl/workbook.xml", "/xl/styles.xml", "/xl/worksheets/sheet1.xml"]) {
    assert(ct.includes(`PartName="${p}"`), `content type missing for ${p}`);
  }
  assert(ct.includes('PartName="/xl/worksheets/sheet2.xml"'), "sheet2 content type");
  assert(part["_rels/.rels"].includes('Target="xl/workbook.xml"'), "root rel");
  const rels = part["xl/_rels/workbook.xml.rels"];
  assert(rels.includes('Id="rId1"') && rels.includes('Target="worksheets/sheet1.xml"'), "rId1");
  assert(rels.includes('Id="rId2"') && rels.includes('Target="worksheets/sheet2.xml"'), "rId2");
  assert(rels.includes('Id="rId3"') && rels.includes('Target="styles.xml"'), "styles rel");
  const wb = part["xl/workbook.xml"];
  assert(wb.includes('<sheet name="One" sheetId="1" r:id="rId1"/>'), wb);
  assert(wb.includes('<sheet name="Two" sheetId="2" r:id="rId2"/>'), wb);
});

test("dedupes sheet names case-insensitively and escapes them", async () => {
  const { part } = await parts([
    { name: "Data", rows: [] },
    { name: "data", rows: [] },
    { name: "R&D", rows: [] },
  ]);
  const wb = part["xl/workbook.xml"];
  assert(wb.includes('name="Data"'), wb);
  assert(wb.includes('name="data (2)"'), wb);
  assert(wb.includes('name="R&amp;D"'), wb);
});

test("only the first sheet is tab-selected", async () => {
  const { part } = await parts([
    { name: "A", rows: [] },
    { name: "B", rows: [] },
  ]);
  assert(part["xl/worksheets/sheet1.xml"].includes('tabSelected="1"'), "sheet1 selected");
  assert(!part["xl/worksheets/sheet2.xml"].includes("tabSelected"), "sheet2 not selected");
});

suite("xlsx — cells and styles");

test("numbers become <v>, strings inline, empties are skipped", async () => {
  const { part } = await parts([
    { name: "S", rows: [["Ct", 18.52, null, "", "<a&b>"], [], [NaN]] },
  ]);
  const xml = part["xl/worksheets/sheet1.xml"];
  assert(
    xml.includes(
      '<row r="1"><c r="A1" t="inlineStr"><is><t xml:space="preserve">Ct</t></is></c>' +
        '<c r="B1"><v>18.52</v></c>' +
        '<c r="E1" t="inlineStr"><is><t xml:space="preserve">&lt;a&amp;b&gt;</t></is></c></row>'
    ),
    xml
  );
  assert(xml.includes('<row r="2"></row>'), "empty row kept for numbering");
  assert(xml.includes('<c r="A3" t="inlineStr"><is><t xml:space="preserve">NaN</t>'), xml);
});

test("row styles and wrapped columns pick the documented cellXfs index", async () => {
  const { part } = await parts([
    {
      name: "S",
      rows: [["T"], ["H", "", "x"], ["n", "w"]],
      rowStyles: { 0: "title", 1: "header" },
      wrapCols: [1],
    },
  ]);
  const xml = part["xl/worksheets/sheet1.xml"];
  assert(xml.includes('<c r="A1" s="4" t="inlineStr">'), "title = 2*2");
  assert(xml.includes('<c r="A2" s="6" t="inlineStr">'), "header = 3*2");
  assert(xml.includes('<c r="B2" s="7"/>'), "empty header cell keeps its wrapped fill");
  assert(xml.includes('<c r="C2" s="6" t="inlineStr">'), "header, not wrapped");
  assert(xml.includes('<c r="A3" t="inlineStr">'), "normal = 0, no s attribute");
  assert(xml.includes('<c r="B3" s="1" t="inlineStr">'), "normal wrapped = 1");
  const styles = part["xl/styles.xml"];
  eq((styles.match(/<xf /g) || []).length, 9); // 1 cellStyleXfs + 8 cellXfs
  assert(styles.includes('<cellXfs count="8">'), styles);
});

test("column widths and the frozen header row are written", async () => {
  const { part } = await parts([
    { name: "S", rows: [["a", "b"]], colWidths: [12, 80], freezeHeader: true },
  ]);
  const xml = part["xl/worksheets/sheet1.xml"];
  assert(
    xml.includes(
      '<cols><col min="1" max="1" width="12" customWidth="1"/>' +
        '<col min="2" max="2" width="80" customWidth="1"/></cols>'
    ),
    xml
  );
  assert(
    xml.includes('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>')
  );
  // sheetViews must precede cols, which must precede sheetData (schema order).
  assert(xml.indexOf("<sheetViews>") < xml.indexOf("<cols>"), "sheetViews before cols");
  assert(xml.indexOf("<cols>") < xml.indexOf("<sheetData>"), "cols before sheetData");
});

summary();
