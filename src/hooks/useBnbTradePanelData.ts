import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '~/components/UserContext';
import {
  computeBnbPositionFromPlatformTrades,
  computeBnbWalletPosition,
  computeBnbWalletPositionFromTrades,
  type BnbWalletPosition,
} from '~/utils/bnbTradesAnalytics';
import {
  getActivePositionsByUser,
  getTradeActivityByUser,
  getTradeHistoryByTokenAddress,
} from '~/utils/functions';
import { fetchBnbTrades, fetchBnbUsdPrice } from '~/utils/bnbToken';

export type BnbTradePosition = BnbWalletPosition;

const EMPTY_POSITION: BnbTradePosition = {
  boughtUsd: 0,
  soldUsd: 0,
  boughtTokens: 0,
  soldTokens: 0,
  holdingUsd: 0,
  holdingTokens: 0,
  unrealizedPnlUsd: 0,
  unrealizedPnlPct: 0,
  realizedPnlUsd: 0,
};

function isEmptyPosition(pos: BnbTradePosition): boolean {
  return (
    pos.boughtUsd === 0 &&
    pos.soldUsd === 0 &&
    pos.boughtTokens === 0 &&
    pos.soldTokens === 0 &&
    pos.holdingTokens === 0
  );
}

function hasPositionActivity(pos: BnbTradePosition): boolean {
  return (
    pos.boughtUsd > 0 ||
    pos.soldUsd > 0 ||
    pos.boughtTokens > 0 ||
    pos.soldTokens > 0 ||
    pos.holdingTokens > 0
  );
}

async function fetchBnbActivityTrades(userId: string): Promise<any[]> {
  const merged: any[] = [];
  const seen = new Set<string>();
  for (const chain of ['bnb', 'bsc', undefined] as const) {
    const trades = await getTradeActivityByUser(userId, chain);
    for (const trade of trades) {
      const key = String(trade.transactionHash || trade.id || JSON.stringify(trade));
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(trade);
    }
  }
  return merged;
}

function positionFromActiveRow(
  row: {
    bought?: number;
    boughtUsdValue?: number;
    sold?: number;
    soldUsdValue?: number;
    remaining?: number;
    remainingUsdValue?: number;
    pnl?: number;
    pnlPercentage?: number;
  },
  priceUsd: number,
): BnbTradePosition {
  const boughtTokens = Number(row.bought) || 0;
  const soldTokens = Number(row.sold) || 0;
  const boughtUsd = Number(row.boughtUsdValue) || 0;
  const soldUsd = Number(row.soldUsdValue) || 0;
  const holdingTokens = Number(row.remaining) ?? Math.max(0, boughtTokens - soldTokens);
  const holdingUsd =
    Number(row.remainingUsdValue) ||
    (priceUsd > 0 && holdingTokens > 0
      ? holdingTokens * priceUsd
      : computeBnbWalletPosition(boughtTokens, boughtUsd, soldTokens, soldUsd, priceUsd).holdingUsd);

  const base = computeBnbWalletPosition(boughtTokens, boughtUsd, soldTokens, soldUsd, priceUsd);
  return {
    ...base,
    holdingTokens,
    holdingUsd,
    unrealizedPnlUsd: Number(row.pnl) || base.unrealizedPnlUsd,
    unrealizedPnlPct: Number(row.pnlPercentage) || base.unrealizedPnlPct,
  };
}

