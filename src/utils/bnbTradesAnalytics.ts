import { isValidBnbWallet } from '~/utils/bnbToken';

export interface BnbTradeRow {
  account?: string;
  side?: string;
  token_amount?: string | number;
  quote_amount?: string | number;
  price_usd?: number;
  block_time?: string;
}

export interface BnbTraderStats {
  wallet: string;
  buyCount: number;
  sellCount: number;
  boughtUsd: number;
  soldUsd: number;
  totalVolumeUsd: number;
  tokensBought: number;
  tokensSold: number;
  tokensRemaining: number;
  lastTradeAt: string;
  realizedPnlUsd: number;
}

export interface BnbHolderFromTrades {
  wallet: string;
  balance: number;
  balanceUsd: number;
  boughtUsd: number;
  soldUsd: number;
  buyCount: number;
  sellCount: number;
  lastTradeAt: string;
}

const parseWeiAmount = (raw: string | number | undefined | null): number => {
  if (raw == null || raw === '') return 0;
  const n = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1e15 ? n / 1e18 : n;
};

const tradeUsd = (trade: BnbTradeRow, tokenAmt: number, quoteBnb: number, bnbUsd: number): number => {
  const price = Number(trade.price_usd);
  if (Number.isFinite(price) && price > 0 && tokenAmt > 0) return tokenAmt * price;
  if (quoteBnb > 0 && bnbUsd > 0) return quoteBnb * bnbUsd;
  return 0;
};

export function countBnbKolFromTrades(
  trades: BnbTradeRow[],
  kolAddressMap: Map<string, unknown>,
): number {
  const seen = new Set<string>();
  for (const trade of trades) {
    const wallet = String(trade.account || '').toLowerCase();
    if (wallet && kolAddressMap.has(wallet)) seen.add(wallet);
  }
  return seen.size;
}

export function countBnbUniqueTradersFromTrades(trades: BnbTradeRow[]): number {
  const seen = new Set<string>();
  for (const trade of trades) {
    const wallet = String(trade.account || '').toLowerCase();
    if (isValidBnbWallet(wallet)) seen.add(wallet);
  }
  return seen.size;
}

export interface BnbWalletPosition {
  boughtUsd: number;
  soldUsd: number;
  boughtTokens: number;
  soldTokens: number;
  holdingTokens: number;
  holdingUsd: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPct: number;
  realizedPnlUsd: number;
}

export function computeBnbWalletPosition(
  boughtTokens: number,
  boughtUsd: number,
  soldTokens: number,
  soldUsd: number,
  priceUsd = 0,
): BnbWalletPosition {
  const remainingTokens = Math.max(0, boughtTokens - soldTokens);
  const avgBuyPrice = boughtTokens > 0 ? boughtUsd / boughtTokens : 0;
  const soldFraction = boughtTokens > 0 ? Math.min(soldTokens / boughtTokens, 1) : 0;
  const costBasis = boughtUsd * Math.max(0, 1 - soldFraction);
  const holdingUsd =
    priceUsd > 0 && remainingTokens > 0
      ? remainingTokens * priceUsd
      : remainingTokens * avgBuyPrice;
  const realizedPnlUsd =
    soldTokens > 0 && avgBuyPrice > 0 ? soldUsd - soldTokens * avgBuyPrice : 0;
  const unrealizedPnlUsd = holdingUsd - costBasis;
  const unrealizedPnlPct = costBasis > 0 ? (unrealizedPnlUsd / costBasis) * 100 : 0;

  return {
    boughtUsd,
    soldUsd,
    boughtTokens,
    soldTokens,
    holdingTokens: remainingTokens,
    holdingUsd,
    unrealizedPnlUsd,
    unrealizedPnlPct,
    realizedPnlUsd,
  };
}

