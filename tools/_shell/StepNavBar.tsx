// `StepNavBar` — horizontal stepper with circles + labels + connector
// line. Past steps render a ✓ on a filled --step-ready circle; the
// current step renders its number on --step-active-bg chrome;
// reachable-unvisited steps render a --step-ready outline; locked
// steps render a neutral outline. Connector line between circles
// fills --step-ready up to the last completed step.

const h = React.createElement;

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