export default function useBnbTradePanelData(
  mint: string | undefined,
  tokenPriceUsd: number,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const { user, walletList, primaryWalletAddresses } = useUser();
  const [bnbBalance, setBnbBalance] = useState(0);
  const [position, setPosition] = useState<BnbTradePosition>(EMPTY_POSITION);
  const tokenPriceRef = useRef(tokenPriceUsd);

  useEffect(() => {
    tokenPriceRef.current = tokenPriceUsd;
  }, [tokenPriceUsd]);

  const bnbWallets = useMemo(
    () =>
      (walletList || []).filter(
        (w) => !w.isArchived && typeof w.ethereumAddress === 'string' && w.ethereumAddress,
      ),
    [walletList],
  );

  const walletAddressesKey = useMemo(() => {
    const addresses = bnbWallets.length
      ? bnbWallets.map((w) => w.ethereumAddress!).filter(Boolean)
      : primaryWalletAddresses.ethereum
        ? [primaryWalletAddresses.ethereum]
        : [];
    return addresses.map((a) => a.toLowerCase()).sort().join(',');
  }, [bnbWallets, primaryWalletAddresses.ethereum]);

  const walletAddresses = useMemo(
    () => (walletAddressesKey ? walletAddressesKey.split(',') : []),
    [walletAddressesKey],
  );

  const selectedWalletCount = walletAddresses.length;

  const refreshBnbBalance = useCallback(async () => {
    if (walletAddresses.length === 0) {
      setBnbBalance((prev) => (prev === 0 ? prev : 0));
      return;
    }

    let total = 0;
    await Promise.all(
      walletAddresses.map(async (address) => {
        try {
          const response = await fetch(
            `/api/get-sol-bal?chain=bnb&address=${encodeURIComponent(address)}`,
          );
          if (!response.ok) return;
          const body = await response.json();
          const bal = Number(body?.data?.balance);
          if (Number.isFinite(bal) && bal >= 0) total += bal;
        } catch {
          // ignore per-wallet failures
        }
      }),
    );
    setBnbBalance((prev) => (prev === total ? prev : total));
  }, [walletAddresses]);

  const refreshPosition = useCallback(async () => {
    if (!mint) {
      setPosition((prev) => (isEmptyPosition(prev) ? prev : EMPTY_POSITION));
      return;
    }

    const tokenMint = mint.toLowerCase();
    const priceUsd = tokenPriceRef.current;
    let next = EMPTY_POSITION;

    try {
      // 1) Platform trade history for this token (Interstate backend)
      if (user?.id) {
        const history = await getTradeHistoryByTokenAddress(tokenMint);
        const platformPos = computeBnbPositionFromPlatformTrades(history, priceUsd);
        if (hasPositionActivity(platformPos)) {
          next = platformPos;
        }

        if (!hasPositionActivity(next)) {
          const activity = await fetchBnbActivityTrades(String(user.id));
          const tokenTrades = activity.filter(
            (trade: any) => String(trade.tokenAddress || '').toLowerCase() === tokenMint,
          );
          const activityPos = computeBnbPositionFromPlatformTrades(tokenTrades, priceUsd);
          if (hasPositionActivity(activityPos)) {
            next = activityPos;
          }
        }

        if (!hasPositionActivity(next)) {
          for (const chain of ['bnb', 'bsc', undefined] as const) {
            const rows = await getActivePositionsByUser(String(user.id), chain);
            const row = rows.find(
              (r) => String(r.tokenAddress || '').toLowerCase() === tokenMint,
            );
            if (row) {
              const activePos = positionFromActiveRow(row, priceUsd);
              if (hasPositionActivity(activePos)) {
                next = activePos;
                break;
              }
            }
          }
        }
      }

      // 2) On-chain trades from token-bnb for connected EVM wallets
      if (!hasPositionActivity(next) && walletAddresses.length > 0) {
        const [tradeRows, bnbUsd] = await Promise.all([
          fetchBnbTrades(tokenMint, 500),
          fetchBnbUsdPrice(),
        ]);
        const onChainPos = computeBnbWalletPositionFromTrades(
          tradeRows,
          walletAddresses,
          bnbUsd ?? 600,
          priceUsd,
        );
        if (hasPositionActivity(onChainPos)) {
          next = onChainPos;
        }
      }

      setPosition((prev) => {
        const unchanged =
          prev.boughtUsd === next.boughtUsd &&
          prev.soldUsd === next.soldUsd &&
          prev.boughtTokens === next.boughtTokens &&
          prev.soldTokens === next.soldTokens &&
          prev.holdingUsd === next.holdingUsd &&
          prev.holdingTokens === next.holdingTokens &&
          prev.unrealizedPnlUsd === next.unrealizedPnlUsd &&
          prev.unrealizedPnlPct === next.unrealizedPnlPct &&
          prev.realizedPnlUsd === next.realizedPnlUsd;
        return unchanged ? prev : next;
      });
    } catch {
      setPosition((prev) => (isEmptyPosition(prev) ? prev : EMPTY_POSITION));
    }
  }, [mint, user?.id, walletAddresses]);

  useEffect(() => {
    if (!enabled) return;
    void refreshBnbBalance();
    const id = setInterval(refreshBnbBalance, 20_000);
    return () => clearInterval(id);
  }, [enabled, refreshBnbBalance]);

  useEffect(() => {
    if (!enabled) return;
    void refreshPosition();
    const id = setInterval(refreshPosition, 10_000);
    return () => clearInterval(id);
  }, [enabled, refreshPosition]);

  // Recompute UPnL when live price moves without re-fetching activity.
  useEffect(() => {
    if (!enabled || tokenPriceUsd <= 0) return;
    setPosition((prev) => {
      if (prev.holdingTokens <= 0) return prev;
      const soldFraction =
        prev.boughtTokens > 0
          ? Math.min(prev.soldTokens / prev.boughtTokens, 1)
          : 0;
      const costBasis = prev.boughtUsd * Math.max(0, 1 - soldFraction);
      const holdingUsd = prev.holdingTokens * tokenPriceUsd;
      const unrealizedPnlUsd = holdingUsd - costBasis;
      const unrealizedPnlPct =
        costBasis > 0 ? (unrealizedPnlUsd / costBasis) * 100 : 0;
      if (
        prev.holdingUsd === holdingUsd &&
        prev.unrealizedPnlUsd === unrealizedPnlUsd &&
        prev.unrealizedPnlPct === unrealizedPnlPct
      ) {
        return prev;
      }
      return {
        ...prev,
        holdingUsd,
        unrealizedPnlUsd,
        unrealizedPnlPct,
      };
    });
  }, [enabled, tokenPriceUsd]);

  return {
    selectedWalletCount,
    bnbBalance,
    position,
    refreshBnbBalance,
    refreshPosition,
  };
}
