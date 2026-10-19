// Receiving end of the inter-tool hand-off (`handoff.ts`). A destination
// tool calls `useHandoff("proportions", apply)` once; `apply` runs with every
// payload addressed to that tool, whichever way it arrives:
//
//   1. Mount — standalone page load, or the SPA mounting the tool for the
//      first time after the source called `navigateToTool`.
//   2. `plottr-handoff` — written while the tool is already mounted (SPA
//      keep-alive routing); `setHandoff` dispatches this event.
//
// The listener registers once on mount but always calls the latest `apply`
// through a ref refreshed every render, so `apply` may read live component
// state without going stale (the class of bug behind the v1.9.1 regression).

import { consumeHandoff } from "./handoff";
import type { HandoffPayload } from "./handoff";

const { useEffect, useRef } = React;

export function useHandoff(tool: string, apply: (payload: HandoffPayload) => void): void {
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  useEffect(() => {
    const receive = (): void => {
      const payload = consumeHandoff(toolRef.current);
      if (payload) applyRef.current(payload);
    };
    receive();
    window.addEventListener("plottr-handoff", receive);
    return () => window.removeEventListener("plottr-handoff", receive);
    // Mount-only: the body reads only a module import and two stable refs.
  }, []);
}
