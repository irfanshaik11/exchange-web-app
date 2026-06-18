/**
 * ConvertPanel — cross-chain "Convert" (Relay bridge) sidebar.
 *
 * Right-sliding panel (matches DepositModal). Phase 1: USDC across Solana + Base,
 * both directions, on Relay's free API. Source/destination are always the user's
 * OWN Turnkey wallets (Solana addr + the single EVM 0x addr). Load via
 * dynamic(() => import('./ConvertPanel'), { ssr: false }).
 *
 * Visual direction: disciplined dark-fintech — the same point of view as the
 * wallet's TokenHoldings list. Quiet surfaces, mint accent used semantically
 * (never decoratively), scale-contrast hierarchy, hover-lit controls, and
 * tabular-nums for every figure. From → To reads top-to-bottom with a single
 * pivot control between the two cards.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import toast from "react-hot-toast";
import { useUser } from "~/components/UserContext";
import { useBridge } from "~/hooks/useBridge";
import {
  canBeOrigin,
  getTokenDecimals,
  getTokenSupportsPermit,
} from "~/utils/bridgeApi";
import type { BridgeChainOption, BridgeOptions } from "~/utils/bridgeApi";
import {
  ArrowOutIcon,
  CaretIcon,
  CheckIcon,
  CloseIcon,
  ConvertGlyph,
  Spinner,
  SwapIcon,
} from "~/components/icons/ConvertIcons";

interface ConvertPanelProps {
  open: boolean;
  onClose: () => void;
}

/** Last-resort decimals when the options matrix hasn't loaded yet. */
const FALLBACK_USDC_DECIMALS = 6;

/**
 * Minimum native SOL the user needs in their Solana wallet to cover the
 * network fee on a Solana-origin convert. Solana-origin converts are paid by
 * the user's OWN Solana wallet, so a ~0 SOL balance makes the convert fail.
 * EVM-origin routes carry no such requirement (fee comes out of the amount).
 */
const MIN_SOL_FOR_FEE = 0.001;
// Fallback matrix used until /options loads. All 6 chains can now be a Convert
// origin (`canBeOrigin` defaults true) — non-permit EVM origins (BNB / Monad /
// HyperEVM) and Solana just need the user to hold a little native gas, which we
// warn about below. The picker shows every entry that satisfies `canBeOrigin`.
// FIX 10: these entries carry no native-gas field, but every key here is also a
// key in CHAIN_META, so the GasNote/fee copy reads its `nativeGas` from there.
// Any key absent from CHAIN_META degrades to "gas" via `chainMeta` (see below).
const FALLBACK_CHAINS: BridgeChainOption[] = [
  { key: "solana", vm: "svm", displayName: "Solana", relayChainId: 792703809 },
  { key: "base", vm: "evm", displayName: "Base", relayChainId: 8453 },
  { key: "ethereum", vm: "evm", displayName: "Ethereum", relayChainId: 1 },
  { key: "bsc", vm: "evm", displayName: "BNB Chain", relayChainId: 56 },
  { key: "monad", vm: "evm", displayName: "Monad", relayChainId: 143 },
  { key: "hyperevm", vm: "evm", displayName: "HyperEVM", relayChainId: 999 },
];

/**
 * Chains whose USDC origin transfer is NOT gasless (no permit support), so the
 * user must hold a little native gas to convert FROM them. Used only as a
 * fallback when the options matrix doesn't report `supportsPermit` for the
 * (token, chain) pair. Permit chains (Base / Ethereum) are gasless and absent.
 */
const NON_PERMIT_EVM_ORIGINS = new Set(["bsc", "monad", "hyperevm"]);

/* ---- palette (matches TokenHoldings / Header AX tokens) ---- */
const C = {
  mint: "#18c48c",
  panel: "#1a1b20",
  surface: "#10131a",
  surfaceHover: "#161a23",
  card: "#141720",
  border: "rgba(255,255,255,0.08)",
  borderSoft: "rgba(255,255,255,0.05)",
  text: "#f4f4f5",
  textSecondary: "#a1a1aa",
  textMuted: "#71717a",
  textFaint: "#3f3f46",
  success: "#22c55e",
  danger: "#ef4444",
} as const;

const TABULAR: CSSProperties = { fontVariantNumeric: "tabular-nums" };

