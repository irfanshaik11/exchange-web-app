// Pure filter-application functions for the Discover page (Trending + New Pairs).
// No React, no side effects — just data filtering.

import { type PulseFilters, defaultPulseFilters } from '~/contexts/PulseFiltersContext';

/**
 * Maps a UI protocol name to one or more backend `launchpad_protocol` values.
 * This is a standalone copy of the mapping in PulseTable — kept separate so
 * Discover filters are completely independent of PulseTable.
 */
export function mapProtocolToBackend(protocol: string): string[] {
  switch (protocol) {
    case 'Pump':
      return ['pump.fun', 'pump', 'pumpfun'];
    case 'Pump AMM':
      return ['pump_amm', 'pumpamm', 'pumpswap', 'pump_swap'];
    case 'Raydium':
      return ['raydium', 'raydiumlaunchpad'];
    case 'Meteora AMM':
      return ['meteora'];
    case 'Meteora AMM V2':
      return ['meteora'];
    case 'Bonk':
      return ['bonk', 'bonk.fun', 'bonkfun', 'launchlab', 'raydiumlaunchpad'];
    case 'Bags':
      return ['bags'];
    case 'Moonit':
      return ['moonit', 'moonshot', 'moonshoot'];
    case 'Boop':
      return ['boop', 'boopfun'];
    case 'LaunchLab':
      return ['launchlab', 'bonk', 'bonk.fun', 'bonkfun', 'raydiumlaunchpad'];
    case 'All':
      return ['all'];
    default:
      return [protocol.toLowerCase()];
  }
}

/**
 * Checks whether a token's `launchpad_protocol` matches ANY of the selected
 * protocol names. Returns true if the token should be included.
 */
export function tokenMatchesProtocolFilter(token: any, protocols: string[]): boolean {
  if (protocols.length === 0 || protocols.includes('All')) return true;

  // Match PulseTable exactly: only check launchpad_protocol (not protocol/amm fallbacks)
  const protocol = ((token as any).launchpad_protocol || '').toLowerCase();
  const mint = (token.mint || '').toLowerCase();

  // Priority 1: Bags mint override (same as PulseTable)
  if (mint.includes('bags')) {
    return protocols.some(f => f === 'Bags');
  }

  // Priority 2: Empty protocol → default "Pump" (same as PulseTable)
  if (!protocol) {
    return protocols.some(f => f === 'Pump');
  }

  // Determine category — SAME order as PulseTable to avoid substring conflicts
  let category = 'Pump';

  if (protocol.includes('pump')) {
    category = (protocol.includes('pump_amm') || protocol.includes('pumpamm') || protocol.includes('pumpswap'))
      ? 'Pump AMM' : 'Pump';
  } else if (protocol.includes('meteora')) {
    category = 'Meteora AMM';
  } else if (protocol.includes('boop')) {
    category = 'Boop';
  } else if (protocol.includes('moonit') || protocol.includes('moonshot') || protocol.includes('moonshoot')) {
    category = 'Moonit';
  } else if (protocol.includes('bonk') || protocol.includes('launchlab') || protocol.includes('launchpad') || mint.endsWith('bonk')) {
    // CRITICAL: 'raydiumlaunchpad' is LaunchLab/Bonk ecosystem on Raydium infra
    // Must check 'launchpad' (not just 'launchlab') — the actual protocol string is 'raydiumlaunchpad'
    category = 'Bonk';
  } else if (protocol.includes('raydium')) {
    // Only matches pure 'raydium' tokens now — 'raydiumlaunchpad' caught above
    category = 'Raydium';
  } else if (protocol.includes('bags')) {
    category = 'Bags';
  }

  return protocols.some((selectedFilter) => {
    if (selectedFilter === category) return true;
    // "Pump" includes "Pump AMM" tokens (full Pump ecosystem)
    if (selectedFilter === 'Pump' && category === 'Pump AMM') return true;
    // Meteora AMM V2 should also match Meteora AMM tokens
    if (selectedFilter === 'Meteora AMM V2' && category === 'Meteora AMM') return true;
    // LaunchLab and Bonk are the same ecosystem
    if (selectedFilter === 'LaunchLab' && category === 'Bonk') return true;
    if (selectedFilter === 'Bonk' && category === 'LaunchLab') return true;
    return false;
  });
}