/** Position for connected wallets from token-bnb on-chain trade feed. */
export function computeBnbWalletPositionFromTrades(
  trades: BnbTradeRow[],
  wallets: string[],
  bnbUsd = 600,
  priceUsd = 0,
): BnbWalletPosition {
  const walletSet = new Set(
    wallets.map((w) => w.trim().toLowerCase()).filter((w) => isValidBnbWallet(w)),
  );
  if (walletSet.size === 0) {
    return computeBnbWalletPosition(0, 0, 0, 0, priceUsd);
  }

  let boughtTokens = 0;
  let boughtUsd = 0;
  let soldTokens = 0;
  let soldUsd = 0;

  const sorted = [...trades].sort(
    (a, b) => new Date(a.block_time || 0).getTime() - new Date(b.block_time || 0).getTime(),
  );

  for (const trade of sorted) {
    const wallet = String(trade.account || '').toLowerCase();
    if (!walletSet.has(wallet)) continue;

    const tokenAmt = parseWeiAmount(trade.token_amount);
    const quoteBnb = parseWeiAmount(trade.quote_amount);
    const usd = tradeUsd(trade, tokenAmt, quoteBnb, bnbUsd);
    const isBuy = String(trade.side || '').toLowerCase() === 'buy';

    if (isBuy) {
      boughtTokens += tokenAmt;
      boughtUsd += usd;
    } else {
      soldTokens += tokenAmt;
      soldUsd += usd;
    }
  }

  return computeBnbWalletPosition(
    boughtTokens,
    boughtUsd,
    soldTokens,
    soldUsd,
    priceUsd,
  );
}

/** Position from Interstate platform trade rows (activity / history API). */
export function computeBnbPositionFromPlatformTrades(
  trades: Array<{
    type?: string;
    tokenAmount?: string | number;
    usdValue?: string | number;
    realizedPnl?: string | number;
  }>,
  priceUsd = 0,
): BnbWalletPosition {
  let boughtTokens = 0;
  let boughtUsd = 0;
  let soldTokens = 0;
  let soldUsd = 0;
  let realizedPnlUsd = 0;

  for (const trade of trades) {
    const type = String(trade.type || '').toLowerCase();
    const tokenAmt = parseWeiAmount(trade.tokenAmount);
    const usd = Number(trade.usdValue) || 0;
    const realized = Number(trade.realizedPnl);
    if (type === 'buy') {
      boughtTokens += tokenAmt;
      boughtUsd += usd;
    } else if (type === 'sell') {
      soldTokens += tokenAmt;
      soldUsd += usd;
      if (Number.isFinite(realized)) realizedPnlUsd += realized;
    }
  }

  const base = computeBnbWalletPosition(
    boughtTokens,
    boughtUsd,
    soldTokens,
    soldUsd,
    priceUsd,
  );

  if (realizedPnlUsd !== 0) {
    return { ...base, realizedPnlUsd };
  }
  return base;
}

