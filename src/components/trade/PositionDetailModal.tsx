import React, { useState, useEffect, useMemo } from 'react';
import { FaTimes, FaExternalLinkAlt, FaSortAmountDown, FaClock, FaRegCopy } from 'react-icons/fa';
import { formatSmartNumber, formatMarketCap, type Token } from '~/utils/db';
import type { PositionRow, TradeRow } from '~/utils/functions';
import { useRouter } from 'next/router';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip, Dot } from 'recharts';
import { useUser } from '../UserContext';
import { env } from '~/env';
import toast from 'react-hot-toast';
import { normalizeMonadAddress } from '~/utils/normalizeMonadAddress';
import { useWatchlist } from '../WatchlistContext';

interface PositionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  position: PositionRow | null;
  tokenMetadata?: {
    name?: string;
    symbol?: string;
    imageUrl?: string;
    protocol?: string;
    launchpad?: string;
    marketCapUsd?: number;
    priceUsd?: number;
  };
  currentPrice?: number;
  chain?: string;
}

interface ChartDataPoint {
  time: string;
  timestamp: number;
  price: number;
  marketCap: number;
  isBuy?: boolean;
  isSell?: boolean;
}

const WALLET_FIELD_CANDIDATES = [
  'walletAddress',
  'wallet_address',
  'wallet',
  'userWallet',
  'userWalletAddress',
  'maker',
  'owner',
  'fromAddress',
  'sourceWallet',
  'executor',
];

const truncateAddress = (address?: string | null, size = 4) => {
  if (!address) return '';
  if (address.length <= size * 2) return address;
  return `${address.slice(0, size)}...${address.slice(-size)}`;
};

const formatUsd = (value: number): string => {
  if (!Number.isFinite(value) || value === 0) return '$0.00';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (abs >= 1000) {
    return `${sign}$${formatSmartNumber(abs)}`;
  }

  const raw = formatWithSubscript(abs);
  const normalized = raw.startsWith('$') ? raw.slice(1) : raw || abs.toFixed(2);
  return `${sign}$${normalized}`;
};

const SUBSCRIPT_DIGITS: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
};

const formatNativeAmount = (value: number): string => {
  if (!Number.isFinite(value) || value === 0) return '0';
  const abs = Math.abs(value);

  if (abs >= 1) {
    return formatSmartNumber(value);
  }

  if (abs >= 0.01) {
    return value.toFixed(3);
  }

  const precise = abs.toFixed(18);
  const match = precise.match(/^0\.(0+)(\d+)/);
  if (match) {
    const zerosLength = match[1].length;
    const digits = match[2] || '';
    const displayDigits = (digits + '0').slice(0, 2);
    const subscript = zerosLength
      .toString()
      .split('')
      .map((d) => SUBSCRIPT_DIGITS[d] || d)
      .join('');
    const core = `0.0${subscript}${displayDigits}`;
    return value < 0 ? `-${core}` : core;
  }

  const fallback = formatWithSubscript(abs).replace('$', '');
  return value < 0 ? `-${fallback}` : fallback;
};

const extractTradeWalletAddress = (trade: TradeRow): string | null => {
  for (const field of WALLET_FIELD_CANDIDATES) {
    const value = (trade as Record<string, any>)[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
};

const annotateChartWithTrades = (
  points: ChartDataPoint[],
  trades: TradeRow[]
): ChartDataPoint[] => {
  if (!points.length) return points;
  if (!trades.length) {
    return points.map((point) => ({ ...point, isBuy: false, isSell: false }));
  }

  const annotated = points.map((point) => ({
    ...point,
    isBuy: false,
    isSell: false,
  }));

  trades.forEach((trade) => {
    const timestampSource = trade.createdAt || trade.tradeTime;
    const tradeTimestamp = timestampSource ? new Date(timestampSource).getTime() : NaN;
    if (!Number.isFinite(tradeTimestamp)) return;

    let closestIndex = -1;
    let minDiff = Infinity;
    annotated.forEach((point, idx) => {
      const diff = Math.abs(point.timestamp - tradeTimestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = idx;
      }
    });

    if (closestIndex >= 0 && minDiff <= 3600000) {
      if (trade.type === 'Buy') {
        annotated[closestIndex].isBuy = true;
      } else if (trade.type === 'Sell') {
        annotated[closestIndex].isSell = true;
      }
    }
  });

  return annotated;
};

const normalizeAddressForLookup = (address?: string | null) => {
  if (!address || typeof address !== 'string') return '';
  const trimmed = address.trim();
  if (!trimmed) return '';
  const normalizedMonad = normalizeMonadAddress(trimmed);
  if (normalizedMonad) {
    return normalizedMonad;
  }
  return trimmed;
};

const parseNumericCandidate = (value: any): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^0-9.\-eE]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'bigint') return Number(value);
  return 0;
};