/**
 * Helper: parse a numeric filter string, returning undefined for empty/NaN.
 * Accepts human shorthand — `k`/`m`/`b` suffixes (×1e3 / 1e6 / 1e9) and a
 * leading `$` or thousands commas — so a pasted/typed `5k`, `$1.2m`, `2,000`
 * reads the way it appears in the table. Plain numbers fall through unchanged
 * via the parseFloat fallback, so no existing filter value changes meaning.
 */
function parseNum(val: string | undefined): number | undefined {
  if (val === undefined || val === null) return undefined;
  const s = String(val).trim().replace(/[$,\s]/g, '');
  if (s === '') return undefined;
  const match = /^(-?\d*\.?\d+)([kmb])?$/i.exec(s);
  if (!match) {
    const fallback = parseFloat(s);
    return isNaN(fallback) ? undefined : fallback;
  }
  const base = parseFloat(match[1]!);
  if (isNaN(base)) return undefined;
  const suffix = (match[2] || '').toLowerCase();
  const multiplier = suffix === 'k' ? 1e3 : suffix === 'm' ? 1e6 : suffix === 'b' ? 1e9 : 1;
  return base * multiplier;
}

/** Convert an age value + unit to minutes for comparison. */
function ageToMinutes(value: number, unit: string): number {
  switch (unit) {
    case 'h': return value * 60;
    case 'd': return value * 60 * 24;
    default:  return value; // 'm'
  }
}

interface FilterCallbacks {
  getVolume?: (t: any) => number;
  getTxns?: (t: any) => number;
  getBuys?: (t: any) => number;
  getSells?: (t: any) => number;
}

/**
 * Main filter function: applies ALL active PulseFilters fields client-side.
 * Callbacks are used for timeframe-dependent values (volume, txns, buys, sells)
 * so the caller can pass the correct timeframe-aware extractors.
 */
