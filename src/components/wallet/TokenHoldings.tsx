// src/components/wallet/TokenHoldings.tsx
// Token-first wallet holdings list for the profile dropdown.
//
// Visual direction: disciplined dark-fintech. A single quiet "Net worth"
// headline anchors the surface; assets sit on flush, hover-lit rows with a
// clear scale-contrast between the amount and its metadata. Zero balances are
// never rendered (no "$0" noise); a 0-USDC wallet shows only the SOL row.
// USDC is a stablecoin so its USD value ≈ its token amount.

import { useMemo } from "react";
import type { CSSProperties } from "react";
import { buildHoldings } from "~/lib/holdings";
import type { TokenHolding } from "~/lib/holdings";

/* ---- palette (subset of Header AX tokens) ---- */
const C = {
  mint: "#18c48c",
  surface: "#10131a",
  surfaceHover: "#161a23",
  card: "#141720",
  border: "rgba(255,255,255,0.08)",
  borderSoft: "rgba(255,255,255,0.05)",
  text: "#f4f4f5",
  textSecondary: "#a1a1aa",
  textMuted: "#71717a",
} as const;

const TABULAR: CSSProperties = { fontVariantNumeric: "tabular-nums" };

/* ---- chain + token presentation (registry-shaped; extend as chains land) ---- */
interface ChainMeta {
  name: string;
  logo: string;
  color: string;
  explorerBase: string; // address explorer root
}

const CHAIN_META: Record<string, ChainMeta> = {
  solana: {
    name: "Solana",
    logo: "/solana.png",
    color: "#14F195",
    explorerBase: "https://solscan.io/account/",
  },
  base: {
    name: "Base",
    logo: "https://avatars.githubusercontent.com/u/108554348?s=280&v=4",
    color: "#0052FF",
    explorerBase: "https://basescan.org/address/",
  },
  ethereum: {
    name: "Ethereum",
    logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
    color: "#627EEA",
    explorerBase: "https://etherscan.io/address/",
  },
  bsc: {
    name: "BNB Chain",
    logo: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",
    color: "#F0B90B",
    explorerBase: "https://bscscan.com/address/",
  },
  monad: {
    // No clean first-party logo handy yet — rely on the colored-letter fallback.
    name: "Monad",
    logo: "",
    color: "#836EF9",
    explorerBase: "https://monadexplorer.com/address/",
  },
  hyperevm: {
    name: "HyperEVM",
    logo: "https://assets.coingecko.com/coins/images/50882/small/hyperliquid.jpg",
    color: "#97FCE4",
    explorerBase: "https://hyperevmscan.io/address/",
  },
};

const chainMeta = (chain: string): ChainMeta =>
  CHAIN_META[chain] ?? {
    name: chain.charAt(0).toUpperCase() + chain.slice(1),
    logo: "",
    color: "#3f3f46",
    explorerBase: "",
  };

const TOKEN_LOGO: Record<string, string> = {
  USDC: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
};

const fmtUsd = (n: number): string =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtAmount = (n: number, max = 4): string =>
  n.toLocaleString(undefined, { maximumFractionDigits: max });

/* ---- logo with a branded colored-chip fallback (mirrors BlockchainSwitcher) ---- */
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
            // hide the broken image, keep the branded color chip beneath
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

