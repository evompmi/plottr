// Unit tests for the molarity calculator's pure prep-sheet math
// (tools/molarity-app/helpers.ts): unit conversions, single-compound
// molarity (mass = moles × MW), C1·V1 = C2·V2 dilution, ligation insert
// mass, and per-row batch mass. Previously the calculator had only an e2e
// smoke test; this pins the arithmetic.

const { suite, test, assert, eq, approx, summary } = require("./harness");
const {
  toBase,
  fromBase,
  CONC_UNITS,
  VOL_UNITS,
  MASS_UNITS,
  formatResult,
  formatMass,
  parseValueUnit,
  parseMassVolConc,
  solveMolarity,
  solveDilution,
  computeLigationInsertNg,
  computeBatchMass,
} = require("./helpers/molarity-loader");

// ── unit conversions ──────────────────────────────────────────────────────

suite("molarity — unit conversion");

test("toBase / fromBase round-trip across every unit family", () => {
  for (const units of [CONC_UNITS, VOL_UNITS, MASS_UNITS]) {
    for (const u of units) {
      approx(fromBase(toBase(7, u.label, units), u.label, units), 7, 1e-12, u.label);
    }
  }
});

test("toBase applies the SI prefix factor", () => {
  approx(toBase(150, "mM", CONC_UNITS), 0.15, 1e-15); // 150 mM = 0.15 M
  approx(toBase(500, "mL", VOL_UNITS), 0.5, 1e-15); // 500 mL = 0.5 L
  approx(toBase(2, "µg", MASS_UNITS), 2e-6, 1e-20); // 2 µg = 2e-6 g
});

test("unknown unit falls back to factor 1", () => {
  eq(toBase(3, "furlong", CONC_UNITS), 3);
  eq(fromBase(3, "furlong", CONC_UNITS), 3);
});

// ── formatters ────────────────────────────────────────────────────────────

suite("molarity — formatters");

test("formatResult handles non-finite, zero, and magnitude bands", () => {
  eq(formatResult(null), "—");
  eq(formatResult(NaN), "—");
  eq(formatResult(Infinity), "—");
  eq(formatResult(0), "0");
  eq(formatResult(1234.5), "1234.50"); // ≥ 100 → 2 dp
  eq(formatResult(2.5), "2.5000"); // ≥ 1 → 4 dp
  eq(formatResult(1e7), "1.0000e+7"); // ≥ 1e6 → exponential
  eq(formatResult(1e-5), "1.0000e-5"); // < 1e-3 → exponential
});

test("formatMass picks g / mg / µg by magnitude", () => {
  eq(formatMass(2), "2.0000 g");
  eq(formatMass(0.005), "5.0000 mg");
  eq(formatMass(3e-6), "3.0000 µg");
});

// ── value+unit parsing ────────────────────────────────────────────────────

suite("molarity — parseValueUnit / parseMassVolConc");

test("parseValueUnit reads number + unit, defaulting when bare", () => {
  eq(parseValueUnit("150 mM", "mM", CONC_UNITS), { value: 150, unit: "mM" });
  eq(parseValueUnit("0.5 M", "mM", CONC_UNITS), { value: 0.5, unit: "M" });
  eq(parseValueUnit("100", "mL", VOL_UNITS), { value: 100, unit: "mL" }); // bare → default
});

test("parseValueUnit rejects unknown units and non-numbers", () => {
  eq(parseValueUnit("150 furlongs", "mM", CONC_UNITS), null);
  eq(parseValueUnit("abc mM", "mM", CONC_UNITS), null);
});

test("parseMassVolConc converts mass/volume strings to g/L", () => {
  eq(parseMassVolConc("50 mg/mL").gPerL, 50); // mg/mL ≡ g/L
  eq(parseMassVolConc("2 g/mL").gPerL, 2000); // g/mL → ×1000
  approx(parseMassVolConc("10 mg/L").gPerL, 0.01, 1e-15);
  eq(parseMassVolConc("50 mM"), null); // molar, not mass/vol
});

// ── molarity: mass = moles × MW ───────────────────────────────────────────

suite("molarity — solveMolarity");

const MOL_BASE = { massUnit: "g", volUnit: "mL", concUnit: "mM" };

test("solve for mass: 150 mM NaCl in 500 mL → 4.383 g", () => {
  // moles = 0.15 mol/L × 0.5 L = 0.075; mass = 0.075 × 58.44 = 4.383 g
  const r = solveMolarity({
    ...MOL_BASE,
    solveFor: "mass",
    mw: "58.44",
    mass: "",
    vol: "500",
    conc: "150",
  });
  eq(r.label, "g");
  approx(r.value, 4.383, 1e-9);
});

test("solve for conc inverts solve for mass (round-trip)", () => {
  const conc = solveMolarity({
    ...MOL_BASE,
    solveFor: "conc",
    mw: "58.44",
    mass: "4.383",
    vol: "500",
    conc: "",
  });
  approx(conc.value, 150, 1e-6); // back to 150 mM
  eq(conc.label, "mM");
});

test("solve for volume and MW close the relation", () => {
  // 0.075 mol of MW 58.44 at 150 mM occupies 500 mL.
  const vol = solveMolarity({
    ...MOL_BASE,
    solveFor: "volume",
    mw: "58.44",
    mass: "4.383",
    vol: "",
    conc: "150",
  });
  approx(vol.value, 500, 1e-6);
  eq(vol.label, "mL");
  const mw = solveMolarity({
    ...MOL_BASE,
    solveFor: "mw",
    mw: "",
    mass: "4.383",
    vol: "500",
    conc: "150",
  });
  approx(mw.value, 58.44, 1e-6);
  eq(mw.label, "g/mol");
});

