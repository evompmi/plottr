// Shared chrome components — NumberInput, SliderControl, StepNavBar,
// PageHeader, UploadPanel, HowToCard, ActionsPanel, the three banners
// (CommaFix / FormulaInjection / ParseError), plus scroll helpers.
//
// Pre-2026-05 these lived in `tools/shared-ui.js` (plain-JS, React.createElement)
// loaded as globals. Now a typed module — kept in `React.createElement`
// form (no JSX rewrite) because the components are dense and a wholesale
// JSX conversion would balloon the diff for no functional change. Same
// pattern as `svg-legend.ts` and `long-format.tsx`.
//
// `toolIcon` and `flashSaved` come from `tools/shared.js` (still ambient
// globals); `FormulaInjectionWarning` is also ambient (declared in
// `types/globals.d.ts` because `scanForFormulaInjection` lives in the
// plain-JS `shared.js`).

import { FileDropZone } from "./file-drop";

const h = React.createElement;
const { useState, useRef, useEffect, useMemo, memo } = React;

// ── NumberInput ─────────────────────────────────────────────────────
//
// Compact numeric entry with −/+ buttons on either side replacing the
// native stacked spinner. Mimics the native `<input type="number">` API:
// `value`, `onChange(e)` where `e.target.value` is a string, plus `min`,
// `max`, `step`, `disabled`, `placeholder`, `className`, `style`,
// `inputStyle`. The −/+ buttons fire a synthetic event with the next
// value as a string so existing `(e) => setX(e.target.value)` handlers
// keep working.
//
// Press-and-hold: the button repeats at an accelerating cadence for as
// long as the pointer is held (first bump immediate, 400 ms before
// repeat kicks in, then 80 ms for a handful of ticks, then 40 ms).
// Release anywhere on the page stops the hold via a window-level
// pointerup listener, so the user can drag off the button mid-hold
// without breaking the gesture.

interface NumberInputProps {
  value: number | string | null | undefined;
  onChange: (e: { target: { value: string } }) => void;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
}

interface HoldState {
  dir: number;
  next: number;
  timerId: ReturnType<typeof setTimeout> | null;
  onUp: (() => void) | null;
}

export function NumberInput(props: NumberInputProps) {
  const value = props.value != null ? props.value : "";
  const onChange = props.onChange;
  const min = props.min != null ? Number(props.min) : null;
  const max = props.max != null ? Number(props.max) : null;
  const rawStep = props.step != null && props.step !== "any" ? Number(props.step) : 1;
  const step = isNaN(rawStep) || rawStep <= 0 ? 1 : rawStep;
  const disabled = !!props.disabled;
  const placeholder = props.placeholder;
  const className = "dv-num" + (disabled ? " dv-num-disabled" : "");

  // Hold state lives in a ref so setTimeout chains survive React re-renders
  // triggered by each fireChange.
  const holdRef = useRef<HoldState | null>(null);

  const fireChange = (newValueStr: string) => {
    if (!onChange) return;
    onChange({ target: { value: newValueStr } });
  };

  const clamp = (n: number): number => {
    if (min != null && n < min) n = min;
    if (max != null && n > max) n = max;
    // Round to the step's decimal precision to avoid 0.1+0.2 float noise.
    const decimals = (String(step).split(".")[1] || "").length;
    return decimals ? Number(n.toFixed(decimals)) : n;
  };

  const numericValue = Number(value);
  const minusDisabled = disabled || (min != null && !isNaN(numericValue) && numericValue <= min);
  const plusDisabled = disabled || (max != null && !isNaN(numericValue) && numericValue >= max);

  const stopRepeat = () => {
    const state = holdRef.current;
    if (!state) return;
    if (state.timerId) clearTimeout(state.timerId);
    if (state.onUp && typeof window !== "undefined") {
      window.removeEventListener("pointerup", state.onUp);
      window.removeEventListener("pointercancel", state.onUp);
    }
    holdRef.current = null;
  };

  const startRepeat = (dir: number) => {
    if ((dir < 0 && minusDisabled) || (dir > 0 && plusDisabled)) return;
    // Seed from the current prop value; every subsequent tick walks our own
    // ref so we stay correct even if React hasn't flushed the re-render yet.
    const seed = isNaN(Number(value)) ? (min != null ? min : 0) : Number(value);
    const state: HoldState = { dir, next: seed, timerId: null, onUp: null };
    holdRef.current = state;

    const doStep = () => {
      if (holdRef.current !== state) return;
      const n = clamp(state.next + dir * step);
      state.next = n;
      fireChange(String(n));
      if ((dir < 0 && min != null && n <= min) || (dir > 0 && max != null && n >= max)) {
        stopRepeat();
      }
    };

    // First step fires immediately so a quick click still bumps once.
    doStep();
    if (holdRef.current !== state) return;

    let ticks = 0;
    const tick = () => {
      if (holdRef.current !== state) return;
      doStep();
      if (holdRef.current !== state) return;
      ticks += 1;
      const delay = ticks > 8 ? 40 : 80;
      state.timerId = setTimeout(tick, delay);
    };
    // 400 ms dwell before the repeat kicks in (standard stepper feel).
    state.timerId = setTimeout(tick, 400);

    // Release anywhere on the page ends the hold — survives the user
    // dragging off the button mid-gesture.
    state.onUp = () => stopRepeat();
    if (typeof window !== "undefined") {
      window.addEventListener("pointerup", state.onUp);
      window.addEventListener("pointercancel", state.onUp);
    }
  };

  // Clean up if the component unmounts during a hold.
  useEffect(() => {
    return () => stopRepeat();
  }, []);

  const onMinusDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    startRepeat(-1);
  };
  const onPlusDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    startRepeat(1);
  };

  return h(
    "div",
    { className, style: props.style },
    h(
      "button",
      {
        type: "button",
        className: "dv-num-btn dv-num-btn-minus",
        onPointerDown: onMinusDown,
        disabled: minusDisabled,
        tabIndex: -1,
        "aria-label": "Decrement",
      },
      "−"
    ),
    h("input", {
      type: "number",
      className: "dv-num-input",
      value,
      min: props.min,
      max: props.max,
      step: props.step != null ? props.step : 1,
      disabled,
      placeholder,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => fireChange(e.target.value),
      style: props.inputStyle,
    }),
    h(
      "button",
      {
        type: "button",
        className: "dv-num-btn dv-num-btn-plus",
        onPointerDown: onPlusDown,
        disabled: plusDisabled,
        tabIndex: -1,
        "aria-label": "Increment",
      },
      "+"
    )
  );
}