export function applyDiscoverFilters(
  tokens: any[],
  filters: PulseFilters,
  options?: FilterCallbacks,
): any[] {
  // Fast path: if no filters are active, skip entirely
  if (!hasActiveFilters(filters)) return tokens;

  return tokens.filter((token) => {
    // ── Protocol ──
    if (!tokenMatchesProtocolFilter(token, filters.protocols)) return false;

    // ── Quote Token ──
    if (filters.quoteTokens.length > 0) {
      const quoteToken = (token.quote_token_symbol || token.quoteSymbol || '').toUpperCase();
      if (!filters.quoteTokens.includes(quoteToken)) return false;
    }

    // ── Search Keywords ──
    if (filters.searchKeywords.trim()) {
      const keywords = filters.searchKeywords
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
      if (keywords.length > 0) {
        const text = `${token.name || ''} ${token.symbol || ''}`.toLowerCase();
        if (!keywords.some((kw) => text.includes(kw))) return false;
      }
    }

    // ── Exclude Keywords ──
    if (filters.excludeKeywords.trim()) {
      const keywords = filters.excludeKeywords
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
      if (keywords.length > 0) {
        const text = `${token.name || ''} ${token.symbol || ''}`.toLowerCase();
        if (keywords.some((kw) => text.includes(kw))) return false;
      }
    }

    // ── Market Cap ──
    const minMc = parseNum(filters.minMarketCap);
    const maxMc = parseNum(filters.maxMarketCap);
    if (minMc !== undefined || maxMc !== undefined) {
      const mc = Number(token.fully_diluted_value || token.market_cap_usd) || 0;
      if (minMc !== undefined && mc < minMc) return false;
      if (maxMc !== undefined && mc > maxMc) return false;
    }

    // ── Volume ──
    const minVol = parseNum(filters.minVolume);
    const maxVol = parseNum(filters.maxVolume);
    if (minVol !== undefined || maxVol !== undefined) {
      const vol = options?.getVolume ? options.getVolume(token) : 0;
      if (minVol !== undefined && vol < minVol) return false;
      if (maxVol !== undefined && vol > maxVol) return false;
    }

    // ── Liquidity ──
    const minLiq = parseNum(filters.minLiquidity);
    const maxLiq = parseNum(filters.maxLiquidity);
    if (minLiq !== undefined || maxLiq !== undefined) {
      const liq = Number(token.total_liquidity_usd || token.liquidity_usd) || 0;
      if (minLiq !== undefined && liq < minLiq) return false;
      if (maxLiq !== undefined && liq > maxLiq) return false;
    }

    // ── Holders ──
    const minH = parseNum(filters.holdersMin);
    const maxH = parseNum(filters.holdersMax);
    if (minH !== undefined || maxH !== undefined) {
      const holders = Number(token.holder_count || token.holders) || 0;
      if (minH !== undefined && holders < minH) return false;
      if (maxH !== undefined && holders > maxH) return false;
    }

    // ── Age ──
    const minAge = parseNum(filters.minAge);
    const maxAge = parseNum(filters.maxAge);
    if (minAge !== undefined || maxAge !== undefined) {
      const createdAt = token.created_at || token.createdAt || token.pair_created_at;
      if (createdAt) {
        const ageMs = Date.now() - new Date(createdAt).getTime();
        const ageMins = ageMs / 60000;
        if (minAge !== undefined && ageMins < ageToMinutes(minAge, filters.ageUnit)) return false;
        if (maxAge !== undefined && ageMins > ageToMinutes(maxAge, filters.ageUnit)) return false;
      }
    }

    // ── Dev Migrations ──
    const minDM = parseNum(filters.devMigrationsMin);
    const maxDM = parseNum(filters.devMigrationsMax);
    if (minDM !== undefined || maxDM !== undefined) {
      const dm = Number(token.dev_migrations ?? token.dev_tokens_migrated) || 0;
      if (minDM !== undefined && dm < minDM) return false;
      if (maxDM !== undefined && dm > maxDM) return false;
    }

    // ── Dev Pairs Created ──
    const minDP = parseNum(filters.devPairsCreatedMin);
    const maxDP = parseNum(filters.devPairsCreatedMax);
    if (minDP !== undefined || maxDP !== undefined) {
      const dp = Number(token.dev_pairs_created ?? token.dev_tokens_created) || 0;
      if (minDP !== undefined && dp < minDP) return false;
      if (maxDP !== undefined && dp > maxDP) return false;
    }

    // ── KOL Count ──
    const minKol = parseNum(filters.kolCountMin);
    const maxKol = parseNum(filters.kolCountMax);
    if (minKol !== undefined || maxKol !== undefined) {
      const kol = Number(token.kol_count) || 0;
      if (minKol !== undefined && kol < minKol) return false;
      if (maxKol !== undefined && kol > maxKol) return false;
    }

    // ── B-Curve % ──
    const minBC = parseNum(filters.bCurvePercentMin);
    const maxBC = parseNum(filters.bCurvePercentMax);
    if (minBC !== undefined || maxBC !== undefined) {
      const bc = Number(token.bonding_pct || token.bCurvePercent) || 0;
      if (minBC !== undefined && bc < minBC) return false;
      if (maxBC !== undefined && bc > maxBC) return false;
    }

    // ── Txns ──
    const minTxn = parseNum(filters.txnsMin);
    const maxTxn = parseNum(filters.txnsMax);
    if (minTxn !== undefined || maxTxn !== undefined) {
      const txns = options?.getTxns ? options.getTxns(token) : 0;
      if (minTxn !== undefined && txns < minTxn) return false;
      if (maxTxn !== undefined && txns > maxTxn) return false;
    }

    // ── Buys ──
    const minBuys = parseNum(filters.numBuysMin);
    const maxBuys = parseNum(filters.numBuysMax);
    if (minBuys !== undefined || maxBuys !== undefined) {
      const buys = options?.getBuys ? options.getBuys(token) : 0;
      if (minBuys !== undefined && buys < minBuys) return false;
      if (maxBuys !== undefined && buys > maxBuys) return false;
    }

    // ── Sells ──
    const minSells = parseNum(filters.numSellsMin);
    const maxSells = parseNum(filters.numSellsMax);
    if (minSells !== undefined || maxSells !== undefined) {
      const sells = options?.getSells ? options.getSells(token) : 0;
      if (minSells !== undefined && sells < minSells) return false;
      if (maxSells !== undefined && sells > maxSells) return false;
    }

    // ── Top 10 Holders % (min/max) ──
    const minTop10 = parseNum(filters.top10HoldersPercentMin);
    const maxTop10 = parseNum(filters.top10HoldersPercentMax) ?? (filters.top10HoldersPercent ? parseNum(filters.top10HoldersPercent) : undefined);
    if (minTop10 !== undefined || maxTop10 !== undefined) {
      // Trending WS feed emits `top10_holders_percent` (NormalizedTrendingToken);
      // the older `_pct`/camelCase names are New Pairs fallbacks. Reading only the
      // old names made this gate a no-op on the trending board (always 0).
      const pct = Number(token.top10_holders_percent ?? token.top10_holders_pct ?? token.top10HoldersPct ?? 0) || 0;
      if (minTop10 !== undefined && pct < minTop10) return false;
      if (maxTop10 !== undefined && pct > maxTop10) return false;
    }

    // ── Dev Holding % ──
    const minDev = parseNum(filters.devHoldingPercentMin);
    const maxDev = parseNum(filters.devHoldingPercentMax);
    if (minDev !== undefined || maxDev !== undefined) {
      const pct = Number(token.dev_percent ?? token.dev_held_percentage ?? 0) || 0;
      if (minDev !== undefined && pct < minDev) return false;
      if (maxDev !== undefined && pct > maxDev) return false;
    }

    // ── Snipers % ──
    const minSniper = parseNum(filters.snipersPercentMin);
    const maxSniper = parseNum(filters.snipersPercentMax);
    if (minSniper !== undefined || maxSniper !== undefined) {
      const pct = Number(token.sniper_percent ?? token.sniper_held_percentage ?? 0) || 0;
      if (minSniper !== undefined && pct < minSniper) return false;
      if (maxSniper !== undefined && pct > maxSniper) return false;
    }

    // ── Insiders % ──
    const minInsider = parseNum(filters.insidersPercentMin);
    const maxInsider = parseNum(filters.insidersPercentMax);
    if (minInsider !== undefined || maxInsider !== undefined) {
      const pct = Number(token.insider_percent ?? token.insider_held_percentage ?? 0) || 0;
      if (minInsider !== undefined && pct < minInsider) return false;
      if (maxInsider !== undefined && pct > maxInsider) return false;
    }

    // ── Bundlers % ──
    const minBundle = parseNum(filters.bundlePercentMin);
    const maxBundle = parseNum(filters.bundlePercentMax);
    if (minBundle !== undefined || maxBundle !== undefined) {
      const pct = Number(token.bundle_percent ?? token.bundled_percentage ?? token.bundler_held_percentage ?? 0) || 0;
      if (minBundle !== undefined && pct < minBundle) return false;
      if (maxBundle !== undefined && pct > maxBundle) return false;
    }

    // ── Pro Traders ──
    const minPro = parseNum(filters.proTradersMin);
    const maxPro = parseNum(filters.proTradersMax);
    if (minPro !== undefined || maxPro !== undefined) {
      const pro = Number(token.pro_traders_count ?? token.pro_traders ?? token.smart_money_count ?? 0) || 0;
      if (minPro !== undefined && pro < minPro) return false;
      if (maxPro !== undefined && pro > maxPro) return false;
    }

    // ── Socials ──
    if (filters.hasTwitter || filters.hasWebsite || filters.hasTelegram || filters.atLeastOneSocial) {
      const links = token.links || {};
      const twitter = token.twitter || links.twitter || links.x || token.twitter_url || token.x || token.x_url || '';
      const website = token.website || links.website || token.website_url || '';
      const telegram = token.telegram || links.telegram || token.telegram_url || '';
      if (filters.hasTwitter && !twitter) return false;
      if (filters.hasWebsite && !website) return false;
      if (filters.hasTelegram && !telegram) return false;
      if (filters.atLeastOneSocial && !twitter && !website && !telegram) return false;
    }

    // ── Only Pump Live ──
    if (filters.onlyPumpLive) {
      const protocol = (token.launchpad_protocol || '').toLowerCase();
      const isLive = token.is_live ?? token.isLive ?? true;
      if (!(protocol.includes('pump') && isLive)) return false;
    }

    // ── Only Mayhem Mode ──
    // Filters down to tokens currently inside the 24h Mayhem hot window.
    // Backend sets `is_mayhem_mode: true` for the duration of the window.
    if (filters.onlyMayhemMode && !token.is_mayhem_mode) return false;

    // ── Global Fees Paid ──
    const minFees = parseNum(filters.globalFeesPaidMin);
    const maxFees = parseNum(filters.globalFeesPaidMax);
    if (minFees !== undefined || maxFees !== undefined) {
      let feesPaid = Number(token.global_fees_paid ?? token.globalFeesPaid ?? 0) || 0;
      if (feesPaid === 0) {
        const lamports = Number(token.total_fees_lamports ?? 0);
        if (lamports > 0) feesPaid = lamports / 1_000_000_000;
      }
      if (minFees !== undefined && feesPaid < minFees) return false;
      if (maxFees !== undefined && feesPaid > maxFees) return false;
    }

    // ── X Reuses ──
    const minReuses = parseNum(filters.twitterReusesMin);
    const maxReuses = parseNum(filters.twitterReusesMax);
    if (minReuses !== undefined || maxReuses !== undefined) {
      const reuses = Number(token.twitter_reuses ?? token.twitterReuses ?? token.twitter_reuse_count ?? 0) || 0;
      if (minReuses !== undefined && reuses < minReuses) return false;
      if (maxReuses !== undefined && reuses > maxReuses) return false;
    }

    // ── Tweet Age ──
    // Skip for now - tweet age calculation requires ageUnit conversion and tweet_created_at field
    // which is complex and rarely used

    return true;
  });
}

