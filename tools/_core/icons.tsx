// _core/icons.tsx — `TOOL_ICONS` catalogue + the `toolIcon` React helper.
//
// Lives as `.tsx` (not `.ts`) because `toolIcon` returns a ReactElement —
// the call site uses `React.createElement` rather than JSX literals, but
// the .tsx extension makes the React surface unambiguous to esbuild and
// future contributors who reach for JSX here.

export const TOOL_ICONS: Record<string, string> = {
  aequorin:
    '<svg viewBox="0 0 44 44" fill="none" stroke="#648FFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 36 C8 36, 10 36, 12 34 C14 30, 15 8, 17 6 C19 4, 20 14, 22 22 C24 28, 25 32, 27 34 C29 36, 32 36, 40 36"/></svg>',
  boxplot:
    '<svg viewBox="0 0 44 44" fill="none" stroke="#648FFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="4" x2="22" y2="12"/><rect x="14" y="12" width="16" height="18" rx="2"/><line x1="14" y1="22" x2="30" y2="22"/><line x1="22" y1="30" x2="22" y2="40"/></svg>',
  scatter:
    '<svg viewBox="0 0 44 44" fill="#648FFF" stroke="none"><circle cx="10" cy="30" r="3"/><circle cx="16" cy="22" r="2.5"/><circle cx="24" cy="26" r="3.5"/><circle cx="20" cy="14" r="2"/><circle cx="32" cy="18" r="3"/><circle cx="36" cy="10" r="2.5"/><circle cx="28" cy="32" r="2"/></svg>',
  venn: '<svg viewBox="0 0 44 44" fill="none" stroke-width="1.5"><circle cx="16" cy="20" r="12" stroke="#648FFF" fill="rgba(100,143,255,0.12)"/><circle cx="28" cy="20" r="12" stroke="#785EF0" fill="rgba(120,94,240,0.12)"/></svg>',
  molarity:
    '<svg viewBox="0 0 44 44" fill="none" stroke="#648FFF" stroke-width="2.5" stroke-linecap="round"><line x1="8" y1="10" x2="18" y2="10"/><line x1="13" y1="5" x2="13" y2="15"/><line x1="26" y1="10" x2="36" y2="10"/><line x1="8" y1="30" x2="18" y2="30"/><circle cx="13" cy="25" r="1.5" fill="#648FFF" stroke="none"/><circle cx="13" cy="35" r="1.5" fill="#648FFF" stroke="none"/><line x1="28" y1="27" x2="34" y2="33"/><line x1="34" y1="27" x2="28" y2="33"/></svg>',
  power:
    '<svg viewBox="0 0 44 44" fill="none" stroke="#648FFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="38" x2="6" y2="6"/><line x1="6" y1="38" x2="38" y2="38"/><path d="M8 34 C12 33, 16 28, 20 20 C24 12, 28 8, 36 7" stroke="#648FFF" stroke-width="2.5"/><line x1="6" y1="14" x2="38" y2="14" stroke-dasharray="3,3" stroke-width="1" opacity="0.5"/></svg>',
  lineplot:
    '<svg viewBox="0 0 44 44" fill="none" stroke="#648FFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6,34 16,24 26,28 36,12"/><circle cx="6" cy="34" r="2.5" fill="#648FFF"/><circle cx="16" cy="24" r="2.5" fill="#648FFF"/><circle cx="26" cy="28" r="2.5" fill="#648FFF"/><circle cx="36" cy="12" r="2.5" fill="#648FFF"/></svg>',
  heatmap:
    '<svg viewBox="0 0 44 44" fill="none" stroke="none"><rect x="6" y="6" width="10" height="10" fill="#648FFF" fill-opacity="0.2"/><rect x="17" y="6" width="10" height="10" fill="#648FFF" fill-opacity="0.5"/><rect x="28" y="6" width="10" height="10" fill="#648FFF" fill-opacity="0.8"/><rect x="6" y="17" width="10" height="10" fill="#648FFF" fill-opacity="0.5"/><rect x="17" y="17" width="10" height="10" fill="#648FFF" fill-opacity="0.8"/><rect x="28" y="17" width="10" height="10" fill="#785EF0" fill-opacity="0.6"/><rect x="6" y="28" width="10" height="10" fill="#648FFF" fill-opacity="0.8"/><rect x="17" y="28" width="10" height="10" fill="#785EF0" fill-opacity="0.6"/><rect x="28" y="28" width="10" height="10" fill="#785EF0"/></svg>',
  upset:
    '<svg viewBox="0 0 44 44" fill="none" stroke="none"><rect x="10" y="4" width="4" height="10" fill="#648FFF"/><rect x="18" y="7" width="4" height="7" fill="#648FFF"/><rect x="26" y="10" width="4" height="4" fill="#648FFF"/><rect x="34" y="11" width="4" height="3" fill="#648FFF"/><line x1="12" y1="22" x2="12" y2="36" stroke="#333333" stroke-width="1.5"/><line x1="20" y1="22" x2="20" y2="36" stroke="#333333" stroke-width="1.5"/><circle cx="12" cy="22" r="2.5" fill="#333333"/><circle cx="20" cy="22" r="2.5" fill="#333333"/><circle cx="28" cy="22" r="2.5" fill="#DDDDDD"/><circle cx="36" cy="22" r="2.5" fill="#DDDDDD"/><circle cx="12" cy="29" r="2.5" fill="#333333"/><circle cx="20" cy="29" r="2.5" fill="#DDDDDD"/><circle cx="28" cy="29" r="2.5" fill="#333333"/><circle cx="36" cy="29" r="2.5" fill="#DDDDDD"/><circle cx="12" cy="36" r="2.5" fill="#DDDDDD"/><circle cx="20" cy="36" r="2.5" fill="#333333"/><circle cx="28" cy="36" r="2.5" fill="#DDDDDD"/><circle cx="36" cy="36" r="2.5" fill="#333333"/></svg>',
  volcano:
    '<svg viewBox="0 0 44 44" fill="none"><line x1="3" y1="30" x2="41" y2="30" stroke="#999999" stroke-width="0.6" stroke-dasharray="2,2" opacity="0.45"/><circle cx="22" cy="38" r="1.4" fill="#999999"/><circle cx="20" cy="36" r="1.2" fill="#999999"/><circle cx="24" cy="36" r="1.2" fill="#999999"/><circle cx="18" cy="38" r="1" fill="#999999"/><circle cx="26" cy="38" r="1" fill="#999999"/><circle cx="22" cy="34" r="1" fill="#999999"/><circle cx="17" cy="28" r="1.6" fill="#0072B2"/><circle cx="13" cy="22" r="2" fill="#0072B2"/><circle cx="9" cy="16" r="2.4" fill="#0072B2"/><circle cx="5" cy="10" r="2.6" fill="#0072B2"/><circle cx="27" cy="28" r="1.6" fill="#D55E00"/><circle cx="31" cy="22" r="2" fill="#D55E00"/><circle cx="35" cy="16" r="2.4" fill="#D55E00"/><circle cx="39" cy="10" r="2.6" fill="#D55E00"/></svg>',
};

export function toolIcon(
  name: string,
  size?: number,
  opts?: { circle?: boolean }
): React.ReactElement | null {
  const sz = size || 22;
  const o = opts || {};
  if (!TOOL_ICONS[name]) return null;
  const svg = TOOL_ICONS[name].replace("<svg ", '<svg width="' + sz + '" height="' + sz + '" ');
  const pad = Math.round(sz * 0.3);
  const outerSize = sz + pad * 2;
  if (o.circle) {
    return React.createElement(
      "span",
      {
        style: {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: outerSize,
          height: outerSize,
          borderRadius: "50%",
          background: "#fff",
          flexShrink: 0,
          verticalAlign: "middle",
          marginRight: 6,
          lineHeight: 0,
        },
      },
      React.createElement("span", {
        dangerouslySetInnerHTML: { __html: svg },
        style: { display: "inline-block", lineHeight: 0 },
      })
    );
  }
  return React.createElement("span", {
    dangerouslySetInnerHTML: { __html: svg },
    style: { display: "inline-block", verticalAlign: "middle", marginRight: 6, lineHeight: 0 },
  });
}
