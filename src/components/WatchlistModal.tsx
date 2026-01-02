import React, { useEffect, useMemo, useState } from 'react';
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
import { executeEnhancedTrade } from '~/utils/enhancedTradeHandler';
import toast from 'react-hot-toast';
import { tradeMonadBuy } from '~/utils/api';
import { executeMonadMultiBuy, formatMonadTxSummary, buildMonadWalletAllocations } from '~/utils/monadWalletAllocation';
import { validateMonadBalance } from '~/utils/tradeBalanceValidation';
import { broadcastMonadQuickTrade } from '~/utils/monadTradeEvents';
import { extractTokenImage } from '~/utils/images';
import { FaCheckCircle } from 'react-icons/fa';

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

// Helper to detect if token is Monad (mint address starts with '0x')
const isMonadToken = (token: Token): boolean => {
  const mint = (token as any)?.mint || '';
  return typeof mint === 'string' && mint.startsWith('0x');
};

// Monad Icon Component - uses Monad favicon (same as InterstateTable)
const MonadIcon = ({ size = 12 }: { size?: number }) => (
  <img
    src="https://monad.xyz/favicon.ico"
    alt="Monad"
    width={size}
    height={size}
    style={{ width: size, height: size, objectFit: 'contain' }}
    className="rounded-full"
  />
);

// Helper to get Monad launchpad from token (same logic as MonadTable)
const getMonadLaunchpad = (token: Token): "nadfun" | "flapsh-simple" | "flapsh-devs" => {
  const protocol = ((token as any)?.launchpad_protocol || "").toLowerCase();
  if (protocol.includes("nad.fun") || protocol.includes("nadfun")) {
    return "nadfun";
  } else if (protocol.includes("flap.sh") || protocol.includes("flapsh")) {
    if (protocol.includes("dev")) {
      return "flapsh-devs";
    }
    return "flapsh-simple";
  }
  return "nadfun"; // Default to nadfun
};

