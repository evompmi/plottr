// upset/stats-panel.tsx — IntersectionStatsPanel: the exact /
// approximate / Poisson SuperExactTest results pane shown for the
// currently-selected intersection. Driven by the parent App's
// intersectionTests cache.

const { useMemo } = React;

/* ── Intersection significance panel ────────────────────────────────────────
 *
 * Click-to-compute SuperExactTest-style multi-set intersection p-value for
 * the currently selected UpSet bar. Key design notes:
 *
 *   - Test input is the INCLUSIVE intersection count (items in all selected
 *     sets, regardless of membership in other sets). The bar height shown in
 *     the plot is the EXCLUSIVE intersection (items in ONLY these sets).
 *     Both are displayed in the panel so the user understands which is tested.
 *   - Null model is fixed-margin: each selected set is a uniformly-random
 *     subset of the universe with its observed size. User-adjustable
 *     "Universe size" governs this — defaults to the union of uploaded
 *     items, but any real gene-list analysis needs a larger background
 *     (genome, proteome). Tooltip explains the gravity of this choice.
 *   - Cache keyed on `${mask}:${universe}` so re-renders don't recompute
 *     and a universe change invalidates stale entries. BH adjustment runs
 *     across all currently-cached tests so pAdj updates live.
 *   - Exact path only — the Poisson approximation is available in stats.js
 *     but we don't expose it here; at plant-science scale the exact DP is
 *     fast enough and more accurate in the deep tail.
 */
