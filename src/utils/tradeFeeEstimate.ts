/**
 * Pre-trade SOL overhead estimate for the buy surfaces.
 *
 * There is no fee data in trade responses or `trade_history`, so the trade UI
 * can only ESTIMATE what the user pays beyond the trade itself. This is the one
 * source of truth for that estimate so the trade panel and Instant Trade can't
 * drift. Estimate only ("~"): Jupiter Ultra may apply adaptive priority, so the
 * real network cost varies with congestion.
 *
 * Constants mirror the FE trade/validation paths:
 *   - platform fee 1%  → backend PLATFORM_FEE_BPS = 100
 *   - network fee      → preTradeValidation / tradeBalanceValidation (0.00001)
 *   - default priority → the trade path's `settings.priority || 0.0001`
 *   - ATA rent         → preTradeValidation FE_SOL_ATA_RENT (0.0025, the value
 *                        the balance gate actually requires)
 * `settings.bribe` IS the Jito/MEV tip in this codebase — it is the tip, so we
 * do NOT add a separate tip on top of it.
 */

/** Platform fee rate (1%). Mirrors backend PLATFORM_FEE_BPS = 100. */
export const PLATFORM_FEE_RATE = 0.01;
/** Base Solana network fee per tx (~2 signatures). Matches the FE validators. */
export const FE_SOL_NETWORK_FEE = 0.00001;
/** Priority fee (SOL) the trade path falls back to when the setting is unset. */
export const FE_SOL_DEFAULT_PRIORITY = 0.0001;
/** First-buy token-account rent (SOL). Matches preTradeValidation's gate value. */
export const FE_SOL_ATA_RENT = 0.0025;

export interface TradeOverheadInput {
  /** Spend amount already converted to SOL-equivalent (caller handles USDC→SOL). */
  solEquivSpend: number;
  /** User's priority-fee setting (SOL). */
  prioritySol: number;
  /** User's bribe / Jito-MEV-tip setting (SOL) — this IS the tip. */
  bribeSol: number;
  /**
   * Whether the token's ATA already exists. `null` = unknown (cold cache); rent
   * is only added when explicitly `false`, to avoid over-stating for holders.
   */
  ataExists: boolean | null;
}

/**
 * Estimated SOL overhead = platform fee (1% of spend) + priority + bribe (the
 * Jito/MEV tip) + base network fee + first-buy ATA rent. USDC trades pay all of
 * this in SOL too (the caller converts the spend to a SOL-equivalent first).
 */
export function estimateTradeOverheadSol(input: TradeOverheadInput): number {
  const spend = Math.max(0, Number(input.solEquivSpend) || 0);
  const platformFee = spend * PLATFORM_FEE_RATE;
  const priority = Number(input.prioritySol) || FE_SOL_DEFAULT_PRIORITY;
  const bribe = Number(input.bribeSol) || 0;
  const ataRent = input.ataExists === false ? FE_SOL_ATA_RENT : 0;
  return platformFee + priority + bribe + FE_SOL_NETWORK_FEE + ataRent;
}
