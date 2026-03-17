/**
 * Maps raw trade error codes/messages to user-friendly toast text.
 * Used by all buy/sell handlers across PulseTable, Discover, TradeActionPanel, etc.
 */
export function mapTradeErrorMessage(error: any): string {
  const errorCode = error?.code || error?.response?.data?.code || '';
  const rawMessage = error?.message || error?.error || error?.response?.data?.error || '';
  const raw = rawMessage.toLowerCase();

  // Insufficient funds
  if (
    errorCode === 'INSUFFICIENT_BALANCE' ||
    errorCode === 'INSUFFICIENT_SOL_FOR_FEES' ||
    raw.includes('insufficient balance') ||
    raw.includes('insufficient sol') ||
    raw.includes('insufficient funds') ||
    raw.includes('insufficient lamports') ||
    raw.includes('account rent') ||
    raw.includes('sufficient balance') ||
    raw.includes('not enough sol') ||
    raw.includes('top up') ||
    (raw.includes('custom') && raw.includes('6000'))
  )
    return 'Insufficient SOL balance for this trade.';

  // Slippage / low liquidity
  if (raw.includes('slippage'))
    return 'Low liquidity — try higher slippage or a smaller amount.';

  // No liquidity / no route
  if (errorCode === 'NO_LIQUIDITY' || errorCode === 'NO_ROUTE' ||
    raw.includes('no liquidity') || raw.includes('no quotes') ||
    raw.includes('no route') || raw.includes('failed to get quotes'))
    return 'Check your SOL balance or token may have low liquidity.';

  // Pool unavailable
  if (errorCode === 'POOL_UNAVAILABLE' || raw.includes('pool unavailable') || raw.includes('pool not found'))
    return 'Trading pool unavailable. Try refreshing the page.';

  // Pool graduated
  if (errorCode === 'POOL_GRADUATED' || errorCode === 'BONDING_CURVE_COMPLETE' || raw.includes('graduated') || raw.includes('bonding curve complete') || raw.includes('virtual pool is completed'))
    return 'Pool graduated — liquidity migrated. Refresh and try again.';

  // Amount too small
  if (errorCode === 'AMOUNT_TOO_SMALL' || raw.includes('amount too small') || raw.includes('minimum trade'))
    return 'Trade amount too small. Try a larger amount.';

  // No holdings (sell-specific)
  if (errorCode === 'NO_HOLDINGS' || raw.includes('insufficient token'))
    return 'Token already sold or transferred.';

  // Transaction/order expired (Jupiter Ultra execute failures + blockhash expiry)
  if (raw.includes('order expired') || raw.includes('transaction expired') || raw.includes('blockhash expired'))
    return 'Trade expired. Please try again.';

  // Timeout
  if (errorCode === 'CLIENT_TIMEOUT' || raw.includes('timed out') || raw.includes('timeout'))
    return 'Trade timed out. Please try again.';

  // TX failed (generic on-chain failure)
  if (errorCode === 'TX_FAILED')
    return 'Transaction failed. Try adjusting slippage.';

  // Unknown/unsupported pool type
  if (errorCode === 'INVALID_POOL_TYPE')
    return 'No trading route found for this token. Try refreshing.';

  // Server error (uncaught backend exception)
  if (raw.includes('internal server error') || raw.includes('status code 500'))
    return 'Trade failed. Please try again.';

  // Fallback: use raw message or generic
  return rawMessage || 'Trade failed. Please try again.';
}
