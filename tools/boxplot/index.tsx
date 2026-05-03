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
    setInjectionWarning,
    vis,
    updVis,
  } = shell;

  // Upload & navigation
  const [rawText, setRawText] = useState<any>(null);
  const [dataFormat, setDataFormat] = useState("long");
  // Count of cells dropped by wideToLong on the last parse (audit-23 #10).
  // 0 means clean reshape; >0 means the user should know about silent
  // shrinkage from empty / non-numeric cells in their wide-format input.
  const [wideSkipped, setWideSkipped] = useState(0);

  // Parsing
  const [parsedHeaders, setParsedHeaders] = useState<any[]>([]);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [hasHeader, setHasHeader] = useState(true);

  // Column config & filtering
  const [colRoles, setColRoles] = useState<ColumnRole[]>([]);
  const [colNames, setColNames] = useState<any[]>([]);
  const [filters, setFilters] = useState<any>({});
  const [valueRenames, setValueRenames] = useState<any>({});

  // Plot state. boxplotColors + categoryColors now live in `vis` so the
  // PrefsPanel's Save / Load file and the auto-persist localStorage slot
  // cover them. Exposed as read-through variables with function-capable
  // setters so existing call sites (including functional updaters) work
  // unchanged.
  // Wrap the `|| {}` fallback in useMemo so the empty-object reference is
  // stable across renders. Otherwise downstream useMemo / useCallback that
  // depend on `boxplotColors` would re-fire every render even when the
  // underlying vis state didn't change. Same pattern for categoryColors
  // below and the scatter mapping dicts.
  const boxplotColors: Record<string, string> = useMemo(
    () => vis.boxplotColors || {},
    [vis.boxplotColors]
  );
  const setBoxplotColors = useCallback(
    (updater: any) =>
      updVis({
        boxplotColors:
          typeof updater === "function" ? updater(vis.boxplotColors || {}) : updater || {},
      }),
    [updVis, vis.boxplotColors]
  );
  const [plotGroupRenames, setPlotGroupRenames] = useState<any>({});
  const [disabledGroups, setDisabledGroups] = useState<any>({});
  // Per-column ordering keyed by column index. Any column that can appear in
  // the rename panel (group/filter role) gets its own order array here, so the
  // user can reorder values during the filter step before ever picking a
  // "Facet by" or "Color by" column in the plot step.
  const [columnOrders, setColumnOrders] = useState<any>({});
  const setOrderForCol = (i: any, newOrder: any) =>
    setColumnOrders((prev: any) => ({ ...prev, [i]: newOrder }));
  const [colorByCol, setColorByCol] = useState(-1);
  const categoryColors = useMemo(() => vis.categoryColors || {}, [vis.categoryColors]);
  const setCategoryColors = useCallback(
    (updater: any) =>
      updVis({
        categoryColors:
          typeof updater === "function" ? updater(vis.categoryColors || {}) : updater || {},
      }),
    [updVis, vis.categoryColors]
  );
  const [dragState, setDragState] = useState<any>(null);
  const [facetByCol, _setFacetByCol] = useState(-1);
  const [subgroupByCol, _setSubgroupByCol] = useState(-1);
  // Facet and subgroup are independent. The only cross-guard is that they
  // can't be the same column (degenerate: every facet has one subgroup).
  // The dropdowns also filter each other's pool so the user can't pick a
  // collision. Each column change clears the keyed cell-annotation /
  // summary dicts so stale entries from previous categories don't
  // accumulate across long sessions.
  const handleSetFacetByCol = (v: any) => {
    if (facetByCol !== v) dispatchStats({ type: "clearCells" });
    _setFacetByCol(v);
    if (v >= 0 && v === subgroupByCol) _setSubgroupByCol(-1);
  };
  const handleSetSubgroupByCol = (v: any) => {
    if (subgroupByCol !== v) dispatchStats({ type: "clearCells" });
    _setSubgroupByCol(v);
    if (v >= 0 && v === facetByCol) _setFacetByCol(-1);
  };
  // One composite-key dict covers every plot mode. The active mode shapes
  // the keys (App composes `${facet}::${subgroup}`, with empty strings for
  // missing dimensions) and the panel below stamps annotations / summaries
  // back into the dict via setCell*.
  const [statsUi, dispatchStats] = useReducer(statsReducer, statsInit);
  const handleStatsShowSummaryChange = (v: any) =>
    dispatchStats({ type: "setShowSummary", value: v });
  const handleStatsDisplayModeChange = (v: any) =>
    dispatchStats({ type: "setDisplayMode", value: v });
  const setStatsShowNs = (v: any) => dispatchStats({ type: "setShowNs", value: v });
  // Stable references so `FacetTrio`'s shallow-compare memo can skip
  // re-rendering unaffected facets when one map entry updates.
  const setCellAnnotation = useCallback(
    (key: any, spec: any) => dispatchStats({ type: "setCellAnnotation", key, value: spec }),
    []
  );
  const setCellSummary = useCallback(
    (key: any, txt: any) => dispatchStats({ type: "setCellSummary", key, value: txt }),
    []
  );

  const facetRefs = useRef<Record<string, any>>({});
  const chartRef = useRef<any>(null);

  const resetDerived = useCallback(() => {
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
  }, [setBoxplotColors, setCategoryColors, updVis]);

  const buildFilters = (hdrs: any, rws: any) => {
    const f: Record<string, any> = {};
    hdrs.forEach((_: any, i: number) => {
      const u = [...new Set(rws.map((r: any) => r[i]))].sort();
      f[i] = { unique: u, included: new Set(u) };
    });
    return f;
  };

  const doParse = useCallback(
    (text: any, sep: any) => {
      const dc = fixDecimalCommas(text, sep);
      const fixedText = dc.text;
      setCommaFixed(dc.commaFixed);
      setCommaFixCount(dc.count);
      setRawText(fixedText);

      const { headers, rows, hasHeader: hh, injectionWarnings } = parseRaw(fixedText, sep);
      setInjectionWarning(injectionWarnings);
      if (!headers.length || !rows.length) {
        setParseError(
          "The file appears to be empty or has no data rows. Please check your file and try again."
        );
        return;
      }
      setParseError(null);

      const isWide = detectWideFormat(headers, rows);
      if (isWide) {
        const { headers: lh, rows: lr, skipped } = wideToLong(headers, rows);
        setParsedHeaders(lh);
        setParsedRows(lr);
        setHasHeader(true);
        setColRoles(["group", "value"]);
        setColNames([...lh]);
        setFilters(buildFilters(lh, lr));
        resetDerived();
        setDataFormat("wide");
        setWideSkipped(skipped || 0);
        setStep("plot");
      } else {
        setWideSkipped(0);
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
            headers.map((_: any, i: number) => {
              const r = guessColumnType(rows.map((row: any) => row[i] ?? ""));
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
    },
    [resetDerived, setCommaFixed, setCommaFixCount, setInjectionWarning, setParseError, setStep]
  );

  const handleFileLoad = useCallback(
    (text: any, name: any) => {
      setFileName(name);
      doParse(text, sepOverride);
    },
    [sepOverride, doParse, setFileName]
  );
  const loadExample = useCallback(() => {
    const csv = makeExamplePlantCSV();
    setSepOverride(",");
    setFileName("example_plant_growth.csv");
    doParse(csv, ",");
  }, [doParse, setFileName, setSepOverride]);

  // Inter-tool hand-off consumer. When the user clicks "↗ Open in Boxplot"
  // in another tool (e.g. RLU timecourse's Σ barplot tile), that tool
  // writes a payload to localStorage under the shared `dataviz-handoff`
  // key and either top-level-navigates here (standalone) or postMessages
  // the landing page to switch the visible iframe (embedded). We
  // handle both cases:
  //
  //   1. Mount-time: top-level-navigation case — App() mounts fresh,
  //      consumeHandoff() at first run finds the payload, parses it,
  //      jumps to the plot step. The source tool already produced
  //      clean structured data so the configure step is skipped.
  //
  //   2. `storage` event: embedded case — the landing page's iframes
  //      are eagerly mounted, so this App() already finished its
  //      mount-time check (and found nothing) by the time the user
  //      clicks the source tool's button. Same-origin writes from
  //      another window fire `storage` events here; we re-consume
  //      reactively and route through the same path.
  //
  // The source tool already produced clean structured data and the
  // user has implicitly confirmed the column roles by choosing this
  // destination, so both paths skip the configure step.
  React.useEffect(() => {
    if (typeof consumeHandoff !== "function") return;
    const apply = (payload: any) => {
      if (!payload || !payload.csv) return;
      setSepOverride(",");
      setFileName(payload.fileName || "from_handoff.csv");
      doParse(payload.csv, ",");
      setStep("plot");
    };
    apply(consumeHandoff("boxplot"));
    const onStorage = (e: any) => {
      // Only react to a fresh write of the hand-off key; deletions
      // (newValue == null) come from our own consumeHandoff in another
      // tab and shouldn't trigger anything here.
      if (e.key !== "dataviz-handoff" || !e.newValue) return;
      apply(consumeHandoff("boxplot"));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // Mount-only effect: the inner `apply` references `doParse` and the
    // setters, but re-running this effect every time those change would
    // re-fire the storage listener registration and risk double-applying
    // a hand-off. Stable on mount is what we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetAll = () => {
    setRawText(null);
    setParsedRows([]);
    setParsedHeaders([]);
    setFileName("");
    setInjectionWarning(null);
    setStep("upload");
  };

  const applyRename = (ci: any, v: any) =>
    valueRenames[ci] && valueRenames[ci][v] != null ? valueRenames[ci][v] : v;

  const filteredRows = useMemo(
    () =>
      parsedRows.filter((r: any) =>
        r.every((v: any, ci: number) => !filters[ci] || filters[ci].included.has(v))
      ),
    [parsedRows, filters]
  );

  const renamedRows = useMemo(
    () => filteredRows.map((r: any) => r.map((v: any, ci: number) => applyRename(ci, v))),
    // applyRename is a closure over valueRenames; depending on valueRenames
    // is sufficient to invalidate this memo when renames change. Including
    // applyRename itself would re-fire on every render since the closure
    // is re-created each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredRows, valueRenames]
  );

  const activeColIdxs = useMemo(
    () =>
      colRoles.reduce<number[]>((acc, r, i) => {
        if (r !== "ignore") acc.push(i);
        return acc;
      }, []),
    [colRoles]
  );

  const groupColIdx = colRoles.indexOf("group");
  const valueColIdx = colRoles.indexOf("value");

  const groupedData = useMemo(() => {
    if (groupColIdx < 0 || valueColIdx < 0) return {};
    const g: Record<string, any> = {};
    renamedRows.forEach((r: any) => {
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
    const seen = new Set();
    const order: any[] = [];
    renamedRows.forEach((r: any) => {
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
      const valid = stored.filter((g: any) => naturalGroupOrder.includes(g));
      const missing = naturalGroupOrder.filter((g: any) => !stored.includes(g));
      return [...valid, ...missing];
    }
    return naturalGroupOrder;
  }, [columnOrders, groupColIdx, naturalGroupOrder]);

  const colorByCandidates = useMemo(
    () =>
      parsedHeaders
        .map((_: any, i: number) => i)
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
    return [...new Set(renamedRows.map((r: any) => r[colorByCol]))].sort();
  }, [colorByCol, renamedRows]);

  const boxplotGroups = useMemo(() => {
    if (groupColIdx < 0 || valueColIdx < 0) return [];
    const gm: Record<string, any> = {};
    renamedRows.forEach((r: any) => {
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
      .filter((name: any) => gm[name])
      .map((name: any, gi: number) => {
        const catMap = gm[name];
        const sources = cats
          .filter((c: any) => catMap[c])
          .map((cat: any, si: number) => ({
            colIndex: si,
            values: catMap[cat],
            category: cat,
          }));
        const allValues = sources.flatMap((s: any) => s.values);
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
      boxplotGroups.map((g: any) => ({
        ...g,
        displayName: plotGroupRenames[g.name] ?? g.name,
        enabled: !disabledGroups[g.name],
      })),
    [boxplotGroups, plotGroupRenames, disabledGroups]
  );

  const displayBoxplotGroups = useMemo(
    () =>
      allDisplayGroups
        .filter((g: any) => g.enabled)
        .map((g: any) => ({ ...g, name: g.displayName })),
    [allDisplayGroups]
  );

  // Facet column candidates (same pool as colorBy). The natural order is the
  // first-seen order of unique values in the (renamed) data so it matches what
  // the user sees in the rename panel.
  const naturalFacetOrder = useMemo(() => {
    if (facetByCol < 0) return [];
    const seen = new Set();
    const order: any[] = [];
    renamedRows.forEach((r: any) => {
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
      const valid = stored.filter((g: any) => naturalFacetOrder.includes(g));
      const missing = naturalFacetOrder.filter((g: any) => !stored.includes(g));
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
    const m: Record<string, any> = {};
    parsedHeaders.forEach((_: any, i: number) => {
      if (i === valueColIdx) return;
      if (colRoles[i] !== "group" && colRoles[i] !== "filter") return;
      const seen = new Set();
      const natural: any[] = [];
      renamedRows.forEach((r: any) => {
        const v = r[i];
        if (!seen.has(v)) {
          seen.add(v);
          natural.push(v);
        }
      });
      const stored = columnOrders[i];
      let order = natural;
      if (stored && stored.length > 0) {
        const valid = stored.filter((g: any) => natural.includes(g));
        const missing = natural.filter((g: any) => !stored.includes(g));
        order = [...valid, ...missing];
      }
      m[i] = { order, onReorder: (newOrder: any) => setOrderForCol(i, newOrder) };
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
      cellRows.forEach((r: any) => {
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
        .filter((name: any) => gm[name] && !disabledGroups[name])
        .map((name: any, gi: number) => {
          const catMap = gm[name];
          const sources = cats
            .filter((c: any) => catMap[c])
            .map((c: any, si: number) => ({
              colIndex: si,
              values: catMap[c],
              category: c,
            }));
          const allValues = sources.flatMap((s: any) => s.values);
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
    boxplotGroups.forEach((g: any) => {
      globalColorMap[g.name] = g.color;
    });
    const sgOrder = subgroupByCol >= 0 ? orderableCols[subgroupByCol]?.order || [] : null;
    return facetByCategories.map((cat: any) => {
      const catRows = renamedRows.filter((r: any) => r[facetByCol] === cat);
      if (sgOrder && sgOrder.length > 0) {
        const subgroups: Array<{ name: string; startIndex: number; count: number }> = [];
        const flatGroups: any[] = [];
        let startIndex = 0;
        for (const sgCat of sgOrder) {
          const sgRows = catRows.filter((r: any) => r[subgroupByCol] === sgCat);
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
    boxplotGroups.forEach((g: any) => {
      globalColorMap[g.name] = g.color;
    });
    const subgroups: Array<{ name: string; startIndex: number; count: number }> = [];
    const flatGroups: any[] = [];
    let startIndex = 0;
    for (const sgCat of sgOrder) {
      const sgRows = renamedRows.filter((r: any) => r[subgroupByCol] === sgCat);
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
  // JSON-encoded so a category named e.g. "S3::pGFP" cannot collide with a
  // facet × subgroup combination of "S3" × "pGFP". Plant-science labels
  // routinely contain "::" — separator collisions were the audit-23 #2
  // finding.
  const cellKey = (facetCat: string, sgName: string) => JSON.stringify([facetCat, sgName]);

  // Merge per-subgroup annotation specs (extracted from the unified
  // cellAnnotations dict) into a single chart-level spec with offset
  // indices. Used by both subgroup-only mode and (per-facet) facet+subgroup
  // mode to project per-cell brackets / CLD letters onto the flat axis.
  const mergeAnnotForSubgroups = useCallback(
    (subgroups: any[], flatGroups: any[], facetCat: string) => {
      const renamedFlat = flatGroups.map((g: any) => ({
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
      gs.map((g: any) => ({ name: plotGroupRenames[g.name] ?? g.name, values: g.allValues }));
    if (statsPanelMode === "flat") {
      if (displayBoxplotGroups.length < 2) return [];
      return [
        {
          key: FLAT_KEY,
          name: "",
          groups: displayBoxplotGroups.map((g: any) => ({ name: g.name, values: g.allValues })),
        },
      ];
    }
    if (statsPanelMode === "facet") {
      return facetedData
        .filter((fd: any) => fd.groups.length >= 2)
        .map((fd: any) => ({
          key: cellKey(fd.category, ""),
          name: fd.category,
          groups: renamedValues(fd.groups),
        }));
    }
    if (statsPanelMode === "subgroup") {
      if (!subgroupedData) return [];
      return subgroupedData.subgroups
        .map((sg: any) => {
          const sgGroups = subgroupedData.flatGroups.slice(sg.startIndex, sg.startIndex + sg.count);
          return {
            key: cellKey("", sg.name),
            name: sg.name,
            groups: renamedValues(sgGroups),
          };
        })
        .filter((s: any) => s.groups.length >= 2);
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

  const toggleFilter = (ci: any, v: any) =>
    setFilters((p: any) => {
      const f = { ...p },
        s = new Set(f[ci].included);
      if (s.has(v)) s.delete(v);
      else s.add(v);
      f[ci] = { ...f[ci], included: s };
      return f;
    });

  const toggleAllFilter = (ci: any, all: any) =>
    setFilters((p: any) => {
      const f = { ...p };
      f[ci] = { ...f[ci], included: all ? new Set(f[ci].unique) : new Set() };
      return f;
    });

  const setRenameVal = (ci: any, ov: any, nv: any) => {
    // If the rename touches the active facet or subgroup column, drop every
    // cellAnnotation / cellSummary entry — the cellKey is built from the
    // (renamed) category name, so stale entries would orphan under the old
    // name and silently leak across the session.
    if (ci === facetByCol || ci === subgroupByCol) {
      dispatchStats({ type: "clearCells" });
    }
    setValueRenames((p: any) => {
      const r = { ...p };
      if (!r[ci]) r[ci] = {};
      r[ci] = { ...r[ci], [ov]: nv };
      return r;
    });
  };

  // Group Plot has exactly one x-axis grouping column and one numeric value
  // column, so "group" and "value" are exclusive roles. Picking either on a
  // new column demotes any previous column with the same role to "filter"
  // instead of silently ending up with two columns whose role select says
  // the same thing but only the first one actually drives the plot
  // (valueColIdx / groupColIdx are both `colRoles.indexOf(...)`).
  const updateRole = (i: number, role: ColumnRole) => {
    // Demoting the column that's currently driving facet-by or subgroup-by
    // would leave cellAnnotations / cellSummaries keyed against categories
    // that no longer correspond to the active split. Wipe to avoid stale
    // reads.
    if (i === facetByCol || i === subgroupByCol) {
      dispatchStats({ type: "clearCells" });
    }
    setColRoles((p: any) =>
      p.map((r: any, j: number) => {
        if (j === i) return role;
        if ((role === "group" || role === "value") && r === role) return "filter";
        return r;
      })
    );
  };
  const updateColName = (i: any, nm: any) =>
    setColNames((p: any) => p.map((n: any, j: number) => (j === i ? nm : n)));

  const yMinVal = vis.yMinCustom !== "" ? Number(vis.yMinCustom) : null;
  const yMaxVal = vis.yMaxCustom !== "" ? Number(vis.yMaxCustom) : null;

  const valueColIsNumeric = useMemo(() => {
    if (valueColIdx < 0 || !parsedRows.length) return false;
    const vals = parsedRows.map((r: any) => r[valueColIdx] ?? "").filter((v: any) => v !== "");
    return vals.length > 0 && vals.filter((v: any) => isNumericValue(v)).length / vals.length > 0.5;
  }, [parsedRows, valueColIdx]);

  const canPlot =
    groupColIdx >= 0 && valueColIdx >= 0 && valueColIsNumeric && boxplotGroups.length > 0;
  const handleToggleGroup = (i: any) => {
    const name = boxplotGroups[i].name;
    setDisabledGroups((p: any) => ({ ...p, [name]: !p[name] }));
  };

  const fileStem = `${fileBaseName(fileName, "groupplot")}_groupplot`;
  const handleDownloadSvg = useCallback(() => {
    if (facetByCol >= 0 && facetedData.length > 0) {
      facetedData.forEach((fd: any) =>
        downloadSvg(facetRefs.current[fd.category], `${fileStem}_${fd.category}.svg`)
      );
    } else {
      downloadSvg(chartRef.current, `${fileStem}.svg`);
    }
  }, [facetByCol, facetedData, fileStem]);

  const handleDownloadPng = useCallback(() => {
    if (facetByCol >= 0 && facetedData.length > 0) {
      facetedData.forEach((fd: any) =>
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

      {step === "plot" && canPlot && wideSkipped > 0 && (
        <div
          role="status"
          style={{
            background: "var(--warning-bg)",
            color: "var(--warning-text)",
            border: "1px solid var(--warning-border)",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 12,
            marginBottom: 12,
          }}
        >
          Wide-to-long reshape skipped <strong>{wideSkipped}</strong>{" "}
          {wideSkipped === 1 ? "cell" : "cells"} that were empty or non-numeric. Sample size shrank
          silently — verify the kept rows match what you expected.
        </div>
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
              boxplotGroups.some((g: any) => g.allValues.some((v: any) => v <= 0)) && (
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
                    ? subgroupedData.flatGroups.map((g: any) => ({
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
                        subgroupedData.subgroups.map((sg: any) => [
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
ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary toolName="Boxplot">
    <App />
  </ErrorBoundary>
);