export function aggregateBnbTrades(
  trades: BnbTradeRow[],
  bnbUsd = 600,
  latestPriceUsd = 0,
): { topTraders: BnbTraderStats[]; holders: BnbHolderFromTrades[] } {
  const byWallet = new Map<
    string,
    {
      wallet: string;
      buyCount: number;
      sellCount: number;
      boughtUsd: number;
      soldUsd: number;
      tokensBought: number;
      tokensSold: number;
      tokensRemaining: number;
      lastTradeAt: string;
    }
  >();

  const sorted = [...trades].sort(
    (a, b) => new Date(a.block_time || 0).getTime() - new Date(b.block_time || 0).getTime(),
  );

  for (const trade of sorted) {
    const wallet = String(trade.account || '').toLowerCase();
    if (!wallet) continue;

    const cur =
      byWallet.get(wallet) ||
      ({
        wallet,
        buyCount: 0,
        sellCount: 0,
        boughtUsd: 0,
        soldUsd: 0,
        tokensBought: 0,
        tokensSold: 0,
        tokensRemaining: 0,
        lastTradeAt: trade.block_time || '',
      } as const);

    const next = { ...cur };
    const tokenAmt = parseWeiAmount(trade.token_amount);
    const quoteBnb = parseWeiAmount(trade.quote_amount);
    const usd = tradeUsd(trade, tokenAmt, quoteBnb, bnbUsd);
    const isBuy = String(trade.side || '').toLowerCase() === 'buy';

    if (isBuy) {
      next.buyCount += 1;
      next.boughtUsd += usd;
      next.tokensBought += tokenAmt;
      next.tokensRemaining += tokenAmt;
    } else {
      next.sellCount += 1;
      next.soldUsd += usd;
      next.tokensSold += tokenAmt;
      next.tokensRemaining = Math.max(0, next.tokensRemaining - tokenAmt);
    }
    next.lastTradeAt = trade.block_time || next.lastTradeAt;
    byWallet.set(wallet, next);
  }

  const priceUsd = latestPriceUsd > 0 ? latestPriceUsd : 0;

  const topTraders: BnbTraderStats[] = [...byWallet.values()]
    .map((w) => {
      const costSold =
        w.tokensBought > 0 && w.tokensSold > 0
          ? w.boughtUsd * Math.min(1, w.tokensSold / w.tokensBought)
          : 0;
      return {
        ...w,
        totalVolumeUsd: w.boughtUsd + w.soldUsd,
        realizedPnlUsd: w.soldUsd - costSold,
      };
    })
    .sort((a, b) => b.totalVolumeUsd - a.totalVolumeUsd);

  const holders: BnbHolderFromTrades[] = [...byWallet.values()]
    .filter((w) => w.tokensRemaining > 0.000001)
    .map((w) => ({
      wallet: w.wallet,
      balance: w.tokensRemaining,
      balanceUsd: priceUsd > 0 ? w.tokensRemaining * priceUsd : 0,
      boughtUsd: w.boughtUsd,
      soldUsd: w.soldUsd,
      buyCount: w.buyCount,
      sellCount: w.sellCount,
      lastTradeAt: w.lastTradeAt,
    }))
    .sort((a, b) => b.balance - a.balance);

  return { topTraders, holders };
}

const TRADE_WINDOW_SEC: Record<'5m' | '1h' | '6h' | '24h', number> = {
  '5m': 300,
  '1h': 3600,
  '6h': 21600,
  '24h': 86400,
};

/** Buy/sell volume + counts for a time window from on-chain trades. */
export function computeBnbTradeWindowStats(
  trades: BnbTradeRow[],
  window: '5m' | '1h' | '6h' | '24h',
  bnbUsd = 600,
  nowMs = Date.now(),
): {
  volume: number;
  buyVolume: number;
  sellVolume: number;
  buys: number;
  sells: number;
  netVolume: number;
  buyPercentage: number;
  sellPercentage: number;
} {
  const cutoffMs = nowMs - TRADE_WINDOW_SEC[window] * 1000;
  let buyVolume = 0;
  let sellVolume = 0;
  let buys = 0;
  let sells = 0;

  for (const trade of trades) {
    const ts = new Date(trade.block_time || 0).getTime();
    if (!Number.isFinite(ts) || ts < cutoffMs) continue;

    const side = String(trade.side || '').toLowerCase();
    const tokenAmt = parseWeiAmount(trade.token_amount);
    const quoteBnb = parseWeiAmount(trade.quote_amount);
    const usd = tradeUsd(trade, tokenAmt, quoteBnb, bnbUsd);

    if (side === 'buy') {
      buys += 1;
      buyVolume += usd;
    } else if (side === 'sell') {
      sells += 1;
      sellVolume += usd;
    }
  }

  const volume = buyVolume + sellVolume;
  const netVolume = buyVolume - sellVolume;
  const buyPercentage = volume > 0 ? (buyVolume / volume) * 100 : 50;
  const sellPercentage = 100 - buyPercentage;

  return {
    volume,
    buyVolume,
    sellVolume,
    buys,
    sells,
    netVolume,
    buyPercentage,
    sellPercentage,
  };
}
