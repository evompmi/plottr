// doseresponse/app.tsx — App orchestrator for the EC50/IC50 (dose–response)
// tool. Pure helpers (4PL math, LM solver, parameter CIs, F-test for shared
// parameters, pre-fit transforms, warning gates) live in helpers.ts; the
// chart renderer in chart.tsx; sidebar composition in plot-area.tsx.

import { PlotToolShell, usePlotToolState } from "../_shell";
import {
  ConditionFit,
  DoseResponseVis,
  DoseRoleAssignment,
  RowInput,
  SharedParamTest,
  VIS_INIT_DOSERESPONSE,
  CURVE_PALETTE,
  buildObservations,
  computeReplicateSds,
  fitMulti,
  fTestSharedParam,
} from "./helpers";
import { UploadStep } from "./steps";
import { PlotStep } from "./plot-area";

const { useState, useMemo, useCallback, useEffect, useRef } = React;

// Synthetic 4PL dose–response with two conditions. Control: logEC50 = −7
// (EC50 = 100 nM), Top = 100, Bottom = 0, Hill = 1. +Antagonist: logEC50 = −6
// (EC50 = 1 µM) — a one-decade rightward shift that the F-test on shared
// EC50 cleanly rejects. Replicate values include a small deterministic
// perturbation so confidence intervals are non-degenerate and the fit
// converges with a realistic residual SE.
const EXAMPLE_CSV = `dose,response,replicate,condition
1e-10,0.2,R1,Control
1e-10,-0.1,R2,Control
1e-9,1.1,R1,Control
1e-9,0.7,R2,Control
1e-8,9.5,R1,Control
1e-8,8.4,R2,Control
1e-7,51.2,R1,Control
1e-7,48.7,R2,Control
1e-6,91.0,R1,Control
1e-6,89.8,R2,Control
1e-5,98.7,R1,Control
1e-5,99.4,R2,Control
1e-4,99.9,R1,Control
1e-4,100.2,R2,Control
1e-3,100.1,R1,Control
1e-3,99.7,R2,Control
1e-10,0.0,R1,+Antagonist
1e-10,0.1,R2,+Antagonist
1e-9,0.3,R1,+Antagonist
1e-9,-0.2,R2,+Antagonist
1e-8,1.2,R1,+Antagonist
1e-8,0.8,R2,+Antagonist
1e-7,9.7,R1,+Antagonist
1e-7,8.4,R2,+Antagonist
1e-6,50.5,R1,+Antagonist
1e-6,48.9,R2,+Antagonist
1e-5,90.6,R1,+Antagonist
1e-5,91.7,R2,+Antagonist
1e-4,98.9,R1,+Antagonist
1e-4,99.4,R2,+Antagonist
1e-3,100.2,R1,+Antagonist
1e-3,99.6,R2,+Antagonist`;

const FALLBACK_X_RANGE: [number, number] = [-10, -3];
const FALLBACK_Y_RANGE: [number, number] = [0, 100];

function autoConditionColors(conditions: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  conditions.forEach((c, i) => {
    out[c] = CURVE_PALETTE[i % CURVE_PALETTE.length];
  });
  return out;
}

function detectRoles(parsed: ParseDataResult): DoseRoleAssignment {
  const isNum = (idx: number): boolean => {
    const vals = parsed.rawData.map((r) => r[idx]).filter((v) => v !== "" && v != null);
    if (vals.length === 0) return false;
    return vals.filter((v) => isNumericValue(v)).length / vals.length > 0.5;
  };
  const numericCols: number[] = [];
  const textCols: number[] = [];
  for (let i = 0; i < parsed.headers.length; i++) {
    if (isNum(i)) numericCols.push(i);
    else textCols.push(i);
  }
  const guessByName = (re: RegExp): number | null => {
    for (let i = 0; i < parsed.headers.length; i++) {
      if (re.test(parsed.headers[i])) return i;
    }
    return null;
  };
  const doseCol = guessByName(/^dose|conc|x$|log.?dose|log.?conc/i) ?? numericCols[0] ?? 0;
  const respCol =
    guessByName(/^response|y$|signal|effect|inhibition|activation/i) ??
    numericCols.find((i) => i !== doseCol) ??
    numericCols[1] ??
    1;
  const conditionCol =
    guessByName(/^cond|treat|group|sample/i) ??
    textCols.find((i) => i !== doseCol && i !== respCol) ??
    null;
  const replicateCol =
    guessByName(/^rep|run|trial/i) ??
    textCols.find((i) => i !== doseCol && i !== respCol && i !== conditionCol) ??
    null;
  return { doseCol, responseCol: respCol, conditionCol, replicateCol };
}

