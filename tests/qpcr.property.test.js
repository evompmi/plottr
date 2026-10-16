// Property-based tests for the qPCR pipeline (tools/qpcr/helpers.ts):
// parse resilience, normalisation invariants, and the ΔCt / −ΔΔCt
// equivalence the statistics rely on.

const fc = require("fast-check");
const { suite, test } = require("./harness");
const { arbAnyCsv } = require("./helpers/csv-arbitraries");
const L = require("./helpers/qpcr-loader");

const RUNS = 200;
const RUNS_HEAVY = 30;
const check = (prop, runs = RUNS) => fc.assert(prop, { numRuns: runs });
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

const GENES = ["R1", "R2", "T1"];
const GROUPS = ["C", "A", "B"];

// Per (group, sample, gene) a Ct in [15, 35] with 2 technical replicates.
const arbWells = fc
  .tuple(
    fc.integer({ min: 2, max: 4 }),
    fc.array(fc.double({ min: 15, max: 35, noNaN: true }), {
      minLength: 3 * 4 * 3 * 2,
      maxLength: 3 * 4 * 3 * 2,
    })
  )
  .map(([nPer, cts]) => {
    const wells = [];
    let k = 0;
    for (const group of GROUPS)
      for (let s = 1; s <= nPer; s++)
        for (const gene of GENES)
          for (let t = 0; t < 2; t++)
            wells.push({ sample: String(s), group, gene, ct: cts[k++ % cts.length] });
    return wells;
  });
const arbEff = fc.record({
  R1: fc.double({ min: 1.7, max: 2.2, noNaN: true }),
  R2: fc.double({ min: 1.7, max: 2.2, noNaN: true }),
  T1: fc.double({ min: 1.7, max: 2.2, noNaN: true }),
});
const cfg = (eff, refs = ["R1", "R2"]) => ({
  refs,
  targets: ["T1"],
  eff,
  normalize: "control",
  control: "C",
  groupOrder: GROUPS,
});

suite("parsing resilience");

test("detectLayout + parse never throw; exactly one of data / error", () => {
  check(
    fc.property(arbAnyCsv, (text) => {
      const raw = L.parseRaw(text);
      const g = L.detectLayout(raw.headers, raw.rows);
      const r =
        g.layout === "long"
          ? L.parseLong(raw.rows, g.long)
          : L.parseWide(raw.headers, raw.rows, g.wide);
      return (r.data === null) !== (r.error === null);
    })
  );
});

suite("normalisation invariants");

test("shifting every Ct of one sample by a constant leaves its ΔCt unchanged (E = 2)", () => {
  check(
    fc.property(arbWells, fc.double({ min: -3, max: 3, noNaN: true }), (wells, shift) => {
      const base = L.computeGene(L.aggregateTechReps(wells), cfg({}), "T1");
      const shifted = wells.map((w) =>
        w.group === "A" && w.sample === "1" ? { ...w, ct: w.ct + shift } : w
      );
      const g = L.computeGene(L.aggregateTechReps(shifted), cfg({}), "T1");
      const a = base.rows.find((r) => r.group === "A" && r.sample === "1");
      const b = g.rows.find((r) => r.group === "A" && r.sample === "1");
      return close(a.dCt, b.dCt);
    })
  );
});

test("control group's mean −ΔΔCt is 0 (geometric-mean fold change 1)", () => {
  check(
    fc.property(arbWells, arbEff, (wells, eff) => {
      const g = L.computeGene(L.aggregateTechReps(wells), cfg(eff), "T1");
      return close(g.summaries[0].meanL, 0, 1e-9);
    })
  );
});

test("E = 2 everywhere reproduces 2^−ΔΔCt from raw Ct", () => {
  check(
    fc.property(arbWells, (wells) => {
      const samples = L.aggregateTechReps(wells);
      const g = L.computeGene(samples, cfg({}), "T1");
      const dct = (s) => s.ct.T1.mean - (s.ct.R1.mean + s.ct.R2.mean) / 2;
      const ctrl = samples.filter((s) => s.group === "C").map(dct);
      const cal = ctrl.reduce((a, b) => a + b, 0) / ctrl.length;
      return g.rows.every((r) => {
        const s = samples.find((x) => x.group === r.group && x.sample === r.sample);
        return close(r.L, -(dct(s) - cal));
      });
    })
  );
});

test("reference-gene order does not change the result", () => {
  check(
    fc.property(arbWells, arbEff, (wells, eff) => {
      const samples = L.aggregateTechReps(wells);
      const a = L.computeGene(samples, cfg(eff, ["R1", "R2"]), "T1");
      const b = L.computeGene(samples, cfg(eff, ["R2", "R1"]), "T1");
      return a.rows.every((r, i) => close(r.dCt, b.rows[i].dCt));
    })
  );
});

