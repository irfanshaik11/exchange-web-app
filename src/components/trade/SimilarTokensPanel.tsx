// components/right/SimilarTokensPanel.tsx
import React from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";
import { LuArrowUpDown, LuShieldCheck } from "react-icons/lu";

type SimilarToken = {
  id: string;
  name: string;
  symbol?: string;
  logoUrl?: string;
  lastTxAt?: number;     // unix seconds
  tokenAgeSec?: number;  // for right-side age chip (e.g., 6mo, 1y)
  marketCapUsd?: number;
  verified?: boolean;    // shows a tiny shield badge
};

type SortKey = "marketCap" | "lastTx" | "age";
type SortDir = "asc" | "desc";

interface Props {
  tokens: SimilarToken[];
  className?: string;
  title?: string;        // default: "Similar Tokens"
  loading?: boolean;
  emptyText?: string;
  maxHeight?: number;    // px; default 360 (expanded)
  sortKey?: SortKey;     // default "marketCap"
  sortDir?: SortDir;     // default "desc"
  onSortChange?: (key: SortKey, dir: SortDir) => void;

  /** Start collapsed (toolbar only) */
  defaultCollapsed?: boolean;
  /** Optional storage key to persist collapsed state */
  persistKey?: string; // default: "SimilarTokensPanel.collapsed"
}

const AX = {
  surface: "bg-[#151719]",
  border: "border-[#24262B]",
  text: "text-[#E6E7EA]",
  muted: "text-[#9CA3AF]",
  mint: "text-[#70E0B0]",
  rowHover: "hover:bg-neutral-800/40",
};

function formatAgeShort(sec?: number) {
  if (!sec || sec <= 0) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor(sec / 3600);
  const mo = Math.floor(d / 30);
  const y = Math.floor(d / 365);
  if (y >= 1) return `${y}y`;
  if (mo >= 1) return `${mo}mo`;
  if (d >= 1) return `${d}d`;
  if (h >= 1) return `${h}h`;
  const m = Math.floor(sec / 60);
  return `${m}m`;
}

function formatSince(ts?: number) {
  if (!ts) return "—";
  const now = Math.floor(Date.now() / 1000);
  return formatAgeShort(Math.max(0, now - ts));
}

