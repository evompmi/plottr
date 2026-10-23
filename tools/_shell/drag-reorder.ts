// Pure geometry behind `useDragReorder` (DragReorder.tsx): where a dragged
// row lands for a given pointer position. Kept apart from the hook so it can
// be tested without a DOM.

// Vertical extent of one reorderable item (one row, or several rows that
// move together — e.g. raw values merged under one label).
export interface RowSpan {
  top: number;
  bottom: number;
}

// Insertion slot for pointer `y`: 0 = before the first item, n = after the
// last. The pointer passes an item once it crosses that item's midpoint.
export function dropSlot(y: number, spans: RowSpan[]): number {
  for (let i = 0; i < spans.length; i++) {
    if (y < (spans[i].top + spans[i].bottom) / 2) return i;
  }
  return spans.length;
}

// The dragged item's new index when dropped in `slot`. Slots `from` and
// `from + 1` sit on either side of the item itself, so both leave it where
// it is (the result equals `from`).
export function slotToIndex(from: number, slot: number): number {
  return slot > from ? slot - 1 : slot;
}