test("tests on ΔCt and on −ΔΔCt give the same p-value", () => {
  check(
    fc.property(arbWells, arbEff, (wells, eff) => {
      const g = L.computeGene(L.aggregateTechReps(wells), cfg(eff), "T1");
      const neg = {
        ...g,
        dCtByGroup: g.groups.map((grp) => g.rows.filter((r) => r.group === grp).map((r) => r.L)),
      };
      const p1 = L.runGeneStats(g, null).testResult;
      const p2 = L.runGeneStats(neg, null).testResult;
      if (!p1 || !p2 || !Number.isFinite(p1.p)) return true; // degenerate (zero-variance) input
      return close(p1.p, p2.p, 1e-7);
    }),
    RUNS_HEAVY
  );
});

test("Welch CI vs control brackets its estimate", () => {
  check(
    fc.property(arbWells, arbEff, (wells, eff) => {
      const g = L.computeGene(L.aggregateTechReps(wells), cfg(eff), "T1");
      return g.vsControl.every(
        (v) => !Number.isFinite(v.lo) || (v.lo <= v.log2fc + 1e-12 && v.log2fc <= v.hi + 1e-12)
      );
    })
  );
});

test("without a calibrator, L = −ΔCt: control-mode L shifted by the calibrator, same p-value", () => {
  check(
    fc.property(arbWells, arbEff, (wells, eff) => {
      const samples = L.aggregateTechReps(wells);
      const c = L.computeGene(samples, cfg(eff), "T1");
      const r = L.computeGene(samples, { ...cfg(eff), normalize: "refs" }, "T1");
      if (r.calibrator !== 0 || r.vsControl.length !== 0 || r.controlMissing) return false;
      const sameRows = r.rows.every(
        (row, i) => close(row.L, -row.dCt) && close(row.L, c.rows[i].L - c.calibrator, 1e-9)
      );
      const sameCi = r.summaries.every(
        (s, i) =>
          !Number.isFinite(s.lo) || close(s.hi - s.lo, c.summaries[i].hi - c.summaries[i].lo)
      );
      const p1 = L.runGeneStats(c, null).testResult;
      const p2 = L.runGeneStats(r, null).testResult;
      const sameP = !p1 || !Number.isFinite(p1.p) || p1.p === p2.p;
      return sameRows && sameCi && sameP;
    })
  );
});

test("error bars: SEM ⊂ CI and SEM ⊂ SD, all centred on the group mean", () => {
  check(
    fc.property(arbWells, arbEff, (wells, eff) => {
      const g = L.computeGene(L.aggregateTechReps(wells), cfg(eff), "T1");
      return g.summaries.every((s) => {
        const sem = L.errorBounds(s, "sem");
        const sd = L.errorBounds(s, "sd");
        const ci = L.errorBounds(s, "ci95");
        if (L.errorBounds(s, "none") !== null) return false;
        if (!sem) return s.n < 2 && sd === null && ci === null;
        const tol = 1e-12;
        return (
          close(sem.lo + sem.hi, 2 * s.meanL, 1e-9) &&
          close(sd.lo + sd.hi, 2 * s.meanL, 1e-9) &&
          sd.lo <= sem.lo + tol &&
          sem.hi <= sd.hi + tol &&
          ci.lo <= sem.lo + tol &&
          sem.hi <= ci.hi + tol
        );
      });
    })
  );
});

suite("efficiency");

test("parseEfficiency: percent and factor forms agree", () => {
  check(
    fc.property(fc.integer({ min: 1, max: 199 }), (pct) => {
      const a = L.parseEfficiency(`${pct} %`);
      const b = L.parseEfficiency(String(1 + pct / 100));
      return a !== null && b !== null && close(a, b, 1e-12);
    })
  );
});

test("standard curve recovers the efficiency of noiseless dilution data", () => {
  check(
    fc.property(
      fc.double({ min: 1.6, max: 2.3, noNaN: true }),
      fc.double({ min: 15, max: 25, noNaN: true }),
      (E, ct0) => {
        const pts = [1, 0.1, 0.01, 0.001].map((q) => ({
          gene: "X",
          quantity: q,
          ct: ct0 - Math.log10(q) / Math.log10(E),
        }));
        const c = L.standardCurves(pts)[0];
        return close(c.E, E, 1e-9) && close(c.r2, 1, 1e-12);
      }
    )
  );
});
