// Shared bond-grade → color tokens. Hoisted out of BondList so the
// PortfolioBreakdown chart and the BondList table stay visually in sync.
// Returns CSS custom-property references (for DOM styling); for canvas/chart
// fills use the concrete colors in PortfolioBreakdown/colors.ts instead.
export function gradeTone(grade?: string): { bg: string; text: string; label: string } {
  if (!grade) return { bg: "var(--surface-muted)", text: "var(--muted)", label: "—" };
  const g = grade.toUpperCase();
  if (g.startsWith("AAA") || g.startsWith("AA")) return { bg: "var(--pass-soft)", text: "var(--pass)", label: g };
  if (g.startsWith("A")) return { bg: "var(--accent-soft)", text: "var(--accent-strong)", label: g };
  if (g.startsWith("BBB")) return { bg: "var(--warn-soft)", text: "var(--warn)", label: g };
  return { bg: "var(--fail-soft)", text: "var(--fail)", label: g };
}
