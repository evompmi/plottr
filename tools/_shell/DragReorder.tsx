// `useDragReorder` + `DragHandle` — drag-and-drop reordering for the lists
// that already reorder with ↑ / ↓ (Group Plot's value lists, the qPCR and
// Proportions order lists). Pointer events, not HTML5 drag and drop, so the
// row's inputs keep normal text selection and touch works too.
//
// Wiring: put `listRef` on the scrolling list, `data-reorder-index={i}` on
// every row (rows that move together share an index), spread
// `handleProps(i)` on a `DragHandle` in the row, and `rowStyle(i, n)` on the
// row for the dimmed source row and the drop line. The ↑ / ↓ buttons stay
// the keyboard path, so the handle is hidden from assistive technology.

import { dropSlot, slotToIndex, type RowSpan } from "./drag-reorder";
import { useShellT } from "./i18n";

const { useRef, useState } = React;

interface DragState {
  from: number;
  slot: number;
}

// Distance from the list's top / bottom edge (px) that scrolls it while dragging.
const EDGE = 28;
const SCROLL_STEP = 8;

// Same colour as focus rings: the accent in light, a lighter tint in dark (≥ 3:1).
const LINE = "var(--focus-outline)";

export interface DragHandleProps {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
}

export interface DragReorder {
  listRef: React.RefObject<HTMLUListElement>;
  handleProps: (i: number) => DragHandleProps;
  // `edges` says whether this row is the first / last row of item `i`
  // (several rows can share an index); the drop line goes on those edges.
  rowStyle: (
    i: number,
    count: number,
    edges?: { first: boolean; last: boolean }
  ) => React.CSSProperties;
}

// Every item's vertical span, in index order, from the rows tagged
// `data-reorder-index` inside `list`.
function itemSpans(list: HTMLElement): RowSpan[] {
  const spans: RowSpan[] = [];
  list.querySelectorAll<HTMLElement>("[data-reorder-index]").forEach((el) => {
    const i = Number(el.dataset.reorderIndex);
    const r = el.getBoundingClientRect();
    const s = spans[i];
    spans[i] = s
      ? { top: Math.min(s.top, r.top), bottom: Math.max(s.bottom, r.bottom) }
      : { top: r.top, bottom: r.bottom };
  });
  return spans;
}

export function useDragReorder(onMove: (from: number, to: number) => void): DragReorder {
  const listRef = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  // Handlers read the live state; React state alone would lag a move behind.
  const dragRef = useRef<DragState | null>(null);
  const update = (next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  const track = (y: number) => {
    const list = listRef.current;
    const cur = dragRef.current;
    if (!list || !cur) return;
    const box = list.getBoundingClientRect();
    if (y < box.top + EDGE) list.scrollTop -= SCROLL_STEP;
    else if (y > box.bottom - EDGE) list.scrollTop += SCROLL_STEP;
    const slot = dropSlot(y, itemSpans(list));
    if (slot !== cur.slot) update({ from: cur.from, slot });
  };

  const handleProps = (i: number): DragHandleProps => ({
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      update({ from: i, slot: i });
    },
    onPointerMove: (e) => track(e.clientY),
    onPointerUp: () => {
      const cur = dragRef.current;
      update(null);
      if (!cur) return;
      const to = slotToIndex(cur.from, cur.slot);
      if (to !== cur.from) onMove(cur.from, to);
    },
    onPointerCancel: () => update(null),
  });

  const rowStyle: DragReorder["rowStyle"] = (i, count, edges = { first: true, last: true }) => {
    if (!drag) return {};
    const style: React.CSSProperties = {};
    if (i === drag.from) style.opacity = 0.45;
    // No line where the drop would leave the item in place.
    const moves = slotToIndex(drag.from, drag.slot) !== drag.from;
    if (moves && edges.first && drag.slot === i) style.boxShadow = `inset 0 2px 0 ${LINE}`;
    if (moves && edges.last && drag.slot === count && i === count - 1)
      style.boxShadow = `inset 0 -2px 0 ${LINE}`;
    return style;
  };

  return { listRef, handleProps, rowStyle };
}

// The grip a row is dragged by (six dots). Pointer-only: the row's ↑ / ↓
// buttons are the keyboard and screen-reader path.
export function DragHandle(handlers: DragHandleProps) {
  const tr = useShellT();
  return (
    <span
      aria-hidden="true"
      className="dv-drag-handle"
      title={tr("shell.reorder.drag")}
      data-testid="drag-handle"
      {...handlers}
    >
      <svg viewBox="0 0 10 16" width="10" height="16" fill="currentColor">
        <circle cx="3" cy="3" r="1.4" />
        <circle cx="7" cy="3" r="1.4" />
        <circle cx="3" cy="8" r="1.4" />
        <circle cx="7" cy="8" r="1.4" />
        <circle cx="3" cy="13" r="1.4" />
        <circle cx="7" cy="13" r="1.4" />
      </svg>
    </span>
  );
}
