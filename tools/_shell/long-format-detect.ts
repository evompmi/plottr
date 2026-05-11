// Long-format detection for set-membership inputs. Given a 2-column
// table, decide whether it's a wide 2-set file (col 1 = items in set A,
// col 2 = items in set B) or a long-format (item, set_label) stack.
//
// Originally introduced for Venn (audit medium M2 replaced an earlier
// heuristic that false-positived on duplicated col-2 items and
// false-negatived on small long-format files); lifted to `_shell/` so
// UpSet can share the same logic and the wide/long upfront picker can
// go away there too. Both tools now route their `doParse` through this
// helper for any 2-column input.
//
// Signal requirements (must all hold for `isLong = true`):
//   1. At least 3 non-empty col-2 cells (anything smaller is too
//      ambiguous to auto-detect; leave it as wide and let the user
//      re-label if wrong).
//   2. col 2 has ≥ 2 and ≤ 20 distinct values — "set labels" are
//      bounded (a user with > 20 sets is on UpSet, not Venn; either
//      way ≤ 20 is plenty).
//   3. Heavy repetition: cells whose value appears ≥ 2 times in col 2
//      make up at least half of col 2. A single-duplicate wide file
//      gives 2/20 = 0.1 which fails; a 3-row 2-set long-format gives
//      2/3 = 0.67.
//   4. col 1 is mostly distinct (≥ 70 % unique). A wide file with
//      heavy column-2 duplication would usually have column-1
//      duplication too; long-format has one row per (item, set) pair
//      so col-1 dupes are rare.
//
// Pure helper, no React / DOM dependency — pinned by
// `tests/venn.test.js` (existing) and `tests/upset.test.js`.

export interface LongFormatDetection {
  isLong: boolean;
  col1Distinct: number;
  col2Distinct: number;
  col2Repeats: number;
}

export function detectLongFormat(headers: string[], rows: string[][]): LongFormatDetection {
  const fail = {
    isLong: false,
    col1Distinct: 0,
    col2Distinct: 0,
    col2Repeats: 0,
  };
  if (!Array.isArray(headers) || headers.length !== 2) return fail;
  if (!Array.isArray(rows) || rows.length === 0) return fail;

  const col1: string[] = [];
  const col2: string[] = [];
  for (const r of rows) {
    const v1 = (r[0] || "").trim();
    const v2 = (r[1] || "").trim();
    if (v1) col1.push(v1);
    if (v2) col2.push(v2);
  }

  const col1Distinct = new Set(col1).size;
  const col2Distinct = new Set(col2).size;

  let col2Repeats = 0;
  if (col2.length > 0) {
    const counts: Record<string, number> = {};
    for (const v of col2) counts[v] = (counts[v] || 0) + 1;
    for (const v of col2) if (counts[v] >= 2) col2Repeats++;
  }

  const enoughRows = col2.length >= 3;
  const boundedSetCount = col2Distinct >= 2 && col2Distinct <= 20;
  const heavyRepetition = col2.length > 0 && col2Repeats * 2 >= col2.length;
  const col1MostlyUnique = col1Distinct >= Math.max(3, col1.length * 0.7);

  const isLong = enoughRows && boundedSetCount && heavyRepetition && col1MostlyUnique;

  return { isLong, col1Distinct, col2Distinct, col2Repeats };
}