// ── SliderControl ───────────────────────────────────────────────────
//
// Slider with label + value display on top, range input below.
//
// Wrapped in React.memo with a custom comparator that intentionally
// ignores the `onChange` prop. Without this, dragging one slider
// re-renders every other slider in the same sidebar (sliders all live
// under the same parent reducer), because each call site passes an
// inline `onChange={(v) => updVis({...})}` that gets a fresh function
// reference every render.
//
// Ignoring onChange is safe HERE because every call site closes the
// inline arrow over a `useReducer` dispatch (or other stable setter)
// plus a literal patch object — no captured state that could go stale
// between renders.

interface SliderControlProps {
  label: React.ReactNode;
  value: number;
  displayValue?: React.ReactNode;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}

function _SliderControlImpl(props: SliderControlProps) {
  const { label, value, displayValue, min, max, step, onChange } = props;
  const dv = displayValue != null ? displayValue : value;
  const pct = ((value - min) / (max - min)) * 100;
  const grad =
    "linear-gradient(to right, var(--accent-primary) " +
    pct +
    "%, var(--slider-track) " +
    pct +
    "%)";
  return h(
    "div",
    null,
    h(
      "div",
      { style: { display: "flex", justifyContent: "space-between", marginBottom: 2 } },
      h("span", { className: "dv-label" }, label),
      h("span", { style: { fontSize: 10, color: "var(--text-faint)" } }, dv)
    ),
    h("input", {
      type: "range",
      min,
      max,
      step,
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value)),
      style: { width: "100%", background: grad },
    })
  );
}

export const SliderControl = memo(_SliderControlImpl, (prev, next) => {
  return (
    prev.value === next.value &&
    prev.min === next.min &&
    prev.max === next.max &&
    prev.step === next.step &&
    prev.label === next.label &&
    prev.displayValue === next.displayValue
  );
});

// ── StepNavBar ──────────────────────────────────────────────────────
//
// Horizontal stepper with circles + labels + connector line. Past steps
// render a ✓ on a filled --step-ready circle; the current step renders
// its number on --step-active-bg chrome; reachable-unvisited steps
// render a --step-ready outline; locked steps render a neutral outline.
// Connector line between circles fills --step-ready up to the last
// completed step.

