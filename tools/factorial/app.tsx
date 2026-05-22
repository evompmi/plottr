// tools/factorial/app.tsx — orchestrator for the Factorial Analysis tool.
// Stats-only — there is no chart.tsx / plot-area.tsx (documented layout
// exception alongside scatter/upset/volcano in tools/CLAUDE.md). The
// scaffold is the same plot-tool shell every other tool uses; the "plot"
// step is named "report" and renders the formatted ANOVA output instead
// of an SVG.

import { PlotToolShell, usePlotToolState } from "../_shell";
import { autoDetectSep, fixDecimalCommas, parseRaw } from "../_core/csv";
import { fileBaseName } from "../_core/download";
import { isNumericValue, toNumericValue } from "../_core/numeric";
import { leveneTest, shapiroWilk, twoWayANOVA } from "../_core/stats/tests";
import { ConfigureStep, ReportStep, UploadStep, summarizeDesign, validateDesign } from "./steps";
import type { FactorialRole, FactorialVis } from "./helpers";

const { useCallback, useMemo, useState } = React;

const VIS_INIT_FACTORIAL: FactorialVis = {
  alphaNormality: 0.05,
  showCellMeans: true,
  showDiagnostics: true,
};

// Sample dataset — plant-biology realistic. Shows the canonical "drug
// works in WT but not the mutant" pattern: main effect of treatment in
// WT (~3 mm/d boost), no effect in ko (flat), → strong A × B
// interaction. Demonstrates the killer feature of the tool on the first
// click of "Load this example".
const EXAMPLE_CSV = `genotype,treatment,growth
WT,control,12.3
WT,control,11.8
WT,control,12.1
WT,control,12.5
WT,treated,15.2
WT,treated,14.8
WT,treated,15.5
WT,treated,15.0
ko,control,11.9
ko,control,12.0
ko,control,11.5
ko,control,12.2
ko,treated,11.8
ko,treated,12.1
ko,treated,11.7
ko,treated,12.0`;

// Pick reasonable defaults for column roles given the parsed grid:
//   - first numeric column → "value"
//   - first non-numeric column → "factorA"
//   - second non-numeric column → "factorB"
//   - everything else → "ignore"
// User can override in the role editor. If no numeric column or fewer
// than two non-numeric columns exist, the configure step's validator
// surfaces the problem.
function guessRoles(headers: string[], rows: string[][]): FactorialRole[] {
  const numericIdx: number[] = [];
  const stringIdx: number[] = [];
  for (let i = 0; i < headers.length; i++) {
    // A column counts as "numeric" if every non-empty cell parses as a
    // number. Empty strings are skipped — they're just missing values.
    let allNumeric = true;
    let seenAny = false;
    for (const r of rows) {
      const v = r[i];
      if (v == null || v === "") continue;
      seenAny = true;
      if (!isNumericValue(v)) {
        allNumeric = false;
        break;
      }
    }
    if (seenAny && allNumeric) numericIdx.push(i);
    else stringIdx.push(i);
  }
  const roles: FactorialRole[] = headers.map(() => "ignore");
  if (stringIdx.length >= 1) roles[stringIdx[0]] = "factorA";
  if (stringIdx.length >= 2) roles[stringIdx[1]] = "factorB";
  if (numericIdx.length >= 1) roles[numericIdx[0]] = "value";
  return roles;
}

