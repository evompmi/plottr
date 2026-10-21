// Pure data derivations behind Group Plot's App: category ordering, boxplot
// group building (flat, per facet, per subgroup), stats-panel set lists,
// cell keys, and the composition-pie counts tables.
//
// No React: every export takes plain values in and returns plain values out,
// so App's useMemos stay thin wrappers and each piece is testable through
// `tests/helpers/boxplot-loader.js`.

import type {
  BoxplotGroup,
  BoxplotStatsSet,
  CompositionRowInput,
  CompositionTable,
  FacetCell,
  Subgroup,
  SubgroupedData,
} from "./helpers";
import { buildCompositionTable } from "./helpers";
import { resolveDiscretePalette } from "../_shell";
import { PALETTE } from "../_core/color";
import { computeStats, quartiles } from "../_core/descriptive";

// ── Category order ──────────────────────────────────────────────────────────

// Unique values of column `col` in first-seen order.
export function firstSeenOrder(rows: string[][], col: number): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const r of rows) {
    const v = r[col];
    if (!seen.has(v)) {
      seen.add(v);
      order.push(v);
    }
  }
  return order;
}

// The user's drag order, minus values no longer present, plus new values
// appended in natural order. No stored order → the natural order.
export function mergeStoredOrder(natural: string[], stored: string[] | undefined): string[] {
  if (!stored || stored.length === 0) return natural;
  const valid = stored.filter((g) => natural.includes(g));
  const missing = natural.filter((g) => !stored.includes(g));
  return [...valid, ...missing];
}

// A value was renamed from `oldLabel` to `newLabel`: keep its slot in the
// stored order instead of letting the new label fall to the end. When
// another value still carries the old label the new one is inserted right
// after it; when the new label already exists the two merge (the old slot
// goes if nothing else uses it). No stored order → nothing to keep.
export function renameInOrder(
  stored: string[] | undefined,
  oldLabel: string,
  newLabel: string,
  oldStillUsed: boolean
): string[] | undefined {
  if (!stored || oldLabel === newLabel) return stored;
  const idx = stored.indexOf(oldLabel);
  if (idx < 0) return stored;
  const next = stored.slice();
  if (next.includes(newLabel)) {
    if (!oldStillUsed) next.splice(idx, 1);
    return next;
  }
  if (oldStillUsed) next.splice(idx + 1, 0, newLabel);
  else next[idx] = newLabel;
  return next;
}

// ── Boxplot groups ──────────────────────────────────────────────────────────

export interface GroupBuildSpec {
  groupCol: number;
  valueCol: number;
  // -1 when no Color-by column is picked: every value lands in one "_all" source.
  colorByCol: number;
  colorByCategories: string[];
  // Group display order; groups absent from it are dropped.
  order: string[];
  disabled: Record<string, boolean>;
  // User-picked colours, then the discrete palette, then PALETTE.
  colors: Record<string, string>;
  palette: string;
  // Facet / subgroup cells take each group's colour from the flat plot first,
  // so a group keeps one colour across every cell.
  colorOverrides?: Record<string, string>;
}

// One boxplot group per category of `groupCol`, values split into sources
// by the Color-by column. Non-numeric and empty values are skipped.
export function buildGroups(rows: string[][], spec: GroupBuildSpec): BoxplotGroup[] {
  const { groupCol, valueCol, colorByCol } = spec;
  if (groupCol < 0 || valueCol < 0) return [];
  const gm: Record<string, Record<string, number[]>> = {};
  for (const r of rows) {
    if (groupCol >= r.length || valueCol >= r.length) continue;
    const g = r[groupCol];
    const v = Number(r[valueCol]);
    if (r[valueCol] === "" || isNaN(v)) continue;
    if (!gm[g]) gm[g] = {};
    const cat = colorByCol >= 0 ? (colorByCol < r.length ? r[colorByCol] : null) || "?" : "_all";
    if (!gm[g][cat]) gm[g][cat] = [];
    gm[g][cat].push(v);
  }
  const cats = colorByCol >= 0 ? spec.colorByCategories : ["_all"];
  const names = spec.order.filter((name) => gm[name] && !spec.disabled[name]);
  // Sized to the group count so ggplot2-hue / viridis-d generate the right
  // number of colours; fixed palettes recycle. Falls back to PALETTE if a
  // stale palette name slips through.
  const seedColors = resolveDiscretePalette(spec.palette || "okabe-ito", names.length);
  const overrides = spec.colorOverrides || {};
  return names.map((name, gi) => {
    const catMap = gm[name];
    const sources = cats
      .filter((c) => catMap[c])
      .map((category, colIndex) => ({ colIndex, values: catMap[category], category }));
    const allValues = sources.flatMap((s) => s.values);
    // `quartiles` and `computeStats` both return null on an empty array; only
    // spread when both succeed so the chart's `if (!g.stats)` narrowing holds.
    const q = quartiles(allValues);
    const cs = computeStats(allValues);
    return {
      name,
      sources,
      allValues,
      stats: q && cs ? { ...q, ...cs } : null,
      color:
        overrides[name] ||
        spec.colors[name] ||
        seedColors[gi % Math.max(1, seedColors.length)] ||
        PALETTE[gi % PALETTE.length],
    };
  });
}

// Partition `rows` by the subgroup column (in `sgOrder`) and build each
// subgroup's groups. Empty subgroups are skipped; `startIndex` / `count`
// locate each subgroup's band in `flatGroups`.
export function splitBySubgroup(
  rows: string[][],
  subgroupCol: number,
  sgOrder: string[],
  build: (cellRows: string[][]) => BoxplotGroup[]
): SubgroupedData {
  const subgroups: Subgroup[] = [];
  const flatGroups: BoxplotGroup[] = [];
  for (const name of sgOrder) {
    const groups = build(rows.filter((r) => r[subgroupCol] === name));
    if (groups.length === 0) continue;
    subgroups.push({ name, startIndex: flatGroups.length, count: groups.length });
    flatGroups.push(...groups);
  }
  return { subgroups, flatGroups };
}