interface StepNavBarProps {
  steps: string[];
  currentStep: string;
  onStepChange: (s: string) => void;
  canNavigate?: (s: string) => boolean;
  // Optional override for the visible label of a step key. Keys remain
  // the stable identifier used by navigation state; labels can be
  // dynamic (e.g. venn showing "Import check" vs "Configure").
  stepLabels?: Record<string, string>;
}

export function StepNavBar(props: StepNavBarProps) {
  const { steps, currentStep, onStepChange } = props;
  const canNavigate = props.canNavigate;
  const stepLabels = props.stepLabels || {};
  const currentIdx = steps.indexOf(currentStep);
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const labelFor = (s: string) => stepLabels[s] || capitalize(s);
  const cells = steps.map((s, i) => {
    const enabled = canNavigate ? canNavigate(s) : true;
    const isCurrent = i === currentIdx;
    const isPast = i < currentIdx;
    const isReachableUnvisited = enabled && !isCurrent && !isPast;

    let circleBg: string;
    let circleBorder: string;
    let circleColor: string;
    let circleContent: React.ReactNode;
    if (isPast) {
      circleBg = "var(--step-ready)";
      circleBorder = "none";
      circleColor = "#ffffff";
      circleContent = h(
        "svg",
        {
          key: "check",
          width: 18,
          height: 18,
          viewBox: "0 0 24 24",
          "aria-hidden": "true",
          style: { display: "block" },
        },
        h("path", {
          d: "M5 12.5l4.2 4.2L19 7",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 3,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        })
      );
    } else if (isCurrent) {
      circleBg = "var(--step-active-bg)";
      circleBorder = "1px solid var(--step-active-border)";
      circleColor = "var(--on-accent)";
      circleContent = String(i + 1);
    } else if (isReachableUnvisited) {
      circleBg = "var(--surface)";
      circleBorder = "2px solid var(--step-ready)";
      circleColor = "var(--step-ready)";
      circleContent = String(i + 1);
    } else {
      circleBg = "var(--surface)";
      circleBorder = "1px solid var(--border)";
      circleColor = "var(--text-faint)";
      circleContent = String(i + 1);
    }

    const labelColor = isCurrent
      ? "var(--text)"
      : isPast
        ? "var(--text-muted)"
        : isReachableUnvisited
          ? "var(--text-faint)"
          : "var(--border)";
    const labelWeight = isCurrent ? 600 : 500;

    const connector =
      i < steps.length - 1
        ? h("div", {
            key: "conn",
            "aria-hidden": "true",
            style: {
              position: "absolute",
              top: 18,
              left: "50%",
              right: "-50%",
              height: 2,
              background: isPast ? "var(--step-ready)" : "var(--border-strong)",
              zIndex: 0,
              transition: "background 160ms ease-out",
            },
          })
        : null;

    const circle = h(
      "span",
      {
        key: "circle",
        style: {
          position: "relative",
          zIndex: 1,
          width: 36,
          height: 36,
          borderRadius: "50%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: circleBg,
          border: circleBorder,
          color: circleColor,
          fontSize: 16,
          fontWeight: 600,
          lineHeight: 1,
          boxSizing: "border-box",
          transition:
            "background 160ms ease-out, border-color 160ms ease-out, color 160ms ease-out",
        },
      },
      circleContent
    );

    const label = h(
      "span",
      {
        key: "label",
        style: {
          marginTop: 6,
          fontSize: 11,
          fontWeight: labelWeight,
          color: labelColor,
          textTransform: "capitalize",
          letterSpacing: 0.2,
          whiteSpace: "nowrap",
        },
      },
      labelFor(s)
    );

    const button = h(
      "button",
      {
        key: "btn",
        type: "button",
        onClick: enabled ? () => onStepChange(s) : undefined,
        disabled: !enabled,
        "aria-current": isCurrent ? "step" : undefined,
        "aria-label": "Step " + (i + 1) + " of " + steps.length + ": " + labelFor(s),
        // Stable test handle. The previous e2e selector
        // `getByRole("button", { name: /Plot$/ })` matched both this pill
        // and the SPA topbar's tool-icon buttons (which also end in
        // "... Plot"), so .first() picked the wrong one. Tests now use
        // `getByTestId("step-plot")` etc.
        "data-testid": "step-" + s,
        style: {
          all: "unset",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          cursor: enabled ? "pointer" : "default",
          position: "relative",
          zIndex: 1,
        },
      },
      circle,
      label
    );

    return h(
      "div",
      {
        key: "step-" + s,
        style: {
          flex: "1 1 0",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          minWidth: 0,
        },
      },
      connector,
      button
    );
  });

  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "flex-start",
        padding: "8px 0 4px",
        width: "100%",
      },
    },
    cells
  );
}

