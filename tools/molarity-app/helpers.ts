// molarity-app/helpers.ts — pure prep-sheet math for the molarity calculator,
// extracted from molarity-app.tsx so it can be unit- / property-tested without
// a React renderer. Every function here is side-effect-free and i18n-free:
// the batch path returns structured error *codes*, and the component maps them
// to localized strings.

export type Unit = { label: string; factor: number };

export const CONC_UNITS: Unit[] = [
  { label: "M", factor: 1 },
  { label: "mM", factor: 1e-3 },
  { label: "µM", factor: 1e-6 },
  { label: "nM", factor: 1e-9 },
];

export const VOL_UNITS: Unit[] = [
  { label: "L", factor: 1 },
  { label: "mL", factor: 1e-3 },
  { label: "µL", factor: 1e-6 },
];

export const MASS_UNITS: Unit[] = [
  { label: "g", factor: 1 },
  { label: "mg", factor: 1e-3 },
  { label: "µg", factor: 1e-6 },
];

export function toBase(value: number, unit: string, units: Unit[]): number {
  const u = units.find((u) => u.label === unit);
  return value * (u ? u.factor : 1);
}

export function fromBase(value: number, unit: string, units: Unit[]): number {
  const u = units.find((u) => u.label === unit);
  return value / (u ? u.factor : 1);
}

export function formatResult(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) return "—";
  if (val === 0) return "0";
  const abs = Math.abs(val);
  if (abs >= 1e6 || abs < 0.001) return val.toExponential(4);
  if (abs >= 100) return val.toFixed(2);
  if (abs >= 1) return val.toFixed(4);
  return val.toPrecision(4);
}

export function formatMass(grams: number): string {
  if (grams >= 1) return grams.toFixed(4) + " g";
  if (grams >= 1e-3) return (grams * 1e3).toFixed(4) + " mg";
  return (grams * 1e6).toFixed(4) + " µg";
}

// Parse a value+unit string like "150 mM", "0.5 M", "500 mL". Returns null when
// the number is non-finite or the unit isn't one of `unitList`.
export function parseValueUnit(
  str: string,
  defaultUnit: string,
  unitList: Unit[]
): { value: number; unit: string } | null {
  str = str.trim();
  const m = str.match(/^([\d.eE+-]+)\s*(.+)?$/);
  if (!m) return null;
  const val = parseFloat(m[1]);
  if (!isFinite(val)) return null;
  const unitStr = (m[2] || defaultUnit).trim();
  const found = unitList.find((u) => u.label === unitStr);
  if (found) return { value: val, unit: unitStr };
  return null;
}

// Parse a mass/volume concentration like "50 mg/mL" → grams-per-litre.
export function parseMassVolConc(
  str: string
): { gPerL: number; originalUnit: string; originalValue: number } | null {
  str = str.trim();
  const m = str.match(/^([\d.eE+-]+)\s*(mg\/mL|µg\/µL|g\/L|µg\/mL|mg\/L|g\/mL)$/i);
  if (!m) return null;
  const val = parseFloat(m[1]);
  if (!isFinite(val)) return null;
  const unit = m[2].toLowerCase();
  const conversions: Record<string, number> = {
    "g/l": 1,
    "mg/ml": 1,
    "µg/µl": 1,
    "µg/ml": 1e-3,
    "mg/l": 1e-3,
    "g/ml": 1e3,
  };
  const gPerL = val * (conversions[unit] || 1);
  return { gPerL, originalUnit: m[2], originalValue: val };
}

export interface SolveResult {
  value: number;
  label: string;
}

export interface MolarityInputs {
  solveFor: string;
  mw: string;
  mass: string;
  massUnit: string;
  vol: string;
  volUnit: string;
  conc: string;
  concUnit: string;
}

