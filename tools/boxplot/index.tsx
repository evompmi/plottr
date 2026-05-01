// boxplot/index.tsx — App orchestrator for the Group Plot tool. This file is
// the esbuild entry point (bundles to tools/boxplot/index.js) and only holds state
// wiring — chart rendering, step panels, sidebar controls, and stats-panel
// live in sibling modules under tools/boxplot/.

import { usePlotToolState } from "../_shell/usePlotToolState";
import { PlotToolShell } from "../_shell/PlotToolShell";
import { ERROR_BAR_LABELS, mergeSubgroupAnnotations } from "./helpers";
import { UploadStep, ConfigureStep, FilterStep, OutputStep } from "./steps";
import { PlotControls } from "./controls";
import { PlotArea, FacetPlotList } from "./plot-area";
import { BoxplotStatsPanel, statsInit, statsReducer } from "./stats-panel";

const { useState, useReducer, useMemo, useCallback, useRef } = React;

const VIS_INIT_BOXPLOT = {
  plotTitle: "",
  yLabel: "Value",
  plotBg: "#ffffff",
  showGrid: false,
  gridColor: "#e0e0e0",
  boxFillOpacity: 0.15,
  boxWidth: 70,
  boxGap: 0,
  pointSize: 2.5,
  showPoints: true,
  jitterWidth: 0.6,
  pointOpacity: 0.6,
  xLabelAngle: 0,
  yMinCustom: "",
  yMaxCustom: "",
  yScale: "linear",
  showCompPie: false,
  plotStyle: "box",
  horizontal: false,
  errorType: "sem",
  errStrokeWidth: 1.2,
  showBarOutline: false,
  barOutlineWidth: 1.5,
  barOutlineColor: "#333333",
  barOpacity: 0.25,
  // Per-group / per-colour-category colours, keyed by name. Live in `vis`
  // (rather than local useState) so they auto-persist to localStorage +
  // round-trip through the PrefsPanel file save/load. Names that don't
  // match a saved entry fall back to the palette default.
  boxplotColors: {},
  categoryColors: {},
};

/* ── Main App (orchestrator) ───────────────────────────────────────────────── */