test("solveMolarity returns null on non-positive / missing inputs", () => {
  eq(
    solveMolarity({ ...MOL_BASE, solveFor: "mass", mw: "0", mass: "", vol: "1", conc: "1" }),
    null
  );
  eq(
    solveMolarity({ ...MOL_BASE, solveFor: "conc", mw: "10", mass: "", vol: "1", conc: "" }),
    null
  );
  eq(
    solveMolarity({ ...MOL_BASE, solveFor: "nonsense", mw: "1", mass: "1", vol: "1", conc: "1" }),
    null
  );
});

// ── dilution: C1·V1 = C2·V2 ───────────────────────────────────────────────

suite("molarity — solveDilution");

const DIL_BASE = { c1Unit: "M", v1Unit: "mL", c2Unit: "mM", v2Unit: "mL" };

test("solve for v1: 1 M stock to 10 mM × 100 mL needs 1 mL", () => {
  // v1 = c2·v2 / c1 = (0.01 × 0.1) / 1 = 0.001 L = 1 mL
  const r = solveDilution({
    ...DIL_BASE,
    solveFor: "v1",
    c1: "1",
    v1: "",
    c2: "10",
    v2: "100",
  });
  eq(r.label, "mL");
  approx(r.value, 1, 1e-9);
});

test("each unknown preserves C1·V1 = C2·V2 in base units", () => {
  // Solve for c2 from a fully-specified C1/V1/V2, then check the identity.
  const c2 = solveDilution({
    ...DIL_BASE,
    solveFor: "c2",
    c1: "1",
    v1: "1",
    c2: "",
    v2: "100",
  });
  const lhs = toBase(1, "M", CONC_UNITS) * toBase(1, "mL", VOL_UNITS);
  const rhs = toBase(c2.value, "mM", CONC_UNITS) * toBase(100, "mL", VOL_UNITS);
  approx(lhs, rhs, 1e-15);
});

test("solveDilution returns null when the divisor input is non-positive", () => {
  eq(solveDilution({ ...DIL_BASE, solveFor: "v1", c1: "0", v1: "", c2: "10", v2: "100" }), null);
});

// ── ligation insert mass ──────────────────────────────────────────────────

suite("molarity — computeLigationInsertNg");

test("3:1 insert:vector, 5 kb vector @ 50 ng, 1 kb insert → 30 ng", () => {
  // (1000/5000) × 50 × (3/1) = 0.2 × 50 × 3 = 30
  approx(
    computeLigationInsertNg({
      vectorBp: "5000",
      vectorNg: "50",
      insertBp: "1000",
      ratioVector: "1",
      ratioInsert: "3",
    }),
    30,
    1e-9
  );
});

test("insert ng scales linearly with vector ng and the molar ratio", () => {
  const base = {
    vectorBp: "3000",
    vectorNg: "20",
    insertBp: "600",
    ratioVector: "1",
    ratioInsert: "1",
  };
  const a = computeLigationInsertNg(base);
  const doubleNg = computeLigationInsertNg({ ...base, vectorNg: "40" });
  const tripleRatio = computeLigationInsertNg({ ...base, ratioInsert: "3" });
  approx(doubleNg, a * 2, 1e-9);
  approx(tripleRatio, a * 3, 1e-9);
});

test("computeLigationInsertNg rejects non-positive / non-finite inputs", () => {
  const ok = {
    vectorBp: "3000",
    vectorNg: "20",
    insertBp: "600",
    ratioVector: "1",
    ratioInsert: "1",
  };
  eq(computeLigationInsertNg({ ...ok, vectorNg: "0" }), null);
  eq(computeLigationInsertNg({ ...ok, insertBp: "-1" }), null);
  eq(computeLigationInsertNg({ ...ok, ratioInsert: "abc" }), null);
});

// ── batch per-row mass ────────────────────────────────────────────────────

suite("molarity — computeBatchMass");

test("molar concentration row matches the molarity relation", () => {
  const r = computeBatchMass("58.44", "150 mM", "500 mL");
  assert(r.ok, "expected ok row");
  approx(r.massG, 4.383, 1e-9);
  eq(r.massDisplay, "4.3830 g");
  eq(r.mw, 58.44);
  eq(r.conc, "150 mM");
  eq(r.vol, "500 mL");
});

test("mass/volume concentration row (50 mg/mL × 100 mL → 5 g)", () => {
  const r = computeBatchMass("484.5", "50 mg/mL", "100 mL");
  assert(r.ok, "expected ok row");
  approx(r.massG, 5, 1e-9);
  eq(r.massDisplay, "5.0000 g");
});

test("error codes for bad MW / volume / unparseable concentration", () => {
  eq(computeBatchMass("0", "150 mM", "500 mL"), { ok: false, errorCode: "mw", value: "0" });
  eq(computeBatchMass("58.44", "150 mM", "lots"), { ok: false, errorCode: "vol", value: "lots" });
  const bad = computeBatchMass("58.44", "purple", "500 mL");
  eq(bad.ok, false);
  eq(bad.errorCode, "conc");
});

summary();