// Single-compound molarity relation, mass = moles × MW, moles = conc × volume.
// Solves for whichever of {conc, mass, volume, mw} is requested; returns null
// when a required input is non-finite or a divisor is non-positive.
export function solveMolarity(inp: MolarityInputs): SolveResult | null {
  const mwVal = parseFloat(inp.mw);
  const massVal = parseFloat(inp.mass);
  const volVal = parseFloat(inp.vol);
  const concVal = parseFloat(inp.conc);

  if (inp.solveFor === "conc") {
    if (!isFinite(mwVal) || !isFinite(massVal) || !isFinite(volVal) || mwVal <= 0 || volVal <= 0)
      return null;
    const massG = toBase(massVal, inp.massUnit, MASS_UNITS);
    const volL = toBase(volVal, inp.volUnit, VOL_UNITS);
    const moles = massG / mwVal;
    const concM = moles / volL;
    return { value: fromBase(concM, inp.concUnit, CONC_UNITS), label: inp.concUnit };
  }
  if (inp.solveFor === "mass") {
    if (!isFinite(mwVal) || !isFinite(concVal) || !isFinite(volVal) || mwVal <= 0 || volVal <= 0)
      return null;
    const concM = toBase(concVal, inp.concUnit, CONC_UNITS);
    const volL = toBase(volVal, inp.volUnit, VOL_UNITS);
    const moles = concM * volL;
    const massG = moles * mwVal;
    return { value: fromBase(massG, inp.massUnit, MASS_UNITS), label: inp.massUnit };
  }
  if (inp.solveFor === "volume") {
    if (!isFinite(mwVal) || !isFinite(concVal) || !isFinite(massVal) || mwVal <= 0 || concVal <= 0)
      return null;
    const concM = toBase(concVal, inp.concUnit, CONC_UNITS);
    const massG = toBase(massVal, inp.massUnit, MASS_UNITS);
    const moles = massG / mwVal;
    const volL = moles / concM;
    return { value: fromBase(volL, inp.volUnit, VOL_UNITS), label: inp.volUnit };
  }
  if (inp.solveFor === "mw") {
    if (
      !isFinite(massVal) ||
      !isFinite(concVal) ||
      !isFinite(volVal) ||
      concVal <= 0 ||
      volVal <= 0
    )
      return null;
    const concM = toBase(concVal, inp.concUnit, CONC_UNITS);
    const volL = toBase(volVal, inp.volUnit, VOL_UNITS);
    const massG = toBase(massVal, inp.massUnit, MASS_UNITS);
    const moles = concM * volL;
    const mwCalc = massG / moles;
    return { value: mwCalc, label: "g/mol" };
  }
  return null;
}

export interface DilutionInputs {
  solveFor: string;
  c1: string;
  c1Unit: string;
  v1: string;
  v1Unit: string;
  c2: string;
  c2Unit: string;
  v2: string;
  v2Unit: string;
}

// Serial-dilution relation C1·V1 = C2·V2, solved for the requested unknown in
// base units (M, L) then converted back to the unknown's display unit.
export function solveDilution(inp: DilutionInputs): SolveResult | null {
  const c1Val = parseFloat(inp.c1);
  const v1Val = parseFloat(inp.v1);
  const c2Val = parseFloat(inp.c2);
  const v2Val = parseFloat(inp.v2);

  if (inp.solveFor === "c1") {
    if (!isFinite(v1Val) || !isFinite(c2Val) || !isFinite(v2Val) || v1Val <= 0) return null;
    const base =
      (toBase(c2Val, inp.c2Unit, CONC_UNITS) * toBase(v2Val, inp.v2Unit, VOL_UNITS)) /
      toBase(v1Val, inp.v1Unit, VOL_UNITS);
    return { value: fromBase(base, inp.c1Unit, CONC_UNITS), label: inp.c1Unit };
  }
  if (inp.solveFor === "v1") {
    if (!isFinite(c1Val) || !isFinite(c2Val) || !isFinite(v2Val) || c1Val <= 0) return null;
    const base =
      (toBase(c2Val, inp.c2Unit, CONC_UNITS) * toBase(v2Val, inp.v2Unit, VOL_UNITS)) /
      toBase(c1Val, inp.c1Unit, CONC_UNITS);
    return { value: fromBase(base, inp.v1Unit, VOL_UNITS), label: inp.v1Unit };
  }
  if (inp.solveFor === "c2") {
    if (!isFinite(c1Val) || !isFinite(v1Val) || !isFinite(v2Val) || v2Val <= 0) return null;
    const base =
      (toBase(c1Val, inp.c1Unit, CONC_UNITS) * toBase(v1Val, inp.v1Unit, VOL_UNITS)) /
      toBase(v2Val, inp.v2Unit, VOL_UNITS);
    return { value: fromBase(base, inp.c2Unit, CONC_UNITS), label: inp.c2Unit };
  }
  if (inp.solveFor === "v2") {
    if (!isFinite(c1Val) || !isFinite(v1Val) || !isFinite(c2Val) || c2Val <= 0) return null;
    const base =
      (toBase(c1Val, inp.c1Unit, CONC_UNITS) * toBase(v1Val, inp.v1Unit, VOL_UNITS)) /
      toBase(c2Val, inp.c2Unit, CONC_UNITS);
    return { value: fromBase(base, inp.v2Unit, VOL_UNITS), label: inp.v2Unit };
  }
  return null;
}

