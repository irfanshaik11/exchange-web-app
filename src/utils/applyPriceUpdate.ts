/**
 * Shared utility for applying price updates to tokens
 *
 * This ensures consistent field mapping across:
 * - PulseBackgroundLoader (updates the store)
 * - PulseTable (if needed for local state)
 *
 * All 45+ fields are mapped with proper conditional logic.
 */

export interface PriceUpdate {
  mint?: string;
  address?: string;
  price_usd?: number;
  market_cap_usd?: number;
  volume_24h?: number | string;
  bonding_pct?: number;
  graduation_percent?: number;
  bonding_curve_progress?: number;
  liquidity_usd?: number;
  price_change_24h?: number;
  trade_type?: string;
  sol_amount?: number;
  token_amount?: number;
  status?: string;
  updated_at?: string;
  // Buy/sell volumes (can be string or number from WebSocket)
  total_buy_volume_5m?: number | string;
  total_sell_volume_5m?: number | string;
  total_buys_5m?: number | string;
  total_sells_5m?: number | string;
  total_buy_volume_1h?: number | string;
  total_sell_volume_1h?: number | string;
  total_buys_1h?: number | string;
  total_sells_1h?: number | string;
  total_buy_volume_6h?: number | string;
  total_sell_volume_6h?: number | string;
  total_buys_6h?: number | string;
  total_sells_6h?: number | string;
  total_buy_volume_24h?: number | string;
  total_sell_volume_24h?: number | string;
  total_buys_24h?: number | string;
  total_sells_24h?: number | string;
  // Holder percentages
  insider_percent?: number;
  sniper_percent?: number;
  dev_percent?: number;
  top10_holders_pct?: number;
  // Bundler data
  bundle_percent?: number;
  bundle_wallet_count?: number;
  // Fees
  total_fees_lamports?: number;
  // Holder/KOL data (also comes in price_update, not just token_info_update)
  holder_count?: number;
  kol_count?: number;
  // Dev stats
  dev_tokens_created?: number;
  dev_tokens_migrated?: number;
  // Smart money
  smart_money_count?: number;
}

export interface TokenInfoUpdate {
  mint_address?: string;
  mint?: string;
  address?: string;
  holder_count?: number;
  kol_count?: number;
}

/**
 * Apply price update to a token with complete field mapping
 * Matches the exact logic from PulseTable's onPriceUpdate callback
 */
export function applyPriceUpdate<T extends { mint: string }>(token: T, update: PriceUpdate): T {
  return {
    ...token,
    // Basic price fields
    ...(update.price_usd !== undefined && { price_usd: update.price_usd }),
    ...(update.market_cap_usd !== undefined && update.market_cap_usd > 0 && { market_cap_usd: update.market_cap_usd }),
    ...(update.volume_24h !== undefined && Number(update.volume_24h) > 0 && { volume_24h: update.volume_24h }),
    ...(update.bonding_pct !== undefined && Number(update.bonding_pct) > 0 && {
      bonding_pct: update.bonding_pct,
      bonding_curve_progress: update.bonding_pct / 100
    }),
    ...(update.graduation_percent !== undefined && Number(update.graduation_percent) > 0 && { graduation_percent: update.graduation_percent }),
    ...(update.bonding_curve_progress !== undefined && Number(update.bonding_curve_progress) > 0 && { bonding_curve_progress: update.bonding_curve_progress }),
    ...(update.liquidity_usd !== undefined && Number(update.liquidity_usd) > 0 && {
      liquidity_usd: update.liquidity_usd,
      total_liquidity_usd: update.liquidity_usd
    }),
    ...(update.price_change_24h !== undefined && { price_change_24h: update.price_change_24h }),
    ...(update.trade_type !== undefined && { last_trade_type: update.trade_type }),
    ...(update.sol_amount !== undefined && { last_sol_amount: update.sol_amount }),
    ...(update.token_amount !== undefined && { last_token_amount: update.token_amount }),
    ...(update.status !== undefined && { status: update.status }),

    // Buy/sell volumes 5m - only update if > 0 to preserve valid data
    ...(update.total_buy_volume_5m !== undefined && Number(update.total_buy_volume_5m) > 0 &&
        { total_buy_volume_5m: update.total_buy_volume_5m }),
    ...(update.total_sell_volume_5m !== undefined && Number(update.total_sell_volume_5m) > 0 &&
        { total_sell_volume_5m: update.total_sell_volume_5m }),
    ...(update.total_buys_5m !== undefined && Number(update.total_buys_5m) > 0 &&
        { total_buys_5m: update.total_buys_5m }),
    ...(update.total_sells_5m !== undefined && Number(update.total_sells_5m) > 0 &&
        { total_sells_5m: update.total_sells_5m }),

    // Buy/sell volumes 1h
    ...(update.total_buy_volume_1h !== undefined && Number(update.total_buy_volume_1h) > 0 &&
        { total_buy_volume_1h: update.total_buy_volume_1h }),
    ...(update.total_sell_volume_1h !== undefined && Number(update.total_sell_volume_1h) > 0 &&
        { total_sell_volume_1h: update.total_sell_volume_1h }),
    ...(update.total_buys_1h !== undefined && Number(update.total_buys_1h) > 0 &&
        { total_buys_1h: update.total_buys_1h }),
    ...(update.total_sells_1h !== undefined && Number(update.total_sells_1h) > 0 &&
        { total_sells_1h: update.total_sells_1h }),

    // Buy/sell volumes 6h
    ...(update.total_buy_volume_6h !== undefined && Number(update.total_buy_volume_6h) > 0 &&
        { total_buy_volume_6h: update.total_buy_volume_6h }),
    ...(update.total_sell_volume_6h !== undefined && Number(update.total_sell_volume_6h) > 0 &&
        { total_sell_volume_6h: update.total_sell_volume_6h }),
    ...(update.total_buys_6h !== undefined && Number(update.total_buys_6h) > 0 &&
        { total_buys_6h: update.total_buys_6h }),
    ...(update.total_sells_6h !== undefined && Number(update.total_sells_6h) > 0 &&
        { total_sells_6h: update.total_sells_6h }),

    // Buy/sell volumes 24h
    ...(update.total_buy_volume_24h !== undefined && Number(update.total_buy_volume_24h) > 0 &&
        { total_buy_volume_24h: update.total_buy_volume_24h }),
    ...(update.total_sell_volume_24h !== undefined && Number(update.total_sell_volume_24h) > 0 &&
        { total_sell_volume_24h: update.total_sell_volume_24h }),
    ...(update.total_buys_24h !== undefined && Number(update.total_buys_24h) > 0 &&
        { total_buys_24h: update.total_buys_24h }),
    ...(update.total_sells_24h !== undefined && Number(update.total_sells_24h) > 0 &&
        { total_sells_24h: update.total_sells_24h }),

    // Holder percentages - only update with positive values (already 0-100 from backend)
    ...(update.insider_percent !== undefined && Number(update.insider_percent) > 0 &&
        { insider_percent: update.insider_percent }),
    ...(update.sniper_percent !== undefined && Number(update.sniper_percent) > 0 &&
        { sniper_percent: update.sniper_percent }),
    ...(update.dev_percent !== undefined && Number(update.dev_percent) > 0 &&
        { dev_percent: update.dev_percent }),
    ...(update.top10_holders_pct !== undefined && Number(update.top10_holders_pct) > 0 &&
        { top10_holders_pct: update.top10_holders_pct }),

    // Bundler data with aliases
    ...(update.bundle_percent !== undefined && Number(update.bundle_percent) > 0 &&
        { bundle_percent: update.bundle_percent, bundler_held_percentage: update.bundle_percent }),
    ...(update.bundle_wallet_count !== undefined && Number(update.bundle_wallet_count) > 0 &&
        { bundle_wallet_count: update.bundle_wallet_count, bundler_count: update.bundle_wallet_count }),

    // Fees
    ...(update.total_fees_lamports !== undefined && Number(update.total_fees_lamports) > 0 &&
        { total_fees_lamports: update.total_fees_lamports }),

    // Holder/KOL counts (also come in price_update messages)
    ...(update.holder_count !== undefined && Number(update.holder_count) > 0 &&
        { holder_count: update.holder_count, holders: update.holder_count }),
    ...(update.kol_count !== undefined && Number(update.kol_count) > 0 &&
        { kol_count: update.kol_count }),

    // Dev stats
    ...(update.dev_tokens_created !== undefined && Number(update.dev_tokens_created) > 0 &&
        { dev_tokens_created: update.dev_tokens_created }),
    ...(update.dev_tokens_migrated !== undefined && Number(update.dev_tokens_migrated) > 0 &&
        { dev_tokens_migrated: update.dev_tokens_migrated }),

    // Smart money
    ...(update.smart_money_count !== undefined && Number(update.smart_money_count) > 0 &&
        { smart_money_count: update.smart_money_count }),

    // Timestamp
    updated_at: update.updated_at || (token as any).updated_at,
  };
}