/* ---- a small chain badge: dot logo + name, optional explorer link ---- */
function ChainBadge({
  chain,
  address,
}: {
  chain: string;
  address?: string | null;
}) {
  const meta = chainMeta(chain);
  return (
    <span className="inline-flex items-center gap-1.5">
      <CoinLogo src={meta.logo} alt={meta.name} color={meta.color} size={14} />
      <span className="text-[12px] font-medium" style={{ color: C.textSecondary }}>
        {meta.name}
      </span>
      {address && meta.explorerBase ? (
        <a
          href={`${meta.explorerBase}${address}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={`View ${meta.name} address on explorer`}
          className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-[#52525b] transition-colors hover:text-[#18c48c]"
        >
          <ExternalLinkIcon />
        </a>
      ) : null}
    </span>
  );
}

function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" aria-hidden="true">
      <path
        d="M7 17 17 7M9 7h8v8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ---- skeleton shimmer row ---- */
function SkeletonRow() {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="h-4 w-4 animate-pulse rounded-full bg-white/10" />
        <div className="h-3 w-16 animate-pulse rounded bg-white/10" />
      </div>
      <div className="h-3 w-14 animate-pulse rounded bg-white/10" />
    </div>
  );
}

export interface TokenHoldingsProps {
  tokenBalances: Record<string, Record<string, number>>;
  solBalance: number;
  solValueUsd: number;
  /** Resolve a wallet address for a chain key, for explorer links. */
  addressFor?: (chain: string) => string | null | undefined;
  loading?: boolean;
}

export default function TokenHoldings({
  tokenBalances,
  solBalance,
  solValueUsd,
  addressFor,
  loading = false,
}: TokenHoldingsProps) {
  const holdings = useMemo(
    () => buildHoldings(tokenBalances),
    [tokenBalances],
  );

  // Net worth = SOL's USD value + Σ token totals (USDC ≈ $1).
  const netWorth = useMemo(
    () => solValueUsd + holdings.reduce((s, h) => s + h.total, 0),
    [solValueUsd, holdings],
  );

  return (
    <div className="mb-4">
      {/* ---- Net worth headline ---- */}
      <div className="mb-3 px-1">
        <div
          className="mb-0.5 text-[10px] font-medium uppercase tracking-[0.14em]"
          style={{ color: C.textMuted }}
        >
          Net worth
        </div>
        {loading ? (
          <div className="h-8 w-32 animate-pulse rounded bg-white/10" />
        ) : (
          <div
            className="text-[28px] font-semibold leading-none tracking-tight"
            style={{ ...TABULAR, color: C.text }}
          >
            <span style={{ color: C.textMuted }}>$</span>
            {fmtUsd(netWorth)}
          </div>
        )}
      </div>

      {/* ---- Asset rows ---- */}
      <div
        className="overflow-hidden rounded-xl"
        style={{
          backgroundColor: C.surface,
          border: `1px solid ${C.border}`,
        }}
      >
        {loading ? (
          <>
            <SkeletonRow />
            <div style={{ borderTop: `1px solid ${C.borderSoft}` }} />
            <SkeletonRow />
            <div style={{ borderTop: `1px solid ${C.borderSoft}` }} />
            <SkeletonRow />
          </>
        ) : (
          <>
            {/* SOL — always shown */}
            <SolRow
              solBalance={solBalance}
              solValueUsd={solValueUsd}
              address={addressFor?.("solana")}
              first
            />

            {/* Tokens (USDC, future tokens) */}
            {holdings.map((h) => (
              <TokenRow key={h.token} holding={h} addressFor={addressFor} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/* ---- SOL row ---- */
function SolRow({
  solBalance,
  solValueUsd,
  address,
  first,
}: {
  solBalance: number;
  solValueUsd: number;
  address?: string | null;
  first?: boolean;
}) {
  return (
    <div
      className="group flex items-center justify-between px-3 py-2.5 transition-colors"
      style={{
        borderTop: first ? undefined : `1px solid ${C.borderSoft}`,
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.backgroundColor = C.surfaceHover)
      }
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <CoinLogo src="/solana.png" alt="SOL" color="#14F195" size={20} ring />
        <div className="min-w-0">
          <div
            className="text-[13px] font-semibold leading-tight"
            style={{ color: C.text }}
          >
            SOL
          </div>
          <div
            className="text-[11px] leading-tight"
            style={{ ...TABULAR, color: C.textMuted }}
          >
            {fmtAmount(solBalance, 4)} SOL
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="text-[13px] font-semibold"
          style={{ ...TABULAR, color: C.text }}
        >
          ${fmtUsd(solValueUsd)}
        </span>
        {address ? (
          <a
            href={`https://solscan.io/account/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label="View Solana wallet on Solscan"
            className="inline-flex h-5 w-5 items-center justify-center rounded text-[#52525b] opacity-0 transition-all hover:text-[#18c48c] group-hover:opacity-100"
          >
            <ExternalLinkIcon />
          </a>
        ) : (
          <span className="h-5 w-5" />
        )}
      </div>
    </div>
  );
}

/* ---- Token row (single-chain collapsed OR multi-chain aggregate + sub-rows) ---- */
function TokenRow({
  holding,
  addressFor,
}: {
  holding: TokenHolding;
  addressFor?: (chain: string) => string | null | undefined;
}) {
  const logo = TOKEN_LOGO[holding.token] ?? "";

  if (holding.singleChain) {
    const only = holding.chains[0];
    return (
      <div
        className="group flex items-center justify-between px-3 py-2.5 transition-colors"
        style={{ borderTop: `1px solid ${C.borderSoft}` }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = C.surfaceHover)
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor = "transparent")
        }
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <CoinLogo src={logo} alt={holding.token} color="#2775CA" size={20} ring />
          <div className="min-w-0">
            <div
              className="text-[13px] font-semibold leading-tight"
              style={{ color: C.text }}
            >
              {holding.token}
            </div>
            <div className="mt-0.5">
              <ChainBadge chain={only.chain} address={addressFor?.(only.chain)} />
            </div>
          </div>
        </div>
        <span
          className="text-[13px] font-semibold"
          style={{ ...TABULAR, color: C.text }}
        >
          ${fmtUsd(only.amount)}
        </span>
      </div>
    );
  }

  // Multi-chain: aggregate header + funded-chain sub-rows
  return (
    <div style={{ borderTop: `1px solid ${C.borderSoft}` }}>
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <CoinLogo src={logo} alt={holding.token} color="#2775CA" size={20} ring />
          <div
            className="text-[13px] font-semibold leading-tight"
            style={{ color: C.text }}
          >
            {holding.token}
          </div>
        </div>
        <span
          className="text-[13px] font-semibold"
          style={{ ...TABULAR, color: C.text }}
        >
          ${fmtUsd(holding.total)}
        </span>
      </div>
      <div className="pb-2 pl-[42px] pr-3">
        {holding.chains.map((c) => (
          <div
            key={c.chain}
            className="group flex items-center justify-between rounded-md px-1.5 py-1 transition-colors hover:bg-white/[0.03]"
          >
            <ChainBadge chain={c.chain} address={addressFor?.(c.chain)} />
            <span
              className="text-[12px] font-medium"
              style={{ ...TABULAR, color: C.textSecondary }}
            >
              ${fmtUsd(c.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