/* ---- chain presentation (registry-shaped; mirrors TokenHoldings) ---- */
interface ChainMeta {
  name: string;
  logo: string;
  color: string;
  /** Native gas token symbol for this chain (used in the gas-needed hint). */
  nativeGas: string;
}
const CHAIN_META: Record<string, ChainMeta> = {
  solana: {
    name: "Solana",
    logo: "/solana.png",
    color: "#14F195",
    nativeGas: "SOL",
  },
  base: {
    name: "Base",
    logo: "https://avatars.githubusercontent.com/u/108554348?s=280&v=4",
    color: "#0052FF",
    nativeGas: "ETH",
  },
  ethereum: {
    name: "Ethereum",
    logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
    color: "#627EEA",
    nativeGas: "ETH",
  },
  bsc: {
    name: "BNB Chain",
    logo: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",
    color: "#F0B90B",
    nativeGas: "BNB",
  },
  monad: {
    // No clean first-party logo handy yet — rely on the colored-letter fallback.
    name: "Monad",
    logo: "",
    color: "#836EF9",
    nativeGas: "MON",
  },
  hyperevm: {
    name: "HyperEVM",
    logo: "https://assets.coingecko.com/coins/images/50882/small/hyperliquid.jpg",
    color: "#97FCE4",
    nativeGas: "HYPE",
  },
};
const chainMeta = (key: string, fallbackName?: string): ChainMeta =>
  CHAIN_META[key] ?? {
    name: fallbackName ?? key.charAt(0).toUpperCase() + key.slice(1),
    logo: "",
    color: C.textFaint,
    nativeGas: "gas",
  };

const USDC_LOGO =
  "https://assets.coingecko.com/coins/images/6319/small/usdc.png";

/**
 * Human decimal string → smallest-unit integer string, for `decimals` decimals.
 *
 * BigInt-safe: we split the input on the decimal point and build the integer by
 * string manipulation rather than `Math.floor(n * 10 ** decimals)`. Float math
 * silently loses precision at 18 decimals (BNB USDC), so it is never used here.
 * Extra fractional digits beyond `decimals` are truncated (no rounding up).
 */
const toRawAmount = (human: string, decimals: number): string => {
  if (!human) return "0";
  // Reject exponent/sign strings ("1e-7", "-5", "1e+21") up front — the
  // digit-only clean below would otherwise silently mangle them into a wrong
  // value. Real inputs are always plain decimals (typed input is pre-stripped
  // to [0-9.]; Max uses a plain balance), so this only fires on bad data.
  if (!/^[0-9.\s]*$/.test(human)) return "0";
  // Keep only digits and a single decimal point.
  const cleaned = human.replace(/[^0-9.]/g, "");
  if (!cleaned || cleaned === ".") return "0";
  const [whole = "", fracRaw = ""] = cleaned.split(".");
  // Pad/truncate the fractional part to exactly `decimals` digits.
  const frac = fracRaw.slice(0, decimals).padEnd(decimals, "0");
  // Strip leading zeros to avoid `BigInt("00")`-style oddities; default "0".
  const combined = `${whole}${frac}`.replace(/^0+/, "") || "0";
  let value: bigint;
  try {
    value = BigInt(combined);
  } catch {
    return "0";
  }
  return value <= 0n ? "0" : value.toString();
};

/**
 * Smallest-unit integer string → human display string, for `decimals` decimals.
 *
 * BigInt-safe inverse of `toRawAmount`. Formats up to 4 fractional digits for
 * readability while keeping full precision in the underlying division.
 */
const fromRawAmount = (raw: string | undefined, decimals: number): string => {
  if (!raw) return "0";
  let value: bigint;
  try {
    value = BigInt(raw);
  } catch {
    return "0";
  }
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = value % base;
  // Build the fractional string padded to `decimals`, then trim for display.
  const fracStr = frac.toString().padStart(decimals, "0");
  const displayFrac = fracStr.slice(0, 4).replace(/0+$/, "");
  const wholeDisplay = whole.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
  return displayFrac ? `${wholeDisplay}.${displayFrac}` : wholeDisplay;
};

/** Per-(token, chain) decimals from the options matrix, FALLBACK if absent. */
const resolveTokenDecimals = (
  options: BridgeOptions | null,
  token: string,
  chainKey: string,
): number => {
  if (!options) return FALLBACK_USDC_DECIMALS;
  return getTokenDecimals(options, token, chainKey);
};

/** True when a smallest-unit string parses to exactly zero. */
const isZeroRaw = (raw: string): boolean => {
  try {
    return BigInt(raw) <= 0n;
  } catch {
    return false;
  }
};

/** Recognise the backend's dust / no-route signals from the error string. */
const isAmountTooLowError = (msg: string | null): boolean => {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return (
    m.includes("amount too low") ||
    m.includes("too low to cover") ||
    m.includes("no route") ||
    m.includes("larger amount")
  );
};