/**
 * Apply token info update (holder_count, kol_count)
 */
export function applyTokenInfoUpdate<T extends { mint: string }>(token: T, update: TokenInfoUpdate): T {
  const mintAddress = update.mint_address || update.mint || update.address;
  if (token.mint !== mintAddress) return token;

  return {
    ...token,
    // Only update if new value is non-zero OR existing value is 0/undefined
    ...((update.holder_count !== 0 || !(token as any).holder_count) &&
        update.holder_count !== undefined &&
        { holder_count: update.holder_count }),
    ...((update.kol_count !== 0 || !(token as any).kol_count) &&
        update.kol_count !== undefined &&
        { kol_count: update.kol_count }),
  };
}

/**
 * Apply price updates to an array of tokens
 * Returns same array reference if no changes (prevents unnecessary re-renders)
 */
export function applyPriceUpdatesToArray<T extends { mint: string }>(
  tokens: T[],
  updates: PriceUpdate[],
  filterZeroLiquidity: boolean = false
): T[] {
  if (!tokens || tokens.length === 0) return tokens;
  if (!updates || updates.length === 0) return tokens;

  const updatesMap = new Map<string, PriceUpdate>();
  for (const update of updates) {
    const mint = update.mint || update.address;
    if (mint) updatesMap.set(mint, update);
  }

  let hasChanges = false;
  const updatedTokens = tokens.map(token => {
    const update = updatesMap.get(token.mint);
    if (!update) return token;
    hasChanges = true;
    return applyPriceUpdate(token, update);
  });

  if (!hasChanges) return tokens;

  if (filterZeroLiquidity) {
    return updatedTokens.filter(token => {
      const liquidity = (token as any).liquidity_usd || (token as any).total_liquidity_usd || 0;
      return liquidity > 0;
    });
  }

  return updatedTokens;
}

/**
 * Apply token info update to an array of tokens
 */
export function applyTokenInfoUpdateToArray<T extends { mint: string }>(
  tokens: T[],
  update: TokenInfoUpdate
): T[] {
  if (!tokens || tokens.length === 0) return tokens;

  const mintAddress = update.mint_address || update.mint || update.address;
  if (!mintAddress) return tokens;

  let hasChanges = false;
  const updatedTokens = tokens.map(token => {
    if (token.mint !== mintAddress) return token;
    hasChanges = true;
    return applyTokenInfoUpdate(token, update);
  });

  return hasChanges ? updatedTokens : tokens;
}
