// `NumberInput` — compact numeric entry with −/+ buttons replacing the
// native stacked spinner. Mimics the native `<input type="number">` API:
// `value`, `onChange(e)` where `e.target.value` is a string. The −/+
// buttons fire a synthetic event with the next value as a string so
// existing `(e) => setX(e.target.value)` handlers keep working.
//
// Press-and-hold: button repeats at an accelerating cadence (first bump
// immediate, 400 ms before repeat kicks in, then 80 ms for a handful of
// ticks, then 40 ms). Release anywhere on the page stops the hold via a
// window-level pointerup listener so the user can drag off the button
// mid-hold without breaking the gesture.

import { useShellT } from "./i18n";

const h = React.createElement;

const { useRef, useEffect } = React;

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
  const tr = useShellT();
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
        "aria-label": tr("shell.num.decrement"),
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
        "aria-label": tr("shell.num.increment"),
      },
      "+"
    )
  );
}
