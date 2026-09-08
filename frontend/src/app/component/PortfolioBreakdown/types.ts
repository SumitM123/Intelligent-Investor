// Shared interfaces for the drill-down portfolio breakdown.

export interface TopHolding {
  symbol: string;
  weight_pct: number;
}

export interface EquityPosition {
  symbol: string;
  market_value: number;
  sector: string;
  industry: string;
}

export interface EtfPosition {
  symbol: string;
  market_value: number;
  top_holdings: TopHolding[];
}

export interface BondNode {
  cusip: string;
  grade: string;
  bond_value: number;
  purchase_price: number | null;
  quantity: number | null;
  ytm: number | null;
  spread_bps: number | null;
  treasury_yield: number | null;
  maturity_date: string | null;
  bond_type: string | null;
}

// The unified shape the frontend derives every level from. The stocks half comes
// from the /api/portfolio/breakdown response; the bonds half is derived client-
// side from the shared BondList state so it stays reactive to add/delete edits.
// `bond_etfs` is the exception on the bonds side: brokerage-held fixed income,
// so it comes from the backend but is totalled into bonds, never stocks.
export interface Breakdown {
  stocks_total: number;
  bonds_total: number;
  equities: EquityPosition[];
  etfs: EtfPosition[];
  bond_etfs: EtfPosition[];
  bonds_by_grade: Record<string, BondNode[]>;
}

export interface AccountOption {
  id: string;
  name: string;
  brokerage_name?: string | null;
}

// One frame of the drill stack. The top frame is the level currently on screen.
// L2BE lists the bond ETFs sitting under the bonds half; its leaf reuses L3T,
// since an ETF's top holdings render identically on either side.
export type Frame =
  | { level: "L0" }
  | { level: "L1S" }
  | { level: "L1B" }
  | { level: "L2E" }
  | { level: "L2T" }
  | { level: "L2BE" }
  | { level: "L2B"; grade: string }
  | { level: "L3E"; sector: string }
  | { level: "L3T"; etfSymbol: string }
  | { level: "L3B"; cusip: string };

export interface Slice {
  label: string;
  value: number;
  color: string;
  onClick: () => void;
}