/** Counts the number of non-default filter categories for the badge display. */
export function countActiveFilters(filters: PulseFilters): number {
  let count = 0;
  if (filters.protocols.length > 0 && !filters.protocols.includes('All')) count++;
  if (filters.quoteTokens.length > 0) count++;
  if (filters.searchKeywords.trim()) count++;
  if (filters.excludeKeywords.trim()) count++;
  if (filters.minMarketCap || filters.maxMarketCap) count++;
  if (filters.minVolume || filters.maxVolume) count++;
  if (filters.minLiquidity || filters.maxLiquidity) count++;
  if (filters.holdersMin || filters.holdersMax) count++;
  if (filters.minAge || filters.maxAge) count++;
  if (filters.devMigrationsMin || filters.devMigrationsMax) count++;
  if (filters.devPairsCreatedMin || filters.devPairsCreatedMax) count++;
  if (filters.kolCountMin || filters.kolCountMax) count++;
  if (filters.bCurvePercentMin || filters.bCurvePercentMax) count++;
  if (filters.txnsMin || filters.txnsMax) count++;
  if (filters.numBuysMin || filters.numBuysMax) count++;
  if (filters.numSellsMin || filters.numSellsMax) count++;
  if (filters.top10HoldersPercent || filters.top10HoldersPercentMin || filters.top10HoldersPercentMax) count++;
  if (filters.devHoldingPercentMin || filters.devHoldingPercentMax) count++;
  if (filters.snipersPercentMin || filters.snipersPercentMax) count++;
  if (filters.insidersPercentMin || filters.insidersPercentMax) count++;
  if (filters.bundlePercentMin || filters.bundlePercentMax) count++;
  if (filters.proTradersMin || filters.proTradersMax) count++;
  if (filters.globalFeesPaidMin || filters.globalFeesPaidMax) count++;
  if (filters.twitterReusesMin || filters.twitterReusesMax) count++;
  if (filters.hasTwitter || filters.hasWebsite || filters.hasTelegram || filters.atLeastOneSocial) count++;
  if (filters.onlyPumpLive) count++;
  if (filters.onlyMayhemMode) count++;
  return count;
}