const fmtBalance = (n: number): string =>
  n.toLocaleString(undefined, { maximumFractionDigits: 2 });

/** Format a USD fee figure, e.g. 0.1234 → "$0.12". */
const fmtUsd = (n: number): string =>
  `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function ConvertPanel({ open, onClose }: ConvertPanelProps) {
  const {
    primaryWalletAddresses,
    tokenBalances,
    refreshTokenBalances,
    solBalance,
  } = useUser();
  const {
    options,
    quote,
    status,
    error,
    liveStatus,
    fetchQuote,
    execute,
    reset,
  } = useBridge();

  const [show, setShow] = useState(false);
  const [fromChain, setFromChain] = useState("solana");
  const [toChain, setToChain] = useState("base");
  const [amount, setAmount] = useState("");

  // The full chain set drives the "To" picker (every chain is a valid
  // destination, including BNB / Monad / HyperEVM). The "From" picker only ever
  // lists chains that can be an origin (`canBeOrigin !== false`).
  const chains = options?.chains?.length ? options.chains : FALLBACK_CHAINS;
  const originChains = useMemo(() => chains.filter(canBeOrigin), [chains]);

  // USDC decimals differ per chain (6 on most, 18 on BNB Chain). The amount the
  // user types is in the FROM chain's units; the quote's `currencyOut.amount`
  // ("you receive") is in the TO chain's units.
  const fromDecimals = useMemo(
    () => resolveTokenDecimals(options, "USDC", fromChain),
    [options, fromChain],
  );
  const toDecimals = useMemo(
    () => resolveTokenDecimals(options, "USDC", toChain),
    [options, toChain],
  );

  const amountRaw = useMemo(
    () => toRawAmount(amount, fromDecimals),
    [amount, fromDecimals],
  );
  const hasAmount = amountRaw !== "0";

  // Mount/unmount with the slide animation (mirrors DepositModal).
  useEffect(() => {
    if (open) {
      setShow(true);
      const t = setTimeout(() => setShow(true), 10);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShow(false), 320);
    return () => clearTimeout(t);
  }, [open]);

  // Reset transient bridge state + pull a fresh per-chain balance each open.
  useEffect(() => {
    if (open) {
      reset();
      void refreshTokenBalances(true);
    }
  }, [open, reset, refreshTokenBalances]);

  // Debounced live quote when route / amount changes.
  useEffect(() => {
    if (!open || !hasAmount || fromChain === toChain) return;
    const t = setTimeout(() => {
      void fetchQuote({ fromChain, toChain, token: "USDC", amount: amountRaw });
    }, 500);
    return () => clearTimeout(t);
  }, [open, hasAmount, fromChain, toChain, amountRaw, fetchQuote]);

  // Surface terminal states as toasts.
  useEffect(() => {
    if (status === "success") {
      toast.success("Convert complete", { style: TOAST_STYLE });
    } else if (status === "error" && error) {
      toast.error(error, { style: TOAST_STYLE });
    }
  }, [status, error]);

  // If the current "From" chain isn't a valid origin (e.g. once /options loads
  // and reclassifies a chain as destination-only), fall back to the first valid
  // origin so the picker never holds an impossible source.
  useEffect(() => {
    if (originChains.length === 0) return;
    if (!originChains.some((c) => c.key === fromChain)) {
      const next = originChains[0];
      if (next && next.key !== fromChain) {
        reset();
        setFromChain(next.key);
      }
    }
  }, [originChains, fromChain, reset]);

  const swapDirection = () => {
    // A swap would put the current destination into "From" — only allowed if
    // that chain is a valid origin. Destination-only chains (BNB / Monad /
    // HyperEVM) can't be flipped to the source, so we leave the route as-is.
    const nextFrom = chains.find((c) => c.key === toChain);
    if (nextFrom && !canBeOrigin(nextFrom)) return;
    // Drop the previous-direction quote immediately so it can't linger until
    // the debounced re-quote fires. Keep `amount` so the new route re-quotes.
    reset();
    setFromChain(toChain);
    setToChain(fromChain);
  };

  // Whether the current destination could be flipped into the "From" side. When
  // it can't (destination-only chain), the swap pivot is disabled so the user
  // isn't offered an action that silently no-ops.
  const canSwap = useMemo(() => {
    const dest = chains.find((c) => c.key === toChain);
    return !dest || canBeOrigin(dest);
  }, [chains, toChain]);

  const fromBalance = tokenBalances?.["USDC"]?.[fromChain];
  const toChainDisplayName =
    chains.find((c) => c.key === toChain)?.displayName ?? toChain;
  const youReceive = fromRawAmount(quote?.currencyOut?.amount, toDecimals);

  // Truthful fee state. Relay only covers the destination fee when our App
  // Balance is funded — the backend reports that per-quote as `sponsored`. When
  // absent or false (today's reality), the fee is still netted from the amount.
  const feeBreakdown = quote?.feeBreakdown;
  const isSponsored = feeBreakdown?.sponsored === true;
  // When sponsored, the user receives the full input amount (what they typed in
  // the From field, parsed back from smallest-units of the FROM chain).
  const youReceiveDisplay = isSponsored
    ? fromRawAmount(quote?.currencyIn?.amount ?? amountRaw, fromDecimals)
    : youReceive;

  const isQuoting = status === "quoting";
  const isBusy =
    status === "quoting" || status === "executing" || status === "pending";

  // Dust guard: a quote that resolves to a zero "you receive", or a backend
  // amount-too-low / no-route error, means the network fee swallows the whole
  // amount. We surface an inline hint and keep Convert disabled, without
  // blocking typing or hiding the backend's clearer error banner.
  const quoteIsZero =
    status === "quoted" &&
    !!quote?.currencyOut?.amount &&
    isZeroRaw(quote.currencyOut.amount);
  const amountTooLow =
    hasAmount &&
    fromChain !== toChain &&
    (quoteIsZero || isAmountTooLowError(error));

  const fromIsSolana = fromChain === "solana";

  // When OUR fee-payer wallet covers the Solana-origin gas, the backend reports
  // `originGasSponsored: true` on the quote — the user needs no native SOL of
  // their own. Absent/false (legacy + non-sponsored) keeps the SOL requirement.
  const originGasSponsored = feeBreakdown?.originGasSponsored === true;

  // Solana-origin converts are normally paid by the user's OWN Solana wallet, so
  // a ~0 SOL balance makes the convert fail — warn proactively (before they
  // click) and keep Convert disabled. EVM-origin routes have no SOL requirement,
  // and when origin gas is sponsored the user doesn't need any SOL either.
  const needsSolForFee =
    fromIsSolana && !originGasSponsored && solBalance < MIN_SOL_FOR_FEE;

  // Whether the FROM chain's USDC origin transfer is gasless (permit-based).
  // Prefer the options-matrix `supportsPermit` flag; fall back to the known
  // non-permit EVM key set when the matrix doesn't report it. Solana (SVM) is
  // never permit-based — the user always pays their own SOL there.
  const fromSupportsPermit = useMemo(() => {
    const reported = getTokenSupportsPermit(options, "USDC", fromChain);
    if (typeof reported === "boolean") return reported;
    if (fromIsSolana) return false;
    return !NON_PERMIT_EVM_ORIGINS.has(fromChain);
  }, [options, fromChain, fromIsSolana]);

  // The FROM chain is a user-pays-gas origin — a non-permit EVM chain (BNB /
  // Monad / HyperEVM) or non-sponsored Solana — when the origin transfer is
  // neither permit-gasless nor sponsored by our fee-payer. This single derived
  // condition drives BOTH the subtitle (don't claim "gasless") and the GasNote
  // below, so the panel never contradicts itself.
  const isUserPaysOrigin = !fromSupportsPermit && !originGasSponsored;

  // Informational note: when converting FROM a user-pays-gas origin the user
  // needs a little of that chain's native token to cover the network fee. Permit
  // chains (Base / Ethereum) are gasless, so no note. This is informational only
  // (the backend pre-flight does the real block). For Solana, the stronger
  // balance-based `needsSolForFee` guard takes precedence, so we suppress this
  // softer note to avoid double-warning.
  const needsNativeGasNote = isUserPaysOrigin && !needsSolForFee;

  // Exceeds-balance guard: the typed amount is larger than the USDC the user
  // actually holds on the From chain. This is the most common confusing case,
  // so we catch it proactively (before any execute) rather than letting the
  // backend reject it. Compared in smallest-units to avoid float drift; only
  // applies once we know the balance (a number) — never blocks when it's
  // still loading (undefined).
  const exceedsBalance = useMemo(() => {
    if (!hasAmount || typeof fromBalance !== "number") return false;
    // toFixed() (not String()) so a tiny/large balance never serializes to
    // exponent notation ("1e-7"), which toRawAmount would reject → false "exceeds".
    const balanceRaw = toRawAmount(
      fromBalance.toFixed(fromDecimals),
      fromDecimals,
    );
    try {
      return BigInt(amountRaw) > BigInt(balanceRaw);
    } catch {
      return false;
    }
  }, [hasAmount, fromBalance, fromDecimals, amountRaw]);

  const canConvert =
    hasAmount &&
    fromChain !== toChain &&
    status === "quoted" &&
    !!quote?.currencyOut?.amount &&
    !quoteIsZero &&
    !needsSolForFee &&
    !exceedsBalance;
  const isSuccess = status === "success";
  // The footer CTA is live either for a fresh convert or to start another after
  // one completes — otherwise it stays disabled (quoting/executing/no amount).
  const ctaEnabled = isSuccess || (canConvert && !isBusy);

  const onConvert = () => {
    if (!canConvert) return;
    void execute({ fromChain, toChain, token: "USDC", amount: amountRaw });
  };

  // After a completed convert, let the user start another without reopening the
  // panel: clear the terminal state, pull fresh balances, and re-quote the route.
  const convertAgain = () => {
    reset();
    void refreshTokenBalances(true);
    if (hasAmount && fromChain !== toChain) {
      void fetchQuote({ fromChain, toChain, token: "USDC", amount: amountRaw });
    }
  };

  if (!open && !show) return null;

  const ctaLabel =
    status === "success"
      ? "Convert again"
      : status === "executing"
        ? "Submitting…"
        : status === "pending"
          ? "Converting…"
          : status === "quoting"
            ? "Fetching quote…"
            : fromChain === toChain
              ? "Pick two different chains"
              : !hasAmount
                ? "Enter an amount"
                : // Same priority as the inline hints, so the disabled CTA
                  // states the precise blocker: SOL > exceeds-balance > dust.
                  needsSolForFee
                  ? "Add SOL for the network fee"
                  : exceedsBalance
                    ? "Amount exceeds balance"
                    : amountTooLow
                      ? "Amount too low"
                      : "Convert";

  return (
    <>
      <div
        className={`fixed inset-0 z-[99998] bg-black/60 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={isBusy ? undefined : onClose}
      />

      <div
        className={`fixed top-0 right-0 bottom-0 z-[99999] w-full max-w-[480px] transform shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ backgroundColor: C.panel }}
      >
        <div className="flex h-full flex-col">
          {/* ---- Header ---- */}
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: `1px solid ${C.border}` }}
          >
            <div className="flex items-center gap-3">
              <span
                className="grid h-9 w-9 place-items-center rounded-full"
                style={{
                  backgroundColor: "rgba(24,196,140,0.12)",
                  boxShadow: `0 0 0 1px rgba(24,196,140,0.25)`,
                }}
                aria-hidden="true"
              >
                <ConvertGlyph />
              </span>
              <div>
                <h2
                  className="text-[17px] leading-tight font-semibold"
                  style={{ color: C.text }}
                >
                  Convert
                </h2>
                <p
                  className="text-[12px] leading-tight"
                  style={{ color: C.textSecondary }}
                >
                  {/* FIX 8: only claim "gasless" when the route truly is for the
                      user (permit origin or sponsored). For user-pays origins
                      (BNB / Monad / HyperEVM / non-sponsored Solana) say "you pay
                      network gas" so the subtitle agrees with the GasNote below. */}
                  Move USDC across chains · ~seconds ·{" "}
                  {isUserPaysOrigin ? "you pay network gas" : "gasless"}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-white/5"
              style={{ color: C.textSecondary }}
              aria-label="Close convert panel"
            >
              <CloseIcon />
            </button>
          </div>

          {/* ---- Body ---- */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {/* From card — origins only (no destination-only chains) */}
            <FieldCard
              label="From"
              chains={originChains}
              selected={fromChain}
              onSelect={setFromChain}
              accent
            >
              <div className="flex items-end justify-between gap-3">
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) =>
                    setAmount(e.target.value.replace(/[^0-9.]/g, ""))
                  }
                  aria-label="Amount to convert"
                  className="w-full min-w-0 bg-transparent text-[32px] leading-none font-semibold outline-none"
                  style={{ ...TABULAR, color: C.text }}
                />
                <TokenChip />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[12px]" style={{ color: C.textMuted }}>
                  {typeof fromBalance === "number" ? (
                    <span style={TABULAR}>
                      Balance{" "}
                      <span style={{ color: C.textSecondary }}>
                        {fmtBalance(fromBalance)}
                      </span>{" "}
                      USDC
                    </span>
                  ) : (
                    "Balance —"
                  )}
                </span>
                {typeof fromBalance === "number" && fromBalance > 0 && (
                  <button
                    onClick={() => setAmount(String(fromBalance))}
                    className="rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase transition-colors"
                    style={{
                      color: C.mint,
                      backgroundColor: "rgba(24,196,140,0.10)",
                    }}
                    aria-label="Use maximum balance"
                  >
                    Max
                  </button>
                )}
              </div>
              {/* Pre-flight guards. Exactly one BLOCKING hint shows, by
                  priority: SOL-needed > exceeds-balance > amount-too-low. Each
                  carries its own specific reason so the user knows precisely why
                  Convert is blocked before clicking. */}
              {needsSolForFee ? (
                <GuardHint>
                  Add a little SOL to your Solana wallet to cover the network
                  fee.
                </GuardHint>
              ) : exceedsBalance ? (
                <GuardHint>
                  Amount exceeds your{" "}
                  {typeof fromBalance === "number"
                    ? fmtBalance(fromBalance)
                    : "0"}{" "}
                  USDC balance.
                </GuardHint>
              ) : amountTooLow ? (
                <GuardHint>
                  Amount too low to cover the network fee — try a larger amount.
                </GuardHint>
              ) : needsNativeGasNote ? (
                // Informational only (not a blocking error): converting from a
                // user-pays-gas origin needs a little native gas. Shown only when
                // no blocking guard above is active.
                <GasNote>
                  Sending from {chainMeta(fromChain).name} needs a little{" "}
                  {chainMeta(fromChain).nativeGas} for the network fee.
                </GasNote>
              ) : null}
            </FieldCard>

            {/* Swap direction — circular pivot straddling the two cards */}
            <div className="relative flex h-0 items-center justify-center">
              <button
                onClick={swapDirection}
                disabled={!canSwap}
                className="group absolute grid h-10 w-10 place-items-center rounded-full transition-all duration-200 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                style={{
                  backgroundColor: C.surface,
                  border: `1px solid ${C.border}`,
                  color: C.mint,
                  boxShadow: `0 0 0 4px ${C.panel}`,
                }}
                onMouseEnter={(e) => {
                  if (canSwap) e.currentTarget.style.borderColor = C.mint;
                }}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.borderColor = C.border)
                }
                aria-label={
                  canSwap
                    ? "Swap source and destination chains"
                    : "This destination chain can't be a source"
                }
                title={
                  canSwap
                    ? undefined
                    : `${toChainDisplayName} can only be a destination`
                }
              >
                <span className="transition-transform duration-300 group-hover:rotate-180">
                  <SwapIcon />
                </span>
              </button>
            </div>

            {/* To card */}
            <FieldCard
              label="To"
              chains={chains}
              selected={toChain}
              onSelect={setToChain}
              disabledKey={fromChain}
            >
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  {isQuoting ? (
                    <div
                      className="h-[32px] w-28 animate-pulse rounded-md"
                      style={{ backgroundColor: "rgba(255,255,255,0.07)" }}
                    />
                  ) : (
                    <div
                      className="truncate text-[32px] leading-none font-semibold"
                      style={{
                        ...TABULAR,
                        color: quote ? C.text : C.textFaint,
                      }}
                    >
                      {quote ? youReceiveDisplay : "0.00"}
                    </div>
                  )}
                </div>
                <TokenChip estimated={!!quote && !isQuoting} />
              </div>
              <div className="mt-3 text-[12px]" style={{ color: C.textMuted }}>
                You receive (estimated)
              </div>
            </FieldCard>

            {/* Quote / fee summary */}
            {quote && !isQuoting && (
              <div
                className="mt-4 overflow-hidden rounded-xl"
                style={{
                  backgroundColor: C.surface,
                  border: `1px solid ${C.border}`,
                }}
              >
                <SummaryRow
                  k="You receive"
                  v={`${youReceiveDisplay} USDC`}
                  emphasize
                  first
                />
                {/* Minimum received only matters when the fee is netted from the
                    amount; when sponsored, the user gets the full input. */}
                {!isSponsored && quote.currencyOut?.minimumAmount && (
                  <SummaryRow
                    k="Minimum received"
                    v={`${fromRawAmount(quote.currencyOut.minimumAmount, toDecimals)} USDC`}
                  />
                )}
                {typeof quote.timeEstimate === "number" && (
                  <SummaryRow
                    k="Estimated time"
                    v={`~${quote.timeEstimate}s`}
                  />
                )}
                {/* Network fee — TRUTHFUL. "Free" ONLY when Relay actually
                    sponsors (feeBreakdown.sponsored === true). Otherwise show
                    the real netted fee: a concrete USD figure when the backend
                    reports one, else the existing per-route copy. */}
                {isSponsored ? (
                  <SummaryRow k="Network fee" v="Free" accent />
                ) : feeBreakdown &&
                  Number.isFinite(feeBreakdown.destinationFeeUsd) &&
                  feeBreakdown.destinationFeeUsd > 0 ? (
                  <SummaryRow
                    k="Network fee"
                    v={`≈ ${fmtUsd(feeBreakdown.destinationFeeUsd)}`}
                  />
                ) : (
                  // FIX 9: honest fee copy when there's no concrete fee figure.
                  // For user-pays origins, origin gas comes out of the user's own
                  // native wallet (not netted from the destination output) — say
                  // so with the chain's native symbol. "Gasless on Solana" stays
                  // only where it genuinely is (sponsored). Permit chains
                  // (Base / Ethereum) keep their existing destination-netted copy.
                  <SummaryRow
                    k="Network fee"
                    v={
                      isUserPaysOrigin
                        ? `Origin gas paid in ${chainMeta(fromChain).nativeGas}`
                        : fromIsSolana
                          ? "Gasless on Solana"
                          : "Paid from amount on destination"
                    }
                    accent={!isUserPaysOrigin && fromIsSolana}
                  />
                )}
              </div>
            )}

            {/* States */}
            {status === "pending" && (
              <StatusBanner tone="mint" pulsing>
                <span className="font-medium">Converting…</span>
                {liveStatus ? (
                  <span className="ml-1 opacity-80">({liveStatus})</span>
                ) : null}
              </StatusBanner>
            )}
            {status === "success" && (
              <StatusBanner tone="success">
                <span className="font-medium">
                  USDC arrived on {toChainDisplayName}.
                </span>
                {toChain === "base" && primaryWalletAddresses?.ethereum && (
                  <a
                    href={`https://basescan.org/address/${primaryWalletAddresses.ethereum}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-1.5 inline-flex items-center gap-0.5 font-semibold underline-offset-2 hover:underline"
                  >
                    View on Basescan
                    <ArrowOutIcon />
                  </a>
                )}
              </StatusBanner>
            )}
            {status === "error" && error && (
              <StatusBanner tone="danger">{error}</StatusBanner>
            )}
          </div>

          {/* ---- Footer CTA ---- */}
          <div
            className="px-6 py-4"
            style={{ borderTop: `1px solid ${C.border}` }}
          >
            <button
              onClick={isSuccess ? convertAgain : onConvert}
              disabled={!ctaEnabled}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[15px] font-semibold transition-all"
              style={
                ctaEnabled
                  ? { backgroundColor: C.mint, color: "#03150f" }
                  : { backgroundColor: C.card, color: C.textMuted }
              }
              onMouseEnter={(e) => {
                if (ctaEnabled)
                  e.currentTarget.style.filter = "brightness(1.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = "none";
              }}
            >
              {isBusy && status !== "quoting" && <Spinner />}
              {ctaLabel}
            </button>
            {!primaryWalletAddresses?.solana && (
              <p
                className="mt-2 text-center text-[11px]"
                style={{ color: C.textMuted }}
              >
                Sign in to convert.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const TOAST_STYLE = {
  background: "#1E1F26",
  color: "#E6E7EA",
  border: "1px solid #18c48c",
};

/* ---- USDC token chip (left of the amount) ---- */
function TokenChip({ estimated }: { estimated?: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-2 rounded-full py-1 pr-3 pl-1"
      style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}
    >
      <CoinLogo src={USDC_LOGO} alt="USDC" color="#2775CA" size={20} ring />
      <span className="text-[13px] font-semibold" style={{ color: C.text }}>
        USDC
      </span>
      {estimated && (
        <span className="text-[10px]" style={{ color: C.textMuted }}>
          est.
        </span>
      )}
    </span>
  );
}

/* ---- Inline pre-flight guard hint (danger dot + specific reason) ---- */
function GuardHint({ children }: { children: ReactNode }) {
  return (
    <div
      className="mt-2 flex items-center gap-1.5 text-[11px]"
      style={{ color: C.danger }}
      role="alert"
    >
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: C.danger }}
        aria-hidden="true"
      />
      {children}
    </div>
  );
}

