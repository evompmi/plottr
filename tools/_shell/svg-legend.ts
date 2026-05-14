// SVG legend renderer shared across chart components. Builds `<g id="legend">`
// blocks with the right layout for three block shapes:
//   - categorical `items` (circle / line / triangle / square / cross + label)
//   - continuous `gradient` (linearGradient stops + min/max labels)
//   - sized circles `sizeItems` (scatter aesthetic — label-aware row wrapping)
// `computeLegendHeight` mirrors the layout math so callers can size the
// reserved bottom band before rendering.
//
// Stays in `React.createElement` form (no JSX) because the SVG output is
// nested deeply enough that JSX would be lower-density without saving any
// real complexity. Hand-typed as `ReactNode | null` rather than a precise
// element-tree type.
//
// Hex literals inside the SVG output are intentional (chart internals must
// stay as literal hex per the chrome / SVG split — see
// `tools/CLAUDE.md` § Theming and the no-css-var-in-svg lint rule).
//
import { svgSafeId } from "../_core/svg-export";

const h = React.createElement;

export interface LegendBlock {
  // Optional title rendered above the items / gradient / sizeItems.
  // Accepts null in addition to undefined because the runtime guard is
  // `if (block.title)` (see renderSvgLegend), and existing call sites
  // pass `title: null` for the no-header case.
  title?: string | null;
  // Optional explicit DOM id for the rendered `<g>` (otherwise derived from
  // title via svgSafeId). Useful when a tool needs a stable hook into the
  // exported SVG.
  id?: string;
  // Categorical legend items (circle / line / triangle / square / cross).
  items?: Array<{ label: string; color: string; shape?: string }>;
  // Continuous colour-bar block.
  gradient?: { stops: string[]; min: string | number; max: string | number };
  // Scatter aesthetic — variable-radius circles with labels.
  sizeItems?: Array<{ r: number; label?: string }>;
  // Tools occasionally extend with their own per-block keys.
  [k: string]: unknown;
}

export type LegendItemWidth = number | ((block: LegendBlock) => number);

export function computeLegendHeight(
  blocks: LegendBlock[] | null | undefined,
  usableW: number,
  itemWidth: LegendItemWidth
): number {
  if (!blocks || !blocks.length) return 0;
  const IH = 18,
    TH = 15;
  const iw: LegendItemWidth = itemWidth || 88;
  let t = 10;
  blocks.forEach((b, bi) => {
    if (b.title) t += TH;
    if (b.items) {
      const bIW = typeof iw === "function" ? iw(b) : iw;
      t += Math.ceil(b.items.length / Math.max(1, Math.floor(usableW / bIW))) * IH;
    }
    if (b.gradient) t += 30;
    if (b.sizeItems && b.sizeItems.length) {
      const mr = Math.max(...b.sizeItems.map((i) => i.r), 3);
      const rowH = mr * 2 + 4;
      // Compute per-item widths and wrap into rows.
      let cx = 0,
        rows = 1;
      b.sizeItems.forEach((item, ii) => {
        const labelW = (item.label || "").length * 5.6 + 6;
        const itemW = mr * 2 + 4 + labelW + 12;
        if (ii > 0 && cx + itemW > usableW) {
          rows++;
          cx = 0;
        }
        cx += itemW;
      });
      t += rows * rowH;
    }
    if (bi < blocks.length - 1) t += 8;
  });
  return t + 6;
}