// ── CommaFixBanner ──────────────────────────────────────────────────

interface CommaFixBannerProps {
  commaFixed: boolean;
  commaFixCount: number;
}

export function CommaFixBanner(props: CommaFixBannerProps) {
  if (!props.commaFixed) return null;
  return h(
    "div",
    {
      className: "dv-panel",
      role: "status",
      style: {
        background: "var(--warning-bg)",
        borderColor: "var(--warning-border)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
      },
    },
    h("span", { style: { fontSize: 18 }, "aria-hidden": "true" }, "🔄"),
    h(
      "div",
      { style: { flex: 1 } },
      h(
        "p",
        { style: { margin: 0, fontSize: 12, color: "var(--warning-text)", fontWeight: 600 } },
        "Decimal commas automatically converted to dots"
      ),
      h(
        "p",
        {
          style: { margin: "2px 0 0", fontSize: 11, color: "var(--warning-text)", opacity: 0.85 },
        },
        props.commaFixCount +
          " value" +
          (props.commaFixCount > 1 ? "s" : "") +
          ' had commas as decimal separators (e.g. "0,5" → "0.5").'
      )
    )
  );
}

// ── FormulaInjectionBanner ──────────────────────────────────────────

interface FormulaInjectionBannerProps {
  warning: FormulaInjectionWarning | null;
}

export function FormulaInjectionBanner(props: FormulaInjectionBannerProps) {
  const w = props.warning;
  if (!w || !w.count) return null;
  const trim = (v: unknown) => {
    const s = String(v);
    return s.length > 80 ? s.slice(0, 80) + "…" : s;
  };
  const fmtCell = (c: { header?: string | null; row: number; col: number; value: unknown }) => {
    const where = c.header
      ? "“" + c.header + "” row " + (c.row + 1)
      : "row " + (c.row + 1) + " col " + (c.col + 1);
    return where + ": " + trim(c.value);
  };
  const fmtHeader = (hdr: { idx: number; value: unknown }) => {
    return "column " + (hdr.idx + 1) + ": " + trim(hdr.value);
  };
  const examples: string[] = [];
  for (let i = 0; i < w.headers.length; i++) examples.push("Header — " + fmtHeader(w.headers[i]));
  for (let i = 0; i < w.cells.length; i++) examples.push(fmtCell(w.cells[i]));
  const shown = examples.length;
  const overflow = w.count - shown;
  return h(
    "div",
    {
      role: "alert",
      style: {
        marginBottom: 16,
        padding: "10px 14px",
        borderRadius: 8,
        background: "var(--warning-bg)",
        border: "1px solid var(--warning-border)",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      },
    },
    h("span", { style: { fontSize: 18, lineHeight: "20px" }, "aria-hidden": "true" }, "⚠️"),
    h(
      "div",
      { style: { flex: 1, minWidth: 0 } },
      h(
        "p",
        { style: { margin: 0, fontSize: 12, color: "var(--warning-text)", fontWeight: 700 } },
        "Suspicious cells in uploaded data (" + w.count + (w.count === 1 ? " cell" : " cells") + ")"
      ),
      h(
        "p",
        {
          style: {
            margin: "2px 0 6px",
            fontSize: 11,
            color: "var(--warning-text)",
            opacity: 0.9,
          },
        },
        "Cells starting with " +
          "= + - @ tab CR" +
          " are treated as formulas by Excel / LibreOffice / Sheets and could exfiltrate or run code if you re-open this data there. Plöttr exports prefix them with a leading apostrophe to neutralise them — but the original file is unchanged, so handle with care."
      ),
      h(
        "ul",
        {
          style: {
            margin: 0,
            paddingLeft: 18,
            fontSize: 11,
            color: "var(--warning-text)",
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, "Cascadia Mono", "Liberation Mono", monospace',
            wordBreak: "break-all",
          },
        },
        examples.map((e, i) => h("li", { key: i }, e))
      ),
      overflow > 0
        ? h(
            "p",
            {
              style: {
                margin: "4px 0 0",
                fontSize: 11,
                color: "var(--warning-text)",
                opacity: 0.85,
              },
            },
            "…and " + overflow + " more."
          )
        : null
    )
  );
}

