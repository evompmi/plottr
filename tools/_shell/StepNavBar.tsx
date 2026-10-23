// `StepNavBar` — the inline step navigation in the app bar
// (Upload › Configure › Filter › Output › Plot). Past steps show a green
// check, the current step a tinted pill with a dot, later steps their
// number; locked steps are greyed out and disabled.

import { useShellT, type ShellKey } from "./i18n";

// Default localized labels for the canonical step keys. Tools may still
// override any of these via the `stepLabels` prop (e.g. heatmap's
// "Import check"); unknown keys fall back to capitalize().
const STEP_LABEL_KEYS: Record<string, ShellKey> = {
  upload: "shell.step.upload",
  configure: "shell.step.configure",
  filter: "shell.step.filter",
  plot: "shell.step.plot",
};

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

function CheckIcon() {
  return (
    <span style={{ color: "var(--step-ready)", display: "inline-flex", flex: "0 0 auto" }}>
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 12l5 5L20 7" />
      </svg>
    </span>
  );
}

export function StepNavBar({
  steps,
  currentStep,
  onStepChange,
  canNavigate,
  stepLabels = {},
}: StepNavBarProps) {
  const tr = useShellT();
  const currentIdx = steps.indexOf(currentStep);
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  // Priority: explicit per-tool override → localized default → capitalize.
  const labelFor = (s: string) =>
    stepLabels[s] || (STEP_LABEL_KEYS[s] ? tr(STEP_LABEL_KEYS[s]) : capitalize(s));
  return (
    <nav
      aria-label={tr("shell.step.navLabel")}
      className="dv-stepnav"
      style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", minWidth: 0 }}
    >
      {steps.map((s, i) => {
        const enabled = canNavigate ? canNavigate(s) : true;
        const isCurrent = i === currentIdx;
        const isPast = i < currentIdx;
        let marker: React.ReactNode;
        if (isPast) marker = <CheckIcon />;
        else if (isCurrent)
          marker = (
            <span
              aria-hidden="true"
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--accent-primary)",
                flex: "0 0 auto",
              }}
            />
          );
        else
          marker = (
            <span
              aria-hidden="true"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--text-faint)",
                flex: "0 0 auto",
              }}
            >
              {i + 1}
            </span>
          );
        return (
          <button
            key={s}
            type="button"
            className="dv-step"
            onClick={enabled && !isCurrent ? () => onStepChange(s) : undefined}
            disabled={!enabled}
            aria-current={isCurrent ? "step" : undefined}
            aria-label={tr("shell.step.aria", {
              n: i + 1,
              total: steps.length,
              label: labelFor(s),
            })}
            // Stable test handle (the visible label alone also matches tool
            // names like "… Plot" elsewhere in the page).
            data-testid={"step-" + s}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: isCurrent ? "6px 10px" : "6px 8px",
              border: "none",
              borderRadius: "var(--radius-md)",
              background: isCurrent ? "var(--accent-primary-weak)" : "transparent",
              color: isCurrent
                ? "var(--link)"
                : enabled
                  ? "var(--text-muted)"
                  : "var(--text-faint)",
              opacity: enabled || isCurrent ? 1 : 0.6,
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: isCurrent ? 600 : 400,
              whiteSpace: "nowrap",
              cursor: enabled && !isCurrent ? "pointer" : "default",
            }}
          >
            {marker}
            {labelFor(s)}
          </button>
        );
      })}
    </nav>
  );
}
