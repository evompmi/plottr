// `ControlTabs` — the plot controls split into a few tabs (e.g. Groups ·
// Style · Facets · Axes), one visible at a time.
//
// A real ARIA tablist: Left / Right / Home / End move between tabs, and the
// active tab is remembered per tool in localStorage so returning to a tool
// reopens the tab the user left. Inactive panels stay mounted (hidden) so
// half-typed values and open sub-panels survive a tab switch. Inside a tab,
// `ControlSection`s render as plain titled groups instead of fold-outs (see
// `ControlTabsContext`).

import { useShellT } from "./i18n";

const { useRef, useState, useId } = React;

export interface ControlTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

// True inside a tab panel; `ControlSection` reads it to drop its fold-out.
export const ControlTabsContext = React.createContext(false);

const storageKey = (tool: string): string => "plottr-tab-" + tool;

function readStoredTab(tool: string): string | null {
  try {
    return localStorage.getItem(storageKey(tool));
  } catch {
    return null;
  }
}

function writeStoredTab(tool: string, id: string): void {
  try {
    localStorage.setItem(storageKey(tool), id);
  } catch {
    // Storage blocked (private window, sandbox): the tab just isn't remembered.
  }
}

export function ControlTabs({ tool, tabs }: { tool: string; tabs: ControlTab[] }) {
  const tr = useShellT();
  const baseId = useId();
  const [stored, setStored] = useState<string | null>(() => readStoredTab(tool));
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // A remembered tab that this tool no longer offers falls back to the first.
  const activeIdx = Math.max(
    0,
    tabs.findIndex((t) => t.id === stored)
  );
  const select = (i: number, focus: boolean) => {
    const tab = tabs[i];
    if (!tab) return;
    setStored(tab.id);
    writeStoredTab(tool, tab.id);
    if (focus) tabRefs.current[i]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const last = tabs.length - 1;
    const next: Record<string, number> = {
      ArrowRight: activeIdx === last ? 0 : activeIdx + 1,
      ArrowLeft: activeIdx === 0 ? last : activeIdx - 1,
      Home: 0,
      End: last,
    };
    if (!(e.key in next)) return;
    e.preventDefault();
    select(next[e.key], true);
  };
  return (
    <div className="dv-ctrl-tabs" style={{ display: "flex", flexDirection: "column" }}>
      <div
        role="tablist"
        aria-label={tr("shell.tabs.label")}
        onKeyDown={onKeyDown}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
          borderBottom: "1px solid var(--border)",
          position: "sticky",
          top: 0,
          zIndex: 2,
          background: "var(--surface)",
        }}
      >
        {tabs.map((t, i) => {
          const selected = i === activeIdx;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              data-testid={`ctrl-tab-${t.id}`}
              className="dv-ctrl-tab"
              onClick={() => select(i, false)}
              style={{
                height: "var(--tab-h)",
                border: "none",
                borderBottom: selected
                  ? "2px solid var(--accent-primary)"
                  : "2px solid transparent",
                marginBottom: -1,
                background: "transparent",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: selected ? 600 : 400,
                color: selected ? "var(--text)" : "var(--text-faint)",
                cursor: "pointer",
                padding: "0 4px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <ControlTabsContext.Provider value={true}>
        {tabs.map((t, i) => (
          <div
            key={t.id}
            role="tabpanel"
            id={`${baseId}-panel-${t.id}`}
            aria-labelledby={`${baseId}-tab-${t.id}`}
            hidden={i !== activeIdx}
            className="dv-ctrl-panel"
          >
            {t.content}
          </div>
        ))}
      </ControlTabsContext.Provider>
    </div>
  );
}