// Helper to format Monad errors (same logic as MonadTable)
const formatMonadError = (error: string | undefined | null): string => {
  if (!error) return "Trade failed. Please try again.";
  
  const errorLower = error.toLowerCase();
  
  if (errorLower.includes('err_bonding_curve_library_invalid_inputs') || 
      errorLower.includes('bonding_curve_library_invalid_inputs')) {
    return "This token has no liquidity or has graduated to DEX. Try a different token.";
  }
  
  if (errorLower.includes('insufficient liquidity') || 
      errorLower.includes('expected output is 0') ||
      errorLower.includes('no liquidity')) {
    return "Insufficient liquidity. This token may not be available for trading.";
  }
  
  if (errorLower.includes('token does not exist') || 
      errorLower.includes('token may not exist')) {
    return "Token not found. Please check the token address.";
  }
  
  if (errorLower.includes('token has graduated') || 
      errorLower.includes('graduated to dex')) {
    return "This token has graduated to DEX. Trading on bonding curve is no longer available.";
  }
  
  if (errorLower.includes('insufficient balance') || 
      errorLower.includes('missing')) {
    return "Insufficient balance. Please add more MON to your wallet.";
  }
  
  if (errorLower.includes('locked') || 
      errorLower.includes('cannot be traded')) {
    return "This token is locked and cannot be traded.";
  }
  
  if (errorLower.includes('execution reverted') || 
      errorLower.includes('revert')) {
    return "Transaction failed. The token may not be available or there may be insufficient liquidity.";
  }
  
  if (error.length < 100 && !error.includes('0x') && !error.includes('data:')) {
    return error;
  }
  
  return "Trade failed. Please try again.";
};

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
  const usdVolumeFields = [
    (token as any).volume_1h_usd,
    (token as any).volume1hUsd,
    (token as any).volume1h_usd,
    (token as any).volume_24h_usd, // fallback when 1h is missing
  ];
  for (const v of usdVolumeFields) {
    const num = Number(v);
    if (Number.isFinite(num) && num > 0) return num;
  }

  const buy = Number((token as any).total_buy_volume_1h) || Number((token as any).total_buy_volume_mon) || 0;
  const sell = Number((token as any).total_sell_volume_1h) || Number((token as any).total_sell_volume_mon) || 0;
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
    (token as any).volume_24h_usd ??  // Use volume_24h_usd for Monad tokens
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
  const price =
    (token as any).usd_price ??
    (token as any).price_usd ??
    (token as any).chart_live_price_usd ??
    (token as any).lastPriceUsd ??
    (token as any).priceUsd ??
    (token as any).price ??
    0;
  const priceChange1h =
    (token as any).price_percent_change_1h ??
    (token as any).price_change_1h ??
    (token as any).price_change ??
    (token as any).price_percent_change_24h ??
    (token as any).price_change_24h ??
    0;
  const legacyPrice =
    Number(
      (token as any)?.usd_price ??
      (token as any)?.price ??
      (token as any)?.price_usd ??
      0
    ) || 0;
  const legacyChange =
    Number(
      (token as any)?.price_percent_change_1h ??
      (token as any)?.price_change_1h ??
      0
    ) || 0;
  const finalPrice = price || legacyPrice;
  const finalChange = priceChange1h || legacyChange;

  return { marketCap, liquidity, volume1h, price: finalPrice, priceChange1h: finalChange };
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
  const { watchlist, removeFromWatchlist, refreshWatchlistToken } = useWatchlist();
  const router = useRouter();
  const { user, refreshBalance, chainBalances, walletList, walletBalances, selectedWalletIds } = useUser();
  const { presets, activePreset } = useQuickBuy();
  const hasMonadTokens = useMemo(
    () => watchlist.some((token) => isMonadToken(token)),
    [watchlist]
  );
  const amountUnit = hasMonadTokens ? 'MON' : 'SOL';
  const [quickBuyAmount, setQuickBuyAmountState] = useState(getQuickBuyAmount);
  const [customAmountInput, setCustomAmountInput] = useState<string>('');

  // Refresh Monad tokens when modal opens if price is missing
  useEffect(() => {
    if (!open) return;
    watchlist.forEach((token) => {
      if (!isMonadToken(token)) return;
      const price =
        (token as any).usd_price ??
        (token as any).price_usd ??
        (token as any).chart_live_price_usd ??
        (token as any).lastPriceUsd ??
        (token as any).price ??
        0;
      if (price && price > 0) return;
      const key = (token as any).mint || token.pair_address || '';
      if (key) refreshWatchlistToken(key);
    });
  }, [open, watchlist, refreshWatchlistToken]);
  
  // Load saved quick buy amount when the modal opens
  useEffect(() => {
    if (!open) return;

    const savedAmount = getQuickBuyAmount();
    const defaultAmount = hasMonadTokens ? 0.1 : 0.01;

    if (savedAmount > 0) {
      setQuickBuyAmountState(savedAmount);
      setCustomAmountInput(savedAmount.toString());
      return;
    }

    if (defaultAmount > 0) {
      setQuickBuyAmountState(defaultAmount);
      setCustomAmountInput(defaultAmount.toString());
      if (typeof window !== 'undefined') {
        localStorage.setItem('quickBuyAmount', defaultAmount.toString());
      }
      return;
    }

    setQuickBuyAmountState(0);
    setCustomAmountInput('');
    if (typeof window !== 'undefined') {
      localStorage.setItem('quickBuyAmount', '0');
    }
  }, [open, hasMonadTokens]);

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
    
    // Validation checks with user feedback
    if (!user?.bearerToken || !user?.id) {
      toast.error("Please log in to trade", {
        duration: 3000,
        style: { background: "#1E1F26", color: "#E6E7EA", border: "1px solid #ff6b6b" },
      });
      return;
    }
    
    if (!quickBuyAmount || quickBuyAmount <= 0) {
      toast.error("Set a buy amount first (enter a custom amount)", {
        duration: 3000,
        style: { background: "#1E1F26", color: "#E6E7EA", border: "1px solid #ff6b6b" },
      });
      return;
    }
    
    const tokenMint = (token as any).mint || '';
    if (!tokenMint) {
      toast.error("Token mint address not found", {
        duration: 3000,
        style: { background: "#1E1F26", color: "#E6E7EA", border: "1px solid #ff6b6b" },
      });
      return;
    }
    
    // Check if this is a Monad token - use MonadTable logic
    if (isMonadToken(token)) {
      // Use MonadTable quick buy logic
      const buyAmount = quickBuyAmount;
      const settings = (presets[activePreset]?.quickBuySettings || {}) as any;
      const launchpad = getMonadLaunchpad(token);
      const tokenAddress = tokenMint;
      
      // Get slippage from preset or use default (15%)
      const slippage = settings?.maxSlippage ? settings.maxSlippage * 100 : 15;
      // Get gas price from preset (optional)
      const gasPrice = settings?.gasPrice !== undefined && settings.gasPrice > 0 ? settings.gasPrice : undefined;
      
      // Pre-validation: Check balance BEFORE showing any toast
      const monadBalance = chainBalances?.['monad'] ?? 0;
      const clientValidation = validateMonadBalance({
        balance: monadBalance,
        tradeAmount: buyAmount,
        gasPrice: gasPrice,
      });
      
      if (!clientValidation.isValid) {
        toast.error(clientValidation.errorMessage || 'Insufficient MON balance', {
          duration: 5000,
          style: { background: "#1E1F26", color: "#E6E7EA", border: "1px solid #ff6b6b" },
        });
        return;
      }
      
      // Get token image and name
      const tokenImage = extractTokenImage(token as any) || null;
      const tokenName = token?.name || token?.symbol || '';
      
      // Generate unique toast ID
      const uniqueToastId = `monad-quickbuy-${Date.now()}`;
      const startTime = Date.now();
      const timerCap = 0.40 + Math.random() * 0.20;
      let timerFinished = false;

      // Determine if this is a multi-wallet trade
      const isMultiWallet = (selectedWalletIds?.monad || []).length > 1;
      const totalSelectedWallets = (selectedWalletIds?.monad || []).length || 1;

      // Pre-calculate which wallets will actually be used (have sufficient balance)
      const { allocations, total } = buildMonadWalletAllocations({
        amount: buyAmount,
        walletList,
        walletBalances,
        selectedWalletIds: selectedWalletIds?.monad || [],
      });
      const walletsWithBalance = allocations.length;

      // Show initial loading toast
      toast.custom(
        (t) => (
          <div className="flex items-center gap-2 bg-[#1a1b1e] text-white border border-white/10 rounded-lg px-4 py-3">
            <FaCheckCircle id={`check-${uniqueToastId}`} className="flex-shrink-0" size={16} style={{ color: '#31e3ac', display: 'none' }} />
            {tokenImage && (
              <img src={tokenImage} alt={tokenName} className="w-5 h-5 rounded-full object-cover flex-shrink-0" style={{ border: '1px solid rgba(255, 255, 255, 0.1)' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            )}
            <span className="font-semibold text-sm" style={{ color: '#31e3ac' }}>Trade placed!</span>
            <span id={`timer-${uniqueToastId}`} className="text-[#9CA3AF] text-xs ml-1">(0.00s)</span>
            <span id={`link-${uniqueToastId}`} className="inline-flex items-center ml-1" style={{ display: 'none' }}>
              <img src="https://monad.xyz/favicon.ico" alt="Monad" className="w-4 h-4 rounded-full" style={{ cursor: 'default' }} />
            </span>
          </div>
        ),
        { id: uniqueToastId, duration: Infinity }
      );

      // Start timer animation
      const timerInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const displayTime = Math.min(elapsed, timerCap).toFixed(2);
        const timerEl = document.getElementById(`timer-${uniqueToastId}`);
        if (timerEl) {
          timerEl.textContent = `(${displayTime}s)`;
        }

        if (!timerFinished && elapsed >= timerCap) {
          timerFinished = true;
          const checkEl = document.getElementById(`check-${uniqueToastId}`);
          if (checkEl) {
            checkEl.style.display = 'block';
          }
          const linkEl = document.getElementById(`link-${uniqueToastId}`);
          if (linkEl) {
            if (isMultiWallet) {
              // Show actual wallets with balance vs total selected
              linkEl.innerHTML = `<span style="color: #31e3ac; font-size: 11px; font-weight: 600;">${walletsWithBalance}/${totalSelectedWallets}</span>`;
            }
            linkEl.style.display = 'inline-flex';
          }
        }
      }, 50);
      
      try {
        const { results, totalConsidered } = await executeMonadMultiBuy({
          tokenAddress,
          amountMON: buyAmount,
          launchpad,
          slippage,
          gasPrice,
          authToken: user.bearerToken,
          walletList,
          walletBalances,
          selectedWalletIds: selectedWalletIds?.monad || [],
        });

        // Extract transaction hashes from results
        const txHashes = results
          .map((r) => (r.result as any)?.txHash)
          .filter(Boolean);

        clearInterval(timerInterval);

        if (txHashes.length > 0) {
          // For multi-wallet trades: Don't update anything (count was already shown at timer cap)
          // For single wallet: Update logo to make it clickable
          if (totalSelectedWallets === 1 && txHashes[0]) {
            const linkEl = document.getElementById(`link-${uniqueToastId}`);
            if (linkEl) {
              const explorerUrl = `https://monadvision.com/tx/${txHashes[0]}`;
              linkEl.innerHTML = `<a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="hover:opacity-80 transition-opacity"><img src="https://monad.xyz/favicon.ico" alt="Monad" class="w-4 h-4 rounded-full" style="cursor: pointer;" /></a>`;
            }
          }
          setTimeout(() => {
            toast.dismiss(uniqueToastId);
          }, 10000);
          setTimeout(() => {
            refreshBalance({ chain: "monad", force: true }).catch((err) => {
              console.warn('Failed to refresh balance:', err);
            });
          }, 1000);
          broadcastMonadQuickTrade(tokenAddress, 'buy');
          console.log('✅ Watchlist Monad Quick Buy successful:', txHashes);
        } else {
          const errorMsg = 'Trade failed';
          toast.error(errorMsg, { id: uniqueToastId, duration: 6000 });
        }
      } catch (error: any) {
        clearInterval(timerInterval);
        const errorMessage = formatMonadError(error?.message || error?.error);
        toast.error(errorMessage, { id: uniqueToastId, duration: 6000 });
        console.error('❌ Watchlist Monad Quick Buy failed:', error);
      }
    } else {
      // Use enhanced trade handler for Solana tokens
      const settings = presets[activePreset].quickBuySettings;
      
      await executeEnhancedTrade({
        token,
        amount: quickBuyAmount,
        side: 'buy',
        settings,
        user: { bearerToken: user.bearerToken, id: user.id },
        solBalance: chainBalances?.['sol'] ?? 0, // Use known SOL balance when available
        solPriceUsd: 150,
        walletContext: {
          selectedWalletIds: selectedWalletIds?.sol || [],
          walletList: walletList || [],
          walletBalances: walletBalances || {},
          chain: 'sol',
        },
        refreshBalance,
        onSuccess: (txHash, stats) => {
          console.log('✅ Watchlist Quick Buy successful:', { txHash, stats });
        },
        onError: (error) => {
          console.error('❌ Watchlist Quick Buy failed:', error);
        },
      });
    }
  };

  return (
    <InterstatePopout open={open} onClose={onClose} align="center" zIndex={9999} className="bg-[#111214] rounded-xl shadow-2xl w-full max-w-5xl p-6 relative text-neutral-100">
      <InterstateButton variant="icon" size="sm" onClick={onClose} className="absolute top-3 right-3 text-xl"><span>×</span></InterstateButton>
      <div className="flex items-center justify-between mb-4 pr-12">
        <div className="text-lg font-bold">Watchlist</div>
        {/* Quick Buy Amount Setter */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-400">Quick Buy:</span>
          <input
            type="number"
            step="any"
            min="0"
            placeholder="Custom"
            value={customAmountInput}
            onChange={(e) => {
              const val = e.target.value;
              setCustomAmountInput(val);
              // Allow empty string while typing
              if (val === '') {
                return;
              }
              const numVal = parseFloat(val);
              if (!isNaN(numVal) && numVal >= 0) {
                setQuickBuyAmountState(numVal);
                if (typeof window !== 'undefined') {
                  localStorage.setItem('quickBuyAmount', numVal.toString());
                }
              }
            }}
            onBlur={(e) => {
              const val = e.target.value.trim();
              if (val === '') {
                setCustomAmountInput('');
                setQuickBuyAmountState(0);
                if (typeof window !== 'undefined') {
                  localStorage.setItem('quickBuyAmount', '0');
                }
                return;
              }
              const numVal = parseFloat(val);
              if (isNaN(numVal) || numVal < 0) {
                setCustomAmountInput('');
                setQuickBuyAmountState(0);
                if (typeof window !== 'undefined') {
                  localStorage.setItem('quickBuyAmount', '0');
                }
              } else {
                // Ensure it's saved
                setQuickBuyAmountState(numVal);
                if (typeof window !== 'undefined') {
                  localStorage.setItem('quickBuyAmount', numVal.toString());
                }
                setCustomAmountInput(numVal.toString());
              }
            }}
            onFocus={(e) => e.target.select()}
            className="w-20 px-2 py-1 text-xs bg-[#2A2B33] border border-[#3A3B43] rounded text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-[#31e3ac] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
            style={{ textAlign: 'center' }}
          />
        </div>
      </div>
      <div className="w-[calc(100%+48px)] overflow-x-auto -mx-6">
        <table className="min-w-full">
          <thead>
            <tr style={{ backgroundColor: 'transparent', borderBottom: `1px solid ${AX.border}` }}>
              <th className="w-72 px-4 py-3 text-left text-xs font-medium tracking-wide uppercase" style={{ color: '#787a8d', fontWeight: '300' }}>Token</th>
              <th className="w-28 px-4 py-3 text-right text-xs font-medium tracking-wide uppercase" style={{ color: '#787a8d', fontWeight: '300' }}>Vol</th>
              {/* <th className="w-20 px-4 py-3 text-right text-xs font-medium tracking-wide uppercase" style={{ color: '#787a8d', fontWeight: '300' }}>1h%</th> */}
              <th className="w-28 px-4 py-3 text-right text-xs font-medium tracking-wide uppercase" style={{ color: '#787a8d', fontWeight: '300' }}>MKT Cap</th>
              <th className="w-28 px-4 py-3 text-right text-xs font-medium tracking-wide uppercase" style={{ color: '#787a8d', fontWeight: '300' }}>Liq</th>
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
                        {/* Chain logo bubble - Monad or Solana */}
                        <div className="absolute bottom-0 right-0 bg-white rounded-full flex items-center justify-center transform translate-x-1/2 translate-y-1/2 z-10"
                             style={{ width: 14, height: 14, padding: '1px' }}>
                          {isMonadToken(token) ? (
                            <MonadIcon size={12} />
                          ) : (
                            <SolanaIcon size={12} />
                          )}
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
                    {/* Volume as percentage of market cap - Commented out for now */}
                    {/* {(() => {
                      // Calculate volume as percentage of market cap
                      let volumePercent = 0;
                      if (volume1h > 0 && marketCap > 0) {
                        volumePercent = (volume1h / marketCap) * 100;
                      }
                      
                      // Color based on price change direction: green for up, red for down
                      const volumeColor = priceChange1h >= 0 ? '#85d99f' : '#f26681';
                      
                      return volumePercent > 0 ? (
                        <div className="text-xs font-medium mt-0.5" style={{ color: volumeColor }}>
                          {formatSmartNumber(volumePercent)}%
                        </div>
                      ) : null;
                    })()} */}
                  </td>
                  
                  {/* 1h% Column - Commented out */}
                  {/* <td className="w-20 px-4 py-3 align-middle text-right">
                    <div className="text-sm font-medium" style={{ color: priceChange1h >= 0 ? '#85d99f' : '#f26681' }}>
                      {priceChange1h >= 0 ? '+' : ''}{formatSmartNumber(Math.abs(priceChange1h))}%
                    </div>
                  </td> */}
                  
                  {/* MKT Cap Column */}
                  <td className="w-28 px-4 py-3 align-middle text-right">
                    <div className="text-sm font-semibold" style={{ color: AX.text }}>
                      ${formatMarketCap(marketCap)}
                    </div>
                  </td>
                  
                  {/* Liq Column */}
                  <td className="w-28 px-4 py-3 align-middle text-right">
                    <div className="text-sm font-semibold" style={{ color: AX.text }}>
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
                      <span>
                        {quickBuyAmount > 0 
                          ? `Buy ${quickBuyAmount} ${isMonadToken(token) ? 'MON' : 'SOL'}`
                          : 'Buy'
                        }
                      </span>
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