/* ---- Inline informational note (mint dot + neutral copy, non-blocking) ---- */
function GasNote({ children }: { children: ReactNode }) {
  return (
    <div
      className="mt-2 flex items-center gap-1.5 text-[11px]"
      style={{ color: C.textSecondary }}
      role="note"
    >
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: C.mint }}
        aria-hidden="true"
      />
      {children}
    </div>
  );
}

/* ---- A From/To card with a real chain-dropdown chooser ---- */
interface FieldCardProps {
  label: string;
  chains: BridgeChainOption[];
  selected: string;
  onSelect: (key: string) => void;
  disabledKey?: string;
  accent?: boolean;
  children: ReactNode;
}

function FieldCard({
  label,
  chains,
  selected,
  onSelect,
  disabledKey,
  accent,
  children,
}: FieldCardProps) {
  return (
    <div
      className="rounded-xl px-4 py-3.5"
      style={{
        backgroundColor: C.surface,
        border: `1px solid ${accent ? "rgba(24,196,140,0.18)" : C.border}`,
      }}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <span
          className="text-[11px] font-semibold tracking-[0.12em] uppercase"
          style={{ color: C.textMuted }}
        >
          {label}
        </span>
        <ChainDropdown
          chains={chains}
          selected={selected}
          onSelect={onSelect}
          disabledKey={disabledKey}
        />
      </div>
      {children}
    </div>
  );
}