export function renderSvgLegend(
  blocks: LegendBlock[] | null | undefined,
  startY: number,
  leftX: number,
  usableW: number,
  itemWidth: LegendItemWidth,
  truncateLabel?: number
): React.ReactNode {
  if (!blocks || !blocks.length) return null;
  const IH = 18,
    TH = 15;
  const iw: LegendItemWidth = itemWidth || 88;

  // Pre-compute block Y offsets in a single pass (avoids O(n²) slice+reduce).
  const blockOffsets: number[] = [0];
  for (let bi = 0; bi < blocks.length - 1; bi++) {
    const b = blocks[bi];
    let off = blockOffsets[bi];
    if (b.title) off += TH;
    if (b.items) {
      const w = typeof iw === "function" ? iw(b) : iw;
      off += Math.ceil(b.items.length / Math.max(1, Math.floor(usableW / w))) * IH;
    }
    if (b.gradient) off += 30;
    if (b.sizeItems && b.sizeItems.length) {
      const mr = Math.max(...b.sizeItems.map((i) => i.r).concat([3]));
      off += mr * 2 + 4;
    }
    off += 8;
    blockOffsets.push(off);
  }

  const blockGroups = blocks.map((block, bi) => {
    const bIW = typeof iw === "function" ? iw(block) : iw;
    const blockY = startY + blockOffsets[bi];
    const itemsPerRow = Math.max(1, Math.floor(usableW / bIW));
    const children: React.ReactNode[] = [];

    if (block.title) {
      children.push(
        h(
          "text",
          { key: "title", fontSize: "10", fill: "#666", fontFamily: "sans-serif", y: 10 },
          block.title
        )
      );
    }

    if (block.items) {
      block.items.forEach((item, ii) => {
        const row = Math.floor(ii / itemsPerRow);
        const col = ii % itemsPerRow;
        let label = item.label || "";
        if (truncateLabel && label.length > truncateLabel) {
          label = label.slice(0, truncateLabel - 2) + "…";
        }
        let shape: React.ReactNode;
        if (item.shape === "line") {
          shape = h("line", {
            key: "s",
            x1: 0,
            x2: 14,
            y1: 7,
            y2: 7,
            stroke: item.color,
            strokeWidth: "2.5",
          });
        } else if (item.shape === "triangle") {
          shape = h("polygon", { key: "s", points: "6,1 1,12 11,12", fill: item.color });
        } else if (item.shape === "square") {
          shape = h("rect", { key: "s", x: 1, y: 2, width: 10, height: 10, fill: item.color });
        } else if (item.shape === "cross") {
          shape = h("path", {
            key: "s",
            d: "M4,0 H8 V4 H12 V8 H8 V12 H4 V8 H0 V4 H4 Z",
            fill: item.color,
          });
        } else {
          shape = h("circle", { key: "s", cx: 6, cy: 7, r: 5, fill: item.color });
        }
        const text = h(
          "text",
          {
            key: "t",
            x: item.shape === "line" ? 18 : 14,
            y: 11,
            fontSize: "10",
            fill: "#444",
            fontFamily: "sans-serif",
          },
          label
        );
        children.push(
          h(
            "g",
            {
              key: "i" + ii,
              transform:
                "translate(" + col * bIW + ", " + ((block.title ? TH : 0) + row * IH) + ")",
            },
            shape,
            text
          )
        );
      });
    }

    if (block.gradient) {
      const gw = Math.min(usableW * 0.6, 200),
        gh = 12;
      const th = block.title ? TH : 0;
      const gradId = "svggrad-" + bi;
      const stops = block.gradient.stops.map((c, si) =>
        h("stop", {
          key: si,
          offset: (si / (block.gradient!.stops.length - 1)) * 100 + "%",
          stopColor: c,
        })
      );
      children.push(
        h(
          "g",
          { key: "grad", transform: "translate(0, " + th + ")" },
          h(
            "defs",
            null,
            h("linearGradient", { id: gradId, x1: "0%", y1: "0%", x2: "100%", y2: "0%" }, stops)
          ),
          h("rect", { x: 0, y: 0, width: gw, height: gh, fill: "url(#" + gradId + ")", rx: "2" }),
          h(
            "text",
            {
              x: 0,
              y: gh + 13,
              fontSize: "9",
              fill: "#555",
              fontFamily: "sans-serif",
              textAnchor: "start",
            },
            block.gradient.min
          ),
          h(
            "text",
            {
              x: gw,
              y: gh + 13,
              fontSize: "9",
              fill: "#555",
              fontFamily: "sans-serif",
              textAnchor: "end",
            },
            block.gradient.max
          )
        )
      );
    }

    // Size items (scatter) — label-aware spacing with row wrapping.
    if (block.sizeItems && block.sizeItems.length) {
      const sth = block.title ? TH : 0;
      const maxR = Math.max(...block.sizeItems.map((i) => i.r), 3);
      const rowH = maxR * 2 + 4;
      let cx = 0,
        row = 0;
      const sizeChildren = block.sizeItems.map((item, ii) => {
        const labelW = (item.label || "").length * 5.6 + 6;
        const itemW = maxR * 2 + 4 + labelW + 12;
        if (ii > 0 && cx + itemW > usableW) {
          row++;
          cx = 0;
        }
        const tx = cx;
        cx += itemW;
        return h(
          "g",
          { key: ii, transform: "translate(" + tx + ", " + row * rowH + ")" },
          h("circle", {
            cx: maxR,
            cy: 0,
            r: item.r,
            fill: "#888",
            fillOpacity: "0.35",
            stroke: "#888",
            strokeWidth: "0.8",
          }),
          h(
            "text",
            { x: maxR * 2 + 4, y: 4, fontSize: "9", fill: "#444", fontFamily: "sans-serif" },
            item.label
          )
        );
      });
      children.push(
        h("g", { key: "size", transform: "translate(0, " + (sth + maxR) + ")" }, sizeChildren)
      );
    }

    const blockId =
      block.id ||
      (block.title && typeof svgSafeId === "function"
        ? "legend-" + svgSafeId(block.title)
        : "legend-block-" + bi);
    return h(
      "g",
      {
        key: bi,
        id: blockId,
        transform: "translate(" + leftX + ", " + blockY + ")",
      },
      children
    );
  });
  return h("g", { id: "legend" }, blockGroups);
}