export interface LigationInputs {
  vectorBp: string;
  vectorNg: string;
  insertBp: string;
  ratioVector: string;
  ratioInsert: string;
}

// Insert mass (ng) for a target molar insert:vector ratio:
// insertNg = (insertBp / vectorBp) × vectorNg × (insertRatio / vectorRatio).
// Returns null unless every input is finite and strictly positive.
export function computeLigationInsertNg(inp: LigationInputs): number | null {
  const vBp = parseFloat(inp.vectorBp);
  const vNg = parseFloat(inp.vectorNg);
  const iBp = parseFloat(inp.insertBp);
  const rV = parseFloat(inp.ratioVector);
  const rI = parseFloat(inp.ratioInsert);
  if (!isFinite(vBp) || !isFinite(vNg) || !isFinite(iBp) || !isFinite(rV) || !isFinite(rI))
    return null;
  if (vBp <= 0 || vNg <= 0 || iBp <= 0 || rV <= 0 || rI <= 0) return null;
  return (iBp / vBp) * vNg * (rI / rV);
}

export type BatchRowResult =
  | {
      ok: true;
      mw: number;
      conc: string;
      vol: string;
      massG: number;
      massDisplay: string;
    }
  | { ok: false; errorCode: "mw" | "vol" | "conc"; value: string };

// Mass to weigh for one batch-sheet row given the raw MW / concentration /
// volume cells. Concentration may be molar ("150 mM") or mass/volume
// ("50 mg/mL"). Errors are returned as codes so the caller localizes them.
export function computeBatchMass(mwStr: string, concStr: string, volStr: string): BatchRowResult {
  const mwVal = parseFloat(mwStr);
  if (!isFinite(mwVal) || mwVal <= 0) return { ok: false, errorCode: "mw", value: mwStr };

  const volParsed = parseValueUnit(volStr, "mL", VOL_UNITS);
  if (!volParsed) return { ok: false, errorCode: "vol", value: volStr };
  const volL = toBase(volParsed.value, volParsed.unit, VOL_UNITS);

  const concParsed = parseValueUnit(concStr, "mM", CONC_UNITS);
  if (concParsed) {
    const concM = toBase(concParsed.value, concParsed.unit, CONC_UNITS);
    const massG = concM * volL * mwVal;
    return {
      ok: true,
      mw: mwVal,
      conc: concParsed.value + " " + concParsed.unit,
      vol: volParsed.value + " " + volParsed.unit,
      massG,
      massDisplay: formatMass(massG),
    };
  }

  const massVolParsed = parseMassVolConc(concStr);
  if (massVolParsed) {
    const massG = massVolParsed.gPerL * volL;
    return {
      ok: true,
      mw: mwVal,
      conc: massVolParsed.originalValue + " " + massVolParsed.originalUnit,
      vol: volParsed.value + " " + volParsed.unit,
      massG,
      massDisplay: formatMass(massG),
    };
  }

  return { ok: false, errorCode: "conc", value: concStr };
}