// Fields the badge UX cares about for "user has changed something". Boolean
// + string entries that defaultPulseFilters initialises to "" / false / [].
// Keep in sync with the body of hasActiveFilters / countActiveFilters.
const TRACKED_FILTER_FIELDS: ReadonlyArray<keyof PulseFilters> = [
  'searchKeywords', 'excludeKeywords',
  'minMarketCap', 'maxMarketCap',
  'minVolume', 'maxVolume',
  'minLiquidity', 'maxLiquidity',
  'holdersMin', 'holdersMax',
  'minAge', 'maxAge',
  'devMigrationsMin', 'devMigrationsMax',
  'devPairsCreatedMin', 'devPairsCreatedMax',
  'kolCountMin', 'kolCountMax',
  'bCurvePercentMin', 'bCurvePercentMax',
  'txnsMin', 'txnsMax',
  'numBuysMin', 'numBuysMax',
  'numSellsMin', 'numSellsMax',
  'top10HoldersPercent', 'top10HoldersPercentMin', 'top10HoldersPercentMax',
  'devHoldingPercentMin', 'devHoldingPercentMax',
  'snipersPercentMin', 'snipersPercentMax',
  'insidersPercentMin', 'insidersPercentMax',
  'bundlePercentMin', 'bundlePercentMax',
  'proTradersMin', 'proTradersMax',
  'globalFeesPaidMin', 'globalFeesPaidMax',
  'twitterReusesMin', 'twitterReusesMax',
  'hasTwitter', 'hasWebsite', 'hasTelegram', 'atLeastOneSocial',
  'onlyPumpLive', 'onlyMayhemMode',
];