function App() {
  const shell = usePlotToolState("boxplot", VIS_INIT_BOXPLOT);
  const {
    step,
    setStep,
    fileName,
    setFileName,
    setParseError,
    sepOverride,
    setSepOverride,
    setCommaFixed,
    setCommaFixCount,
    vis,
    updVis,
  } = shell;

  // Upload & navigation
  const [rawText, setRawText] = useState(null);
  const [dataFormat, setDataFormat] = useState("long");

  // Parsing
  const [parsedHeaders, setParsedHeaders] = useState([]);
  const [parsedRows, setParsedRows] = useState([]);
  const [hasHeader, setHasHeader] = useState(true);

  // Column config & filtering
  const [colRoles, setColRoles] = useState<ColumnRole[]>([]);
  const [colNames, setColNames] = useState([]);
  const [filters, setFilters] = useState({});
  const [valueRenames, setValueRenames] = useState({});

  // Plot state. boxplotColors + categoryColors now live in `vis` so the
  // PrefsPanel's Save / Load file and the auto-persist localStorage slot
  // cover them. Exposed as read-through variables with function-capable
  // setters so existing call sites (including functional updaters) work
  // unchanged.
  const boxplotColors = vis.boxplotColors || {};
  const setBoxplotColors = useCallback(
    (updater) =>
      updVis({
        boxplotColors:
          typeof updater === "function" ? updater(vis.boxplotColors || {}) : updater || {},
      }),
    [updVis, vis.boxplotColors]
  );
  const [plotGroupRenames, setPlotGroupRenames] = useState({});
  const [disabledGroups, setDisabledGroups] = useState({});
  // Per-column ordering keyed by column index. Any column that can appear in
  // the rename panel (group/filter role) gets its own order array here, so the
  // user can reorder values during the filter step before ever picking a
  // "Facet by" or "Color by" column in the plot step.
  const [columnOrders, setColumnOrders] = useState({});
  const setOrderForCol = (i, newOrder) => setColumnOrders((prev) => ({ ...prev, [i]: newOrder }));
  const [colorByCol, setColorByCol] = useState(-1);
  const categoryColors = vis.categoryColors || {};
  const setCategoryColors = useCallback(
    (updater) =>
      updVis({
        categoryColors:
          typeof updater === "function" ? updater(vis.categoryColors || {}) : updater || {},
      }),
    [updVis, vis.categoryColors]
  );
  const [dragState, setDragState] = useState(null);
  const [facetByCol, _setFacetByCol] = useState(-1);
  const [subgroupByCol, _setSubgroupByCol] = useState(-1);
  // Facet and subgroup are independent. The only cross-guard is that they
  // can't be the same column (degenerate: every facet has one subgroup).
  // The dropdowns also filter each other's pool so the user can't pick a
  // collision. Each column change clears the keyed cell-annotation /
  // summary dicts so stale entries from previous categories don't
  // accumulate across long sessions.
  const handleSetFacetByCol = (v) => {
    if (facetByCol !== v) dispatchStats({ type: "clearCells" });
    _setFacetByCol(v);
    if (v >= 0 && v === subgroupByCol) _setSubgroupByCol(-1);
  };
  const handleSetSubgroupByCol = (v) => {
    if (subgroupByCol !== v) dispatchStats({ type: "clearCells" });
    _setSubgroupByCol(v);
    if (v >= 0 && v === facetByCol) _setFacetByCol(-1);
  };
  // One composite-key dict covers every plot mode. The active mode shapes
  // the keys (App composes `${facet}::${subgroup}`, with empty strings for
  // missing dimensions) and the panel below stamps annotations / summaries
  // back into the dict via setCell*.
  const [statsUi, dispatchStats] = useReducer(statsReducer, statsInit);
  const handleStatsShowSummaryChange = (v) => dispatchStats({ type: "setShowSummary", value: v });
  const handleStatsDisplayModeChange = (v) => dispatchStats({ type: "setDisplayMode", value: v });
  const setStatsShowNs = (v) => dispatchStats({ type: "setShowNs", value: v });
  // Stable references so `FacetTrio`'s shallow-compare memo can skip
  // re-rendering unaffected facets when one map entry updates.
  const setCellAnnotation = useCallback(
    (key, spec) => dispatchStats({ type: "setCellAnnotation", key, value: spec }),
    []
  );
  const setCellSummary = useCallback(
    (key, txt) => dispatchStats({ type: "setCellSummary", key, value: txt }),
    []
  );

  const facetRefs = useRef({});
  const chartRef = useRef();

  const resetDerived = () => {
    setValueRenames({});
    setBoxplotColors({});
    setPlotGroupRenames({});
    setDisabledGroups({});
    setColumnOrders({});
    setColorByCol(-1);
    setCategoryColors({});
    _setFacetByCol(-1);
    _setSubgroupByCol(-1);
    dispatchStats({ type: "reset" });
    updVis({ yMinCustom: "", yMaxCustom: "" });
  };

  const buildFilters = (hdrs, rws) => {
    const f = {};
    hdrs.forEach((_, i) => {
      const u = [...new Set(rws.map((r) => r[i]))].sort();
      f[i] = { unique: u, included: new Set(u) };
    });
    return f;
  };

  const doParse = useCallback((text, sep) => {
    const dc = fixDecimalCommas(text, sep);
    const fixedText = dc.text;
    setCommaFixed(dc.commaFixed);
    setCommaFixCount(dc.count);
    setRawText(fixedText);

    const { headers, rows, hasHeader: hh } = parseRaw(fixedText, sep);
    if (!headers.length || !rows.length) {
      setParseError(
        "The file appears to be empty or has no data rows. Please check your file and try again."
      );
      return;
    }
    setParseError(null);

    const isWide = detectWideFormat(headers, rows);
    if (isWide) {
      const { headers: lh, rows: lr } = wideToLong(headers, rows);
      setParsedHeaders(lh);
      setParsedRows(lr);
      setHasHeader(true);
      setColRoles(["group", "value"]);
      setColNames([...lh]);
      setFilters(buildFilters(lh, lr));
      resetDerived();
      setDataFormat("wide");
      setStep("plot");
    } else {
      setParsedHeaders(headers);
      setParsedRows(rows);
      setHasHeader(hh);
      // guessColumnType is per-column, so it can hand back multiple "group"
      // or "value" roles (e.g. two low-cardinality categorical columns or two
      // numeric columns). Group Plot only uses one x-axis grouping column and
      // one numeric value column — keep the first guess of each and demote
      // any later ones to "filter" so the configure step never starts in a
      // state the user can't reach via the UI.
      {
        let seenGroup = false;
        let seenValue = false;
        setColRoles(
          headers.map((_, i) => {
            const r = guessColumnType(rows.map((row) => row[i] ?? ""));
            if (r === "group") {
              if (seenGroup) return "filter";
              seenGroup = true;
              return r;
            }
            if (r === "value") {
              if (seenValue) return "filter";
              seenValue = true;
              return r;
            }
            return r;
          })
        );
      }
      setColNames([...headers]);
      setFilters(buildFilters(headers, rows));
      resetDerived();
      setDataFormat("long");
      setStep("configure");
    }
  }, []);

  const handleFileLoad = useCallback(
    (text, name) => {
      setFileName(name);
      doParse(text, sepOverride);
    },
    [sepOverride, doParse]
  );
  const loadExample = useCallback(() => {
    const csv = makeExamplePlantCSV();
    setSepOverride(",");
    setFileName("example_plant_growth.csv");
    doParse(csv, ",");
  }, [doParse]);

  const resetAll = () => {
    setRawText(null);
    setParsedRows([]);
    setParsedHeaders([]);
    setFileName("");
    setStep("upload");
  };

  const applyRename = (ci, v) =>
    valueRenames[ci] && valueRenames[ci][v] != null ? valueRenames[ci][v] : v;

  const filteredRows = useMemo(
    () => parsedRows.filter((r) => r.every((v, ci) => !filters[ci] || filters[ci].included.has(v))),
    [parsedRows, filters]
  );

  const renamedRows = useMemo(
    () => filteredRows.map((r) => r.map((v, ci) => applyRename(ci, v))),
    [filteredRows, valueRenames]
  );

  const activeColIdxs = useMemo(
    () =>
      colRoles.reduce((acc, r, i) => {
        if (r !== "ignore") acc.push(i);
        return acc;
      }, []),
    [colRoles]
  );

  const groupColIdx = colRoles.indexOf("group");
  const valueColIdx = colRoles.indexOf("value");

  const groupedData = useMemo(() => {
    if (groupColIdx < 0 || valueColIdx < 0) return {};
    const g = {};
    renamedRows.forEach((r) => {
      const k = r[groupColIdx];
      if (!g[k]) g[k] = [];
      g[k].push(r[valueColIdx]);
    });
    return g;
  }, [renamedRows, groupColIdx, valueColIdx]);

  const stats = useMemo(() => computeGroupStats(groupedData), [groupedData]);

  const wideData = useMemo(
    () =>
      groupColIdx < 0 || valueColIdx < 0
        ? null
        : reshapeWide(renamedRows, groupColIdx, valueColIdx),
    [renamedRows, groupColIdx, valueColIdx]
  );

  const naturalGroupOrder = useMemo(() => {
    if (groupColIdx < 0 || valueColIdx < 0) return [];
    const seen = new Set(),
      order = [];
    renamedRows.forEach((r) => {
      const g = r[groupColIdx];
      if (!seen.has(g)) {
        seen.add(g);
        order.push(g);
      }
    });
    return order;
  }, [renamedRows, groupColIdx, valueColIdx]);

  const effectiveOrder = useMemo(() => {
    const stored = columnOrders[groupColIdx];
    if (stored && stored.length > 0) {
      const valid = stored.filter((g) => naturalGroupOrder.includes(g));
      const missing = naturalGroupOrder.filter((g) => !stored.includes(g));
      return [...valid, ...missing];
    }
    return naturalGroupOrder;
  }, [columnOrders, groupColIdx, naturalGroupOrder]);

  const colorByCandidates = useMemo(
    () =>
      parsedHeaders
        .map((_, i) => i)
        .filter(
          (i) =>
            i !== groupColIdx &&
            i !== valueColIdx &&
            (colRoles[i] === "filter" || colRoles[i] === "group")
        ),
    [parsedHeaders, groupColIdx, valueColIdx, colRoles]
  );

  const colorByCategories = useMemo(() => {
    if (colorByCol < 0) return [];
    return [...new Set(renamedRows.map((r) => r[colorByCol]))].sort();
  }, [colorByCol, renamedRows]);

  const boxplotGroups = useMemo(() => {
    if (groupColIdx < 0 || valueColIdx < 0) return [];
    const gm = {};
    renamedRows.forEach((r) => {
      if (groupColIdx >= r.length || valueColIdx >= r.length) return;
      const g = r[groupColIdx],
        v = Number(r[valueColIdx]);
      if (r[valueColIdx] === "" || isNaN(v)) return;
      if (!gm[g]) gm[g] = {};
      if (colorByCol >= 0) {
        const cat = (colorByCol < r.length ? r[colorByCol] : null) || "?";
        if (!gm[g][cat]) gm[g][cat] = [];
        gm[g][cat].push(v);
      } else {
        if (!gm[g]["_all"]) gm[g]["_all"] = [];
        gm[g]["_all"].push(v);
      }
    });
    const cats = colorByCol >= 0 ? colorByCategories : ["_all"];
    return effectiveOrder
      .filter((name) => gm[name])
      .map((name, gi) => {
        const catMap = gm[name];
        const sources = cats
          .filter((c) => catMap[c])
          .map((cat, si) => ({
            colIndex: si,
            values: catMap[cat],
            category: cat,
          }));
        const allValues = sources.flatMap((s) => s.values);
        return {
          name,
          sources,
          allValues,
          stats: { ...quartiles(allValues), ...computeStats(allValues) },
          color: boxplotColors[name] || PALETTE[gi % PALETTE.length],
        };
      });
  }, [
    renamedRows,
    groupColIdx,
    valueColIdx,
    boxplotColors,
    effectiveOrder,
    colorByCol,
    colorByCategories,
  ]);

  const allDisplayGroups = useMemo(
    () =>
      boxplotGroups.map((g) => ({
        ...g,
        displayName: plotGroupRenames[g.name] ?? g.name,
        enabled: !disabledGroups[g.name],
      })),
    [boxplotGroups, plotGroupRenames, disabledGroups]
  );

  const displayBoxplotGroups = useMemo(
    () => allDisplayGroups.filter((g) => g.enabled).map((g) => ({ ...g, name: g.displayName })),
    [allDisplayGroups]
  );

  // Facet column candidates (same pool as colorBy). The natural order is the
  // first-seen order of unique values in the (renamed) data so it matches what
  // the user sees in the rename panel.
  const naturalFacetOrder = useMemo(() => {
    if (facetByCol < 0) return [];
    const seen = new Set();
    const order = [];
    renamedRows.forEach((r) => {
      const v = r[facetByCol];
      if (!seen.has(v)) {
        seen.add(v);
        order.push(v);
      }
    });
    return order;
  }, [facetByCol, renamedRows]);

  const effectiveFacetOrder = useMemo(() => {
    const stored = columnOrders[facetByCol];
    if (stored && stored.length > 0) {
      const valid = stored.filter((g) => naturalFacetOrder.includes(g));
      const missing = naturalFacetOrder.filter((g) => !stored.includes(g));
      return [...valid, ...missing];
    }
    return naturalFacetOrder;
  }, [columnOrders, facetByCol, naturalFacetOrder]);

  const facetByCategories = effectiveFacetOrder;

  // Every group/filter column (except the numeric value column) is
  // reorderable. Each column's natural order is first-seen in renamedRows,
  // any user-drag override is merged on top. Computed here so that reordering
  // works at the filter step — before the user has even chosen which column
  // feeds "Facet by" or "Color by" in the plot step.
  const orderableCols = useMemo(() => {
    const m = {};
    parsedHeaders.forEach((_, i) => {
      if (i === valueColIdx) return;
      if (colRoles[i] !== "group" && colRoles[i] !== "filter") return;
      const seen = new Set();
      const natural = [];
      renamedRows.forEach((r) => {
        const v = r[i];
        if (!seen.has(v)) {
          seen.add(v);
          natural.push(v);
        }
      });
      const stored = columnOrders[i];
      let order = natural;
      if (stored && stored.length > 0) {
        const valid = stored.filter((g) => natural.includes(g));
        const missing = natural.filter((g) => !stored.includes(g));
        order = [...valid, ...missing];
      }
      m[i] = { order, onReorder: (newOrder) => setOrderForCol(i, newOrder) };
    });
    return m;
  }, [parsedHeaders, colRoles, valueColIdx, renamedRows, columnOrders]);

  // Build the boxplot groups for one (facet, subgroup) cell. Pure helper —
  // closes over global color map / disabled groups / color-by state to match
  // what `boxplotGroups` does for the flat case. `cellRows` is already
  // filtered to a single facet × subgroup combo.
  const buildCellGroups = useCallback(
    (cellRows: any[], globalColorMap: Record<string, string>) => {
      const gm: Record<string, Record<string, number[]>> = {};
      cellRows.forEach((r) => {
        if (groupColIdx >= r.length || valueColIdx >= r.length) return;
        const g = r[groupColIdx],
          v = Number(r[valueColIdx]);
        if (r[valueColIdx] === "" || isNaN(v)) return;
        if (!gm[g]) gm[g] = {};
        if (colorByCol >= 0) {
          const cc = (colorByCol < r.length ? r[colorByCol] : null) || "?";
          if (!gm[g][cc]) gm[g][cc] = [];
          gm[g][cc].push(v);
        } else {
          if (!gm[g]["_all"]) gm[g]["_all"] = [];
          gm[g]["_all"].push(v);
        }
      });
      const cats = colorByCol >= 0 ? colorByCategories : ["_all"];
      return effectiveOrder
        .filter((name) => gm[name] && !disabledGroups[name])
        .map((name, gi) => {
          const catMap = gm[name];
          const sources = cats
            .filter((c) => catMap[c])
            .map((c, si) => ({
              colIndex: si,
              values: catMap[c],
              category: c,
            }));
          const allValues = sources.flatMap((s) => s.values);
          return {
            name,
            sources,
            allValues,
            stats: { ...quartiles(allValues), ...computeStats(allValues) },
            color: globalColorMap[name] || boxplotColors[name] || PALETTE[gi % PALETTE.length],
          };
        });
    },
    [
      groupColIdx,
      valueColIdx,
      colorByCol,
      colorByCategories,
      effectiveOrder,
      disabledGroups,
      boxplotColors,
    ]
  );

  // Faceted data with optional subgroup nesting. Shape per entry:
  //   { category, groups, subgroups | null, flatGroups | null }
  // — `groups` is what BoxplotChart consumes (== flatGroups when subgrouped,
  // else the per-facet boxes). `subgroups` carries the {name,startIndex,count}
  // band metadata when subgroupByCol is active. The non-facet flat path is
  // handled separately below.
  const facetedData = useMemo(() => {
    if (facetByCol < 0) return [];
    const globalColorMap: Record<string, string> = {};
    boxplotGroups.forEach((g) => {
      globalColorMap[g.name] = g.color;
    });
    const sgOrder = subgroupByCol >= 0 ? orderableCols[subgroupByCol]?.order || [] : null;
    return facetByCategories.map((cat) => {
      const catRows = renamedRows.filter((r) => r[facetByCol] === cat);
      if (sgOrder && sgOrder.length > 0) {
        const subgroups: Array<{ name: string; startIndex: number; count: number }> = [];
        const flatGroups: any[] = [];
        let startIndex = 0;
        for (const sgCat of sgOrder) {
          const sgRows = catRows.filter((r) => r[subgroupByCol] === sgCat);
          const groups = buildCellGroups(sgRows, globalColorMap);
          if (groups.length > 0) {
            subgroups.push({ name: sgCat, startIndex, count: groups.length });
            flatGroups.push(...groups);
            startIndex += groups.length;
          }
        }
        return { category: cat, groups: flatGroups, subgroups, flatGroups };
      }
      const groups = buildCellGroups(catRows, globalColorMap);
      return { category: cat, groups, subgroups: null, flatGroups: null };
    });
  }, [
    facetByCol,
    facetByCategories,
    subgroupByCol,
    orderableCols,
    renamedRows,
    boxplotGroups,
    buildCellGroups,
  ]);

  // Subgroup-only data: single plot with groups partitioned by subgroup column.
  // (Facet+subgroup mode threads subgroups through facetedData above instead.)
  const subgroupedData = useMemo(() => {
    if (subgroupByCol < 0 || facetByCol >= 0 || groupColIdx < 0 || valueColIdx < 0) return null;
    const sgOrder = orderableCols[subgroupByCol]?.order || [];
    if (sgOrder.length === 0) return null;
    const globalColorMap: Record<string, string> = {};
    boxplotGroups.forEach((g) => {
      globalColorMap[g.name] = g.color;
    });
    const subgroups: Array<{ name: string; startIndex: number; count: number }> = [];
    const flatGroups: any[] = [];
    let startIndex = 0;
    for (const sgCat of sgOrder) {
      const sgRows = renamedRows.filter((r) => r[subgroupByCol] === sgCat);
      const groups = buildCellGroups(sgRows, globalColorMap);
      if (groups.length > 0) {
        subgroups.push({ name: sgCat, startIndex, count: groups.length });
        flatGroups.push(...groups);
        startIndex += groups.length;
      }
    }
    if (subgroups.length === 0) return null;
    return { subgroups, flatGroups };
  }, [
    subgroupByCol,
    facetByCol,
    orderableCols,
    renamedRows,
    groupColIdx,
    valueColIdx,
    boxplotGroups,
    buildCellGroups,
  ]);

  // Cell key composition. App owns the keying convention; the panel and
  // reducer treat keys as opaque strings. Using "::" as separator with empty
  // strings for missing dimensions guarantees a stable, unique key per cell.
  const FLAT_KEY = "flat";
  const cellKey = (facetCat: string, sgName: string) => `${facetCat}::${sgName}`;

  // Merge per-subgroup annotation specs (extracted from the unified
  // cellAnnotations dict) into a single chart-level spec with offset
  // indices. Used by both subgroup-only mode and (per-facet) facet+subgroup
  // mode to project per-cell brackets / CLD letters onto the flat axis.
  const mergeAnnotForSubgroups = useCallback(
    (subgroups: any[], flatGroups: any[], facetCat: string) => {
      const renamedFlat = flatGroups.map((g) => ({
        ...g,
        name: plotGroupRenames[g.name] ?? g.name,
      }));
      const perKeySpecs: Record<string, unknown> = {};
      for (const sg of subgroups) {
        perKeySpecs[sg.name] = statsUi.cellAnnotations[cellKey(facetCat, sg.name)] || null;
      }
      return mergeSubgroupAnnotations(subgroups, renamedFlat, perKeySpecs);
    },
    [statsUi.cellAnnotations, plotGroupRenames]
  );

  const mergedSubgroupAnnot = useMemo(() => {
    if (!subgroupedData) return null;
    return mergeAnnotForSubgroups(subgroupedData.subgroups, subgroupedData.flatGroups, "");
  }, [subgroupedData, mergeAnnotForSubgroups]);

  // The non-facet chart gets a single annotation spec and a single summary
  // line chosen by the active mode.
  const chartAnnotations =
    subgroupByCol >= 0 && subgroupedData
      ? mergedSubgroupAnnot
      : statsUi.cellAnnotations[FLAT_KEY] || null;
  const chartSummary =
    subgroupByCol >= 0 && subgroupedData ? null : statsUi.cellSummaries[FLAT_KEY] || null;

  // Per-facet annotation + per-subgroup-band summaries for the FacetTrio
  // chart. Computed once here so FacetPlotList can pass typed maps in
  // without each FacetTrio recomputing on every parent render.
  const perFacetChartAnnotations = useMemo(() => {
    if (facetByCol < 0) return {};
    const out: Record<string, unknown> = {};
    for (const fd of facetedData) {
      if (fd.subgroups && fd.flatGroups) {
        out[fd.category] = mergeAnnotForSubgroups(fd.subgroups, fd.flatGroups, fd.category);
      } else {
        out[fd.category] = statsUi.cellAnnotations[cellKey(fd.category, "")] || null;
      }
    }
    return out;
  }, [facetByCol, facetedData, statsUi.cellAnnotations, mergeAnnotForSubgroups]);

  const perFacetSubgroupSummaries = useMemo(() => {
    if (facetByCol < 0) return {};
    const out: Record<string, Record<string, string | null>> = {};
    for (const fd of facetedData) {
      if (!fd.subgroups) continue;
      const map: Record<string, string | null> = {};
      for (const sg of fd.subgroups) {
        map[sg.name] = statsUi.cellSummaries[cellKey(fd.category, sg.name)] || null;
      }
      out[fd.category] = map;
    }
    return out;
  }, [facetByCol, facetedData, statsUi.cellSummaries]);

  const perFacetSummaries = useMemo(() => {
    if (facetByCol < 0) return {};
    const out: Record<string, string | null> = {};
    for (const fd of facetedData) {
      if (fd.subgroups) continue;
      out[fd.category] = statsUi.cellSummaries[cellKey(fd.category, "")] || null;
    }
    return out;
  }, [facetByCol, facetedData, statsUi.cellSummaries]);

  // One bottom stats panel for every mode. The set list is shaped per mode so
  // each tile's `name` makes its scope obvious — flat / facet / subgroup /
  // facet × subgroup — and the `key` matches the cellAnnotations / cellSummaries
  // dict the panel writes back into. ≥2-group filter mirrors the panel's own
  // skip rule (a single group can't be tested against itself).
  const statsPanelMode: "flat" | "facet" | "subgroup" | "facetSubgroup" =
    facetByCol >= 0 && subgroupByCol >= 0
      ? "facetSubgroup"
      : facetByCol >= 0
        ? "facet"
        : subgroupByCol >= 0
          ? "subgroup"
          : "flat";
  const statsPanelLabel = useMemo(() => {
    if (statsPanelMode === "facet") return "Facet";
    if (statsPanelMode === "subgroup") return "Subgroup";
    if (statsPanelMode === "facetSubgroup") return "Facet × Subgroup";
    return "";
  }, [statsPanelMode]);
  const statsPanelSets = useMemo(() => {
    const renamedValues = (gs: any[]) =>
      gs.map((g) => ({ name: plotGroupRenames[g.name] ?? g.name, values: g.allValues }));
    if (statsPanelMode === "flat") {
      if (displayBoxplotGroups.length < 2) return [];
      return [
        {
          key: FLAT_KEY,
          name: "",
          groups: displayBoxplotGroups.map((g) => ({ name: g.name, values: g.allValues })),
        },
      ];
    }
    if (statsPanelMode === "facet") {
      return facetedData
        .filter((fd) => fd.groups.length >= 2)
        .map((fd) => ({
          key: cellKey(fd.category, ""),
          name: fd.category,
          groups: renamedValues(fd.groups),
        }));
    }
    if (statsPanelMode === "subgroup") {
      if (!subgroupedData) return [];
      return subgroupedData.subgroups
        .map((sg) => {
          const sgGroups = subgroupedData.flatGroups.slice(sg.startIndex, sg.startIndex + sg.count);
          return {
            key: cellKey("", sg.name),
            name: sg.name,
            groups: renamedValues(sgGroups),
          };
        })
        .filter((s) => s.groups.length >= 2);
    }
    // facet × subgroup
    const out: any[] = [];
    for (const fd of facetedData) {
      if (!fd.subgroups || !fd.flatGroups) continue;
      for (const sg of fd.subgroups) {
        const sgGroups = fd.flatGroups.slice(sg.startIndex, sg.startIndex + sg.count);
        if (sgGroups.length < 2) continue;
        out.push({
          key: cellKey(fd.category, sg.name),
          name: `${fd.category} — ${sg.name}`,
          groups: renamedValues(sgGroups),
        });
      }
    }
    return out;
  }, [statsPanelMode, displayBoxplotGroups, facetedData, subgroupedData, plotGroupRenames]);

  const toggleFilter = (ci, v) =>
    setFilters((p) => {
      const f = { ...p },
        s = new Set(f[ci].included);
      if (s.has(v)) s.delete(v);
      else s.add(v);
      f[ci] = { ...f[ci], included: s };
      return f;
    });

  const toggleAllFilter = (ci, all) =>
    setFilters((p) => {
      const f = { ...p };
      f[ci] = { ...f[ci], included: all ? new Set(f[ci].unique) : new Set() };
      return f;
    });

  const setRenameVal = (ci, ov, nv) =>
    setValueRenames((p) => {
      const r = { ...p };
      if (!r[ci]) r[ci] = {};
      r[ci] = { ...r[ci], [ov]: nv };
      return r;
    });

  // Group Plot has exactly one x-axis grouping column and one numeric value
  // column, so "group" and "value" are exclusive roles. Picking either on a
  // new column demotes any previous column with the same role to "filter"
  // instead of silently ending up with two columns whose role select says
  // the same thing but only the first one actually drives the plot
  // (valueColIdx / groupColIdx are both `colRoles.indexOf(...)`).
  const updateRole = (i: number, role: ColumnRole) =>
    setColRoles((p) =>
      p.map((r, j) => {
        if (j === i) return role;
        if ((role === "group" || role === "value") && r === role) return "filter";
        return r;
      })
    );
  const updateColName = (i, nm) => setColNames((p) => p.map((n, j) => (j === i ? nm : n)));

  const yMinVal = vis.yMinCustom !== "" ? Number(vis.yMinCustom) : null;
  const yMaxVal = vis.yMaxCustom !== "" ? Number(vis.yMaxCustom) : null;

  const valueColIsNumeric = useMemo(() => {
    if (valueColIdx < 0 || !parsedRows.length) return false;
    const vals = parsedRows.map((r) => r[valueColIdx] ?? "").filter((v) => v !== "");
    return vals.length > 0 && vals.filter((v) => isNumericValue(v)).length / vals.length > 0.5;
  }, [parsedRows, valueColIdx]);

  const canPlot =
    groupColIdx >= 0 && valueColIdx >= 0 && valueColIsNumeric && boxplotGroups.length > 0;
  const handleToggleGroup = (i) => {
    const name = boxplotGroups[i].name;
    setDisabledGroups((p) => ({ ...p, [name]: !p[name] }));
  };

  const fileStem = `${fileBaseName(fileName, "groupplot")}_groupplot`;
  const handleDownloadSvg = useCallback(() => {
    if (facetByCol >= 0 && facetedData.length > 0) {
      facetedData.forEach((fd) =>
        downloadSvg(facetRefs.current[fd.category], `${fileStem}_${fd.category}.svg`)
      );
    } else {
      downloadSvg(chartRef.current, `${fileStem}.svg`);
    }
  }, [facetByCol, facetedData, fileStem]);

  const handleDownloadPng = useCallback(() => {
    if (facetByCol >= 0 && facetedData.length > 0) {
      facetedData.forEach((fd) =>
        downloadPng(facetRefs.current[fd.category], `${fileStem}_${fd.category}.png`)
      );
    } else {
      downloadPng(chartRef.current, `${fileStem}.png`);
    }
  }, [facetByCol, facetedData, fileStem]);

  return (
    <PlotToolShell
      state={shell}
      toolName="boxplot"
      title="Group Plot"
      visInit={VIS_INIT_BOXPLOT}
      steps={["upload", "configure", "filter", "output", "plot"]}
      canNavigate={(s) => s === "upload" || parsedRows.length > 0}
    >
      {step === "upload" && (
        <UploadStep
          sepOverride={sepOverride}
          onSepChange={setSepOverride}
          rawText={rawText}
          doParse={doParse}
          handleFileLoad={handleFileLoad}
          setStep={setStep}
          onLoadExample={loadExample}
        />
      )}

      {step === "configure" && parsedRows.length > 0 && (
        <ConfigureStep
          fileName={fileName}
          parsedHeaders={parsedHeaders}
          parsedRows={parsedRows}
          hasHeader={hasHeader}
          colRoles={colRoles}
          colNames={colNames}
          valueColIdx={valueColIdx}
          valueColIsNumeric={valueColIsNumeric}
          onRoleChange={updateRole}
          onNameChange={updateColName}
        />
      )}

      {step === "filter" && parsedRows.length > 0 && (
        <FilterStep
          parsedHeaders={parsedHeaders}
          parsedRows={parsedRows}
          colRoles={colRoles}
          colNames={colNames}
          filters={filters}
          filteredRows={filteredRows}
          renamedRows={renamedRows}
          activeColIdxs={activeColIdxs}
          valueRenames={valueRenames}
          orderableCols={orderableCols}
          applyRename={applyRename}
          toggleFilter={toggleFilter}
          toggleAllFilter={toggleAllFilter}
          setRenameVal={setRenameVal}
          dragState={dragState}
          setDragState={setDragState}
        />
      )}

      {step === "output" && parsedRows.length > 0 && (
        <OutputStep
          colNames={colNames}
          groupColIdx={groupColIdx}
          valueColIdx={valueColIdx}
          valueColIsNumeric={valueColIsNumeric}
          stats={stats}
          renamedRows={renamedRows}
          activeColIdxs={activeColIdxs}
          wideData={wideData}
          fileName={fileName}
        />
      )}

      {step === "plot" && canPlot && (
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          <PlotControls
            dataFormat={dataFormat}
            setDataFormat={setDataFormat}
            setStep={setStep}
            resetAll={resetAll}
            allDisplayGroups={allDisplayGroups}
            boxplotGroups={boxplotGroups}
            renamedRows={renamedRows}
            setPlotGroupRenames={setPlotGroupRenames}
            setBoxplotColors={setBoxplotColors}
            onToggleGroup={handleToggleGroup}
            vis={vis}
            updVis={updVis}
            colorByCol={colorByCol}
            setColorByCol={setColorByCol}
            colorByCandidates={colorByCandidates}
            colNames={colNames}
            categoryColors={categoryColors}
            setCategoryColors={setCategoryColors}
            colorByCategories={colorByCategories}
            facetByCol={facetByCol}
            setFacetByCol={handleSetFacetByCol}
            subgroupByCol={subgroupByCol}
            setSubgroupByCol={handleSetSubgroupByCol}
            onDownloadSvg={handleDownloadSvg}
            onDownloadPng={handleDownloadPng}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            {vis.yScale !== "linear" &&
              boxplotGroups.some((g) => g.allValues.some((v) => v <= 0)) && (
                <div
                  style={{
                    background: "var(--warning-bg)",
                    color: "var(--warning-text)",
                    border: "1px solid var(--warning-border)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 12,
                    marginBottom: 8,
                  }}
                >
                  Some values are &le; 0 and cannot be shown on a{" "}
                  {vis.yScale === "log10"
                    ? "log\u2081\u2080"
                    : vis.yScale === "log2"
                      ? "log\u2082"
                      : "ln"}{" "}
                  scale.
                </div>
              )}
            {facetByCol < 0 ? (
              <PlotArea
                colorByCol={colorByCol}
                colorByCategories={colorByCategories}
                colNames={colNames}
                categoryColors={categoryColors}
                facetByCol={facetByCol}
                facetedData={facetedData}
                chartRef={chartRef}
                displayBoxplotGroups={
                  subgroupByCol >= 0 && subgroupedData
                    ? subgroupedData.flatGroups.map((g) => ({
                        ...g,
                        name: plotGroupRenames[g.name] ?? g.name,
                        color: boxplotColors[g.name] ?? g.color,
                      }))
                    : displayBoxplotGroups
                }
                vis={vis}
                yMinVal={yMinVal}
                yMaxVal={yMaxVal}
                chartAnnotations={chartAnnotations}
                chartSummary={chartSummary}
                subgroups={subgroupByCol >= 0 && subgroupedData ? subgroupedData.subgroups : null}
                subgroupSummaries={
                  subgroupByCol >= 0 && subgroupedData
                    ? Object.fromEntries(
                        subgroupedData.subgroups.map((sg) => [
                          sg.name,
                          statsUi.cellSummaries[cellKey("", sg.name)] || null,
                        ])
                      )
                    : null
                }
              />
            ) : (
              <FacetPlotList
                facetedData={facetedData}
                facetRefs={facetRefs}
                vis={vis}
                yMinVal={yMinVal}
                yMaxVal={yMaxVal}
                plotGroupRenames={plotGroupRenames}
                boxplotColors={boxplotColors}
                categoryColors={categoryColors}
                colorByCol={colorByCol}
                colorByCategories={colorByCategories}
                colNames={colNames}
                facetStatsAnnotations={perFacetChartAnnotations}
                facetStatsSummary={perFacetSummaries}
                facetSubgroupSummaries={perFacetSubgroupSummaries}
              />
            )}
            {statsPanelSets.length > 0 && (
              <BoxplotStatsPanel
                key={`stats-panel-${statsPanelMode}`}
                sets={statsPanelSets}
                setLabel={statsPanelLabel}
                fileStem={fileStem}
                singletonAutoExpand={statsPanelMode === "flat"}
                onAnnotationForKey={setCellAnnotation}
                onSummaryForKey={setCellSummary}
                displayMode={statsUi.displayMode}
                onDisplayModeChange={handleStatsDisplayModeChange}
                showNs={statsUi.showNs}
                onShowNsChange={setStatsShowNs}
                showSummary={statsUi.showSummary}
                onShowSummaryChange={handleStatsShowSummaryChange}
                errorBarLabel={vis.plotStyle === "bar" ? ERROR_BAR_LABELS[vis.errorType] : null}
              />
            )}
          </div>
        </div>
      )}

      {step === "plot" && !canPlot && (
        <div
          className="dv-panel"
          style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)" }}
        >
          <p style={{ fontSize: 12, color: "var(--warning-text)" }}>
            ⚠ Assign <strong>group</strong> + <strong>value</strong> columns and ensure filters keep
            data.
          </p>
          <button
            onClick={() => setStep("configure")}
            className="dv-btn dv-btn-secondary"
            style={{ marginTop: 8 }}
          >
            ← Configure
          </button>
        </div>
      )}
    </PlotToolShell>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary toolName="Boxplot">
    <App />
  </ErrorBoundary>
);
