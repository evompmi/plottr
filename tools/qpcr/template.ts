// Fill-in Excel template for the long layout: a "How to fill" legend sheet,
// an empty "Data" sheet with the four headers, and a small worked
// "Example" that pastes straight into the tool. The headers stay English in
// both languages because `detectLayout` recognises them automatically.

import type { XlsxCell, XlsxSheet } from "../_core/xlsx";
import type { QpcrKey } from "./i18n";

export const TEMPLATE_HEADERS = ["Sample", "Group", "Gene", "Ct"];

// Mean Ct per biological sample (3 per group) and the per-well offsets of
// its three technical replicates. ACT2 is the reference, RD29A the target
// (~4.7 cycles earlier under drought, i.e. ~25-fold induction).
const EXAMPLE_MEANS: Record<string, Record<string, number[]>> = {
  ACT2: { Control: [18.52, 18.71, 18.4], Drought: [18.63, 18.45, 18.58] },
  RD29A: { Control: [27.1, 27.35, 26.92], Drought: [22.31, 22.05, 22.48] },
};
const TECH_OFFSETS = [
  [-0.04, 0.03, 0.01],
  [0.02, -0.05, 0.03],
  [0.05, 0, -0.05],
];

export function templateExampleRows(): XlsxCell[][] {
  const rows: XlsxCell[][] = [];
  for (const group of ["Control", "Drought"]) {
    for (let s = 0; s < 3; s++) {
      for (const gene of Object.keys(EXAMPLE_MEANS)) {
        for (let t = 0; t < 3; t++) {
          // One well that did not amplify, to show how to write it.
          const undetermined = group === "Control" && s === 2 && gene === "RD29A" && t === 1;
          const ct = Math.round((EXAMPLE_MEANS[gene][group][s] + TECH_OFFSETS[s][t]) * 100) / 100;
          rows.push([s + 1, group, gene, undetermined ? "Undetermined" : ct]);
        }
      }
    }
  }
  return rows;
}

export function buildQpcrTemplateSheets(tr: (k: QpcrKey) => string): XlsxSheet[] {
  const legend: XlsxCell[][] = [
    [tr("qpcr.tpl.title")],
    [],
    [tr("qpcr.tpl.stepsHead"), "", ""],
    ["1", tr("qpcr.tpl.step1")],
    ["2", tr("qpcr.tpl.step2")],
    ["3", tr("qpcr.tpl.step3")],
    [],
    [tr("qpcr.tpl.colHead"), tr("qpcr.tpl.whatHead"), tr("qpcr.tpl.exampleHead")],
    ["Sample", tr("qpcr.tpl.colSample"), 1],
    ["Group", tr("qpcr.tpl.colGroup"), "Control"],
    ["Gene", tr("qpcr.tpl.colGene"), "ACT2"],
    ["Ct", tr("qpcr.tpl.colCt"), 18.52],
    [],
    [tr("qpcr.tpl.rulesHead"), "", ""],
    ["•", tr("qpcr.tpl.rule1")],
    ["•", tr("qpcr.tpl.rule2")],
    ["•", tr("qpcr.tpl.rule3")],
    ["•", tr("qpcr.tpl.rule4")],
    ["•", tr("qpcr.tpl.rule5")],
  ];
  return [
    {
      name: tr("qpcr.tpl.sheetLegend"),
      rows: legend,
      rowStyles: { 0: "title", 2: "header", 7: "header", 13: "header" },
      colWidths: [12, 80, 14],
      wrapCols: [1],
    },
    {
      name: tr("qpcr.tpl.sheetData"),
      rows: [TEMPLATE_HEADERS],
      rowStyles: { 0: "header" },
      colWidths: [12, 16, 16, 10],
      freezeHeader: true,
    },
    {
      name: tr("qpcr.tpl.sheetExample"),
      rows: [TEMPLATE_HEADERS, ...templateExampleRows()],
      rowStyles: { 0: "header" },
      colWidths: [12, 16, 16, 14],
      freezeHeader: true,
    },
  ];
}