/**
 * Returns true if `filters` differs from `baseline` on any tracked field.
 * Used by tabs that ship non-empty default filter sets (e.g. Gainers, which
 * defaults to min liq $10k + min holders 50 + top-10 < 50%) so the "active
 * filter" badge only lights up when the USER has changed something — not
 * just because the tab's baseline is non-empty.
 */
export function hasActiveFiltersAgainst(
  filters: PulseFilters,
  baseline: PulseFilters,
): boolean {
  // Protocol/quote-token arrays compared by content.
  const protoChanged =
    filters.protocols.length !== baseline.protocols.length ||
    filters.protocols.some((p, i) => p !== baseline.protocols[i]);
  if (protoChanged) return true;
  const quoteChanged =
    filters.quoteTokens.length !== baseline.quoteTokens.length ||
    filters.quoteTokens.some((q, i) => q !== baseline.quoteTokens[i]);
  if (quoteChanged) return true;
  for (const key of TRACKED_FILTER_FIELDS) {
    if (filters[key] !== baseline[key]) return true;
  }
  return false;
}

/** Per-bucket-aware count for the badge number. */
export function countActiveFiltersAgainst(
  filters: PulseFilters,
  baseline: PulseFilters,
): number {
  let count = 0;
  if (
    filters.protocols.length !== baseline.protocols.length ||
    filters.protocols.some((p, i) => p !== baseline.protocols[i])
  ) count++;
  if (
    filters.quoteTokens.length !== baseline.quoteTokens.length ||
    filters.quoteTokens.some((q, i) => q !== baseline.quoteTokens[i])
  ) count++;
  for (const key of TRACKED_FILTER_FIELDS) {
    if (filters[key] !== baseline[key]) count++;
  }
  return count;
}

/** Quick check if any filter deviates from defaults. */
export function hasActiveFilters(filters: PulseFilters): boolean {
  return (
    (filters.protocols.length > 0 && !filters.protocols.includes('All')) ||
    filters.quoteTokens.length > 0 ||
    !!filters.searchKeywords.trim() ||
    !!filters.excludeKeywords.trim() ||
    !!filters.minMarketCap ||
    !!filters.maxMarketCap ||
    !!filters.minVolume ||
    !!filters.maxVolume ||
    !!filters.minLiquidity ||
    !!filters.maxLiquidity ||
    !!filters.holdersMin ||
    !!filters.holdersMax ||
    !!filters.minAge ||
    !!filters.maxAge ||
    !!filters.devMigrationsMin ||
    !!filters.devMigrationsMax ||
    !!filters.devPairsCreatedMin ||
    !!filters.devPairsCreatedMax ||
    !!filters.kolCountMin ||
    !!filters.kolCountMax ||
    !!filters.bCurvePercentMin ||
    !!filters.bCurvePercentMax ||
    !!filters.txnsMin ||
    !!filters.txnsMax ||
    !!filters.numBuysMin ||
    !!filters.numBuysMax ||
    !!filters.numSellsMin ||
    !!filters.numSellsMax ||
    !!filters.top10HoldersPercent ||
    !!filters.top10HoldersPercentMin ||
    !!filters.top10HoldersPercentMax ||
    !!filters.devHoldingPercentMin ||
    !!filters.devHoldingPercentMax ||
    !!filters.snipersPercentMin ||
    !!filters.snipersPercentMax ||
    !!filters.insidersPercentMin ||
    !!filters.insidersPercentMax ||
    !!filters.bundlePercentMin ||
    !!filters.bundlePercentMax ||
    !!filters.proTradersMin ||
    !!filters.proTradersMax ||
    !!filters.globalFeesPaidMin ||
    !!filters.globalFeesPaidMax ||
    !!filters.twitterReusesMin ||
    !!filters.twitterReusesMax ||
    !!filters.hasTwitter ||
    !!filters.hasWebsite ||
    !!filters.hasTelegram ||
    !!filters.atLeastOneSocial ||
    !!filters.onlyPumpLive ||
    !!filters.onlyMayhemMode
  );
}
