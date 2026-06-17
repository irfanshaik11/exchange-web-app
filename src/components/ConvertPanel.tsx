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
import type { BridgeChainOption } from "~/utils/bridgeApi";
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

const USDC_DECIMALS = 6;
const FALLBACK_CHAINS: BridgeChainOption[] = [
  { key: "solana", vm: "svm", displayName: "Solana", relayChainId: 792703809 },
  { key: "base", vm: "evm", displayName: "Base", relayChainId: 8453 },
];

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
}
const CHAIN_META: Record<string, ChainMeta> = {
  solana: { name: "Solana", logo: "/solana.png", color: "#14F195" },
  base: {
    name: "Base",
    logo: "https://avatars.githubusercontent.com/u/108554348?s=280&v=4",
    color: "#0052FF",
  },
};
const chainMeta = (key: string, fallbackName?: string): ChainMeta =>
  CHAIN_META[key] ?? {
    name: fallbackName ?? key.charAt(0).toUpperCase() + key.slice(1),
    logo: "",
    color: C.textFaint,
  };

const USDC_LOGO = "https://assets.coingecko.com/coins/images/6319/small/usdc.png";

const toRawAmount = (human: string): string => {
  const n = Number(human);
  if (!Number.isFinite(n) || n <= 0) return "0";
  return BigInt(Math.floor(n * 10 ** USDC_DECIMALS)).toString();
};

const fromRawAmount = (raw?: string): string => {
  if (!raw) return "0";
  const n = Number(raw) / 10 ** USDC_DECIMALS;
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

const fmtBalance = (n: number): string =>
  n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function ConvertPanel({ open, onClose }: ConvertPanelProps) {
  const { primaryWalletAddresses, tokenBalances, refreshTokenBalances } =
    useUser();
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

  const chains = options?.chains?.length ? options.chains : FALLBACK_CHAINS;
  const amountRaw = useMemo(() => toRawAmount(amount), [amount]);
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

  const swapDirection = () => {
    // Drop the previous-direction quote immediately so it can't linger until
    // the debounced re-quote fires. Keep `amount` so the new route re-quotes.
    reset();
    setFromChain(toChain);
    setToChain(fromChain);
  };

  const fromBalance = tokenBalances?.["USDC"]?.[fromChain];
  const toChainDisplayName =
    chains.find((c) => c.key === toChain)?.displayName ?? toChain;
  const youReceive = fromRawAmount(quote?.currencyOut?.amount);
  const isQuoting = status === "quoting";
  const isBusy =
    status === "quoting" || status === "executing" || status === "pending";
  const canConvert =
    hasAmount &&
    fromChain !== toChain &&
    status === "quoted" &&
    !!quote?.currencyOut?.amount;
  const isSuccess = status === "success";
  // The footer CTA is live either for a fresh convert or to start another after
  // one completes — otherwise it stays disabled (quoting/executing/no amount).
  const ctaEnabled = isSuccess || (canConvert && !isBusy);
  const fromIsSolana = fromChain === "solana";

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
                  className="text-[17px] font-semibold leading-tight"
                  style={{ color: C.text }}
                >
                  Convert
                </h2>
                <p
                  className="text-[12px] leading-tight"
                  style={{ color: C.textSecondary }}
                >
                  Move USDC across chains · ~seconds · gasless
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
            {/* From card */}
            <FieldCard
              label="From"
              chains={chains}
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
                  className="w-full min-w-0 bg-transparent text-[32px] font-semibold leading-none outline-none"
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
                    className="rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors"
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
            </FieldCard>

            {/* Swap direction — circular pivot straddling the two cards */}
            <div className="relative flex h-0 items-center justify-center">
              <button
                onClick={swapDirection}
                className="group absolute grid h-10 w-10 place-items-center rounded-full transition-all duration-200 hover:scale-105"
                style={{
                  backgroundColor: C.surface,
                  border: `1px solid ${C.border}`,
                  color: C.mint,
                  boxShadow: `0 0 0 4px ${C.panel}`,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.borderColor = C.mint)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.borderColor = C.border)
                }
                aria-label="Swap source and destination chains"
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
                      className="truncate text-[32px] font-semibold leading-none"
                      style={{
                        ...TABULAR,
                        color: quote ? C.text : C.textFaint,
                      }}
                    >
                      {quote ? youReceive : "0.00"}
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
                  v={`${youReceive} USDC`}
                  emphasize
                  first
                />
                {quote.currencyOut?.minimumAmount && (
                  <SummaryRow
                    k="Minimum received"
                    v={`${fromRawAmount(quote.currencyOut.minimumAmount)} USDC`}
                  />
                )}
                {typeof quote.timeEstimate === "number" && (
                  <SummaryRow k="Estimated time" v={`~${quote.timeEstimate}s`} />
                )}
                <SummaryRow
                  k="Network fee"
                  v={
                    fromIsSolana
                      ? "Gasless on Solana"
                      : "Paid from amount on destination"
                  }
                  accent={fromIsSolana}
                />
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
      <span
        className="text-[13px] font-semibold"
        style={{ color: C.text }}
      >
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
          className="text-[11px] font-semibold uppercase tracking-[0.12em]"
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
        <CoinLogo src={meta.logo} alt={meta.name} color={meta.color} size={16} />
        <span
          className="text-[13px] font-medium"
          style={{ color: C.text }}
        >
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
          className="absolute right-0 z-10 mt-1.5 w-44 overflow-hidden rounded-xl py-1 shadow-2xl"
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