export function App() {
  const shell = usePlotToolState<DoseResponseVis>("doseresponse", VIS_INIT_DOSERESPONSE);
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

  const [rawText, setRawText] = useState<string | null>(null);
  const [roles, setRoles] = useState<DoseRoleAssignment>({
    doseCol: 0,
    responseCol: 1,
    conditionCol: null,
    replicateCol: null,
  });
  const sepRef = useRef("");
  const svgRef = useRef<SVGSVGElement>(null);

  const parsed = useMemo(() => (rawText ? parseData(rawText, sepRef.current) : null), [rawText]);

  const { numericCols, textCols } = useMemo(() => {
    if (!parsed) return { numericCols: [] as number[], textCols: [] as number[] };
    const num: number[] = [];
    const txt: number[] = [];
    parsed.headers.forEach((_, i) => {
      const vals = parsed.rawData.map((r) => r[i]).filter((v) => v !== "" && v != null);
      const isNum =
        vals.length > 0 && vals.filter((v) => isNumericValue(v)).length / vals.length > 0.5;
      if (isNum) num.push(i);
      else txt.push(i);
    });
    return { numericCols: num, textCols: txt };
  }, [parsed]);

  // Derive RowInput[] from parsed + roles. Skip rows missing a numeric dose
  // or response cell. Condition defaults to "All" when the user hasn't
  // assigned a condition column.
  const rows = useMemo<RowInput[]>(() => {
    if (!parsed) return [];
    const out: RowInput[] = [];
    for (let i = 0; i < parsed.data.length; i++) {
      const numeric = parsed.data[i];
      const raw = parsed.rawData[i];
      const dose = numeric[roles.doseCol];
      const response = numeric[roles.responseCol];
      if (dose == null || response == null) continue;
      const condition =
        roles.conditionCol != null &&
        raw[roles.conditionCol] != null &&
        raw[roles.conditionCol] !== ""
          ? String(raw[roles.conditionCol])
          : "All";
      const replicate =
        roles.replicateCol != null && raw[roles.replicateCol] != null
          ? String(raw[roles.replicateCol])
          : undefined;
      out.push({ dose, response, condition, replicate });
    }
    return out;
  }, [parsed, roles]);

  const replicateSds = useMemo(
    () => (vis.weighting === "inv-sd2" ? computeReplicateSds(rows) : undefined),
    [rows, vis.weighting]
  );

  const built = useMemo(
    () =>
      buildObservations(rows, {
        doseUnit: vis.doseUnit,
        zeroDoseMode: vis.zeroDoseMode,
        normalisation: vis.normalisation,
        baseline: vis.normalisationBaseline,
        topRef: vis.normalisationTop,
        weighting: vis.weighting,
        conditionStats: replicateSds,
      }),
    [
      rows,
      vis.doseUnit,
      vis.zeroDoseMode,
      vis.normalisation,
      vis.normalisationBaseline,
      vis.normalisationTop,
      vis.weighting,
      replicateSds,
    ]
  );

  const conditionFits: ConditionFit[] = useMemo(
    () =>
      fitMulti(built.observations, built.conditions, {
        paramLocks: vis.paramLocks,
        alpha: vis.alpha,
      }),
    [built.observations, built.conditions, vis.paramLocks, vis.alpha]
  );

  const sharedTests: SharedParamTest[] = useMemo(() => {
    if (built.conditions.length < 2) return [];
    return [
      fTestSharedParam(conditionFits, "logEC50", { paramLocks: vis.paramLocks }),
      fTestSharedParam(conditionFits, "hillSlope", { paramLocks: vis.paramLocks }),
    ];
  }, [conditionFits, built.conditions.length, vis.paramLocks]);

  // Seed per-condition colors when a new condition shows up. Existing
  // entries persist via auto-prefs (keyed by condition name) so the user's
  // color choices survive a dataset swap as long as names match.
  useEffect(() => {
    if (built.conditions.length === 0) return;
    const next = { ...vis.conditionColors };
    let changed = false;
    built.conditions.forEach((c, i) => {
      if (!next[c]) {
        next[c] = CURVE_PALETTE[i % CURVE_PALETTE.length];
        changed = true;
      }
    });
    if (changed) updVis({ conditionColors: next });
  }, [built.conditions, vis.conditionColors, updVis]);

  // Auto-detect axis ranges from the observation set.
  const autoAxis = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const o of built.observations) {
      if (o.isZeroDose) continue;
      if (Number.isFinite(o.x)) xs.push(o.x);
      if (Number.isFinite(o.y)) ys.push(o.y);
    }
    const xMin = xs.length ? Math.floor(Math.min(...xs)) : FALLBACK_X_RANGE[0];
    const xMax = xs.length ? Math.ceil(Math.max(...xs)) : FALLBACK_X_RANGE[1];
    const yMin = ys.length ? Math.min(...ys) : FALLBACK_Y_RANGE[0];
    const yMax = ys.length ? Math.max(...ys) : FALLBACK_Y_RANGE[1];
    const yPad = (yMax - yMin) * 0.08 || 1;
    return { xMin, xMax, yMin: yMin - yPad, yMax: yMax + yPad };
  }, [built.observations]);

  const effAxis = useMemo(
    () => ({
      xMin: vis.xMin != null ? vis.xMin : autoAxis.xMin,
      xMax: vis.xMax != null ? vis.xMax : autoAxis.xMax,
      yMin: vis.yMin != null ? vis.yMin : autoAxis.yMin,
      yMax: vis.yMax != null ? vis.yMax : autoAxis.yMax,
    }),
    [vis.xMin, vis.xMax, vis.yMin, vis.yMax, autoAxis]
  );

  // Update axis labels when the user picks new role columns.
  useEffect(() => {
    if (!parsed) return;
    const xLabel =
      vis.doseUnit === "log10"
        ? `log₁₀ ${parsed.headers[roles.doseCol] ?? "dose"}`
        : `${parsed.headers[roles.doseCol] ?? "dose"} (M)`;
    const yLabel = parsed.headers[roles.responseCol] ?? "response";
    if (vis.xLabel !== xLabel || vis.yLabel !== yLabel) {
      updVis({ xLabel, yLabel });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, roles.doseCol, roles.responseCol, vis.doseUnit]);

  const svgLegend = useMemo(() => {
    if (built.conditions.length < 2) return null;
    return [
      {
        id: "legend-condition",
        title:
          roles.conditionCol != null && parsed ? parsed.headers[roles.conditionCol] : "Condition",
        items: built.conditions.map((c) => ({
          label: c,
          color: vis.conditionColors[c] || CURVE_PALETTE[0],
          shape: "dot" as const,
        })),
      },
    ];
  }, [built.conditions, parsed, roles.conditionCol, vis.conditionColors]);

  const doParse = useCallback(
    (text: string, sep: string) => {
      sepRef.current = sep;
      const dc = fixDecimalCommas(text, sep);
      setCommaFixed(dc.commaFixed);
      setCommaFixCount(dc.count);
      const fixedText = dc.text;
      const parsedNow = parseData(fixedText, sep);
      setInjectionWarning(parsedNow.injectionWarnings);
      if (parsedNow.headers.length < 2 || parsedNow.data.length === 0) {
        setParseError(
          "The file appears to be empty or has no data rows. Dose-response needs at least one dose column and one response column."
        );
        return;
      }
      setParseError(null);
      setRawText(fixedText);
      setRoles(detectRoles(parsedNow));
      // Reset per-dataset color seed: if the new dataset shares condition
      // names with the previous one the user keeps their colors; new names
      // get fresh palette assignments via the effect above.
      const fresh: Record<string, string> = {};
      const nextConds = new Set<string>();
      const guess = detectRoles(parsedNow);
      for (let i = 0; i < parsedNow.data.length; i++) {
        if (guess.conditionCol != null) {
          const v = parsedNow.rawData[i][guess.conditionCol];
          if (v != null && v !== "") nextConds.add(String(v));
        } else {
          nextConds.add("All");
        }
      }
      Array.from(nextConds).forEach((c, i) => {
        fresh[c] = vis.conditionColors[c] || CURVE_PALETTE[i % CURVE_PALETTE.length];
      });
      updVis({ conditionColors: { ...vis.conditionColors, ...fresh } });
      setStep("plot");
    },
    [
      setCommaFixed,
      setCommaFixCount,
      setInjectionWarning,
      setParseError,
      setStep,
      updVis,
      vis.conditionColors,
    ]
  );

  const handleFileLoad = useCallback(
    (text: string, name: string) => {
      setFileName(name);
      doParse(text, sepOverride);
    },
    [sepOverride, doParse, setFileName]
  );

  const loadExample = useCallback(() => {
    setSepOverride(",");
    setFileName("dose-response-example.csv");
    updVis({ conditionColors: autoConditionColors(["Control", "+Antagonist"]) });
    doParse(EXAMPLE_CSV, ",");
  }, [doParse, setFileName, setSepOverride, updVis]);

  const resetAll = () => {
    setRawText(null);
    setFileName("");
    setInjectionWarning(null);
    setStep("upload");
  };

  const canNavigate = (s: string) => {
    if (s === "upload") return true;
    if (s === "plot") return !!parsed;
    return false;
  };

  return (
    <PlotToolShell
      state={shell}
      toolName="doseresponse"
      title="EC50 / IC50 (Dose–Response)"
      visInit={VIS_INIT_DOSERESPONSE}
      steps={["upload", "plot"]}
      canNavigate={canNavigate}
    >
      {step === "upload" && (
        <UploadStep
          sepOverride={sepOverride}
          setSepOverride={setSepOverride}
          rawText={rawText}
          doParse={doParse}
          handleFileLoad={handleFileLoad}
          onLoadExample={loadExample}
        />
      )}
      {step === "plot" && parsed && (
        <PlotStep
          parsed={parsed}
          fileName={fileName}
          numericCols={numericCols}
          textCols={textCols}
          roles={roles}
          setRoles={setRoles}
          rows={rows}
          conditions={built.conditions}
          conditionFits={conditionFits}
          sharedTests={sharedTests}
          vis={vis}
          updVis={updVis}
          autoAxis={autoAxis}
          effAxis={effAxis}
          resetAll={resetAll}
          svgRef={svgRef}
          svgLegend={svgLegend}
        />
      )}
    </PlotToolShell>
  );
}
