import React, { useEffect, useState, useCallback } from 'react';
import { FaStar, FaRegStar } from 'react-icons/fa';
import { FaTrashAlt } from 'react-icons/fa';
import { User, Globe, Search, Copy } from "lucide-react";
import { HiLightningBolt } from "react-icons/hi";
import FastImage from "./FastImage";
import type { Token } from "../utils/db";
import InterstatePopout from './InterstatePopout';
import InterstateButton from './InterstateButton';
import { useWatchlist } from './WatchlistContext';
import { formatSmartNumber, formatMarketCap } from '../utils/db';
import { useRouter } from 'next/router';
import { copyToClipboard } from '~/utils/clipboard';
import { SolanaIcon } from './Footer';
import { useUser } from './UserContext';
import { useQuickBuy } from './QuickBuyContext';
import { tradeBuy, SOL_MINT_ADDRESS, ApiError } from '../utils/api';
import { getPoolTypeFromToken } from '../utils/poolTypeDetection';
import { showTransactionPendingToast, startTransactionToastTimeout, updateTransactionToast } from '~/utils/toast';

interface WatchlistModalProps {
  open: boolean;
  onClose: () => void;
}

const AX = {
  surface: "#1A1A1A",
  border: "#2A2B33",
  text: "#E6E7EA",
  muted: "#9CA3AF",
  glowCyan: "rgba(6, 182, 212, 0.3)",
};

const DEFAULT_PROTOCOL_COLOR = "#22c55e";
const DEFAULT_PROTOCOL_ICON = "https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png";

const normalizeKey = (s?: string) => (s || "").toLowerCase().replace(/\s+/g, "").replace(/_/g, "");

const rawProtocolColorMap: Record<string, string> = {
  pump: DEFAULT_PROTOCOL_COLOR,
  "pump.fun": DEFAULT_PROTOCOL_COLOR,
  bonk: "#ff6b35",
  bags: DEFAULT_PROTOCOL_COLOR,
  moonshot: "#eab308",
  moonshoot: "#eab308",
  moonit: "#eab308",
  heaven: "#8b5cf6",
  "daos.fun": "#06b6d4",
  candle: "#f59e0b",
  sugar: "#ec4899",
  believe: "#10b981",
  jupiter: "#8b5cf6",
  boop: "#134577",
  boopfun: "#134577",
  launchlab: "#3b82f6",
  dynamic: "#526fff",
  raydium: "#5c51f7",
  raydiumlaunchpad: "#5c51f7",
  meteora: "#ff4662",
  "meteora_v2": "#ff4662",
  pump_amm: "#e9ba14",
  orca: "#0ea5e9",
};

const normalizedProtocolColorMap: Record<string, string> = Object.fromEntries(
  Object.entries(rawProtocolColorMap).map(([key, value]) => [normalizeKey(key), value])
);

function extractProtocolRaw(token: Token | null): string | null {
  if (!token) return null;
  const candidates = [
    (token as any).launchpad_protocol,
    (token as any).protocol,
    (token as any).launchpadName,
    (token as any).amm,
  ];
  for (const candidate of candidates) {
    if (candidate == null) continue;
    const value = String(candidate).toLowerCase().trim();
    if (value) return value;
  }
  return null;
}

function shouldFillProtocolBadge(token: Token): boolean {
  const raw = extractProtocolRaw(token) || "";
  return ["meteora", "bonk", "bags", "moonit", "moonshot", "moonshoot"].some((needle) => raw.includes(needle));
}

function resolveProtocolColor(token: Token): string {
  const raw = extractProtocolRaw(token);
  if (!raw) return DEFAULT_PROTOCOL_COLOR;
  if (raw.includes("meteora")) return "#ff4662";
  if (raw.includes("pump")) return DEFAULT_PROTOCOL_COLOR;
  if (raw.includes("launch")) return "#3b82f6";
  const normalized = normalizeKey(raw);
  if (rawProtocolColorMap[raw]) return rawProtocolColorMap[raw];
  if (normalizedProtocolColorMap[normalized]) return normalizedProtocolColorMap[normalized];
  if (raw.includes("raydium")) return "#5c51f7";
  if (raw.includes("moonit") || raw.includes("moonshot") || raw.includes("moonshoot")) return "#eab308";
  if (raw.includes("boop")) return "#134577";
  if (raw.includes("bonk")) return "#ff6b35";
  if (raw.includes("bags")) return DEFAULT_PROTOCOL_COLOR;
  if (raw.includes("orca")) return "#0ea5e9";
  if (raw.includes("jupiter")) return "#8b5cf6";
  return DEFAULT_PROTOCOL_COLOR;
}

