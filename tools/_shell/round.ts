// Tiny numeric rounding helpers shared between plot tools. Used to keep
// auto-axis bounds and per-x stat readouts at a stable decimal precision
// across re-renders (raw FP would surface 1.4000000000000001 in the
// padded axis bounds the user pastes back into the override field).

export const round2 = (v: number): number => Math.round(v * 100) / 100;
export const round4 = (v: number): number => Math.round(v * 10000) / 10000;
