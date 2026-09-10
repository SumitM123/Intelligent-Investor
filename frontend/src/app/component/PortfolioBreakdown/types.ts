// Shared interfaces for the drill-down portfolio breakdown.

export interface SectorWeight {
  sector: string;
  weight_pct: number;
}

export interface EquityPosition {
  symbol: string;
  market_value: number;
  sector: string;
  industry: string;
}

// An equity ETF drills into its sector mix — the fund's actual diversification.
export interface EtfPosition {
  symbol: string;
  market_value: number;
  sector_weights: SectorWeight[];
}

export interface RatingWeight {
  grade: string;
  weight_pct: number;
}

// A bond fund has no meaningful sector mix (yfinance returns {} for BND), so it
// drills into credit quality instead.
export interface BondEtfPosition {
  symbol: string;
  market_value: number;
  credit_quality: RatingWeight[];
}

export interface BondNode {
  // Identifies one lot uniquely (cusip + coupon_rate + maturity_date + price +
  // purchase_date) — a CUSIP alone is no longer unique now that the same bond
  // can be held as multiple distinct lots. See BondList.tsx::lotKey.
  lot_key: string;
  cusip: string;
  grade: string;
  bond_value: number;
  coupon_rate: number | null;
  price: number | null;
  quantity: number | null;
  purchase_date: string | null;
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
  bond_etfs: BondEtfPosition[];
  bonds_by_grade: Record<string, BondNode[]>;
}

export interface AccountOption {
  id: string;
  name: string;
  number?: string | null;
  institution_name?: string | null;
  balance?: number | null;
  // Only /api/snapTrade/list_accounts returns this; the per-connection route omits it
  // because every account it returns belongs to the connection that was asked for.
  connection_id?: string | null;
}

// One live brokerage connection, as reported by GET /api/snapTrade/connections.
// Never persisted client-side: it is re-read on every mount so it survives a refresh
// and reflects a connection revoked outside the app.
export interface BrokerConnection {
  id: string;
  institution_name: string;
  created_date?: string | null;
}

// One frame of the drill stack. The top frame is the level currently on screen.
// L2BE lists the bond ETFs sitting under the bonds half, and L3BE is their leaf:
// a bond fund charts credit quality where an equity ETF (L3T) charts holdings.
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
  | { level: "L3BE"; etfSymbol: string }
  | { level: "L3B"; cusip: string; lotKey: string };

export interface Slice {
  label: string;
  value: number;
  color: string;
  onClick: () => void;
}