function resolveProtocolIcon(token: Token): string {
  const raw = extractProtocolRaw(token);
  if (!raw) return DEFAULT_PROTOCOL_ICON;
  if (raw.includes("meteora")) {
    return "https://s1.coincarp.com/logo/1/meteora.png?style=72&v=1759911013";
  }
  if (raw.includes("raydium") || raw.includes("launch")) {
    return "https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png";
  }
  if (raw.includes("boop")) {
    return "https://api.phantom.app/image-proxy/?image=https%3A%2F%2Fdhc7eusqrdwa0.cloudfront.net%2Fassets%2FBOOP_logo_icon_dark_bg.png&anim=true";
  }
  if (raw.includes("moonit") || raw.includes("moonshot") || raw.includes("moonshoot")) {
    return "https://avatars.githubusercontent.com/u/174132191?s=280&v=4";
  }
  if (raw.includes("bonk")) {
    return "https://s3.coinmarketcap.com/static-gravity/image/a28128d9ff7c49c9ad33ee2f626fda40.png";
  }
  if (raw.includes("bags")) {
    return "https://play-lh.googleusercontent.com/7AxVcu1pumxavcGTb16WBJQU88CDZd0v8q0WzFwfin7zbBvItYMuNQ0Xkqq4srTw4A=w240-h480-rw";
  }
  if (raw.includes("pump")) return DEFAULT_PROTOCOL_ICON;
  return DEFAULT_PROTOCOL_ICON;
}

function normalizeAssetUrl(raw?: string): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.startsWith("data:")) return s;
  if (s.startsWith("ipfs://")) {
    const cid = s.replace("ipfs://", "").replace(/^ipfs\//, "");
    return `https://cloudflare-ipfs.com/ipfs/${cid}`;
  }
  if (/^ipfs[/:]/i.test(s)) {
    const cid = s.replace(/^ipfs[/:]/i, "");
    return `https://cloudflare-ipfs.com/ipfs/${cid}`;
  }
  if (/^[a-z0-9_-]{40,}$/i.test(s) && !/^https?:\/\//i.test(s)) return `https://arweave.net/${s}`;
  if (s.startsWith("http://")) return s.replace(/^http:\/\//i, "https://");
  if (s.startsWith("https://")) return s;
  return null;
}

function resolveWatchlistVolume1h(token: Token): number {
  const buy = Number((token as any).total_buy_volume_1h) || 0;
  const sell = Number((token as any).total_sell_volume_1h) || 0;
  if (buy || sell) return buy + sell;
  const direct =
    (token as any).volume_1h ??
    (token as any).volume1h ??
    (token as any).volume60m ??
    (token as any).volume_60m ??
    0;
  if (direct) return Number(direct) || 0;
  const fallback =
    (token as any).total_volume_1h ??
    (token as any).buy_volume_1h ??
    (token as any).volume_24h ??
    0;
  return Number(fallback) || 0;
}

function resolveWatchlistStats(token: Token) {
  const marketCap =
    (token as any).market_cap_usd ??
    (token as any).marketCapUSD ??
    (token as any).fully_diluted_value ??
    0;
  const liquidity =
    (token as any).total_liquidity_usd ??
    (token as any).liquidity_usd ??
    (token as any).liquidityUsd ??
    0;
  const volume1h = resolveWatchlistVolume1h(token);
  const price = (token as any).usd_price ?? (token as any).price ?? 0;
  const priceChange1h = (token as any).price_percent_change_1h ?? (token as any).price_change_1h ?? 0;

  return { marketCap, liquidity, volume1h, price, priceChange1h };
}

// SubscriptNumber component for price display
const SubscriptNumber: React.FC<{ value: number | string | null | undefined; className?: string }> = ({ value, className }) => {
  const MAX_ZEROES = 2;

  const toNumber = (val: number | string | null | undefined): number | null => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const cleaned = val.replace(/[$,\s]/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  };

  const formatNumber = (num: number) => {
    const numStr = num.toFixed(20);
    const [integerPart, decimalPart = ''] = numStr.split('.');
    const leadingZeros = decimalPart.match(/^0*/)?.[0] || '';
    const originalZeroCount = leadingZeros.length;
    const zeroCount = Math.max(0, originalZeroCount - 1);
    const sigDigitsStart = leadingZeros.length;

    const firstDigit = decimalPart[sigDigitsStart] || '0';
    const secondDigit = decimalPart[sigDigitsStart + 1] || '0';
    const roundingDigit = decimalPart[sigDigitsStart + 2] || '0';

    const roundedSecondDigit = parseInt(roundingDigit) >= 5
      ? (parseInt(secondDigit) + 1).toString()
      : secondDigit;

    let finalDigits;
    if (roundedSecondDigit === '10') {
      finalDigits = (parseInt(firstDigit) + 1).toString() + '0';
    } else {
      finalDigits = firstDigit + roundedSecondDigit;
    }

    if (originalZeroCount > MAX_ZEROES) {
      return (
        <span className={className}>
          0.0<sub>{zeroCount}</sub>{finalDigits}
        </span>
      );
    } else if (originalZeroCount > 0) {
      const zeros = '0'.repeat(originalZeroCount);
      return (
        <span className={className}>
          0.{zeros}{finalDigits}
        </span>
      );
    } else {
      return (
        <span className={className}>
          {integerPart}.{decimalPart.substring(0, 2)}
        </span>
      );
    }
  };

  const num = toNumber(value);
  if (num === null || !isFinite(num)) {
    return <span className={className}>-</span>;
  }
  if (num === 0) {
    return <span className={className}>0.00</span>;
  }

  return formatNumber(num);
};

// Helper to get quickBuyAmount from localStorage
const getQuickBuyAmount = (): number => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('quickBuyAmount');
    if (saved) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
  }
  return 0;
};

