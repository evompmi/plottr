// Unit tests for tools/_shell/handoff.ts — one-shot inter-tool data
// hand-off via sessionStorage. Pins the round-trip contract used by the
// "↗ Open in Boxplot" button on RLU timecourse's Σ barplot tile and any
// future "send to <tool>" buttons.

const { suite, test, eq, assert, summary } = require("./harness");
const { freshContext } = require("./helpers/handoff-loader");

suite("shared-handoff.js — round trip");

test("setHandoff then consumeHandoff with matching tool returns the payload", () => {
  const c = freshContext();
  c.setHandoff({ tool: "boxplot", csv: "Group,Value\nA,1\nB,2" });
  const out = c.consumeHandoff("boxplot");
  eq(out.tool, "boxplot");
  eq(out.csv, "Group,Value\nA,1\nB,2");
});

test("consumeHandoff clears the localStorage key on success (one-shot)", () => {
  const c = freshContext();
  c.setHandoff({ tool: "boxplot", csv: "x,y\n1,2" });
  c.consumeHandoff("boxplot");
  eq(c.sessionStorage.getItem("dataviz-handoff"), null);
  // Second call returns null — no resurrection on a later mount.
  eq(c.consumeHandoff("boxplot"), null);
});

test("consumeHandoff with mismatched tool returns null and leaves the payload for its target", () => {
  // Every mounted consumer reacts to every write. Group Plot is both a
  // consumer and a source (composition pies → Proportions): its own
  // listener must not delete the payload it just sent to Proportions.
  const c = freshContext();
  c.setHandoff({ tool: "proportions", csv: "..." });
  eq(c.consumeHandoff("boxplot"), null);
  assert(c.sessionStorage.getItem("dataviz-handoff") !== null);
  eq(c.consumeHandoff("proportions").csv, "...");
  eq(c.sessionStorage.getItem("dataviz-handoff"), null);
});

test("an expired payload is discarded by any consumer, matching or not", () => {
  // Stale payloads (target never mounted) must not resurface later.
  const c = freshContext();
  const old = Date.now() - c.HANDOFF_TTL_MS - 1;
  c.sessionStorage.setItem(
    "dataviz-handoff",
    JSON.stringify({ tool: "proportions", csv: "...", sentAt: old })
  );
  eq(c.consumeHandoff("boxplot"), null);
  eq(c.sessionStorage.getItem("dataviz-handoff"), null);
  c.sessionStorage.setItem(
    "dataviz-handoff",
    JSON.stringify({ tool: "boxplot", csv: "...", sentAt: old })
  );
  eq(c.consumeHandoff("boxplot"), null);
  eq(c.sessionStorage.getItem("dataviz-handoff"), null);
});

test("a payload just inside the TTL is still delivered", () => {
  const c = freshContext();
  c.sessionStorage.setItem(
    "dataviz-handoff",
    JSON.stringify({ tool: "boxplot", csv: "ok", sentAt: Date.now() - c.HANDOFF_TTL_MS + 1000 })
  );
  eq(c.consumeHandoff("boxplot").csv, "ok");
});

test("the payload lives in per-tab sessionStorage, never in shared localStorage", () => {
  // localStorage is shared by every tab: an already-open copy of the target
  // tool in another tab could consume the payload before this tab's does.
  const c = freshContext();
  c.setHandoff({ tool: "boxplot", csv: "x" });
  assert(c.sessionStorage.getItem("dataviz-handoff") !== null);
  eq(Object.keys(c.localStore), []);
});

test("setHandoff stamps sentAt", () => {
  const c = freshContext();
  const before = Date.now();
  c.setHandoff({ tool: "boxplot", csv: "x" });
  const stored = JSON.parse(c.sessionStorage.getItem("dataviz-handoff"));
  assert(typeof stored.sentAt === "number" && stored.sentAt >= before);
});

test("consumeHandoff with no payload returns null and is idempotent", () => {
  const c = freshContext();
  eq(c.consumeHandoff("boxplot"), null);
  eq(c.consumeHandoff("boxplot"), null);
});

test("consumeHandoff swallows malformed JSON and clears the bad payload", () => {
  // Direct localStorage write of garbage simulates a corrupted store from
  // a previous Plöttr version with a different payload schema.
  const c = freshContext();
  c.sessionStorage.setItem("dataviz-handoff", "{not valid json");
  eq(c.consumeHandoff("boxplot"), null);
  eq(c.sessionStorage.getItem("dataviz-handoff"), null);
});

test("consumeHandoff returns null when payload is JSON but missing the tool field", () => {
  const c = freshContext();
  c.sessionStorage.setItem("dataviz-handoff", JSON.stringify({ csv: "..." }));
  eq(c.consumeHandoff("boxplot"), null);
  // Still cleared — null/undefined `tool` can never match anyone, so
  // there's no value to leaving the entry around.
  eq(c.sessionStorage.getItem("dataviz-handoff"), null);
});

test("payload preserves arbitrary extra fields (loose schema)", () => {
  const c = freshContext();
  c.setHandoff({
    tool: "boxplot",
    csv: "x,y\n1,2",
    mode: "long",
    source: "RLU timecourse — Σ barplot",
    fileName: "rlu_sums.csv",
    custom: { whatever: 42 },
  });
  const out = c.consumeHandoff("boxplot");
  eq(out.mode, "long");
  eq(out.source, "RLU timecourse — Σ barplot");
  eq(out.fileName, "rlu_sums.csv");
  assert(out.custom && out.custom.whatever === 42);
});

test("payload preserves yLabel for downstream y-axis overrides", () => {
  // Aequorin → boxplot sets `yLabel: "A.U.C."` so the destination
  // plot reads the standard scientific label (area under the curve)
  // rather than the implementation detail the boxplot would otherwise
  // auto-derive from the value column header ("Raw Sum" / "Corrected
  // Sum"). The handoff transport just round-trips the field; the
  // consumer is responsible for applying it (covered in boxplot/app.tsx
  // and pinned at the live-render level — not testable here without a
  // full React mount).
  const c = freshContext();
  c.setHandoff({
    tool: "boxplot",
    csv: "Condition,Raw Sum\nA,1\nB,2",
    yLabel: "A.U.C.",
  });
  const out = c.consumeHandoff("boxplot");
  eq(out.yLabel, "A.U.C.");
});

test("setHandoff overwrites a prior unconsumed payload (last-write-wins)", () => {
  // Edge case: user rapidly clicks two source tools' "Open in Boxplot"
  // buttons before either consumption fires. Whoever wrote last wins;
  // the earlier payload is discarded. Documented behaviour, not a bug.
  const c = freshContext();
  c.setHandoff({ tool: "boxplot", csv: "first" });
  c.setHandoff({ tool: "boxplot", csv: "second" });
  const out = c.consumeHandoff("boxplot");
  eq(out.csv, "second");
});

summary();
