import type { CSSProperties } from "react";

// Real hex codes, not theme variables. A drawing must look the same to everyone, whichever
// theme each person happens to be using.
export const COLORS = [
  "#111111", "#6b7280", "#ffffff",
  "#e11d48", "#f97316", "#f59e0b",
  "#16a34a", "#0891b2", "#2563eb",
  "#7c3aed", "#db2777", "#92400e",
];

/** The dot that previews the brush size next to the slider. */
export function widthDot(w: number, c: string, on: boolean): CSSProperties {
  return {
    width: Math.max(6, Math.min(28, w)),
    height: Math.max(6, Math.min(28, w)),
    borderRadius: "50%",
    background: c === "#ffffff" ? "#ffffff" : c,
    border: c === "#ffffff" ? "1px solid #44495a" : "none",
    opacity: on ? 1 : 0.35,
    flexShrink: 0,
  };
}
