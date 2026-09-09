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

// Ordered so that consecutive entries are far apart in hue, and with lightness
// deliberately varied in the back half: a pie with a dozen wedges needs more
// separation than hue alone provides, and collision probing walks this order.
const PALETTE = [
  "#3b82f6", // blue 500
  "#f97316", // orange 500
  "#10b981", // emerald 500
  "#ec4899", // pink 500
  "#eab308", // yellow 500
  "#8b5cf6", // violet 500
  "#06b6d4", // cyan 500
  "#ef4444", // red 500
  "#84cc16", // lime 500
  "#d946ef", // fuchsia 500
  "#0e7490", // cyan 700 — darker
  "#fdba74", // orange 300 — lighter
  "#4ade80", // green 400 — lighter
  "#c084fc", // purple 400 — lighter
  "#94a3b8", // slate 400 — neutral
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

function hashIndex(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % PALETTE.length;
}

// Colors for a whole set of labels at once (sectors, ETFs, stock symbols).
// Each label keeps a deterministic color where possible — so it stays stable
// across drill levels — but two labels hashing to the same slot would otherwise
// draw identical wedges in one pie, so collisions probe forward to the next
// free color. Colors only repeat past PALETTE.length labels in a single chart.
export function pickColors(labels: string[]): string[] {
  const used = new Set<number>();
  return labels.map((label) => {
    let idx = hashIndex(label);
    for (let probe = 0; probe < PALETTE.length && used.has(idx); probe++) {
      idx = (idx + 1) % PALETTE.length;
    }
    used.add(idx);
    return PALETTE[idx];
  });
}
