/**
 * walletTradeAdapter
 *
 * Converts chain-derived `WalletPortfolioTrade` rows from token-service
 * (/v1/wallet/:addr/trades) into the legacy `TradeRow` shape that the existing
 * <Activity> component renders. Goal: feed the existing component with chain-
 * derived data without changing its props or rendering logic.
 *
 * Loss notes (fields that exist on TradeRow but cannot be derived from a single
 * WalletPortfolioTrade row):
 *   - realizedPnl, realizedPnlPercentage, costBasis: these require matching a
 *     buy with subsequent sell(s) — single-trade data is insufficient. Activity
 *     gracefully omits these when undefined.
 *   - tokenName, tokenSymbol, imageUrl: chain endpoint doesn't include token
 *     metadata; pass via the optional `metadata` param when available from the
 *     page-level cache.
 *   - tradeTime (HH:MM:SS): derived from created_at on the fly.
 *   - id: WalletPortfolioTrade has no DB id. We hash the signature into a stable
 *     numeric value so React keys stay consistent across re-renders.
 */

import type { TradeRow } from "./functions";
import type { WalletPortfolioTrade } from "./api";

/** djb2 hash → positive 32-bit int. Stable across renders for the same signature. */
function hashSignature(sig: string): number {
  let hash = 5381;
  for (let i = 0; i < sig.length; i++) {
    hash = ((hash << 5) + hash + sig.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export interface TradeMetadataHint {
  name?: string | null;
  symbol?: string | null;
  imageUrl?: string | null;
  image?: string | null;
}

export function walletPortfolioTradeToTradeRow(
  wpt: WalletPortfolioTrade,
  metadata?: TradeMetadataHint,
): TradeRow {
  // Best-effort time formatter. Falls back to the ISO timestamp if parsing fails.
  let tradeTime = wpt.created_at;
  try {
    const d = new Date(wpt.created_at);
    if (!Number.isNaN(d.getTime())) {
      tradeTime = d.toLocaleTimeString();
    }
  } catch {
    // fall through with ISO
  }

  // sol_amount × USD-per-token gives an approximation of the trade's USD value.
  // Not strictly equal to (token_amount × price_usd) when fees/slippage shift the
  // ratio, but close enough for display purposes — Activity shows this as a single
  // formatted number.
  const usdValue =
    Number.isFinite(wpt.sol_amount) && Number.isFinite(wpt.price_usd)
      ? wpt.sol_amount * wpt.price_usd
      : 0;

  return {
    id: hashSignature(wpt.signature),
    transactionHash: wpt.signature,
    type: wpt.is_buy ? "Buy" : "Sell",
    createdAt: wpt.created_at,
    tradeTime,
    marketCap: wpt.market_cap_usd,
    solAmount: wpt.sol_amount,
    tokenAmount: wpt.token_amount,
    usdValue,
    pricePerToken: wpt.price_usd,
    tokenAddress: wpt.token_mint,
    pairAddress: wpt.pool_address ?? undefined,
    originalPairAddress: wpt.pool_address ?? undefined,
    blockchain: "solana",
    launchpad: wpt.launchpad_protocol ?? null,
    tokenName: metadata?.name ?? null,
    tokenSymbol: metadata?.symbol ?? null,
    imageUrl: metadata?.imageUrl ?? metadata?.image ?? null,
    walletAddress: wpt.trader_wallet,
    // PnL fields aren't derivable from a single chain trade row — leave undefined.
    realizedPnl: undefined,
    realizedPnlPercentage: undefined,
    costBasis: undefined,
    isSplitTrade: false,
  };
}
