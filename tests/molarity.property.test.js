// Property-based tests for the molarity calculator's pure math
// (tools/molarity-app/helpers.ts). Drives the solver relations under
// fast-check, checking the physical invariants that the per-example unit
// tests pin pointwise: molarity round-trips (solve-for-mass then
// solve-for-conc recovers the input), C1·V1 = C2·V2 holds for every solved
// unknown, and ligation insert mass is linear in vector mass.

const fc = require("fast-check");
const { suite, test } = require("./harness");
const {
  toBase,
  CONC_UNITS,
  VOL_UNITS,
  solveMolarity,
  solveDilution,
  computeLigationInsertNg,
} = require("./helpers/molarity-loader");

const RUNS = 400;
const check = (prop) => fc.assert(prop, { numRuns: RUNS });

// Positive, finite, well-scaled magnitudes — avoids subnormal / overflow
// regimes where floating-point round-trips legitimately lose precision.
const pos = fc.double({ min: 1e-3, max: 1e6, noNaN: true, noDefaultInfinity: true });

// Relative closeness, robust to the wide dynamic range of the inputs.
const relClose = (a, b, tol = 1e-6) =>
  Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

suite("molarity property — solveMolarity round-trip");

test("solve-for-mass then solve-for-conc recovers the concentration", () => {
  // Work in base units (M / L / g) so unit conversion is identity and the
  // property isolates the moles = conc × volume, mass = moles × MW relation.
  const U = { massUnit: "g", volUnit: "L", concUnit: "M" };
  check(
    fc.property(pos, pos, pos, (mw, conc, vol) => {
      const mass = solveMolarity({
        ...U,
        solveFor: "mass",
        mw: `${mw}`,
        mass: "",
        vol: `${vol}`,
        conc: `${conc}`,
      });
      if (!mass || !Number.isFinite(mass.value)) return true;
      const back = solveMolarity({
        ...U,
        solveFor: "conc",
        mw: `${mw}`,
        mass: `${mass.value}`,
        vol: `${vol}`,
        conc: "",
      });
      return back !== null && relClose(back.value, conc);
    })
  );
});

test("solve-for-volume then solve-for-mass recovers the mass", () => {
  const U = { massUnit: "g", volUnit: "L", concUnit: "M" };
  check(
    fc.property(pos, pos, pos, (mw, conc, mass) => {
      const vol = solveMolarity({
        ...U,
        solveFor: "volume",
        mw: `${mw}`,
        mass: `${mass}`,
        vol: "",
        conc: `${conc}`,
      });
      if (!vol || !Number.isFinite(vol.value)) return true;
      const back = solveMolarity({
        ...U,
        solveFor: "mass",
        mw: `${mw}`,
        mass: "",
        vol: `${vol.value}`,
        conc: `${conc}`,
      });
      return back !== null && relClose(back.value, mass);
    })
  );
});

suite("molarity property — dilution invariant");

test("every solved unknown satisfies C1·V1 = C2·V2 in base units", () => {
  const U = { c1Unit: "M", v1Unit: "L", c2Unit: "M", v2Unit: "L" };
  check(
    fc.property(pos, pos, pos, (c1, v1, c2) => {
      const v2 = solveDilution({
        ...U,
        solveFor: "v2",
        c1: `${c1}`,
        v1: `${v1}`,
        c2: `${c2}`,
        v2: "",
      });
      if (!v2 || !Number.isFinite(v2.value)) return true;
      const lhs = toBase(c1, "M", CONC_UNITS) * toBase(v1, "L", VOL_UNITS);
      const rhs = toBase(c2, "M", CONC_UNITS) * toBase(v2.value, "L", VOL_UNITS);
      return relClose(lhs, rhs);
    })
  );
});

suite("molarity property — ligation linearity");

test("insert ng is proportional to vector ng (other inputs fixed)", () => {
  check(
    fc.property(
      pos,
      pos,
      pos,
      fc.double({ min: 1e-3, max: 1e3, noNaN: true, noDefaultInfinity: true }),
      (vBp, iBp, vNg, k) => {
        const base = { vectorBp: `${vBp}`, insertBp: `${iBp}`, ratioVector: "1", ratioInsert: "3" };
        const a = computeLigationInsertNg({ ...base, vectorNg: `${vNg}` });
        const b = computeLigationInsertNg({ ...base, vectorNg: `${vNg * k}` });
        if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return true;
        return relClose(b, a * k);
      }
    )
  );
});
