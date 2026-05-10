// Narrow-viewport detection for the calculators. Plot tools are desktop-
// first and skip this hook entirely; the calculators (`molarity-app.tsx`,
// `power-app.tsx`) collapse layout below their respective breakpoints.
// Default of 600 px matches molarity; power passes 900 explicitly.

const { useState, useEffect } = React;

export function useIsMobile(breakpoint: number = 600): boolean {
  const [mobile, setMobile] = useState<boolean>(window.innerWidth < breakpoint);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return mobile;
}