/* ---- Chain dropdown: trigger button (logo + name + caret) + popover list ---- */
function ChainDropdown({
  chains,
  selected,
  onSelect,
  disabledKey,
}: {
  chains: BridgeChainOption[];
  selected: string;
  onSelect: (key: string) => void;
  disabledKey?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sel = chains.find((c) => c.key === selected);
  const meta = chainMeta(selected, sel?.displayName);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg py-1.5 pr-2 pl-2.5 transition-colors hover:brightness-110"
        style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Chain: ${meta.name}. Change chain`}
      >
        <CoinLogo
          src={meta.logo}
          alt={meta.name}
          color={meta.color}
          size={16}
        />
        <span className="text-[13px] font-medium" style={{ color: C.text }}>
          {meta.name}
        </span>
        <span
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          style={{ color: C.textMuted }}
        >
          <CaretIcon />
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-10 mt-1.5 max-h-[248px] w-44 overflow-y-auto overscroll-contain rounded-xl py-1 shadow-2xl"
          style={{
            backgroundColor: C.panel,
            border: `1px solid ${C.border}`,
          }}
        >
          {chains.map((c) => {
            const cm = chainMeta(c.key, c.displayName);
            const isSel = c.key === selected;
            const isDisabled = c.key === disabledKey;
            return (
              <button
                key={c.key}
                role="option"
                aria-selected={isSel}
                disabled={isDisabled}
                onClick={() => {
                  if (isDisabled) return;
                  onSelect(c.key);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors disabled:cursor-not-allowed"
                style={{
                  color: isDisabled ? C.textFaint : C.text,
                  opacity: isDisabled ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isDisabled)
                    e.currentTarget.style.backgroundColor = C.surfaceHover;
                }}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <CoinLogo
                  src={cm.logo}
                  alt={cm.name}
                  color={cm.color}
                  size={18}
                  ring
                />
                <span className="flex-1 text-[13px] font-medium">
                  {cm.name}
                </span>
                {isSel && <CheckIcon />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---- Quote summary row with subtle dividers ---- */
function SummaryRow({
  k,
  v,
  emphasize,
  accent,
  first,
}: {
  k: string;
  v: string;
  emphasize?: boolean;
  accent?: boolean;
  first?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2.5"
      style={{ borderTop: first ? undefined : `1px solid ${C.borderSoft}` }}
    >
      <span className="text-[12px]" style={{ color: C.textMuted }}>
        {k}
      </span>
      <span
        className="text-[12px] font-medium"
        style={{
          ...TABULAR,
          color: accent ? C.mint : emphasize ? C.text : C.textSecondary,
        }}
      >
        {v}
      </span>
    </div>
  );
}

/* ---- Status banner (mint pending / success / danger) ---- */
function StatusBanner({
  tone,
  pulsing,
  children,
}: {
  tone: "mint" | "success" | "danger";
  pulsing?: boolean;
  children: ReactNode;
}) {
  const color =
    tone === "mint" ? C.mint : tone === "success" ? C.success : C.danger;
  return (
    <div
      className={`mt-4 flex items-center gap-2.5 rounded-xl px-4 py-3 text-[12px] ${
        pulsing ? "animate-pulse" : ""
      }`}
      style={{
        color,
        backgroundColor: `${color}1a`,
        border: `1px solid ${color}4d`,
      }}
    >
      {pulsing && (
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/* ---- logo with branded colored-chip fallback (mirrors TokenHoldings) ---- */
function CoinLogo({
  src,
  alt,
  color,
  size,
  ring,
}: {
  src: string;
  alt: string;
  color: string;
  size: number;
  ring?: boolean;
}) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        boxShadow: ring ? `0 0 0 1px ${C.border}` : undefined,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          loading="eager"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
        />
      ) : (
        <span
          className="text-[8px] font-bold uppercase"
          style={{ color: "rgba(0,0,0,0.55)" }}
        >
          {alt.slice(0, 1)}
        </span>
      )}
    </span>
  );
}
