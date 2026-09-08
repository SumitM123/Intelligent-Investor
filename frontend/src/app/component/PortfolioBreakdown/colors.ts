// Concrete colors for the Chart.js pie. CSS custom properties (var(--x)) can't
// be used as canvas fill styles, so the chart needs real hex values here.
// The DOM legend swatches reuse these same hex values for consistency.

// Re-export the BondList grade tokens so callers have one import surface.
export { gradeTone } from "@/app/component/BondList/gradeTone";

export const STOCKS_COLOR = "#3b82f6"; // blue-500
export const BONDS_COLOR = "#10b981"; // emerald-500
export const ETF_COLOR = "#6366f1"; // indigo-500
// Teal reads as a bond-side green while staying distinct from the grade colors
// it shares the L1B ring with (AAA/AA emerald, A blue).
export const BOND_ETF_COLOR = "#14b8a6"; // teal-500

const PALETTE = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
  "#06b6d4", "#a855f7", "#eab308", "#22c55e", "#f43f5e",
];

// Concrete grade colors aligned with gradeTone's intent (AAA/AA green, A blue,
// BBB amber, Matured/Unclassified/Other gray, High Yield / Junk red).
export function gradeColor(grade?: string): string {
  const g = (grade ?? "").toUpperCase();
  if (g.startsWith("AAA") || g.startsWith("AA")) return "#10b981";
  // "OTHER" is a bond fund's unrated residual — gray, not the junk red it
  // would otherwise fall through to.
  if (g.startsWith("MATURED") || g.startsWith("UNCLASS") || g.startsWith("OTHER")) return "#9ca3af";
  if (g.startsWith("A")) return "#3b82f6";
  if (g.startsWith("BBB")) return "#f59e0b";
  return "#ef4444";
}

// Deterministic color for an arbitrary label (sector, ETF, stock symbol) so the
// same label always maps to the same wedge color across drill levels.
export function pickColor(label: string, index = 0): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash + index) % PALETTE.length;
  return PALETTE[idx];
}