export function IntersectionStatsPanel({
  intersection,
  displaySetNames,
  sets,
  membershipMap,
  universeSize,
  intersectionTests,
}: any) {
  if (!intersection) return null;

  // Inclusive count: items whose bitmask covers every selected set.
  const inclusiveSize = React.useMemo(() => {
    const mask = intersection.mask;
    let count = 0;
    for (const m of membershipMap.values()) {
      if ((m & mask) === mask) count++;
    }
    return count;
  }, [intersection, membershipMap]);

  const selectedSetSizes = intersection.setIndices.map(
    (i: number) => (sets.get(displaySetNames[i]) || new Set()).size
  );
  const selectedSetNames = intersection.setIndices.map((i: number) => displaySetNames[i]);

  const universeN = typeof universeSize === "number" ? universeSize : Number(universeSize);

  const cacheKey = `${intersection.mask}:${universeN}`;
  const cachedResult = intersectionTests.get(cacheKey);

  const fmtP = (p: number | null | undefined) => {
    if (p == null || !Number.isFinite(p)) return "—";
    if (p === 0) return "0";
    if (p >= 1e-4) return p.toPrecision(4);
    return p.toExponential(3);
  };

  const sidebarSection = (
    label: React.ReactNode,
    value: React.ReactNode,
    tooltip: string | null = null
  ) =>
    React.createElement(
      "div",
      { style: { display: "flex", justifyContent: "space-between", gap: 16 } },
      React.createElement("span", { style: { color: "var(--text-muted)" } }, label),
      React.createElement(
        "span",
        {
          style: {
            fontFamily: "monospace",
            color: "var(--text)",
            cursor: tooltip ? "help" : undefined,
          },
          title: tooltip || undefined,
        },
        value
      )
    );

  return (
    <div
      className="dv-panel"
      style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <p className="dv-tile-title" style={{ margin: 0 }}>
          Intersection significance
        </p>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
          SuperExactTest-style exact test against the fixed-margin null
        </span>
      </div>

      {(() => {
        // Expected value + direction track the EXCLUSIVE bar height — the
        // count the user actually reads off the plot. Under the independence
        // approximation each item lands in this cell with probability
        //   p_M = Π(nᵢ/N for nᵢ in insideSizes) · Π(1 − nⱼ/N for nⱼ in outsideSizes)
        // so E[exclusive] = N · p_M. Refreshes on bar selection / universe
        // change — no need to click "Compute stats" to see the direction.
        const universeFinite = Number.isFinite(universeN) && universeN > 0;
        const xExclusive = intersection.size;
        // Inside sets: the ones the bar's mask selects. Outside sets:
        // every other set in the active upload.
        const outsideSetSizes: number[] = [];
        for (let j = 0; j < displaySetNames.length; j++) {
          if (!intersection.setIndices.includes(j)) {
            outsideSetSizes.push((sets.get(displaySetNames[j]) || new Set()).size);
          }
        }
        const expected = universeFinite
          ? multisetExclusiveExpected(selectedSetSizes, outsideSetSizes, universeN)
          : NaN;
        const expectedKnown = Number.isFinite(expected);
        const direction = !expectedKnown
          ? null
          : Math.abs(xExclusive - expected) < 1e-9
            ? "neutral"
            : xExclusive > expected
              ? "enriched"
              : "depleted";
        const directionGlyph =
          direction === "enriched"
            ? "↑ enriched"
            : direction === "depleted"
              ? "↓ depleted"
              : direction === "neutral"
                ? "≈ as expected"
                : "";
        const directionColor =
          direction === "enriched"
            ? "var(--accent-plot, #1f6feb)"
            : direction === "depleted"
              ? "var(--warning-text, #b45309)"
              : "var(--text-muted)";
        const fmtExpected = (v: number) => {
          if (!Number.isFinite(v)) return "—";
          if (v === 0) return "0";
          if (v >= 0.01 && v < 1000) return v.toPrecision(4).replace(/\.?0+$/, "");
          return v.toExponential(3);
        };
        return (
          <div style={{ display: "grid", gap: 4, fontSize: 12 }}>
            {sidebarSection(
              "Sets tested",
              intersectionShortLabel(intersection.setIndices),
              selectedSetNames.join(" ∩ ")
            )}
            {sidebarSection("Set sizes (nᵢ)", selectedSetSizes.join(", "))}
            {sidebarSection(
              "Exclusive overlap (bar)",
              <span style={{ display: "inline-flex", gap: 8, alignItems: "baseline" }}>
                <span>{xExclusive}</span>
                {direction && (
                  <span style={{ fontSize: 11, color: directionColor, fontWeight: 600 }}>
                    {directionGlyph}
                  </span>
                )}
              </span>
            )}
            {expectedKnown &&
              sidebarSection(
                "Expected under null",
                <span style={{ display: "inline-flex", gap: 6, alignItems: "baseline" }}>
                  <span>{fmtExpected(expected)}</span>
                  <span
                    style={{ fontSize: 10, color: "var(--text-faint)" }}
                    title={
                      "E[exclusive] = N · Π(nᵢ/N) · Π(1 − nⱼ/N) under the " +
                      "independence approximation (each item falls in each set with " +
                      "its marginal probability). Inside: sets the bar covers. " +
                      "Outside: the other uploaded sets."
                    }
                  >
                    = N · Π(nᵢ/N) · Π(1 − nⱼ/N)
                  </span>
                </span>
              )}
            {sidebarSection(
              <span style={{ color: "var(--text-faint)" }}>Inclusive overlap</span>,
              <span style={{ color: "var(--text-faint)" }}>{inclusiveSize}</span>
            )}
          </div>
        );
      })()}

      {cachedResult ? (
        // Headline two-sided p on the EXCLUSIVE bar height, followed by the
        // two one-sided tails for directional breakdown. One of the tails
        // matches the direction pill above; the other is near 1 by
        // construction.
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(() => {
            const two = cachedResult.pTwoSided;
            const twoAdj = cachedResult.pAdjTwoSided;
            const enr = Number.isFinite(cachedResult.pUpper) ? cachedResult.pUpper : cachedResult.p;
            const enrAdj = cachedResult.pAdjUpper;
            const dep = cachedResult.pLower;
            const depAdj = cachedResult.pAdjLower;
            const rowStyle = {
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              flexWrap: "wrap" as const,
              fontSize: 12,
            };
            const renderRow = (
              label: string,
              hint: string,
              p: number | null | undefined,
              pAdj: number | null | undefined
            ) => (
              <div style={rowStyle}>
                <span
                  style={{
                    color: "var(--text-muted)",
                    minWidth: 110,
                    display: "inline-block",
                  }}
                >
                  {label}
                </span>
                <span>
                  <span style={{ color: "var(--text-muted)" }}>p = </span>
                  <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{fmtP(p)}</span>
                </span>
                <span>
                  <span style={{ color: "var(--text-muted)" }}>p_adj = </span>
                  <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{fmtP(pAdj)}</span>
                </span>
                <span style={{ fontSize: 10, color: "var(--text-faint)" }}>{hint}</span>
              </div>
            );
            return (
              <>
                {renderRow(
                  "Two-sided",
                  "min(2·pUpper, 2·pLower, 1) — headline p, drives plot markers + bar colour",
                  two,
                  twoAdj
                )}
                {renderRow("Enrichment", "P(X ≥ bar) — Binomial(N, p_M), upper tail", enr, enrAdj)}
                {renderRow("Depletion", "P(X ≤ bar) — lower tail", dep, depAdj)}
                <span style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>
                  Each family BH-adjusted separately across {intersectionTests.size} intersection
                  {intersectionTests.size === 1 ? "" : "s"} cached for N={universeN}. The two-sided
                  p is the honest headline (one test per bar, no cherry-picking); the per-tail rows
                  are there for directional breakdown. The Binomial null assumes each item is
                  independently placed in every set at its marginal rate.
                </span>
              </>
            );
          })()}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
          No p-value for this intersection yet — use <strong>Compute stats</strong> in the sidebar
          to run the two-sided Binomial test (plus the per-tail enrichment / depletion breakdown) on
          the exclusive bar height for every intersection in the current set selection in one pass.
        </div>
      )}
    </div>
  );
}
