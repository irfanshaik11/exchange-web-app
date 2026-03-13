// src/utils/hyperliquidTypes.ts
// Type definitions for Hyperliquid perpetual futures integration

// ============ Market Metadata ============

export interface HyperliquidAsset {
  name: string;           // e.g., "BTC", "ETH"
  szDecimals: number;     // Size decimal precision
  maxLeverage: number;
  onlyIsolated?: boolean;
}

export interface HyperliquidMeta {
  universe: HyperliquidAsset[];
}

// ============ Asset Context (Live Data) ============

export interface HyperliquidAssetCtx {
  funding: string;        // Current funding rate
  openInterest: string;   // Open interest in base
  prevDayPx: string;      // 24h ago price (for change calc)
  dayNtlVlm: string;     // 24h notional volume
  premium: string;
  oraclePx: string;       // Oracle/index price
  markPx: string;         // Mark price
  midPx?: string;
  impactPxs?: [string, string]; // [bid impact, ask impact]
}

export interface HyperliquidMetaAndAssetCtxs {
  meta: HyperliquidMeta;
  assetCtxs: HyperliquidAssetCtx[];
}

// ============ Order Book ============

export interface HyperliquidL2Level {
  px: string;   // Price
  sz: string;   // Size
  n: number;    // Number of orders at this level
}

export interface HyperliquidL2Book {
  coin: string;
  levels: [HyperliquidL2Level[], HyperliquidL2Level[]]; // [bids, asks]
  time: number;
}

// ============ Trades ============

export interface HyperliquidTrade {
  coin: string;
  side: string;     // "A" (ask/sell) or "B" (bid/buy)
  px: string;       // Price
  sz: string;       // Size
  time: number;     // Unix ms
  hash: string;     // Transaction hash
  tid: number;      // Trade ID
}

// ============ Candles ============

export interface HyperliquidCandle {
  t: number;   // Open time (ms)
  T: number;   // Close time (ms)
  s: string;   // Symbol
  i: string;   // Interval
  o: string;   // Open
  c: string;   // Close
  h: string;   // High
  l: string;   // Low
  v: string;   // Volume
  n: number;   // Number of trades
}

// ============ User State ============

export interface HyperliquidMarginSummary {
  accountValue: string;
  totalNtlPos: string;
  totalRawUsd: string;
  totalMarginUsed: string;
}

export interface HyperliquidPositionData {
  coin: string;
  entryPx: string | null;
  leverage: { type: string; value: number };
  liquidationPx: string | null;
  marginUsed: string;
  maxLeverage: number;
  positionValue: string;
  returnOnEquity: string;
  szi: string;              // Signed size (negative = short)
  unrealizedPnl: string;
  cumFunding: {
    allTime: string;
    sinceChange: string;
    sinceOpen: string;
  };
}

export interface HyperliquidAssetPosition {
  position: HyperliquidPositionData;
  type: string;
}

export interface HyperliquidAccountState {
  marginSummary: HyperliquidMarginSummary;
  crossMarginSummary: HyperliquidMarginSummary;
  assetPositions: HyperliquidAssetPosition[];
  crossMaintenanceMarginUsed: string;
}

// ============ Open Orders ============

export interface HyperliquidOpenOrder {
  coin: string;
  side: string;       // "B" or "A"
  limitPx: string;
  sz: string;
  oid: number;
  timestamp: number;
  origSz: string;
  cloid?: string;
  reduceOnly?: boolean;
  orderType?: string;
  triggerCondition?: string;
  triggerPx?: string;
  isTrigger?: boolean;
}

// ============ User Fills ============

export interface HyperliquidFill {
  coin: string;
  px: string;
  sz: string;
  side: string;
  time: number;
  startPosition: string;
  dir: string;
  closedPnl: string;
  hash: string;
  oid: number;
  crossed: boolean;
  fee: string;
  tid: number;
  feeToken: string;
}

// ============ Frontend Enriched Types ============

export interface HyperliquidMarketRow {
  name: string;
  assetIndex: number;
  markPx: number;
  prevDayPx: number;
  change24h: number;
  change24hPct: number;
  volume24h: number;
  openInterest: number;
  funding: number;
  maxLeverage: number;
  szDecimals: number;
}

export interface HyperliquidPositionRow {
  coin: string;
  side: "LONG" | "SHORT";
  size: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number | null;
  unrealizedPnl: number;
  returnOnEquity: number;
  leverage: number;
  marginUsed: number;
  fundingSinceOpen: number;
}

// ============ WebSocket Subscription Types ============

export type HyperliquidWsChannel =
  | "l2Book"
  | "trades"
  | "candle"
  | "allMids"
  | "userEvents"
  | "userFills"
  | "userFundings"
  | "orderUpdates";

export interface HyperliquidWsSubscription {
  method: "subscribe" | "unsubscribe";
  subscription: {
    type: HyperliquidWsChannel;
    coin?: string;
    interval?: string;
    user?: string;
  };
}

export interface HyperliquidWsMessage {
  channel: HyperliquidWsChannel;
  data: any;
}

// ============ Config ============

export interface HyperliquidConfig {
  isTestnet: boolean;
  apiUrl: string;
  wsUrl: string;
}
