// tools/factorial/handoff.ts — builds the cross-tool handoff payload that
// jumps from the Factorial Analysis Report step into the Group Plot tool
// so the user can drill into specific cell-by-cell comparisons (post-hoc
// territory the factorial tool deliberately doesn't render itself).
//
// The boxplot consumer expects long-format CSV with one group column,
// one value column, and an optional filter column the user can use to
// slice the data. We project the factorial data into that shape and ship
// the pre-assigned column roles so boxplot skips its auto-detection
// entirely.

import type { HandoffPayload } from "../_shell/handoff";

export interface FactorialHandoffInput {
  factorAName: string;
  factorBName: string;
  valueName: string;
  longRows: Array<{ a: string; b: string; v: number }>;
  // Stem used to build the boxplot's filename hint.
  fileStem: string;
  // Which factor becomes the boxplot's grouping (x-axis) column. The
  // other factor becomes the filter column. Default "A" mirrors the
  // primary picked option documented at slice 2 scoping time.
  groupFactor: "A" | "B";
}

// Defensive CSV cell quoting — matches the shape the rest of the kernel
// emits. Quotes when the cell contains a comma, quote, or newline (or is
// empty), doubles internal quotes, leaves everything else bare.
function csvCell(s: string): string {
  if (s === "") return '""';
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function csvNum(v: number): string {
  // Boxplot's parser handles `1.5` and `1,5` alike (decimal-comma fix
  // runs first). Emit dot-decimal — fewer reader assumptions downstream.
  return String(v);
}

export function buildHandoffPayload(input: FactorialHandoffInput): HandoffPayload {
  const { factorAName, factorBName, valueName, longRows, fileStem, groupFactor } = input;
  // Pick which factor becomes group / filter from the toggle.
  const groupName = groupFactor === "A" ? factorAName : factorBName;
  const filterName = groupFactor === "A" ? factorBName : factorAName;
  const groupOfRow = (r: { a: string; b: string; v: number }): string =>
    groupFactor === "A" ? r.a : r.b;
  const filterOfRow = (r: { a: string; b: string; v: number }): string =>
    groupFactor === "A" ? r.b : r.a;

  // Header row + one CSV row per observation. Column order is
  // (group, value, filter) so boxplot's auto-detection lines up with
  // the explicit colRoles hint below — defence in depth in case a
  // future boxplot version forgets to honour colRoles.
  const lines: string[] = [];
  lines.push([csvCell(groupName), csvCell(valueName), csvCell(filterName)].join(","));
  for (const r of longRows) {
    lines.push([csvCell(groupOfRow(r)), csvNum(r.v), csvCell(filterOfRow(r))].join(","));
  }
  const csv = lines.join("\n");

  return {
    tool: "boxplot",
    csv,
    mode: "long",
    source: "factorial",
    fileName: fileStem + "_drilldown.csv",
    yLabel: valueName,
    colRoles: ["group", "value", "filter"],
  };
}