// ── Stats-panel cells ───────────────────────────────────────────────────────

// Cell keys for the cellAnnotations / cellSummaries dicts. JSON-encoded so a
// category named e.g. "S3::pGFP" cannot collide with a facet × subgroup
// combination of "S3" × "pGFP" — plant-science labels routinely contain "::".
export const FLAT_KEY = "flat";
export const cellKey = (facetCat: string, sgName: string): string =>
  JSON.stringify([facetCat, sgName]);

export type StatsPanelMode = "flat" | "facet" | "subgroup" | "facetSubgroup";

export function statsPanelModeOf(facetByCol: number, subgroupByCol: number): StatsPanelMode {
  if (facetByCol >= 0) return subgroupByCol >= 0 ? "facetSubgroup" : "facet";
  return subgroupByCol >= 0 ? "subgroup" : "flat";
}

// One stats set per testable cell (≥ 2 groups — a single group can't be
// tested against itself), named so its scope is obvious and keyed to match
// the cellAnnotations / cellSummaries dicts.
export function buildStatsPanelSets(
  mode: StatsPanelMode,
  displayGroups: BoxplotGroup[],
  facetedData: FacetCell[],
  subgroupedData: SubgroupedData | null,
  renames: Record<string, string>
): BoxplotStatsSet[] {
  const renamedValues = (gs: BoxplotGroup[]) =>
    gs.map((g) => ({ name: renames[g.name] ?? g.name, values: g.allValues }));
  const bands = (sd: SubgroupedData) =>
    sd.subgroups.map((sg) => ({
      sg,
      groups: sd.flatGroups.slice(sg.startIndex, sg.startIndex + sg.count),
    }));
  if (mode === "flat") {
    if (displayGroups.length < 2) return [];
    const groups = displayGroups.map((g) => ({ name: g.name, values: g.allValues }));
    return [{ key: FLAT_KEY, name: "", groups }];
  }
  if (mode === "facet") {
    return facetedData
      .filter((fd) => fd.groups.length >= 2)
      .map((fd) => ({
        key: cellKey(fd.category, ""),
        name: fd.category,
        groups: renamedValues(fd.groups),
      }));
  }
  if (mode === "subgroup") {
    if (!subgroupedData) return [];
    return bands(subgroupedData)
      .filter((b) => b.groups.length >= 2)
      .map((b) => ({
        key: cellKey("", b.sg.name),
        name: b.sg.name,
        groups: renamedValues(b.groups),
      }));
  }
  const out: BoxplotStatsSet[] = [];
  for (const fd of facetedData) {
    if (!fd.subgroups || !fd.flatGroups) continue;
    for (const b of bands({ subgroups: fd.subgroups, flatGroups: fd.flatGroups })) {
      if (b.groups.length < 2) continue;
      out.push({
        key: cellKey(fd.category, b.sg.name),
        name: `${fd.category} — ${b.sg.name}`,
        groups: renamedValues(b.groups),
      });
    }
  }
  return out;
}

// ── Composition pies → Proportions ──────────────────────────────────────────

export interface CompositionSpec {
  colNames: string[];
  groupCol: number;
  facetByCol: number;
  subgroupByCol: number;
  colorByCategories: string[];
  facetedData: FacetCell[];
  subgroupedData: SubgroupedData | null;
  // Already carry the renamed display names.
  displayGroups: BoxplotGroup[];
  renames: Record<string, string>;
}

// One counts table per facet (facets are never pooled into one test), groups
// labelled `facet.subgroup.group` with the user's renames — the same groups,
// order and counts the pies draw.
export function buildCompositionTables(spec: CompositionSpec): CompositionTable[] {
  const { colNames, facetByCol, subgroupByCol, colorByCategories } = spec;
  const display = (name: string) => spec.renames[name] ?? name;
  const toRows = (
    groups: BoxplotGroup[],
    subgroups: Subgroup[] | null,
    prefix: string[]
  ): CompositionRowInput[] =>
    groups.map((g, gi) => {
      const sg = subgroups?.find((s) => gi >= s.startIndex && gi < s.startIndex + s.count);
      return {
        labelParts: [...prefix, ...(sg ? [sg.name] : []), display(g.name)],
        sources: g.sources,
      };
    });
  const sgHeader = subgroupByCol >= 0 ? [colNames[subgroupByCol] || ""] : [];
  const groupHeader = colNames[spec.groupCol] || "";
  if (facetByCol >= 0) {
    const header = [colNames[facetByCol] || "", ...sgHeader, groupHeader];
    return spec.facetedData
      .filter((fd) => fd.groups.length > 0)
      .map((fd) =>
        buildCompositionTable(
          toRows(fd.groups, fd.subgroups, [fd.category]),
          colorByCategories,
          header,
          fd.category
        )
      );
  }
  if (subgroupByCol >= 0 && spec.subgroupedData) {
    const sd = spec.subgroupedData;
    return [
      buildCompositionTable(
        toRows(sd.flatGroups, sd.subgroups, []),
        colorByCategories,
        [...sgHeader, groupHeader],
        null
      ),
    ];
  }
  const rows = spec.displayGroups.map((g) => ({ labelParts: [g.name], sources: g.sources }));
  return [buildCompositionTable(rows, colorByCategories, [groupHeader], null)];
}