const deriveMarketCapFromTrade = (
  trade: TradeRow,
  trades: TradeRow[],
  metadata?: { marketCapUsd?: number },
  fallback?: number
): number => {
  const candidates = [
    (trade as any).marketCap,
    (trade as any).marketcap,
    (trade as any).market_cap,
    (trade as any).market_cap_usd,
    (trade as any).fully_diluted_value,
    (trade as any).mcap,
  ];

  let marketCapValue = candidates
    .map(parseNumericCandidate)
    .find((val) => val > 0) || 0;

  if (!marketCapValue && trades.length > 0) {
    const sameTokenValues = trades
      .map((t) =>
        parseNumericCandidate(
          (t as any).marketCap ??
            (t as any).marketcap ??
            (t as any).market_cap ??
            (t as any).market_cap_usd
        )
      )
      .filter((val) => val > 0);
    if (sameTokenValues.length > 0) {
      marketCapValue = Math.max(...sameTokenValues);
    }
  }

  if (!marketCapValue && typeof metadata?.marketCapUsd === 'number') {
    marketCapValue = metadata.marketCapUsd;
  }

  if (!marketCapValue && typeof fallback === 'number' && fallback > 0) {
    marketCapValue = fallback;
  }

  return marketCapValue;
};

// Format number with subscript notation for small decimals
const formatWithSubscript = (value: number): string => {
  if (!Number.isFinite(value) || value === 0) return "0";

  const absValue = Math.abs(value);

  if (absValue >= 1) {
    return value.toFixed(2);
  }

  const str = value.toFixed(18);
  const match = str.match(/^0\.(0*)([1-9]\d*)/);

  if (match) {
    const leadingZeros = match[1].length;
    const significantDigits = match[2];
    const displayDigits = significantDigits.slice(0, 5);

    if (leadingZeros > 0) {
      const subscriptMap: { [key: string]: string } = {
        '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
        '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'
      };
      const subscript = leadingZeros.toString().split('').map(d => subscriptMap[d] || d).join('');
      return `$0.0${subscript}${displayDigits}`;
    }
    return `$0.${displayDigits}`;
  }

  return `$${value.toFixed(8).replace(/\.?0+$/, '')}`;
};

