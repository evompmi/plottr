// Unit tests for tools/shared-handoff.js — one-shot inter-tool data
// hand-off via localStorage. Pins the round-trip contract used by the
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
  eq(c.localStorage.getItem("dataviz-handoff"), null);
  // Second call returns null — no resurrection on a later mount.
  eq(c.consumeHandoff("boxplot"), null);
});

test("consumeHandoff with mismatched tool returns null AND removes the payload", () => {
  // Removing on mismatch is intentional: a stale payload meant for a
  // different tool would otherwise survive every navigation. The user
  // can re-trigger the source tool's button to write a fresh one.
  const c = freshContext();
  c.setHandoff({ tool: "boxplot", csv: "..." });
  eq(c.consumeHandoff("scatter"), null);
  eq(c.localStorage.getItem("dataviz-handoff"), null);
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
  c.localStorage.setItem("dataviz-handoff", "{not valid json");
  eq(c.consumeHandoff("boxplot"), null);
  eq(c.localStorage.getItem("dataviz-handoff"), null);
});

test("consumeHandoff returns null when payload is JSON but missing the tool field", () => {
  const c = freshContext();
  c.localStorage.setItem("dataviz-handoff", JSON.stringify({ csv: "..." }));
  eq(c.consumeHandoff("boxplot"), null);
  // Still cleared — null/undefined `tool` can never match anyone, so
  // there's no value to leaving the entry around.
  eq(c.localStorage.getItem("dataviz-handoff"), null);
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