// ── ParseErrorBanner ────────────────────────────────────────────────

interface ParseErrorBannerProps {
  error: string | null | undefined;
}

export function ParseErrorBanner(props: ParseErrorBannerProps) {
  if (!props.error) return null;
  return h(
    "div",
    {
      role: "alert",
      style: {
        marginBottom: 16,
        padding: "10px 14px",
        borderRadius: 8,
        background: "var(--danger-bg)",
        border: "1px solid var(--danger-border)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      },
    },
    h("span", { style: { fontSize: 16 }, "aria-hidden": "true" }, "🚫"),
    h(
      "span",
      { style: { fontSize: 12, color: "var(--danger-text)", fontWeight: 600 } },
      props.error
    )
  );
}

// ── PageHeader ──────────────────────────────────────────────────────
//
// Page header with tool icon. The landing page owns the theme toggle
// in its top bar — we don't render a second one here.

interface PageHeaderProps {
  toolName: string;
  title: React.ReactNode;
  middle?: React.ReactNode;
  right?: React.ReactNode;
}

export function PageHeader(props: PageHeaderProps) {
  const vbar = (key: string) =>
    h("div", {
      key,
      "aria-hidden": "true",
      style: {
        flex: "0 0 auto",
        width: 1,
        alignSelf: "stretch",
        background: "var(--border-strong)",
      },
    });
  const rowChildren: React.ReactNode[] = [
    h(
      "h1",
      {
        key: "title",
        style: {
          margin: 0,
          fontSize: 22,
          fontWeight: 700,
          color: "var(--text)",
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
        },
      },
      toolIcon(props.toolName),
      props.title
    ),
  ];
  if (props.middle) {
    rowChildren.push(vbar("vbar-middle"));
    rowChildren.push(
      h(
        "div",
        {
          key: "middle",
          style: { flex: "1 1 auto", minWidth: 0, display: "flex", alignItems: "center" },
        },
        props.middle
      )
    );
  } else {
    rowChildren.push(h("div", { key: "spacer", style: { flex: "1 1 auto" } }));
  }
  if (props.right) {
    rowChildren.push(vbar("vbar-right"));
    rowChildren.push(
      h(
        "div",
        {
          key: "right",
          style: { flex: "0 0 auto", display: "flex", alignItems: "center" },
        },
        props.right
      )
    );
  }
  return h(
    "div",
    {
      style: {
        marginBottom: 28,
        borderBottom: "1px solid var(--border-strong)",
        paddingBottom: 16,
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 16,
          minHeight: 40,
        },
      },
      rowChildren
    )
  );
}

// ── UploadPanel ─────────────────────────────────────────────────────
//
// Separator selector + FileDropZone combo for the upload step.

interface UploadPanelProps {
  sepOverride: string;
  onSepChange: (s: string) => void;
  onFileLoad: (text: string, fileName: string) => void;
  onLoadExample?: () => void;
  exampleLabel?: React.ReactNode;
  hint?: string;
}

