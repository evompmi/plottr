// Icon-button picker for a chart's plot style (Group Plot: box / violin /
// raincloud / bar; qPCR: bar / dot / box), so every tool offers the same
// look. Each option is a labelled 22 × 22 line icon drawn in `currentColor`;
// the selected one is filled with the accent colour and exposed to assistive
// tech via `aria-pressed` inside a labelled `role="group"`.

export interface PlotStyleOption<T extends string> {
  value: T;
  label: string;
  icon: React.ReactNode;
  title?: string;
}

export interface PlotStyleIconPickerProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: PlotStyleOption<T>[];
  ariaLabel: string;
}

export function PlotStyleIconPicker<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: PlotStyleIconPickerProps<T>): React.ReactElement {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        gap: 6,
      }}
    >
      {options.map(({ value: key, label, icon, title }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            title={title}
            onClick={() => onChange(key)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              minHeight: 56,
              padding: "6px 0",
              borderRadius: "var(--radius-lg)",
              cursor: "pointer",
              border: active
                ? "1.5px solid var(--accent-primary)"
                : "1px solid var(--border-strong)",
              background: active ? "var(--accent-primary-weak)" : "var(--surface)",
              color: active ? "var(--link)" : "var(--text-muted)",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              transition: "background 120ms ease, color 120ms ease, border-color 120ms ease",
            }}
          >
            {icon}
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function BoxStyleIcon(): React.ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <line x1="11" y1="2" x2="11" y2="6" stroke="currentColor" strokeWidth="1.2" />
      <rect
        x="5"
        y="6"
        width="12"
        height="10"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <line x1="5" y1="11" x2="17" y2="11" stroke="currentColor" strokeWidth="1.5" />
      <line x1="11" y1="16" x2="11" y2="20" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function ViolinStyleIcon(): React.ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <path
        d="M11 2 C7 6, 5 9, 5 11 C5 13, 7 16, 11 20 C15 16, 17 13, 17 11 C17 9, 15 6, 11 2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <line x1="7" y1="11" x2="15" y2="11" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function RaincloudStyleIcon(): React.ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <path
        d="M11 2 C8 5, 6 8, 6 11 C6 14, 8 17, 11 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle cx="14" cy="7" r="1" fill="currentColor" />
      <circle cx="16" cy="10" r="1" fill="currentColor" />
      <circle cx="13" cy="13" r="1" fill="currentColor" />
      <circle cx="15" cy="16" r="1" fill="currentColor" />
      <circle cx="14" cy="19" r="1" fill="currentColor" />
    </svg>
  );
}

export function BarStyleIcon(): React.ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <rect x="2" y="10" width="5" height="10" rx="0.5" fill="currentColor" opacity="0.7" />
      <rect x="8.5" y="4" width="5" height="16" rx="0.5" fill="currentColor" opacity="0.7" />
      <rect x="15" y="7" width="5" height="13" rx="0.5" fill="currentColor" opacity="0.7" />
      <line x1="10" y1="2" x2="10" y2="4" stroke="currentColor" strokeWidth="1.2" />
      <line x1="8.5" y1="3" x2="11.5" y2="3" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

// Mean dot ± error bar per group (qPCR "Dots").
export function DotStyleIcon(): React.ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22">
      {(
        [
          [4.5, 14, 3],
          [11, 6, 4],
          [17.5, 10, 3],
        ] as const
      ).map(([x, y, h]) => (
        <g key={x}>
          <line x1={x} y1={y - h} x2={x} y2={y + h} stroke="currentColor" strokeWidth="1.2" />
          <line
            x1={x - 1.5}
            y1={y - h}
            x2={x + 1.5}
            y2={y - h}
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <line
            x1={x - 1.5}
            y1={y + h}
            x2={x + 1.5}
            y2={y + h}
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <circle cx={x} cy={y} r="2.2" fill="currentColor" />
        </g>
      ))}
      <line x1="1" y1="21" x2="21" y2="21" stroke="currentColor" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}
