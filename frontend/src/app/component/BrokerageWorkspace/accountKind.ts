// Classifies a connected account for the Actual Retrieved feature. SnapTrade's raw_type
// is brokerage-specific free text with no fixed enum across institutions (confirmed
// empirically: this app's real Robinhood connection returns "ROTH_IRA"/"INDIVIDUAL"), so
// matching has to be flexible rather than an exact-string lookup. Missing/unrecognized
// raw_type falls back to "traditional" -- the account picker's existing sell flow -- so
// the absence of a signal never silently breaks what already works.

export type AccountKind = "traditional" | "roth_401k" | "roth_ira";

export function classifyAccountKind(rawType: string | null | undefined): AccountKind {
  if (!rawType) return "traditional";
  const normalized = rawType.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (normalized.includes("ROTH") && normalized.includes("401")) return "roth_401k";
  if (normalized.includes("ROTH") && normalized.includes("IRA")) return "roth_ira";
  return "traditional";
}