export function UploadPanel(props: UploadPanelProps) {
  const { sepOverride, onSepChange, onFileLoad, onLoadExample, exampleLabel, hint } = props;
  return h(
    "div",
    { className: "dv-panel" },
    h(
      "div",
      {
        style: {
          marginBottom: 12,
          padding: "12px 16px",
          background: "var(--info-bg)",
          borderRadius: 8,
          border: "1.5px solid var(--info-border)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        },
      },
      h(
        "label",
        {
          htmlFor: "dv-separator-select",
          style: { fontSize: 13, fontWeight: 600, color: "var(--accent-primary)" },
        },
        "Column separator"
      ),
      h(
        "select",
        {
          id: "dv-separator-select",
          value: sepOverride,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onSepChange(e.target.value),
          className: "dv-select-sep",
        },
        h("option", { value: "" }, "— Select —"),
        h("option", { value: "," }, "Comma (,)"),
        h("option", { value: ";" }, "Semicolon (;)"),
        h("option", { value: "\t" }, "Tab (\\t)"),
        h("option", { value: " " }, "Space")
      )
    ),
    !sepOverride
      ? h(
          "div",
          {
            style: {
              border: "2px dashed var(--border-strong)",
              borderRadius: 12,
              padding: "48px 24px",
              textAlign: "center",
              background: "var(--surface-sunken)",
              opacity: 0.5,
            },
          },
          h("div", { style: { fontSize: 40, marginBottom: 8 }, "aria-hidden": "true" }, "🚫"),
          h(
            "p",
            { style: { margin: 0, fontSize: 15, color: "var(--text-faint)" } },
            "Pick a column separator above to enable file loading"
          )
        )
      : h(FileDropZone, {
          onFileLoad,
          accept: ".csv,.tsv,.txt,.dat,.tab",
          hint: hint || "CSV · TSV · TXT · DAT — 2 MB max",
        }),
    onLoadExample
      ? h(
          "div",
          {
            style: {
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: 12,
              color: "var(--text-muted)",
            },
          },
          h("span", null, "Try sample data:"),
          h(
            "button",
            {
              type: "button",
              className: "dv-btn dv-btn-secondary",
              onClick: onLoadExample,
              "data-testid": "load-example",
            },
            exampleLabel || "Load example →"
          )
        )
      : null
  );
}

// ── HowToCard ───────────────────────────────────────────────────────
//
// Collapsible "How to use" card shared across every plot tool's upload
// step. Open state persists under `dv-howto-<toolName>` in localStorage;
// open by default on first visit.

interface HowToCardProps {
  toolName: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}

export function HowToCard(props: HowToCardProps) {
  const { toolName, title, subtitle, children } = props;
  const storageKey = "dv-howto-" + toolName;
  const initialOpen = useMemo(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v === "1") return true;
      if (v === "0") return false;
    } catch {
      /* ignore */
    }
    return true;
  }, [storageKey]);
  const [open, setOpen] = useState(initialOpen);
  const bodyId = "dv-howto-body-" + toolName;
  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  return h(
    "section",
    {
      style: {
        marginTop: 24,
        borderRadius: 14,
        overflow: "hidden",
        border: "2px solid var(--howto-border)",
        boxShadow: "var(--howto-shadow)",
      },
    },
    h(
      "button",
      {
        type: "button",
        onClick: toggle,
        "aria-expanded": open ? "true" : "false",
        "aria-controls": bodyId,
        style: {
          width: "100%",
          background: "linear-gradient(135deg,var(--howto-header-from),var(--howto-header-to))",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          font: "inherit",
          color: "inherit",
        },
      },
      toolIcon(toolName, 24, { circle: true }),
      h(
        "div",
        { style: { flex: 1, minWidth: 0 } },
        h("div", { style: { color: "var(--on-accent)", fontWeight: 700, fontSize: 15 } }, title),
        subtitle
          ? h(
              "div",
              { style: { color: "var(--on-accent-muted)", fontSize: 11, marginTop: 2 } },
              subtitle
            )
          : null
      ),
      h(
        "span",
        {
          "aria-hidden": "true",
          style: {
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--on-accent)",
            transition: "transform .18s ease",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            flexShrink: 0,
          },
        },
        h(
          "svg",
          { width: 22, height: 22, viewBox: "0 0 24 24", style: { display: "block" } },
          h("path", {
            d: "M9 5l7 7-7 7",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 2.6,
            strokeLinecap: "round",
            strokeLinejoin: "round",
          })
        )
      )
    ),
    open
      ? h(
          "div",
          {
            id: bodyId,
            style: {
              background: "var(--info-bg)",
              padding: "20px 24px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            },
          },
          children
        )
      : null
  );
}

// ── ActionsPanel ────────────────────────────────────────────────────
//
// Actions tile for plot step. Renders a wrapping row of unified
// download chips (SVG / PNG / + any `extraDownloads` like CSV/TXT)
// followed by a full-width Start-over button. Each chip flex-grows so
// 1/2/3 fit evenly; a 4th wraps.

