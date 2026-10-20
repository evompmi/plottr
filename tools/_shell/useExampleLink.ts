// `useExampleLink(tool, load)` — open a tool with its example data from a
// link: `#/<tool>?example` (the landing's "Try it on example data"). On mount
// and on later hash changes (tools stay mounted under keep-alive routing),
// a matching hash calls `load` once and is rewritten to plain `#/<tool>`, so
// a reload or a back-navigation doesn't load the example again.

const { useEffect, useRef } = React;

export function exampleLinkHash(tool: string): string {
  return `#/${tool}?example`;
}

export function useExampleLink(tool: string, load: () => void): void {
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const check = (): void => {
      if (window.location.hash !== exampleLinkHash(tool)) return;
      try {
        window.history.replaceState(null, "", `#/${tool}`);
      } catch {
        // Sandboxed history: the hash stays, the example still loads.
      }
      loadRef.current();
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [tool]);
}
