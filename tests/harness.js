// tests/harness.js — Vitest compat shim.
//
// The 24 `tests/*.test.js` files were originally written against a
// homemade harness with `suite() / test() / assert() / eq() / approx() /
// throws() / summary()`. They keep that vocabulary; this module just
// turns each `test()` call into a `vitest.test()` registration so
// Vitest runs the suite, reports failures with proper diffs, and gives
// us parallel file execution, watch mode, snapshot testing, and IDE
// integration for free.
//
// Mapping:
//   suite("Name")      → updates a module-local prefix used for the
//                        next vitest.test() name(s). Vitest doesn't
//                        let us imperatively open / close describe()
//                        blocks at evaluation time, so suites flatten
//                        into prefixed test names ("Name — sub-test").
//                        `vitest run --reporter=verbose` groups by
//                        file, which reads naturally enough.
//   test(name, fn)     → vitest.test(`${suite} — ${name}`, fn).
//                        Throws inside `fn` are surfaced as Vitest
//                        failures without our help.
//   assert(c, msg)     → throws an Error if `c` is falsy.
//   eq(a, b, msg)      → JSON.stringify-deep-equal; throws on mismatch
//                        (matches the historical semantics — `eq` has
//                        always been "stringify and compare" in this
//                        repo, not Vitest-style structural equality).
//   approx(a, b, tol)  → throws if |a - b| > tol.
//   throws(fn, msg)    → throws if `fn` does not throw.
//   summary()          → no-op. Vitest produces its own per-file and
//                        per-run totals; the bump-test-count posttest
//                        hook reads the `Tests  N passed (N)` line
//                        from .test-output.log.
//
// Why the shim instead of converting every test file to
// describe/it/expect:
//   - 24 files × ~50 tests each = ~1k call sites. The shim ships in
//     one file and changes none of them.
//   - The repo's house style for assertions is JSON-stringify equality
//     (`eq`) and absolute-tolerance comparison (`approx`). Vitest's
//     `expect(...).toEqual(...)` is structural, which is *better* in
//     general but produces different diff output that some of the
//     existing tests would need updating to read cleanly.
//   - A future contributor who wants Vitest's full DSL can use it
//     directly — `describe`, `it`, and `expect` are global by virtue
//     of `vitest.config.js` `globals: true`.

// Vitest 3.x's CJS entry refuses to be `require()`d directly; it's ESM-
// only and steers everyone toward dynamic import(). We don't need the
// import — `vitest.config.js` runs with `globals: true`, which injects
// Vitest's `test`, `expect`, `describe` etc. onto the global object
// before any test file loads. We grab `globalThis.test` lazily so the
// reference picks up the runtime-injected function rather than the
// undefined-at-module-load-time slot.

let _suite = "";

function suite(name) {
  _suite = name;
}

function test(name, fn) {
  // Tests register at file evaluation time. `_suite` is captured by
  // value in the `fullName` string at registration, before Vitest gets
  // around to running the queued tests, so the prefix stays correct
  // even though `_suite` keeps changing as the file evaluates.
  const fullName = _suite ? `${_suite} — ${name}` : name;
  // `globalThis.test` is Vitest's injected global. We call through
  // globalThis explicitly to dodge any local-shadowing surprises (a
  // future contributor adding `const test = …` at the top of harness.js
  // would otherwise silently break every registration).
  globalThis.test(fullName, fn);
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || "Assertion failed");
}

function eq(actual, expected, msg) {
  // Historical semantics: stringify both sides and compare. Cheap, and
  // produces the failure message shape the existing tests rely on.
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(msg || `Expected ${b}\n       Got     ${a}`);
}

function approx(actual, expected, tol = 1e-9, msg) {
  if (Math.abs(actual - expected) > tol)
    throw new Error(msg || `Expected ≈${expected}, got ${actual}`);
}

function throws(fn, msg) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error(msg || "Expected function to throw");
}

function summary() {
  // No-op under Vitest. The runner emits its own totals; the
  // landing-page badge bumper reads them from `.test-output.log`.
}

module.exports = { suite, test, assert, eq, approx, throws, summary };