export interface ActionsPanelDownload {
  label: string;
  title?: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

interface ActionsPanelProps {
  onDownloadSvg?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onDownloadPng?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  extraDownloads?: ActionsPanelDownload[];
  onReset: () => void;
}

export function ActionsPanel(props: ActionsPanelProps) {
  const downloads: ActionsPanelDownload[] = [];
  if (props.onDownloadSvg) {
    downloads.push({
      label: "SVG",
      title: "Download the plot as SVG — vector graphics, editable in Inkscape or Illustrator",
      onClick: props.onDownloadSvg,
    });
  }
  if (props.onDownloadPng) {
    downloads.push({
      label: "PNG",
      title: "Download the plot as PNG — 2× raster at the plot's native resolution",
      onClick: props.onDownloadPng,
    });
  }
  if (props.extraDownloads) {
    props.extraDownloads.forEach((d) => downloads.push(d));
  }
  const dlButtons = downloads.map((d, i) =>
    h(
      "button",
      {
        key: "dl" + i,
        title: d.title || undefined,
        onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
          d.onClick(e);
          flashSaved(e.currentTarget);
        },
        className: "dv-btn dv-btn-dl",
        style: { flex: "1 1 0" },
      },
      "⬇ " + d.label
    )
  );
  return h(
    "div",
    { className: "dv-panel" },
    h(
      "p",
      {
        className: "dv-tile-title",
        style: { margin: "0 0 8px" },
      },
      "Actions"
    ),
    dlButtons.length > 0
      ? h(
          "div",
          {
            style: {
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginBottom: 8,
            },
          },
          dlButtons
        )
      : null,
    h(
      "button",
      {
        onClick: props.onReset,
        title: "Clear all data, controls, and current session — returns to the upload step",
        className: "dv-btn dv-btn-danger",
      },
      "↺ Start over"
    )
  );
}

// ── Scroll helpers ──────────────────────────────────────────────────
//
// `scrollIntoViewWithinAncestor` — after a collapsible section expands,
// scroll just enough to bring `el`'s bottom (plus optional `extraBottom`
// px) into view, padded by `pad` px. Prefers the nearest scrollable
// ancestor (typically a sticky control-panel sidebar with its own
// overflow-y); falls back to scrolling the window when no such ancestor
// exists, so the helper works for tools like heatmap whose sidebar
// rides the page's own scroll.
//
// Deliberately does NOT use Element.scrollIntoView() — that bubbles up
// and scrolls every scrollable ancestor including the page even when
// the sidebar alone could satisfy the request. This helper picks ONE
// scroll container and only moves that one.

export function scrollIntoViewWithinAncestor(
  el: Element | null,
  pad?: number,
  extraBottom?: number
): void {
  if (!el) return;
  const padding = pad == null ? 8 : pad;
  const extra = extraBottom || 0;
  let parent: Element | null = el.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    const ov = style.overflowY;
    if ((ov === "auto" || ov === "scroll") && parent.scrollHeight > parent.clientHeight) {
      const parentRect = parent.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const revealBottom = elRect.bottom + extra;
      if (revealBottom > parentRect.bottom - padding) {
        const delta = revealBottom - parentRect.bottom + padding;
        const maxDelta = elRect.top - parentRect.top - padding;
        parent.scrollBy({ top: Math.min(delta, Math.max(0, maxDelta)), behavior: "smooth" });
      } else if (elRect.top < parentRect.top + padding) {
        parent.scrollBy({ top: elRect.top - parentRect.top - padding, behavior: "smooth" });
      }
      return;
    }
    parent = parent.parentElement;
  }
  // No scrollable ancestor — the page itself is what scrolls (heatmap case).
  const elRect = el.getBoundingClientRect();
  const viewportBottom = window.innerHeight;
  const revealBottom = elRect.bottom + extra;
  if (revealBottom > viewportBottom - padding) {
    const delta = revealBottom - viewportBottom + padding;
    const maxDelta = Math.max(0, elRect.top - padding);
    window.scrollBy({ top: Math.min(delta, maxDelta), behavior: "smooth" });
  } else if (elRect.top < padding) {
    window.scrollBy({ top: elRect.top - padding, behavior: "smooth" });
  }
}

// `scrollDisclosureIntoView` — disclosure-specific wrapper. Measures
// where the next section's header sits relative to the expanded section,
// and reveals its bottom edge plus ~14 px of clearance below so the
// next header lands comfortably inside the viewport instead of flush at
// the bottom edge.
const DISCLOSURE_TRAILING_CLEARANCE = 40;
export function scrollDisclosureIntoView(el: Element | null, pad?: number): void {
  if (!el) return;
  const next = el.nextElementSibling;
  const nextHeader = next && next.firstElementChild;
  let extra = 0;
  if (nextHeader) {
    const elRect = el.getBoundingClientRect();
    const nhRect = nextHeader.getBoundingClientRect();
    extra = Math.max(0, nhRect.bottom + DISCLOSURE_TRAILING_CLEARANCE - elRect.bottom);
  }
  scrollIntoViewWithinAncestor(el, pad == null ? 8 : pad, extra);
}