function formatMoney(n?: number) {
  if (!n || !isFinite(n)) return "$—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

const SkeletonRow = ({ i }: { i: number }) => (
  <div key={`sk-${i}`} className={`flex items-center gap-3 py-3 px-3 border-b ${AX.border} animate-pulse`}>
    <div className="h-9 w-9 rounded-lg bg-neutral-700" />
    <div className="flex-1">
      <div className="h-3 w-32 bg-neutral-700 rounded mb-2" />
      <div className="h-3 w-24 bg-neutral-800 rounded" />
    </div>
    <div className="text-right">
      <div className="h-3 w-10 bg-neutral-700 rounded mb-2 ml-auto" />
      <div className="h-4 w-16 bg-neutral-700 rounded ml-auto" />
    </div>
  </div>
);

const Row: React.FC<{ t: SimilarToken }> = ({ t }) => {
  const ageBadge = formatAgeShort(t.tokenAgeSec);
  const lastTx = formatSince(t.lastTxAt);
  const mc = formatMoney(t.marketCapUsd);

  return (
    <div className={`group ${AX.rowHover} transition-colors flex items-center gap-3 py-3 px-3 border-b ${AX.border}`}>
      {/* Avatar */}
      <div className="relative">
        {t.logoUrl ? (
          <img
            src={t.logoUrl}
            alt={t.name}
            className="h-9 w-9 rounded-lg object-cover ring-1 ring-black/30"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-9 w-9 rounded-lg bg-neutral-700 grid place-items-center text-[10px] text-neutral-300">
            {t.symbol?.slice(0, 3)?.toUpperCase() || "TOK"}
          </div>
        )}
        {t.verified && (
          <span className="absolute -right-1 -bottom-1 h-4 w-4 rounded-full bg-neutral-900 grid place-items-center ring-1 ring-black/40">
            <LuShieldCheck className="text-emerald-400" size={12} />
          </span>
        )}
      </div>

      {/* Main text */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className={`truncate font-medium ${AX.text}`}>{t.name}</div>
          {t.symbol && <div className={`truncate ${AX.muted} text-[11px]`}>{t.symbol}</div>}
        </div>
        <div className={`text-[11px] ${AX.muted}`}>Last TX: {lastTx}</div>
      </div>

      {/* Right column */}
      <div className="text-right">
        <div className="text-[11px] text-emerald-400">{ageBadge}</div>
        <div className={`text-sm font-semibold ${AX.mint}`}>{mc}</div>
      </div>
    </div>
  );
};

const Header: React.FC<{
  title: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortChange?: (k: SortKey, d: SortDir) => void;
}> = ({ title, collapsed, onToggleCollapse, sortKey, sortDir, onSortChange }) => {
  const toggleSort = () => onSortChange?.(sortKey, sortDir === "desc" ? "asc" : "desc");
  return (
    <div
      className={`sticky top-0 z-10 flex items-center justify-between px-3 py-2 border-b ${AX.border} bg-[#151719]/95 backdrop-blur`}
    >
      <button
        onClick={onToggleCollapse}
        className="flex items-center gap-2 group/btn"
        aria-expanded={!collapsed}
        aria-controls="similar-panel-body"
        title={collapsed ? "Expand" : "Collapse"}
      >
        <span className={`text-[13px] font-semibold ${AX.text}`}>{title}</span>
        <FaChevronDown
          className={`text-neutral-500 transition-transform duration-150 group-hover/btn:text-neutral-300 ${
            collapsed ? "-rotate-90" : "rotate-0"
          }`}
          size={10}
        />
      </button>

      <button
        onClick={toggleSort}
        className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-200 transition-colors"
        title="Sort by Market Cap"
      >
        <span>MC</span>
        <LuArrowUpDown size={14} />
      </button>
    </div>
  );
};

const SimilarTokensPanel: React.FC<Props> = ({
  tokens,
  className,
  title = "Similar Tokens",
  loading,
  emptyText = "No similar tokens found.",
  maxHeight = 360,
  sortKey = "marketCap",
  sortDir = "desc",
  onSortChange,
  defaultCollapsed = false,
  persistKey = "SimilarTokensPanel.collapsed",
}) => {
  // collapsed state with persistence
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return defaultCollapsed;
    const saved = localStorage.getItem(persistKey);
    if (saved === "1") return true;
    if (saved === "0") return false;
    return defaultCollapsed;
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(persistKey, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed, persistKey]);

  const sorted = React.useMemo(() => {
    const arr = [...(tokens || [])];
    const dir = sortDir === "desc" ? -1 : 1;
    if (sortKey === "marketCap") {
      arr.sort((a, b) => ((a.marketCapUsd || 0) < (b.marketCapUsd || 0) ? 1 * dir : -1 * dir));
    } else if (sortKey === "lastTx") {
      arr.sort((a, b) => ((a.lastTxAt || 0) < (b.lastTxAt || 0) ? 1 * dir : -1 * dir));
    } else if (sortKey === "age") {
      arr.sort((a, b) => ((a.tokenAgeSec || 0) < (b.tokenAgeSec || 0) ? 1 * dir : -1 * dir));
    }
    return arr;
  }, [tokens, sortKey, sortDir]);

  // Smooth expand/collapse using max-height animation on a wrapper
  const bodyMax = Math.max(0, maxHeight - 38 /* header */ - 34 /* footer */);
  const wrapperStyle: React.CSSProperties = collapsed
    ? { maxHeight: 0, overflow: "hidden", transition: "max-height 180ms ease" }
    : { maxHeight: bodyMax, overflow: "hidden", transition: "max-height 180ms ease" };

  return (
    <div
      className={[
        "rounded-xl",
        AX.surface,
        `border ${AX.border}`,
        "shadow-[0_0_0_1px_rgba(0,0,0,0.25)]",
        "flex flex-col",
        className || "",
      ].join(" ")}
      style={{ maxHeight }}
    >
      <Header
        title={title}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={onSortChange}
      />

      {/* Collapsible content wrapper (animates height) */}
      <div id="similar-panel-body" style={wrapperStyle}>
        {/* Actual scrolling region */}
        {!collapsed && (
          <div className="overflow-y-auto" style={{ maxHeight: bodyMax }}>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} i={i} />)
            ) : !sorted.length ? (
              <div className="px-3 py-6 text-center text-neutral-500 text-sm">{emptyText}</div>
            ) : (
              sorted.map((t) => <Row key={t.id} t={t} />)
            )}
          </div>
        )}
      </div>

      {/* Footer hidden when collapsed */}
      {!collapsed && (
        <div className="px-3 py-2 border-t border-[#24262B] text-[11px] text-neutral-500 flex items-center gap-2">
          <FaChevronRight size={10} />
          <span>Scroll to explore related tokens</span>
        </div>
      )}
    </div>
  );
};

export default SimilarTokensPanel;
