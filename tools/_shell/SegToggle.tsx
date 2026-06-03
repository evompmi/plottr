// Accessible segmented toggle — the canonical replacement for the inline
// `flex + overflow:hidden + two/three styled <button>` blocks that several
// tools re-implemented by hand. Renders the shared `.dv-seg` / `.dv-seg-btn`
// chrome (focus-visible outline + disabled styling come from components.css)
// and, unlike the hand-rolled copies, exposes the selected state to assistive
// tech via `aria-pressed` on each button inside a labelled `role="group"`.
//
// `SegToggle<T>` is the general multi-option control (T is the value union, so
// `onChange` stays fully typed with no cast at the call site). `OnOffToggle` is
// the boolean-backed convenience wrapper for the ubiquitous Off/On case.

export interface SegOption<T extends string> {
  value: T;
  label: React.ReactNode;
  title?: string;
  disabled?: boolean;
}

export interface SegToggleProps<T extends string> {
  options: ReadonlyArray<SegOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group (the question the buttons answer). */
  ariaLabel?: string;
  /** Disable the whole group. */
  disabled?: boolean;
  /** Extra inline style merged onto the `.dv-seg` wrapper. */
  style?: React.CSSProperties;
}

export function SegToggle<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled,
  style,
}: SegToggleProps<T>): React.ReactElement {
  return (
    <div className="dv-seg" role="group" aria-label={ariaLabel} style={style}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            className={"dv-seg-btn" + (active ? " dv-seg-btn-active" : "")}
            aria-pressed={active}
            title={opt.title}
            disabled={disabled || opt.disabled}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export interface OnOffToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  offLabel?: string;
  onLabel?: string;
  ariaLabel?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export function OnOffToggle({
  value,
  onChange,
  offLabel = "Off",
  onLabel = "On",
  ariaLabel,
  disabled,
  style,
}: OnOffToggleProps): React.ReactElement {
  return (
    <SegToggle<"off" | "on">
      value={value ? "on" : "off"}
      onChange={(v) => onChange(v === "on")}
      options={[
        { value: "off", label: offLabel },
        { value: "on", label: onLabel },
      ]}
      ariaLabel={ariaLabel}
      disabled={disabled}
      style={style}
    />
  );
}