export function App() {
  const shell = usePlotToolState("factorial", VIS_INIT_FACTORIAL);
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

  // Parsed data — headers, rows, detected separator. Reset on each
  // upload; the configure step works against these straight.
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [detectedSep, setDetectedSep] = useState("");
  const [colRoles, setColRoles] = useState<FactorialRole[]>([]);
  const [colNames, setColNames] = useState<string[]>([]);

  // Find which column index each role lives on. Returns null when no
  // column has that role yet.
  const findRoleIdx = (role: FactorialRole): number | null => {
    const i = colRoles.indexOf(role);
    return i === -1 ? null : i;
  };
  const aColIdx = findRoleIdx("factorA");
  const bColIdx = findRoleIdx("factorB");
  const valueColIdx = findRoleIdx("value");

  // Project the parsed grid into the (factorA, factorB, value) triples
  // the ANOVA kernel consumes. Drops rows with non-finite value or
  // empty factor labels.
  const longRows = useMemo(() => {
    if (aColIdx == null || bColIdx == null || valueColIdx == null) return [];
    const out: Array<{ a: string; b: string; v: number }> = [];
    for (const r of parsedRows) {
      const a = (r[aColIdx] || "").trim();
      const b = (r[bColIdx] || "").trim();
      const raw = r[valueColIdx];
      if (!a || !b || raw == null || raw === "") continue;
      const v = toNumericValue(raw);
      if (!Number.isFinite(v)) continue;
      out.push({ a, b, v: v as number });
    }
    return out;
  }, [parsedRows, aColIdx, bColIdx, valueColIdx]);

  const summary = useMemo(() => {
    if (aColIdx == null || bColIdx == null) return null;
    return summarizeDesign(
      longRows.map((r) => r.a),
      longRows.map((r) => r.b)
    );
  }, [longRows, aColIdx, bColIdx]);

  const validationError = useMemo(() => {
    if (parsedRows.length === 0) return null;
    if (!summary) return "Pick columns for factor A, factor B, and value.";
    return validateDesign(summary, { aColIdx, bColIdx, valueColIdx });
  }, [parsedRows.length, summary, aColIdx, bColIdx, valueColIdx]);

  // Run the ANOVA + diagnostics only when the design validates. Memoised
  // to keep them stable across PrefsPanel-induced re-renders.
  const anovaResult = useMemo(() => {
    if (validationError) return null;
    if (longRows.length === 0) return null;
    return twoWayANOVA(
      longRows.map((r) => r.v),
      longRows.map((r) => r.a),
      longRows.map((r) => r.b)
    );
  }, [longRows, validationError]);

  const diagnostics = useMemo(() => {
    if (!anovaResult || anovaResult.error) {
      return { perCellShapiro: [], levene: null };
    }
    // Per-cell Shapiro-Wilk. Cells with n < 3 can't run the test —
    // surface NaN W/p and let the report flag them visually as "—".
    const perCellShapiro = anovaResult.cells.map((c) => {
      const cellValues: number[] = [];
      for (const r of longRows) {
        if (r.a === c.levelA && r.b === c.levelB) cellValues.push(r.v);
      }
      if (cellValues.length < 3) {
        return { levelA: c.levelA, levelB: c.levelB, W: NaN, p: NaN, n: c.n };
      }
      const sw = shapiroWilk(cellValues);
      return { levelA: c.levelA, levelB: c.levelB, W: sw.W, p: sw.p, n: c.n };
    });
    // Levene across the full set of cells (treating each cell as a
    // group). Needs n ≥ 2 in every cell.
    let levene: { F: number; df1: number; df2: number; p: number } | null = null;
    const cellGroups: number[][] = [];
    for (const c of anovaResult.cells) {
      const arr: number[] = [];
      for (const r of longRows) {
        if (r.a === c.levelA && r.b === c.levelB) arr.push(r.v);
      }
      if (arr.length < 2) {
        cellGroups.length = 0;
        break;
      }
      cellGroups.push(arr);
    }
    if (cellGroups.length === anovaResult.cells.length && cellGroups.length >= 2) {
      const lv = leveneTest(cellGroups);
      if (!lv.error) levene = { F: lv.F, df1: lv.df1, df2: lv.df2, p: lv.p };
    }
    return { perCellShapiro, levene };
  }, [anovaResult, longRows]);

  // ── Parsing ─────────────────────────────────────────────────────────
  const doParse = useCallback(
    (text: string, sepHint: string) => {
      setParseError(null);
      setInjectionWarning(null);
      // `autoDetectSep` returns a string for known delimiters and a
      // RegExp for whitespace fallback; the rest of the pipeline takes
      // the string form (RegExp → "" so `fixDecimalCommas` short-
      // circuits, matching boxplot's convention).
      const resolved = autoDetectSep(text, sepHint);
      const effectiveSep = typeof resolved === "string" ? resolved : "";
      setDetectedSep(effectiveSep);
      const dc = fixDecimalCommas(text, effectiveSep);
      setCommaFixed(dc.commaFixed);
      setCommaFixCount(dc.count);
      const { headers, rows, injectionWarnings } = parseRaw(dc.text, effectiveSep);
      setInjectionWarning(injectionWarnings);
      if (!headers.length || !rows.length) {
        setParseError(
          "The file appears to be empty or has no data rows. Please check your file and try again."
        );
        return;
      }
      if (headers.length < 3) {
        setParseError(
          `Factorial Analysis needs at least 3 columns (factor A, factor B, value); got ${headers.length}.`
        );
        return;
      }
      if (rows.length < 4) {
        setParseError(`Factorial Analysis needs at least 4 observations; got ${rows.length}.`);
        return;
      }
      setParsedHeaders(headers);
      setParsedRows(rows);
      setColNames([...headers]);
      setColRoles(guessRoles(headers, rows));
      setStep("configure");
    },
    [setParseError, setInjectionWarning, setCommaFixed, setCommaFixCount, setStep]
  );

  const handleFileLoad = useCallback(
    (text: string, name: string) => {
      setFileName(name);
      doParse(text, sepOverride);
    },
    [doParse, sepOverride, setFileName]
  );

  const handleTextPaste = useCallback(
    (text: string, name: string) => {
      setFileName(name);
      doParse(text, sepOverride);
    },
    [doParse, sepOverride, setFileName]
  );

  const loadExample = useCallback(() => {
    setSepOverride(",");
    setFileName("plant-growth-example.csv");
    doParse(EXAMPLE_CSV, ",");
  }, [doParse, setFileName, setSepOverride]);

  // ── Role / name editing ─────────────────────────────────────────────
  const updateRole = useCallback((i: number, role: FactorialRole) => {
    setColRoles((prev) => {
      const next = [...prev];
      // Unique roles: factorA / factorB / value. Demote any prior holder
      // of the chosen role to "ignore" so the design stays well-defined.
      if (role === "factorA" || role === "factorB" || role === "value") {
        for (let k = 0; k < next.length; k++) {
          if (k !== i && next[k] === role) next[k] = "ignore";
        }
      }
      next[i] = role;
      return next;
    });
  }, []);

  const updateColName = useCallback((i: number, name: string) => {
    setColNames((prev) => {
      const next = [...prev];
      next[i] = name;
      return next;
    });
  }, []);

  // ── Render ─────────────────────────────────────────────────────────
  const fileStem = fileName ? fileBaseName(fileName) : "factorial";
  const factorAName = aColIdx != null ? colNames[aColIdx] : "factorA";
  const factorBName = bColIdx != null ? colNames[bColIdx] : "factorB";
  const valueName = valueColIdx != null ? colNames[valueColIdx] : "value";

  return (
    <PlotToolShell
      state={shell}
      toolName="factorial"
      title="Factorial Analysis"
      visInit={VIS_INIT_FACTORIAL}
      steps={["upload", "configure", "report"]}
      stepLabels={{ report: "Report" }}
      showPrefsOnStep="report"
      canNavigate={(s) => s === "upload" || parsedRows.length > 0}
    >
      {step === "upload" && (
        <UploadStep
          sepOverride={sepOverride}
          setSepOverride={setSepOverride}
          handleFileLoad={handleFileLoad}
          handleTextPaste={handleTextPaste}
          onLoadExample={loadExample}
        />
      )}
      {step === "configure" && parsedRows.length > 0 && (
        <ConfigureStep
          fileName={fileName}
          parsedHeaders={parsedHeaders}
          parsedRows={parsedRows}
          colRoles={colRoles}
          colNames={colNames}
          detectedSep={detectedSep}
          onRoleChange={updateRole}
          onNameChange={updateColName}
          summary={summary}
          validationError={validationError}
        />
      )}
      {step === "report" && anovaResult && !anovaResult.error && (
        <ReportStep
          result={anovaResult}
          factorAName={factorAName}
          factorBName={factorBName}
          valueName={valueName}
          fileStem={fileStem}
          longRows={longRows}
          diagnostics={diagnostics}
          vis={vis}
          updVis={updVis}
        />
      )}
      {step === "report" && (!anovaResult || anovaResult.error) && (
        <div
          style={{
            padding: "16px 20px",
            background: "var(--danger-bg)",
            color: "var(--danger-text)",
            border: "1px solid var(--danger-border)",
            borderRadius: 6,
            fontSize: 14,
          }}
        >
          {anovaResult?.error || validationError || "Configure step incomplete."}
        </div>
      )}
    </PlotToolShell>
  );
}