export default function WatchlistModal({ open, onClose }: WatchlistModalProps) {
  const [show, setShow] = useState(false);
  const { watchlist, removeFromWatchlist } = useWatchlist();
  const router = useRouter();
  const { user } = useUser();
  const { presets, activePreset } = useQuickBuy();
  const [quickBuyAmount, setQuickBuyAmountState] = useState(getQuickBuyAmount);
  
  // Keep quickBuyAmount in sync with localStorage
  useEffect(() => {
    setQuickBuyAmountState(getQuickBuyAmount());
  }, [open]);

  useEffect(() => {
    if (open) {
      setShow(true);
    } else {
      const timeout = setTimeout(() => setShow(false), 220);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  if (!open && !show) return null;

  const handleTokenClick = (tokenAddress: string) => {
    if (!tokenAddress) return;
    router.push(`/trade/${tokenAddress}`);
    onClose();
  };

  const handleQuickBuy = async (token: Token, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!user) {
      console.log("❌ No user found for quick buy");
      return;
    }
    
    let pendingToastId: string | null = null;
    let clearToastTimeout = () => undefined;
    
    try {
      const poolType = getPoolTypeFromToken(token);
      const effectivePoolAddress = (token as any).migrated_pool_address || token.pair_address;
      console.log(`🔍 Watchlist Quick Buy ${token.symbol} - Protocol: ${(token as any).launchpad_protocol || (token as any).protocol || 'unknown'} → PoolType: ${poolType}`);
      
      const settings = presets[activePreset].quickBuySettings;
      
      // Show pending toast
      pendingToastId = showTransactionPendingToast("Attempting transaction...");
      clearToastTimeout = startTransactionToastTimeout(pendingToastId);
      
      const data = await tradeBuy({
        poolAddress: effectivePoolAddress,
        baseMint: (token as any).mint || '',
        quoteMint: SOL_MINT_ADDRESS,
        amount: quickBuyAmount,
        mevProtection: settings.mevMode === "off" ? 0 : 1,
        poolType: poolType,
        originalPairAddress: token.pair_address,
        slippage: settings.maxSlippage || 0.4,
        priorityFee: settings.priority || 0.0001,
        bribe: settings.bribe || 0,
        mevMode: settings.mevMode,
        autoFee: settings.autoFee || false,
        maxFee: settings.maxFee || 0,
        rpc: settings.rpc,
        tokenName: token.name,
        tokenSymbol: token.symbol,
      }, user.bearerToken);
      
      const txHash = data?.hash || data?.txid;
      const tokenAmount = data?.amount || data?.tokenAmount;

      if (data && txHash) {
        console.log(`✅ Watchlist Quick Buy successful! Hash: ${txHash}`);
        clearToastTimeout();
        updateTransactionToast(
          pendingToastId,
          "success",
          `✅ Quick Buy successful! Bought ${tokenAmount || 'tokens'} ${token.symbol}. Tx: ${txHash.slice(0, 8)}...`
        );
      } else {
        console.log('❌ Quick Buy failed - no transaction hash returned');
        clearToastTimeout();
        updateTransactionToast(pendingToastId, "error", "❌ Quick Buy failed - no transaction hash returned");
      }
    } catch (e: any) {
      console.error('Watchlist Quick Buy error:', e);
      clearToastTimeout();
      
      if (e instanceof ApiError) {
        if (e.code === 'NO_ACTIVE_POOL') {
          updateTransactionToast(pendingToastId, "error", `⚠️ Pool unavailable for ${token.symbol}`);
        } else if (e.code === 'INSUFFICIENT_BALANCE') {
          updateTransactionToast(pendingToastId, "error", `⚠️ Insufficient balance`);
        } else if (e.code === 'TX_FAILED') {
          updateTransactionToast(pendingToastId, "error", `❌ Trade failed. Try adjusting slippage or amount.`);
        } else {
          const msg = e.message.length > 80 ? e.message.substring(0, 77) + '...' : e.message;
          updateTransactionToast(pendingToastId, "error", `❌ ${msg}`);
        }
      } else {
        let errorMsg = e.message || "Unknown error";
        const msg = errorMsg.length > 80 ? errorMsg.substring(0, 77) + '...' : errorMsg;
        updateTransactionToast(pendingToastId, "error", `❌ ${msg}`);
      }
    }
  };

  return (
    <InterstatePopout open={open} onClose={onClose} align="center" zIndex={9999} className="bg-neutral-900 rounded-xl shadow-2xl w-full max-w-5xl p-6 relative text-neutral-100">
      <InterstateButton variant="icon" size="sm" onClick={onClose} className="absolute top-3 right-3 text-xl"><span>×</span></InterstateButton>
      <div className="text-lg font-bold mb-4">Watchlist</div>
      <div className="w-full overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr style={{ backgroundColor: 'transparent', borderBottom: `1px solid ${AX.border}` }}>
              <th className="w-72 px-4 py-3 text-left text-xs font-medium tracking-wide uppercase" style={{ color: '#787a8d', fontWeight: '300' }}>Token</th>
              <th className="w-28 px-4 py-3 text-right text-xs font-medium tracking-wide uppercase" style={{ color: '#787a8d', fontWeight: '300' }}>1h Vol</th>
              <th className="w-20 px-4 py-3 text-right text-xs font-medium tracking-wide uppercase" style={{ color: '#787a8d', fontWeight: '300' }}>1h%</th>
              <th className="w-36 px-4 py-3 text-right text-xs font-medium tracking-wide uppercase" style={{ color: '#787a8d', fontWeight: '300' }}>MKT Cap / Liq</th>
              <th className="w-28 px-4 py-3 text-right text-xs font-medium tracking-wide uppercase" style={{ color: '#787a8d', fontWeight: '300' }}>Price</th>
              <th className="w-28 px-4 py-3 text-center text-xs font-medium tracking-wide uppercase" style={{ color: '#787a8d', fontWeight: '300' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {watchlist.map((token, idx) => {
              const tokenKey = token.pair_address || (token as any).mint || token.symbol;
              const protocolColor = resolveProtocolColor(token);
              const tokenIcon = resolveProtocolIcon(token);
              const fillProtocolBadge = shouldFillProtocolBadge(token);
              const rawImg = (token as any).uri || (token as any).image || (token as any).logo;
              const imgSrc = normalizeAssetUrl(rawImg);
              const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                token.symbol || token.name || "T"
              )}&background=0f1012&color=E6E7EA&size=48`;
              const { marketCap, liquidity, volume1h, price, priceChange1h } = resolveWatchlistStats(token);
              const tokenAddress = token.pair_address || (token as any).mint || '';

              return (
                <tr 
                  key={tokenKey} 
                  className="cursor-pointer"
                  style={{ 
                    borderBottom: `1px solid ${AX.border}`,
                    backgroundColor: idx % 2 === 0 ? '#111214' : '#15161a'
                  }}
                  onMouseEnter={(e) => { 
                    e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#1a1b1f' : '#1c1d22';
                  }}
                  onMouseLeave={(e) => { 
                    e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#111214' : '#15161a';
                  }}
                  onClick={() => handleTokenClick(tokenAddress)}
                >
                  {/* Token Column */}
                  <td className="w-72 px-4 py-3 align-middle">
                    <div className="flex items-center gap-2">
                      {/* Star icon */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromWatchlist(tokenAddress);
                        }}
                        className="flex items-center justify-center transition-colors duration-200 cursor-pointer hover:opacity-80"
                        style={{ color: '#f2c367' }}
                        title="Remove from watchlist"
                      >
                        <FaStar className="w-4 h-4" />
                      </button>
                      
                      {/* Token avatar */}
                      <div className="relative h-10 w-10 flex items-center justify-center">
                        <div className="relative rounded-full overflow-hidden" style={{ width: '40px', height: '40px' }}>
                          <FastImage
                            src={imgSrc ?? undefined}
                            fallbackSrc={fallbackAvatar}
                            alt={token.name || token.symbol || ""}
                            width={40}
                            height={40}
                            className="w-full h-full object-cover rounded-full"
                            symbol={token.symbol}
                            name={token.name}
                            showBubble={false}
                          />
                        </div>
                        {/* Solana logo bubble */}
                        <div className="absolute bottom-0 right-0 bg-white rounded-full flex items-center justify-center transform translate-x-1/2 translate-y-1/2 z-10"
                             style={{ width: 14, height: 14, padding: '1px' }}>
                          <SolanaIcon size={12} />
                        </div>
                      </div>
                      
                      {/* Token name and symbol */}
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="truncate text-sm font-bold" style={{ color: AX.text }}>
                            {token.name}
                          </span>
                          {/* Copy contract button */}
                          <button
                            className="transition-colors duration-200 cursor-pointer hover:opacity-80"
                            style={{ color: AX.muted }}
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard((token as any).mint || tokenAddress, "Contract address copied!");
                            }}
                            title="Copy contract address"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          {/* Search icon */}
                          <button
                            className="transition-colors duration-200 cursor-pointer"
                            style={{ color: AX.muted }}
                            onClick={(e) => {
                              e.stopPropagation();
                              const searchQuery = `${token.symbol} ${token.name}`.trim();
                              const twitterUrl = `https://twitter.com/search?q=${encodeURIComponent(searchQuery)}`;
                              window.open(twitterUrl, '_blank');
                            }}
                            title="Search on Twitter"
                          >
                            <Search className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="truncate text-xs" style={{ color: AX.muted }}>
                          {token.symbol}
                        </span>
                      </div>
                    </div>
                  </td>
                  
                  {/* 1h Vol Column */}
                  <td className="w-28 px-4 py-3 align-middle text-right">
                    <div className="text-sm font-medium" style={{ color: AX.text }}>
                      ${formatSmartNumber(volume1h)}
                    </div>
                  </td>
                  
                  {/* 1h% Column */}
                  <td className="w-20 px-4 py-3 align-middle text-right">
                    <div className="text-sm font-medium" style={{ color: priceChange1h >= 0 ? '#85d99f' : '#f26681' }}>
                      {priceChange1h >= 0 ? '+' : ''}{formatSmartNumber(Math.abs(priceChange1h))}%
                    </div>
                  </td>
                  
                  {/* MKT Cap / Liq Column */}
                  <td className="w-36 px-4 py-3 align-middle text-right">
                    <div className="text-sm font-semibold" style={{ color: AX.text }}>
                      ${formatMarketCap(marketCap)}
                    </div>
                    <div className="text-xs" style={{ color: AX.muted }}>
                      ${formatSmartNumber(liquidity)}
                    </div>
                  </td>
                  
                  {/* Price Column */}
                  <td className="w-28 px-4 py-3 align-middle text-right">
                    <div className="text-sm font-medium" style={{ color: AX.text }}>
                      $<SubscriptNumber value={price} />
                    </div>
                  </td>
                  
                  {/* Action Column */}
                  <td className="w-28 px-4 py-3 align-middle text-center">
                    <button
                      onClick={(e) => handleQuickBuy(token, e)}
                      className="flex items-center justify-center gap-1.5 text-xs font-medium transition-all duration-200 cursor-pointer mx-auto"
                      style={{
                        backgroundColor: '#272a2e',
                        color: '#85d99f',
                        padding: '8px 12px',
                        borderRadius: '4px',
                        minHeight: '32px',
                        width: 'auto'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#2f3238';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#272a2e';
                      }}
                    >
                      <HiLightningBolt size={14} style={{ color: '#85d99f' }} />
                      <span>Buy</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {watchlist.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <FaRegStar className="text-4xl text-neutral-500 mb-4" />
            <div className="text-lg font-semibold mb-2">Your watchlist is empty</div>
            <div className="text-neutral-400 text-sm text-center max-w-xs">
              Add tokens to your watchlist by clicking the star icon on any token page
            </div>
          </div>
        )}
      </div>
    </InterstatePopout>
  );
} 