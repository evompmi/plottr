// _core/numeric.ts — locale-aware numeric detection + seeded PRNG.
//
// Unicode-aware normalisation before numeric parsing. Excel on macOS, PDFs,
// Word docs, and statistical-paper copy-paste all routinely embed non-ASCII
// minus-ish and whitespace-ish characters into number cells. These are
// visually identical to the ASCII forms but break `Number()` parsing —
// `Number("−5")` (U+2212 minus sign) is `NaN`, not `-5`. Normalise them
// before regex + Number() so we don't silently drop legitimate values.

const UNICODE_MINUS_CHARS = /[\u2212\u2013\u2014]/g; // − (minus) – (en-dash) — (em-dash)
const UNICODE_SPACE_CHARS = /[\u00A0\u2009\u202F]/g; // NBSP, thin space, narrow NBSP

export function normalizeNumericString(v: unknown): unknown {
  if (typeof v !== "string") return v;
  return v.replace(UNICODE_MINUS_CHARS, "-").replace(UNICODE_SPACE_CHARS, "");
}

// Returns true only for strings that are entirely a valid finite number.
// Rejects:
//   - alphanumeric ("6wpi", "12abc", "0xFF"),
//   - Number() specials ("Infinity", "NaN"),
//   - overflow strings that coerce to ±Infinity ("1e999"),
//   - leading-zero integer IDs ("007", "000123") that silently lose their
//     zero-padded form when coerced — well plates, accession numbers, and
//     LIMS codes commonly use this shape.
// Accepts normalised Unicode variants: "−5" (U+2212), "–5" (en-dash), and
// numbers containing NBSP / thin spaces from copy-paste.
export function isNumericValue(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const s = (normalizeNumericString(v) as string).trim();
  if (s.length === 0) return false;
  if (/^-?0\d/.test(s)) return false;
  if (!/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return false;
  return Number.isFinite(Number(s));
}

// Convenience: normalise + parse. Callers that already know `isNumericValue`
// is true should route through this instead of `Number(v)` directly so
// Unicode-minus / NBSP values parse correctly.
export function toNumericValue(v: unknown): number {
  return isNumericValue(v) ? Number((normalizeNumericString(v) as string).trim()) : NaN;
}

// ── Seeded random — Park-Miller LCG ────────────────────────────────────────

export function seededRandom(seed: number): () => number {
  let s = seed;
  // Burn one LCG step before returning so the first observable output is
  // properly mixed. Park-Miller's first step on a small seed produces
  // roughly `seed * 16807 / 2^31`, so adjacent small seeds (e.g. the
  // per-source `gi*1000 + si*100 + 42` pattern the boxplot jitter uses)
  // would otherwise all return near-identical small first values — a
  // single-point source would then render its dot at the leftmost edge
  // of the jitter band. One warm-up advances the state into a
  // properly-mixed region of the cycle while keeping the function
  // deterministic (re-renders don't re-jitter).
  s = (s * 16807) % 2147483647;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}
