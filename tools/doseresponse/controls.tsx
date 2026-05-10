// doseresponse/controls.tsx — Reusable sidebar tile components.

const TOGGLE_VARIANTS = ["off", "on"] as const;
type ToggleVariant = (typeof TOGGLE_VARIANTS)[number];

export function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div>
      <span className="dv-label">{label}</span>
      <div
        style={{
          display: "flex",
          borderRadius: 6,
          overflow: "hidden",
          border: "1px solid var(--border-strong)",
        }}
      >
        {TOGGLE_VARIANTS.map((mode: ToggleVariant) => {
          const active = mode === "on" ? value : !value;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onChange(mode === "on")}
              style={{
                flex: 1,
                padding: "4px 0",
                fontSize: 11,
                fontWeight: active ? 700 : 400,
                fontFamily: "inherit",
                cursor: "pointer",
                border: "none",
                background: active ? "var(--accent-primary)" : "var(--surface)",
                color: active ? "var(--on-accent)" : "var(--text-muted)",
                transition: "background 120ms ease, color 120ms ease",
              }}
            >
              {mode === "off" ? "Off" : "On"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SegmentedRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div>
      <span className="dv-label">{label}</span>
      <div
        style={{
          display: "flex",
          borderRadius: 6,
          overflow: "hidden",
          border: "1px solid var(--border-strong)",
        }}
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              style={{
                flex: 1,
                padding: "4px 6px",
                fontSize: 11,
                fontWeight: active ? 700 : 400,
                fontFamily: "inherit",
                cursor: "pointer",
                border: "none",
                background: active ? "var(--accent-primary)" : "var(--surface)",
                color: active ? "var(--on-accent)" : "var(--text-muted)",
                transition: "background 120ms ease, color 120ms ease",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
