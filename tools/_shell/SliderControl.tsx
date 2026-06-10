// `SliderControl` — labelled range slider with the value displayed on top.
//
// Wrapped in `React.memo` with a custom comparator that intentionally
// ignores the `onChange` prop. Without this, dragging one slider
// re-renders every other slider in the same sidebar (sliders all live
// under the same parent reducer), because each call site passes an
// inline `onChange={(v) => updVis({...})}` that gets a fresh function
// reference every render. Ignoring onChange is safe HERE because every
// call site closes the inline arrow over a `useReducer` dispatch (or
// other stable setter) plus a literal patch object — no captured state
// that could go stale between renders.

const h = React.createElement;

const { memo } = React;

interface SliderControlProps {
  label: React.ReactNode;
  value: number;
  displayValue?: React.ReactNode;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}

function SliderControlImpl(props: SliderControlProps) {
  const { label, value, displayValue, min, max, step, onChange } = props;
  // Associate the visible label with the range input so screen readers
  // announce e.g. "Point size" instead of a bare "slider". `aria-labelledby`
  // (rather than a string `aria-label`) works for ReactNode labels — the
  // accessible name resolves to the span's text content.
  const labelId = React.useId();
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
      h("span", { className: "dv-label", id: labelId }, label),
      h("span", { style: { fontSize: 10, color: "var(--text-faint)" } }, dv)
    ),
    h("input", {
      type: "range",
      min,
      max,
      step,
      value,
      "aria-labelledby": labelId,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value)),
      style: { width: "100%", background: grad },
    })
  );
}

export const SliderControl = memo(SliderControlImpl, (prev, next) => {
  return (
    prev.value === next.value &&
    prev.min === next.min &&
    prev.max === next.max &&
    prev.step === next.step &&
    prev.label === next.label &&
    prev.displayValue === next.displayValue
  );
});