export default function PositionDetailModal({
  isOpen,
  onClose,
  position,
  tokenMetadata,
  currentPrice = 0,
  chain = 'sol',
}: PositionDetailModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState('4h');
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [loadingTrades, setLoadingTrades] = useState(false);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const router = useRouter();
  const {
    user,
    primaryWalletAddresses,
    chainBalances,
    solBalance,
    walletList,
    walletBalances,
  } = useUser();
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();

  const userId = user?.id;

  const isMonad = chain === 'monad';
  const currency = isMonad ? 'MON' : 'SOL';

  const primaryWallet = walletList.find((w) => w.isPrimary) || walletList[0];
  const fallbackWalletAddress = isMonad
    ? primaryWalletAddresses.ethereum ||
      primaryWallet?.ethereumAddress ||
      primaryWallet?.address
    : primaryWalletAddresses.solana ||
      (primaryWallet as any)?.solanaAddress ||
      primaryWallet?.address;
  const fallbackWalletBalance = isMonad
    ? (chainBalances['monad'] ?? 0)
    : solBalance;


  useEffect(() => {
    if (isOpen) {
      setTimeout(() => setIsVisible(true), 10);
      document.body.style.overflow = 'hidden';

      if (position && userId) {
        fetchTradesForToken();
        fetchChartData();
      }
    } else {
      setIsVisible(false);
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, position, userId]);

  useEffect(() => {
    if (isOpen && position && userId) {
      fetchChartData();
    }
  }, [selectedTimeframe]);

  const fetchTradesForToken = async () => {
    if (!userId || !position) return;

    setLoadingTrades(true);
    try {
      const currentChain = chain || 'sol';
      const blockchainParam = currentChain === 'monad' ? '&blockchain=monad' : '&blockchain=solana';
      const res = await fetch(
        `${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/get_trade_activity_by_user?userId=${userId}${blockchainParam}`
      );

      if (res.ok) {
        const allTrades: TradeRow[] = await res.json();
        const tokenTrades = allTrades
          .filter(
            (t) => t.tokenAddress?.toLowerCase() === position.tokenAddress?.toLowerCase()
          )
          .sort(
            (a, b) =>
              new Date(b.createdAt || b.tradeTime).getTime() -
              new Date(a.createdAt || a.tradeTime).getTime()
          );
        setTrades(tokenTrades);
      }
    } catch (error) {
      console.error('Error fetching trades:', error);
    } finally {
      setLoadingTrades(false);
    }
  };

  const fetchChartData = async () => {
    if (!position) return;

    setLoadingChart(true);
    try {
      const url = new URL(`${env.NEXT_PUBLIC_BACKEND_URL}/v1/trade/ohlc-data`);
      url.searchParams.set('mint', position.tokenAddress);
      url.searchParams.set('interval', '1m');
      url.searchParams.set('timeframe', selectedTimeframe === '4h' ? '4h' : selectedTimeframe === '1d' ? '24h' : '720h');

      const res = await fetch(url.toString(), {
        headers: {
          'accept': 'application/json',
          'X-API-Key': env.NEXT_PUBLIC_BACKEND_API_KEY || 'test-key',
        },
      });

      if (res.ok) {
        const result = await res.json();
        if (result.success && result.data) {
          const chartPoints: ChartDataPoint[] = result.data.map((candle: any) => {
            const time = new Date(candle.timestamp);
            const priceValue = candle.close || candle.price || 0;
            const candleMarketCap =
              parseNumericCandidate(
                candle.marketCap ??
                  candle.market_cap ??
                  candle.marketcap ??
                  candle.marketCapUsd ??
                  candle.market_cap_usd
              ) || fallbackMarketCapValue;

            return {
              time: time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              timestamp: time.getTime(),
              price: priceValue,
              marketCap: candleMarketCap,
            };
          });

          setChartData(annotateChartWithTrades(chartPoints, trades));
        } else {
          generateFallbackChartData();
        }
      } else {
        generateFallbackChartData();
      }
    } catch (error) {
      console.error('Error fetching chart data:', error);
      generateFallbackChartData();
    } finally {
      setLoadingChart(false);
    }
  };

  const generateFallbackChartData = () => {
    const data: ChartDataPoint[] = [];
    const now = Date.now();
    const hours = selectedTimeframe === '4h' ? 4 : selectedTimeframe === '1d' ? 24 : 720;
    const points = Math.min(hours * 2, 50);

    const avgBuyPrice = position && position.boughtUsdValue > 0 && position.bought > 0
      ? position.boughtUsdValue / position.bought
      : currentPrice || 0.001;

    const avgBuyMC = fallbackMarketCapValue || avgBuyPrice * 1000000;

    for (let i = points; i >= 0; i--) {
      const time = now - i * (hours * 3600000 / points);
      const variance = avgBuyMC * 0.1;
      const mc = avgBuyMC + (Math.random() - 0.5) * variance;

      data.push({
        time: new Date(time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        timestamp: time,
        price: mc / 1000000,
        marketCap: mc || fallbackMarketCapValue,
        isBuy: i === Math.floor(points * 0.3), // Mark a point as buy for demo
      });
    }

    setChartData(annotateChartWithTrades(data, trades));
  };

  useEffect(() => {
    if (!trades.length || chartData.length === 0) return;
    setChartData((prev) => annotateChartWithTrades(prev, trades));
  }, [trades, chartData.length]);

  const sortedTrades = useMemo(() => {
    if (!trades.length) return [];
    return [...trades].sort(
      (a, b) =>
        new Date(b.createdAt || b.tradeTime).getTime() -
        new Date(a.createdAt || a.tradeTime).getTime()
    );
  }, [trades]);

  const chronologicalTrades = useMemo(() => {
    if (!sortedTrades.length) return [];
    return [...sortedTrades].reverse();
  }, [sortedTrades]);

  const buyTrades = useMemo(() => sortedTrades.filter((t) => t.type === 'Buy'), [sortedTrades]);
  const sellTrades = useMemo(() => sortedTrades.filter((t) => t.type === 'Sell'), [sortedTrades]);

  const toNum = (val: any): number => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') return parseFloat(val) || 0;
    return 0;
  };

  const bought = toNum(position?.bought ?? 0);
  const sold = toNum(position?.sold ?? 0);
  const remaining = toNum(position?.remaining ?? 0);
  const boughtUsdValue = toNum(position?.boughtUsdValue ?? 0);
  const soldUsdValue = toNum(position?.soldUsdValue ?? 0);
  const remainingUsdValue = toNum(position?.remainingUsdValue ?? 0);

  const totalPnl = toNum(position?.pnl ?? 0);
  const totalPnlPercentage = toNum(position?.pnlPercentage ?? 0);

  const avgBuyPrice = bought > 0 ? boughtUsdValue / bought : 0;
  const costBasisOfRemaining = remaining * avgBuyPrice;
  const unrealizedPnl = remainingUsdValue - costBasisOfRemaining;
  const unrealizedPnlPercentage = costBasisOfRemaining > 0 ? (unrealizedPnl / costBasisOfRemaining) * 100 : 0;

  const avgSellPrice = sold > 0 ? soldUsdValue / sold : 0;
  const realizedCostBasis = sold > 0 && bought > 0 ? (sold / bought) * boughtUsdValue : 0;
  const realizedPnl = soldUsdValue - realizedCostBasis;
  const realizedPnlPercentage = realizedCostBasis > 0 ? (realizedPnl / realizedCostBasis) * 100 : 0;

  const avgBuyMC = buyTrades.length > 0
    ? buyTrades.reduce((sum, t) => sum + toNum(t.marketCap), 0) / buyTrades.length
    : avgBuyPrice * 1000000;

  const fallbackMarketCapValue = useMemo(() => {
    if (sortedTrades.length > 0) {
      return deriveMarketCapFromTrade(
        sortedTrades[0],
        sortedTrades,
        tokenMetadata ? { marketCapUsd: tokenMetadata.marketCapUsd } : undefined,
        avgBuyMC
      );
    }
    if (typeof tokenMetadata?.marketCapUsd === 'number' && tokenMetadata.marketCapUsd > 0) {
      return tokenMetadata.marketCapUsd;
    }
    return avgBuyMC;
  }, [sortedTrades, tokenMetadata, avgBuyMC]);

  const getNativeAmount = (trade: TradeRow) =>
    toNum(
      trade.solAmount ??
        (trade as any).nativeAmount ??
        (trade as any).baseAmount ??
        (trade as any).monAmount ??
        (trade as any).amountIn ??
        0
    );

  const enrichedTrades = useMemo(
    () =>
      sortedTrades.map((trade) => ({
        trade,
        marketCapValue: deriveMarketCapFromTrade(
          trade,
          sortedTrades,
          tokenMetadata ? { marketCapUsd: tokenMetadata.marketCapUsd } : undefined,
          fallbackMarketCapValue
        ),
      })),
    [sortedTrades, tokenMetadata, fallbackMarketCapValue]
  );

  const avgBuyMcForDisplay = useMemo(() => {
    const values = enrichedTrades
      .filter(({ trade }) => trade.type === 'Buy')
      .map(({ marketCapValue }) => marketCapValue)
      .filter((val) => val > 0);
    if (values.length > 0) {
      return values.reduce((sum, val) => sum + val, 0) / values.length;
    }
    return fallbackMarketCapValue || avgBuyMC;
  }, [enrichedTrades, fallbackMarketCapValue, avgBuyMC]);

  const avgSellMcForDisplay = useMemo(() => {
    const values = enrichedTrades
      .filter(({ trade }) => trade.type === 'Sell')
      .map(({ marketCapValue }) => marketCapValue)
      .filter((val) => val > 0);
    if (values.length > 0) {
      return values.reduce((sum, val) => sum + val, 0) / values.length;
    }
    return 0;
  }, [enrichedTrades]);

  const walletMetadataMap = useMemo(() => {
    const map = new Map<string, any>();
    walletList.forEach((wallet) => {
      if (!wallet) return;
      const solAddr = normalizeAddressForLookup(wallet?.solanaAddress || wallet?.address);
      if (solAddr) {
        map.set(solAddr, wallet);
        map.set(solAddr.toLowerCase(), wallet);
      }
      const monAddr = normalizeMonadAddress(wallet?.ethereumAddress || wallet?.address);
      if (monAddr) {
        map.set(monAddr, wallet);
      }
    });
    return map;
  }, [walletList]);

  const tradeWalletAddress = useMemo(() => {
    if (!trades.length) return null;
    const counts: Record<string, { count: number; raw: string }> = {};
    trades.forEach((trade) => {
      const extracted = extractTradeWalletAddress(trade);
      if (!extracted) return;
      const normalized = normalizeAddressForLookup(extracted);
      if (!normalized) return;
      const key = normalized.startsWith('0x') ? normalized : normalized.toLowerCase();
      if (!counts[key]) {
        counts[key] = { count: 0, raw: extracted };
      }
      counts[key].count += 1;
    });
    const ranked = Object.entries(counts).sort((a, b) => b[1].count - a[1].count);
    return ranked.length > 0 ? counts[ranked[0][0]].raw : null;
  }, [trades]);

  const resolvedWalletAddress = tradeWalletAddress || fallbackWalletAddress || '';
  const normalizedResolvedWalletAddress = normalizeAddressForLookup(resolvedWalletAddress);
  const normalizedLookupKeys = normalizedResolvedWalletAddress
    ? [normalizedResolvedWalletAddress, normalizedResolvedWalletAddress.toLowerCase()]
    : [];

  const linkedWallet = useMemo(() => {
    if (!normalizedLookupKeys.length) return undefined;
    for (const key of normalizedLookupKeys) {
      const match = walletMetadataMap.get(key);
      if (match) return match;
    }
    return undefined;
  }, [walletMetadataMap, normalizedLookupKeys]);

  if (!isOpen || !position) return null;

  const displayName = tokenMetadata?.name || (position as any).name || 'Unknown';
  const displaySymbol = tokenMetadata?.symbol || (position as any).symbol || '???';
  const displayImage = tokenMetadata?.imageUrl || position.imageUrl || '';

  const handleViewChart = () => {
    if (isMonad && position.tokenAddress) {
      router.push(`/trade/monad/${position.tokenAddress}`);
    } else {
      const navigateAddress = position.pairAddress || position.tokenAddress;
      if (navigateAddress) {
        router.push(`/trade/${navigateAddress}`);
      }
    }
    onClose();
  };

  const positionPercentage = bought > 0 ? (remaining / bought) * 100 : 0;

  const earliestBuy = chronologicalTrades.find((trade) => trade.type === 'Buy');
  const firstBuyTimestamp = earliestBuy
    ? new Date(earliestBuy.createdAt || earliestBuy.tradeTime).getTime()
    : null;
  const holdingDuration = firstBuyTimestamp ? Date.now() - firstBuyTimestamp : null;

  const formatDuration = (ms: number | null) => {
    if (!ms) return '--';
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    const minutes = Math.floor(ms / (1000 * 60));
    return `${minutes}m`;
  };

  const formatAge = (timestamp: string) => {
    const now = Date.now();
    const time = new Date(timestamp).getTime();
    const diff = now - time;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard', {
      duration: 2000,
      style: { background: '#1E1F26', color: '#E6E7EA', border: '1px solid #2A2B33' },
    });
  };

  // Custom dot renderer for chart
  const renderDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (payload.isBuy) {
      return (
        <g>
          <rect x={cx - 10} y={cy - 10} width={20} height={20} rx={4} fill="#10B981" />
          <text x={cx} y={cy + 5} textAnchor="middle" fill="white" fontSize={12} fontWeight="bold">B</text>
        </g>
      );
    }
    if (payload.isSell) {
      return (
        <g>
          <rect x={cx - 10} y={cy - 10} width={20} height={20} rx={4} fill="#EF4444" />
          <text x={cx} y={cy + 5} textAnchor="middle" fill="white" fontSize={12} fontWeight="bold">S</text>
        </g>
      );
    }
    return null;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length > 0) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#1E1F26] border border-[#2A2B33] px-3 py-2 rounded-lg shadow-lg">
          <p className="text-xs text-[#9CA3AF]">{data.time}</p>
          <p className="text-sm text-white font-semibold">MC: {formatUsd(data.marketCap)}</p>
        </div>
      );
    }
    return null;
  };

  // Calculate total spent in native currency (MON/SOL)
  const totalBoughtNative = buyTrades.reduce((sum, t) => sum + getNativeAmount(t), 0);
  const totalSoldNative = sellTrades.reduce((sum, t) => sum + getNativeAmount(t), 0);
  const gasRate = isMonad ? 0.0001 : 0.001;
  const estimateGasCost = (nativeAmount: number) => {
    if (!nativeAmount || nativeAmount <= 0) return 0;
    return nativeAmount * gasRate;
  };
  const totalGasSpentNative = sortedTrades.reduce(
    (sum, trade) => sum + estimateGasCost(getNativeAmount(trade)),
    0
  );
  const totalTxCount = sortedTrades.length;
  const netNativeFlow = totalSoldNative - totalBoughtNative;
  const lastTradeEvent = sortedTrades[0];
  const lastTradeAge = lastTradeEvent
    ? formatAge(lastTradeEvent.createdAt || lastTradeEvent.tradeTime)
    : '--';

  const walletBalanceFromContext =
    normalizedResolvedWalletAddress && normalizedResolvedWalletAddress.length > 0
      ? walletBalances[normalizedResolvedWalletAddress] ||
        walletBalances[normalizedResolvedWalletAddress.toLowerCase()]
      : undefined;

  const walletBalanceValue =
    typeof walletBalanceFromContext === 'number'
      ? walletBalanceFromContext
      : fallbackWalletBalance;

  const walletDisplayName =
    (linkedWallet as any)?.label ||
    (tradeWalletAddress ? 'Trade wallet' : primaryWallet?.label || 'Wallet');

  const truncatedWalletAddress = truncateAddress(resolvedWalletAddress);
  const walletExplorerUrl = resolvedWalletAddress
    ? isMonad
      ? `https://monadvision.com/address/${normalizeMonadAddress(resolvedWalletAddress)}`
      : `https://solscan.io/address/${resolvedWalletAddress}`
    : null;
  const walletBalanceDisplay = Number.isFinite(walletBalanceValue) ? walletBalanceValue : 0;
  const buySellSummary = `${buyTrades.length} buys / ${sellTrades.length} sells`;
  const avgEntryDisplay = formatUsd(avgBuyPrice);
  const avgExitDisplay = sold > 0 ? formatUsd(avgSellPrice) : '—';
  const realizedPnlDisplay = `${formatUsd(realizedPnl)} (${realizedPnlPercentage.toFixed(2)}%)`;
  const netNativeFlowDisplay = `${netNativeFlow >= 0 ? '+' : '-'}${formatSmartNumber(
    Math.abs(netNativeFlow)
  )} ${currency}`;
  const estGasDisplay = `${formatSmartNumber(totalGasSpentNative)} ${currency}`;
  const lastActivityDisplay = lastTradeAge && lastTradeAge !== '--' ? `${lastTradeAge} ago` : '--';
  const avgMcDisplay = `$${formatMarketCap(avgBuyMcForDisplay)}/${
    avgSellMcForDisplay > 0 ? `$${formatMarketCap(avgSellMcForDisplay)}` : '$0.0000'
  }`;
  const watchlistKey = position.pairAddress || position.tokenAddress || '';
  const isWatched = watchlistKey ? isInWatchlist(watchlistKey) : false;
  const watchlistTokenPayload: Token | null = watchlistKey
    ? {
        pair_address: position.pairAddress || position.tokenAddress,
        mint: position.tokenAddress,
        name: displayName,
        symbol: displaySymbol,
        logo: displayImage,
        market_cap_usd: fallbackMarketCapValue,
      } as Token
    : null;

  const toggleWatchlist = () => {
    if (!watchlistKey || !watchlistTokenPayload) return;
    if (isWatched) {
      removeFromWatchlist(watchlistKey);
      toast.success('Removed from watchlist');
    } else {
      addToWatchlist(watchlistTokenPayload);
      toast.success('Added to watchlist');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ zIndex: 140 }}
        onClick={onClose}
      />

      {/* Slide-in Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-[520px] bg-[#0A0B0D] shadow-2xl transition-transform duration-300 ease-out overflow-y-auto ${
          isVisible ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ zIndex: 141 }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#0A0B0D] px-4 pt-4 pb-3 z-10">
          <div className="flex items-start justify-between">
            {/* Left: Token info */}
            <div className="flex items-center gap-3">
              {/* Watchlist star */}
              <button
                onClick={toggleWatchlist}
                className={`transition-colors ${isWatched ? 'text-yellow-300' : 'text-[#9CA3AF] hover:text-yellow-400'}`}
                title={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill={isWatched ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </button>

              {/* Token image - circle, no border */}
              {displayImage ? (
                <img
                  src={displayImage}
                  alt={displayName}
                  className="w-10 h-10 rounded-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm">
                  {displaySymbol.slice(0, 2)}
                </div>
              )}

              {/* Token name and price */}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold text-base">{displayName}</span>
                  <span className="text-[#9CA3AF] text-sm">
                    {formatUsd(currentPrice || avgBuyPrice)}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  {isMonad && (
                    <img
                      src="https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg"
                      alt="Monad"
                      className="w-3.5 h-3.5 rounded-full"
                    />
                  )}
                  <span className="text-[#9CA3AF] text-xs">MCP ${formatMarketCap(fallbackMarketCapValue || avgBuyMC)}</span>
                </div>
              </div>
            </div>

            {/* Right: Timeframe buttons and close */}
            <div className="flex items-center gap-2">
              <div className="flex bg-[#1E1F26] rounded-lg p-0.5">
                {['4h', '1d', '30d'].map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setSelectedTimeframe(tf)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      selectedTimeframe === tf
                        ? 'bg-[#2A2B33] text-white'
                        : 'text-[#9CA3AF] hover:text-white'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-[#1E1F26] rounded-lg transition-colors text-[#9CA3AF] hover:text-white ml-2"
              >
                <FaTimes size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Chart Section */}
        <div className="px-4 pb-3">
          <div className="bg-[#0A0B0D] rounded-lg">
            {loadingChart ? (
              <div className="h-[180px] flex items-center justify-center text-[#9CA3AF] text-sm">
                Loading chart...
              </div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData} margin={{ top: 20, right: 50, left: 0, bottom: 5 }}>
                  <XAxis
                    dataKey="time"
                    stroke="#4B5563"
                    style={{ fontSize: '10px' }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="#4B5563"
                    style={{ fontSize: '10px' }}
                    tickLine={false}
                    axisLine={false}
                    domain={['auto', 'auto']}
                    tickFormatter={(val) => `$${formatMarketCap(val)}`}
                    orientation="right"
                    width={45}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  {/* Average buy price reference line - yellow/cream dashed */}
                  <ReferenceLine
                    y={avgBuyMcForDisplay}
                    stroke="#FCD34D"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    label={{
                      value: `Avg Bought MC: $${formatMarketCap(avgBuyMcForDisplay)}`,
                      position: 'right',
                      fill: '#FCD34D',
                      fontSize: 10,
                      offset: 10,
                    }}
                  />
                  {/* Market cap line - pink/coral color */}
                  <Line
                    type="monotone"
                    dataKey="marketCap"
                    stroke="#F472B6"
                    strokeWidth={2}
                    dot={renderDot}
                    activeDot={{ r: 4, fill: '#F472B6' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-[#9CA3AF] text-sm">
                No chart data available
              </div>
            )}
          </div>
        </div>

        {/* Wallet Selector */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-3 bg-[#101115] border border-[#1E1F26] rounded-2xl px-3 py-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#16171D]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2">
                <rect x="2" y="6" width="20" height="14" rx="2"/>
                <path d="M2 10h20"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-[#9CA3AF]">{walletDisplayName}</p>
              <div className="flex items-center gap-2 text-white font-mono text-xs mt-0.5">
                <span className="truncate">{truncatedWalletAddress || '----'}</span>
                {resolvedWalletAddress && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(resolvedWalletAddress);
                      }}
                      className="text-[#9CA3AF] hover:text-white transition-colors"
                      title="Copy wallet address"
                    >
                      <FaRegCopy size={12} />
                    </button>
                    {walletExplorerUrl && (
                      <a
                        href={walletExplorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#9CA3AF] hover:text-white transition-colors"
                        title="View on explorer"
                      >
                        <FaExternalLinkAlt size={10} />
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isMonad && (
                <img
                  src="https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg"
                  alt="Monad"
                  className="w-4 h-4 rounded-full"
                />
              )}
              <div className="text-right">
                <p className="text-white text-sm font-semibold">
                  {walletBalanceDisplay.toFixed(walletBalanceDisplay >= 1 ? 2 : 4)} {currency}
                </p>
                <p className="text-[11px] text-[#9CA3AF]">Balance</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="px-4 pb-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {/* Total Profit */}
            <div>
              <p className="text-[#9CA3AF] text-xs mb-1">Total Profit</p>
              <div className="flex items-center gap-1.5">
                <span className={`text-sm font-semibold ${totalPnl >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                  {formatUsd(totalPnl)} ({totalPnlPercentage.toFixed(2)}%)
                </span>
                <a
                  href={isMonad
                    ? `https://monadvision.com/token/${position.tokenAddress}`
                    : `https://solscan.io/token/${position.tokenAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#9CA3AF] hover:text-white"
                >
                  <FaExternalLinkAlt size={10} />
                </a>
              </div>
            </div>

            {/* Unrealized */}
            <div>
              <p className="text-[#9CA3AF] text-xs mb-1">Unrealized</p>
              <span className={`text-sm font-semibold ${unrealizedPnl >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                {formatUsd(unrealizedPnl)} ({unrealizedPnlPercentage.toFixed(2)}%)
              </span>
            </div>

            {/* Balance */}
            <div>
              <p className="text-[#9CA3AF] text-xs mb-1">Balance</p>
              <span className="text-sm text-white font-semibold">{formatUsd(remainingUsdValue)}</span>
            </div>

            {/* Position % */}
            <div>
              <p className="text-[#9CA3AF] text-xs mb-1">Position%({formatSmartNumber(remaining)} of {formatSmartNumber(bought)})</p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-white font-semibold">{positionPercentage.toFixed(0)}%</span>
                <div className="flex-1 h-1.5 bg-[#2A2B33] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full"
                    style={{ width: `${Math.min(positionPercentage, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Holding Duration */}
            <div>
              <p className="text-[#9CA3AF] text-xs mb-1">Holding Duration</p>
              <span className="text-sm text-white font-semibold">{formatDuration(holdingDuration)}</span>
            </div>

            {/* Avg MC B/S */}
            <div>
              <p className="text-[#9CA3AF] text-xs mb-1">Avg MC B/S</p>
              <span className="text-sm text-white font-semibold">{avgMcDisplay}</span>
            </div>

            {/* Bought */}
            <div>
              <p className="text-[#9CA3AF] text-xs mb-1">Bought</p>
              <p className="text-sm">
                <span className="text-[#10B981]">{formatUsd(boughtUsdValue)}</span>
                <span className="text-[#9CA3AF]"> / </span>
                <span className="text-[#10B981]">{buyTrades.length} TXs</span>
              </p>
              <p className="text-xs text-[#10B981]">{formatSmartNumber(bought)}</p>
            </div>

            {/* Sold */}
            <div>
              <p className="text-[#9CA3AF] text-xs mb-1">Sold</p>
              <p className="text-sm">
                <span className="text-[#10B981]">{formatUsd(soldUsdValue)}</span>
                <span className="text-[#9CA3AF]"> / </span>
                <span className="text-[#10B981]">{sellTrades.length} TXs</span>
              </p>
              <p className="text-xs text-[#10B981]">{formatSmartNumber(sold)}</p>
            </div>
          </div>
        </div>

        {/* Deep Dive Stats */}
        <div className="px-4 pb-4">
          <div className="bg-[#0F1012] border border-[#1E1F26] rounded-lg p-4 grid grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <p className="text-[11px] text-[#9CA3AF] uppercase">Avg Entry</p>
              <p className="text-white text-sm font-semibold">{avgEntryDisplay}</p>
            </div>
            <div>
              <p className="text-[11px] text-[#9CA3AF] uppercase">Avg Exit</p>
              <p className="text-white text-sm font-semibold">{avgExitDisplay}</p>
            </div>
            <div>
              <p className="text-[11px] text-[#9CA3AF] uppercase">Cost Basis</p>
              <p className="text-white text-sm font-semibold">{formatUsd(boughtUsdValue)}</p>
            </div>
            <div>
              <p className="text-[11px] text-[#9CA3AF] uppercase">Current Value</p>
              <p className="text-white text-sm font-semibold">{formatUsd(remainingUsdValue)}</p>
            </div>
            <div>
              <p className="text-[11px] text-[#9CA3AF] uppercase">Realized PnL</p>
              <p className={`text-sm font-semibold ${realizedPnl >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                {realizedPnlDisplay}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#9CA3AF] uppercase">Net Native Flow</p>
              <p className="text-white text-sm font-semibold">{netNativeFlowDisplay}</p>
              <p className="text-[11px] text-[#9CA3AF]">Gas est. {estGasDisplay}</p>
            </div>
            <div>
              <p className="text-[11px] text-[#9CA3AF] uppercase">Trades</p>
              <p className="text-white text-sm font-semibold">{totalTxCount || 0} txs</p>
              <p className="text-[11px] text-[#9CA3AF]">{buySellSummary}</p>
            </div>
            <div>
              <p className="text-[11px] text-[#9CA3AF] uppercase">Last Activity</p>
              <p className="text-white text-sm font-semibold">{lastActivityDisplay}</p>
            </div>
          </div>
        </div>

        {/* Candlestick Charts Button */}
        <div className="px-4 pb-4">
          <button
            onClick={handleViewChart}
            className="w-full bg-[#1E1F26] hover:bg-[#2A2B33] text-white text-sm font-medium py-3 px-4 rounded-lg transition-colors border border-[#2A2B33]"
          >
            Candlestick Charts
          </button>
        </div>

        {/* Transaction History Table */}
        <div className="px-4 pb-6">
          {loadingTrades ? (
            <div className="bg-[#0F1012] rounded-lg border border-[#1E1F26] p-8 text-center">
              <p className="text-[#9CA3AF] text-sm">Loading transactions...</p>
            </div>
          ) : trades.length > 0 ? (
            <div className="rounded-lg overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-6 gap-2 px-3 py-2 border-b border-[#1E1F26] text-[10px] text-[#9CA3AF]">
                <div className="flex items-center gap-1">
                  Type
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 10l5 5 5-5z"/>
                  </svg>
                </div>
                <div className="flex items-center gap-1">
                  MC
                  <FaSortAmountDown size={8} />
                </div>
                <div>Amount</div>
                <div>Total</div>
                <div className="flex items-center gap-1">
                  {currency}
                  {isMonad && (
                    <img
                      src="https://pbs.twimg.com/profile_images/1749618187489206272/rDaFjEhN_400x400.jpg"
                      alt="Monad"
                      className="w-3 h-3 rounded-full"
                    />
                  )}
                </div>
                <div className="flex items-center gap-1">
                  Time
                  <FaClock size={8} />
                </div>
              </div>

              {/* Table Rows */}
              {enrichedTrades.map(({ trade, marketCapValue }, idx) => {
                const amount = toNum(trade.tokenAmount);
                const nativeAmount = getNativeAmount(trade);
                const usdValue = toNum(trade.usdValue);
                const tradeWallet = extractTradeWalletAddress(trade);
                const normalizedTradeWallet = normalizeAddressForLookup(tradeWallet);
                const walletMeta =
                  normalizedTradeWallet &&
                  (walletMetadataMap.get(normalizedTradeWallet) ||
                    walletMetadataMap.get(normalizedTradeWallet.toLowerCase()));
                const walletLabel = walletMeta?.label;
                const walletBadge = tradeWallet ? truncateAddress(tradeWallet, 3) : '—';
                const explorerUrl = trade.transactionHash
                  ? isMonad
                    ? `https://monadvision.com/tx/${trade.transactionHash}`
                    : `https://solscan.io/tx/${trade.transactionHash}`
                  : null;

                return (
                  <div
                    key={trade.transactionHash || trade.id || idx}
                    className="grid grid-cols-6 gap-2 px-3 py-2.5 border-b border-[#1E1F26]/50 last:border-b-0 text-xs items-center"
                  >
                    <div>
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                          trade.type === 'Buy'
                            ? 'bg-[#10B981]/20 text-[#10B981]'
                            : 'bg-[#EF4444]/20 text-[#EF4444]'
                        }`}
                      >
                        {trade.type}
                      </span>
                      {(walletLabel || tradeWallet) && (
                        <div className="text-[10px] text-[#9CA3AF] mt-1">
                          {walletLabel ? `${walletLabel} • ${walletBadge}` : walletBadge}
                        </div>
                      )}
                    </div>
                    <div className="text-white">${formatMarketCap(marketCapValue)}</div>
                    <div className="text-white">{formatSmartNumber(amount)}</div>
                    <div className="text-white">{formatUsd(usdValue)}</div>
                    <div className="text-white">
                      {formatNativeAmount(nativeAmount)} {currency}
                    </div>
                    <div className="flex items-center gap-1 text-[#9CA3AF]">
                      <span>{formatAge(trade.createdAt)}</span>
                      {explorerUrl && (
                        <a
                          href={explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#9CA3AF] hover:text-white"
                        >
                          <FaExternalLinkAlt size={9} />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-[#0F1012] rounded-lg border border-[#1E1F26] p-8 text-center">
              <p className="text-[#9CA3AF] text-sm">No transactions found</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
