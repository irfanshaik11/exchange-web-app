// components/trade/TradeHeader.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Token } from "~/utils/db";
import { formatSmartNumber, formatLamportsToSol, normalizeTimestampMs } from "~/utils/db";
import { useWatchlist } from "../WatchlistContext";
import { SubscriptNumber } from "../InterstateTable";
import FastImage from "../FastImage";
import useMarketDataWebSocket from "~/hooks/useMarketDataWebSocket";
import { useRouter } from "next/router";
import { getProtocolBranding } from "~/utils/protocolBranding";
import type { SolanaTokenInfo, SolanaTokenVolume, HolderSummary } from "~/hooks/useSolanaTokenWebSocket";

import { IoShareSocialOutline } from "react-icons/io5";
import {
	FaRegStar,
	FaStar,
	FaSearch,
	FaExpand,
	FaCamera,
	FaUser,
	FaTelegram,
} from "react-icons/fa";
import { LuCopy } from "react-icons/lu";
import { LuPill, LuDroplet, LuSearch } from "react-icons/lu";
import Link from "next/link";
import { CiTrophy } from "react-icons/ci";
import { FaXTwitter } from "react-icons/fa6";
import { FiGlobe } from "react-icons/fi";
import { GoPeople } from "react-icons/go";
import {
	PiTelegramLogo,
	PiCrownSimpleLight,
	PiRobotLight,
} from "react-icons/pi";
import ColorFillBar from "../ColorFillBar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useSearch } from "../ui/SearchContext";
import { TradeSocialIcons } from "../TradeSocialIcons";
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MONAD_PROTOCOL_KEYWORDS = [
	"nad.fun",
	"nadfun",
	"flap.sh",
	"flapsh",
	"kuru",
];
const MONAD_BRAND = {
	color: "#9B59B6",
	icon: "https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1",
};
// Monad candle colors (matches chart colors)
const MONAD_RED = "#f26682";

/* ---------- AXIOM palette ---------- */
const AX = {
	bg: "#111214",
	surface: "#1A1A1A",
	surface2: "#17191E",
	border: "#2A2B33",
	text: "#f0f5f5",
	muted: "#9CA3AF",
	green: "#3DDC84",
	blue: "#8EC5FF",
	warning: "#facc15",
	aiBlue: "#3B82F6",
	aiGreen: "#18c48c",
	aiCyan: "#06B6D4",
	glowBlue: "rgba(59, 130, 246, 0.35)",
	glowGreen: "rgba(24, 196, 140, 0.3)",
	glowCyan: "rgba(6, 182, 212, 0.3)",
};

const DEFAULT_PROTOCOL_COLOR = "#22c55e";
const DEFAULT_PROTOCOL_ICON =
	"https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png";

const normalizeKey = (s?: string) =>
	(s || "").toLowerCase().replace(/\s+/g, "").replace(/_/g, "");

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
	meteora_v2: "#ff4662",
	pump_amm: "#e9ba14",
	orca: "#0ea5e9",
};

const normalizedProtocolColorMap: Record<string, string> = Object.fromEntries(
	Object.entries(rawProtocolColorMap).map(([key, value]) => [
		normalizeKey(key),
		value,
	]),
);

const formatMarketCap = (value: string | number | null | undefined): string => {
	if (value === null || value === undefined) return "-";

	const numericValue =
		typeof value === "string"
			? parseFloat(value.replace(/,/g, ""))
			: Number(value);

	if (!Number.isFinite(numericValue)) return "-";

	const abs = Math.abs(numericValue);

	const abbreviations = [
		{ value: 1e12, suffix: "T" },
		{ value: 1e9, suffix: "B" },
		{ value: 1e6, suffix: "M" },
		{ value: 1e3, suffix: "K" },
	];

	for (const { value: threshold, suffix } of abbreviations) {
		if (abs >= threshold) {
			const formatted = (numericValue / threshold).toFixed(2);
			return formatted.endsWith(".00")
				? `${parseInt(formatted)}${suffix}`
				: `${formatted}${suffix}`;
		}
	}

	if (abs >= 1) {
		return numericValue.toFixed(2);
	}

	if (abs === 0) {
		return "0";
	}

	return numericValue.toFixed(2);
};

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

function resolveProtocolColor(
	token: Token,
	columnType: "new" | "final-stretch" | "migrated",
): string {
	const raw = extractProtocolRaw(token);
	if (!raw) return DEFAULT_PROTOCOL_COLOR;

	if (raw.includes("meteora")) {
		return columnType === "migrated" ? "#eab308" : "#ff4662";
	}

	if (raw.includes("pump")) {
		return columnType === "migrated" ? "#eab308" : DEFAULT_PROTOCOL_COLOR;
	}

	if (raw.includes("launch")) {
		return columnType === "migrated" ? "#eab308" : "#3b82f6";
	}

	const normalized = normalizeKey(raw);

	if (rawProtocolColorMap[raw]) return rawProtocolColorMap[raw];
	if (normalizedProtocolColorMap[normalized])
		return normalizedProtocolColorMap[normalized];

	if (raw.includes("raydium")) return "#5c51f7";
	if (
		raw.includes("moonit") ||
		raw.includes("moonshot") ||
		raw.includes("moonshoot")
	)
		return "#eab308";
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

	if (
		raw.includes("moonit") ||
		raw.includes("moonshot") ||
		raw.includes("moonshoot")
	) {
		return "https://avatars.githubusercontent.com/u/174132191?s=280&v=4";
	}

	if (raw.includes("bonk")) {
		return "https://s3.coinmarketcap.com/static-gravity/image/a28128d9ff7c49c9ad33ee2f626fda40.png";
	}

	if (raw.includes("bags")) {
		return "https://play-lh.googleusercontent.com/7AxVcu1pumxavcGTb16WBJQU88CDZd0v8q0WzFwfin7zbBvItYMuNQ0Xkqq4srTw4A=w240-h480-rw";
	}

	if (raw.includes("pump")) {
		return DEFAULT_PROTOCOL_ICON;
	}

	return DEFAULT_PROTOCOL_ICON;
}

function shouldFillProtocolBadge(token: Token): boolean {
	const raw = extractProtocolRaw(token) || "";
	return ["meteora", "bonk", "bags", "moonit", "moonshot", "moonshoot"].some(
		(needle) => raw.includes(needle),
	);
}

/* ---------- helpers ---------- */
function shortenAddress(address: string, chars = 4): string {
	if (!address || address.length < chars * 2) return address;
	return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Get the first valid timestamp from multiple candidates.
 * Skips null/undefined/invalid values.
 */
function getFirstValidTimestamp(...candidates: any[]): number | null {
	for (const candidate of candidates) {
		const ts = normalizeTimestampMs(candidate);
		if (ts !== null) return ts;
	}
	return null;
}

function getTokenAge(createdAt: string | number | object | null | undefined) {
	const ts = normalizeTimestampMs(createdAt);
	if (ts === null) return "Unknown";

	const diffMs = Date.now() - ts;
	if (diffMs < 0) return "0s"; // Future date, show as just created

	const diffSec = Math.floor(diffMs / 1000);
	if (diffSec < 60) return `${diffSec}s`;
	if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
	if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
	return `${Math.floor(diffSec / 86400)}d`;
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
	if (/^[a-z0-9_-]{40,}$/i.test(s) && !/^https?:\/\//i.test(s))
		return `https://arweave.net/${s}`;
	if (s.startsWith("http://")) return s.replace(/^http:\/\//i, "https://");
	if (s.startsWith("https://")) return s;
	return null;
}

function resolveTwitterInfo(token: Token | null): {
	url: string | null;
	handle: string | null;
} {
	if (!token) return { url: null, handle: null };

	const candidates = [
		(token as any).twitter,
		(token as any).twitter_url,
		(token as any).x,
		(token as any).x_url,
		(token as any).socials?.twitter,
	];

	for (const candidate of candidates) {
		if (!candidate) continue;
		let value = String(candidate).trim();
		if (!value) continue;

		value = value.replace(/^https?:\/\/(www\.)?(twitter\.com|x\.com)\//i, "");
		value = value.replace(/^@/, "");
		value = value.split(/[/?#]/)[0];

		if (!value) continue;

		const handle = value.toLowerCase();
		return {
			handle,
			url: `https://twitter.com/${handle}`,
		};
	}

	const fallback = (token.symbol || token.name || "")
		.toLowerCase()
		.replace(/[^a-z0-9_]/gi, "");
	if (fallback) {
		return {
			handle: fallback,
			url: `https://twitter.com/${fallback}`,
		};
	}

	return { url: null, handle: null };
}

/* ---------- tiny UI atom ---------- */
function StatInline({
	label,
	children,
	accent,
}: {
	label: string;
	children: React.ReactNode;
	accent?: "green" | "blue";
}) {
	return (
		<div className="flex flex-col items-start gap-0.5">
			<span
				className="text-[9px] sm:text-xs tracking-wider text-[#C4CCCC]"
			// style={{ color: AX.muted }}
			>
				{label}
			</span>
			<span
				className="text-[11px] sm:text-sm tabular-nums"
				style={{
					color:
						accent === "green"
							? AX.green
							: accent === "blue"
								? AX.blue
								: AX.text,
				}}
			>
				{children}
			</span>
		</div>
	);
}

/* ---------- column type ---------- */
function getColumnType(token: Token): "new" | "final-stretch" | "migrated" {
	const migrated =
		(token as any).is_migrated ||
		(token as any).migrated ||
		(token as any).graduated ||
		(token as any).is_graduated ||
		((token.status || '').toLowerCase().includes('migrated')) ||
		!!token.migrated_time;
	if (migrated) return "migrated";

	const pct =
		(token as any).bonding_pct ??
		((token as any).bonding_curve_progress != null
			? (token as any).bonding_curve_progress * 100
			: undefined) ??
		(token as any).graduationPercent ??
		0;

	const marketCap =
		(token as any).fully_diluted_value ?? (token as any).market_cap_usd ?? 0;

	let progress = 0;
	if (typeof pct === "number" && pct >= 0) progress = pct;
	else if (marketCap > 0)
		progress = Math.min((marketCap / 69000000) * 100, 100);

	if (progress >= 100) return "migrated";
	return progress >= 60 ? "final-stretch" : "new";
}

/* ===================================================================== */
interface TradeHeaderProps {
	token: Token | null;
	livePriceUsd?: number | null;
	liveMarketCapUsd?: number | null;
	/** Real-time token info from unified WebSocket (price, mcap, liquidity, image) */
	wsTokenInfo?: SolanaTokenInfo | null;
	/** Real-time volume data from unified WebSocket (5m, 1h, 6h, 24h volumes) */
	wsVolume?: SolanaTokenVolume | null;
	/** Holder summary from unified WebSocket (kol_count, total_holders, etc.) */
	holderSummary?: HolderSummary | null;
	/** Toggle function for right panel visibility */
	onToggleRightPanel?: () => void;
	/** Whether the right panel is currently visible */
	isRightPanelVisible?: boolean;
}

const TradeHeader: React.FC<TradeHeaderProps> = ({ token, livePriceUsd, liveMarketCapUsd, wsTokenInfo, wsVolume, holderSummary, onToggleRightPanel, isRightPanelVisible }) => {
	const coalesceNumber = (...values: any[]): number | null => {
		for (const v of values) {
			const n = typeof v === "string" ? parseFloat(v) : v;
			if (Number.isFinite(n)) return n as number;
		}
		return null;
	};

	// Check if we have ANY way to identify the token:
	// 1. name or symbol from token prop
	// 2. name or symbol from wsTokenInfo
	// 3. mint address (can show truncated address as fallback)
	const tokenMint = token?.mint || (token as any)?.pair_address || wsTokenInfo?.mint;
	const hasTokenIdentity =
		(token?.name || token?.symbol) ||
		(wsTokenInfo?.name || wsTokenInfo?.symbol) ||
		tokenMint; // Mint address is enough - we can show truncated address

	if (!token && !wsTokenInfo) {
		// No data at all - show skeleton
		return (
			<div className="flex-shrink-0 px-2">
				<div
					className="flex items-center gap-3 rounded-lg p-3"
					style={{ backgroundColor: AX.surface }}
				>
					<div className="h-10 w-10 animate-pulse rounded-md bg-neutral-800" />
					<div className="flex flex-col gap-1">
						<div className="h-4 w-24 animate-pulse rounded bg-neutral-800" />
						<div className="h-3 w-16 animate-pulse rounded bg-neutral-800" />
					</div>
				</div>
			</div>
		);
	}

	if (!hasTokenIdentity) {
		// Have objects but no identity fields yet - show skeleton
		return (
			<div className="flex-shrink-0 px-2">
				<div
					className="flex items-center gap-3 rounded-lg p-3"
					style={{ backgroundColor: AX.surface }}
				>
					<div className="h-10 w-10 animate-pulse rounded-md bg-neutral-800" />
					<div className="flex flex-col gap-1">
						<div className="h-4 w-24 animate-pulse rounded bg-neutral-800" />
						<div className="h-3 w-16 animate-pulse rounded bg-neutral-800" />
					</div>
				</div>
			</div>
		);
	}

	const router = useRouter();
	const { openSearch } = useSearch();
	const {
		addToWatchlist,
		removeFromWatchlist,
		isInWatchlist,
		updateWatchlistToken,
	} = useWatchlist();
	const watchlistKey = token.pair_address || (token as any).mint || "";
	const isWatched = isInWatchlist(watchlistKey);

	// Determine if this is a Monad token (vs Solana) - used for data source selection
	const isMonadContext = useMemo(() => {
		const protocolSource =
			(token as any).launchpad_protocol ||
			(token as any).protocol ||
			(token as any).launchpadName ||
			(token as any).amm ||
			extractProtocolRaw(token) ||
			undefined;
		const normalizedProtocol = (protocolSource || "").toLowerCase();
		const isMonadProtocol = normalizedProtocol
			? MONAD_PROTOCOL_KEYWORDS.some((keyword) =>
				normalizedProtocol.includes(keyword),
			)
			: false;
		const tokenChain = ((token as any).blockchain ||
			(token as any).network ||
			(token as any).chain ||
			"") as string;
		const normalizedChain = tokenChain.toLowerCase();
		return (
			normalizedChain === "monad" ||
			router?.pathname?.includes("/trade/monad") ||
			isMonadProtocol
		);
	}, [token, router?.pathname]);

	// For Solana tokens, we only use data from /v1/trade/view endpoint (token prop)
	const isSolanaToken = !isMonadContext;
	const [showPreview, setShowPreview] = useState(false);
	const [toastMessage, setToastMessage] = useState<string | null>(null);
	const [showZoomPopup, setShowZoomPopup] = useState(false);
	const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
	const twitterInfo = useMemo(() => {
		// Priority: wsTokenInfo.twitter (from metadata URI) > token fields
		if (wsTokenInfo?.twitter) {
			// Extract handle from URL if it's a full URL
			let url = wsTokenInfo.twitter;
			let handle = url;

			// Clean up the URL to extract handle
			handle = handle.replace(/^https?:\/\/(www\.)?(twitter\.com|x\.com)\//i, "");
			handle = handle.replace(/^@/, "");
			handle = handle.split(/[/?#]/)[0].toLowerCase();

			// Ensure URL is properly formatted
			if (!url.startsWith('http')) {
				url = `https://twitter.com/${handle}`;
			}

			return { url, handle };
		}
		return resolveTwitterInfo(token);
	}, [token, wsTokenInfo?.twitter]);
	const twitterProfileUrl = twitterInfo.url;
	const twitterHandle = twitterInfo.handle;
	const [showXProfilePreview, setShowXProfilePreview] = useState(false);
	const [xPreviewPosition, setXPreviewPosition] = useState({ x: 0, y: 0 });
	const xPreviewTimeoutRef = useRef<number | null>(null);
	const toastTimeoutRef = useRef<number | null>(null);

	// X Preview mouse tracking refs (for delayed hide like PulseTable)
	const isOverXPreview = useRef(false);
	const isOverXButton = useRef(false);
	const xButtonRef = useRef<HTMLButtonElement>(null);
	const [xPreviewPos, setXPreviewPos] = useState({ left: 0, top: 0, openBelow: false });

	// Search dropdown menu state
	const [showSearchMenu, setShowSearchMenu] = useState(false);
	const [searchMenuPosition, setSearchMenuPosition] = useState({ left: 0, top: 0, openAbove: false });
	const isOverSearchMenu = useRef(false);
	const isOverSearchButton = useRef(false);
	const searchMenuRef = useRef<HTMLDivElement>(null);

	// State for fetched age from search endpoint
	const [fetchedCreatedAt, setFetchedCreatedAt] = useState<
		string | number | null
	>(null);
	const fetchingAgeRef = useRef(false);

	// Track last valid age to prevent overwriting with invalid values
	const lastValidAgeRef = useRef<string | null>(null);
	const lastValidTokenMintRef = useRef<string | null>(null);

	// Reset fetched age when token changes so stale data doesn't bleed across navigations
	const tokenIdentity = token?.mint || token?.pair_address || (token as any)?.address;
	useEffect(() => {
		setFetchedCreatedAt(null);
		fetchingAgeRef.current = false;
		lastValidAgeRef.current = null;
		lastValidTokenMintRef.current = null;
	}, [tokenIdentity]);

	// Check if we have age data (include launch_time which backend often uses instead of created_at)
	// Use normalizeTimestampMs to reject zero-value timestamps like "0001-01-01T00:00:00Z"
	const hasAge =
		normalizeTimestampMs((token as any).created_at) ||
		normalizeTimestampMs((token as any).createdAt) ||
		normalizeTimestampMs((token as any).CreatedAt) ||
		normalizeTimestampMs((token as any).launch_time) ||
		fetchedCreatedAt;

	// Fetch age from search endpoint if missing (for both Solana and Monad tokens)
	useEffect(() => {
		if (hasAge || fetchingAgeRef.current) return;

		const tokenAddress =
			token.mint || token.pair_address || (token as any).address;
		if (!tokenAddress) return;

		fetchingAgeRef.current = true;

		// Use the appropriate search endpoint based on chain
		const searchUrl = isMonadContext
			? `${process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL || "https://monad-token-service.narrative.trade"}/v1/search?q=${encodeURIComponent(tokenAddress)}`
			: `${process.env.NEXT_PUBLIC_GO_SERVICE_URL}/v1/search?phrase=${encodeURIComponent(tokenAddress)}&limit=1`;

		fetch(searchUrl, {
			headers: { Accept: "application/json" },
		})
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				// Monad: data.data[0].created_at
				// Solana: data.tokens[0].created_at
				let createdAt = null;
				if (isMonadContext && data?.data?.[0]) {
					createdAt = data.data[0].created_at || data.data[0].createdAt;
				} else if (data?.tokens?.[0]) {
					createdAt = data.tokens[0].created_at || data.tokens[0].pair_created_at;
				}
				if (createdAt) {
					setFetchedCreatedAt(createdAt);
				}
			})
			.catch((err) => {
				console.debug("[TradeHeader] Failed to fetch age:", err);
			})
			.finally(() => {
				fetchingAgeRef.current = false;
			});
	}, [hasAge, token, isMonadContext]);

	// Live ticker for age updates (every second for fresh tokens, every minute for older)
	const [ageTick, setAgeTick] = useState(0);
	useEffect(() => {
		const interval = setInterval(() => {
			setAgeTick((t) => t + 1);
		}, 1000); // Update every second
		return () => clearInterval(interval);
	}, []);

	const tokenAgeLabel = useMemo(() => {
		const currentMint = token?.mint || (token as any)?.address || "";

		// AGE: Use token data from /v1/trade/view, falling back to fetchedCreatedAt from search endpoint
		const createdAt =
			(token as any).created_at ||
			(token as any).createdAt ||
			(token as any).CreatedAt ||
			(token as any).launch_time ||
			fetchedCreatedAt;

		// Check if we have any age data defined (vs still loading)
		const hasAnyAgeField =
			(token as any).created_at !== undefined ||
			(token as any).createdAt !== undefined ||
			(token as any).CreatedAt !== undefined ||
			(token as any).launch_time !== undefined ||
			fetchedCreatedAt !== null;

		const age = getTokenAge(createdAt);

		// Debug logging to trace the age calculation issue
		if (process.env.NODE_ENV === "development" || (age.includes("d") && parseInt(age) > 365)) {
			console.log("[TradeHeader] Age debug:", {
				selectedCreatedAt: createdAt,
				selectedType: typeof createdAt,
				parsedTs: normalizeTimestampMs(createdAt),
				calculatedAge: age,
				tokenFields: {
					created_at: (token as any).created_at,
					createdAt: (token as any).createdAt,
					CreatedAt: (token as any).CreatedAt,
					launch_time: (token as any).launch_time,
				},
				tokenName: token?.name || token?.symbol,
				tokenMint: currentMint,
				lastValidAge: lastValidAgeRef.current,
				lastValidMint: lastValidTokenMintRef.current,
			});
		}

		// If age is unknown and we have no age fields defined, show loading indicator
		// If age is unknown but we have fields (they're just empty), show "-"
		if (age === "Unknown") {
			// If we have a last valid age for the SAME token, keep showing it
			// This prevents flashing to "-" when data temporarily becomes invalid
			if (lastValidAgeRef.current && lastValidTokenMintRef.current === currentMint) {
				console.log("[TradeHeader] Preserving last valid age:", lastValidAgeRef.current);
				return lastValidAgeRef.current;
			}
			return hasAnyAgeField ? "-" : "...";
		}

		// Store this valid age for the current token
		lastValidAgeRef.current = age;
		lastValidTokenMintRef.current = currentMint;

		return age;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [token, fetchedCreatedAt, isSolanaToken, ageTick]);
	const [showXPreview, setShowXPreview] = useState<boolean>(false);
	const [buttonPosition, setButtonPosition] = useState<{
		left: number;
		top: number;
	} | null>(null);

	const {
		isConnected: wsConnected,
		loading: wsLoading,
		error: wsError,
		getMarketData,
	} = useMarketDataWebSocket({
		pairAddress: token.pair_address || "",
		tokenAddress: token.mint || "",
		enabled: true,
	});

	const marketData = getMarketData();
	const chartPriceUsd = coalesceNumber(
		livePriceUsd,
		(token as any)?.chart_live_price_usd,
	);
	const chartMarketCapUsd = coalesceNumber(
		liveMarketCapUsd,
		(token as any)?.chart_live_market_cap_usd,
	);
	// Priority: chartPriceUsd (OHLC chart) > wsTokenInfo > marketData > token
	// Chart price has highest priority to ensure header stays in sync with displayed chart
	const effectivePrice =
		coalesceNumber(
			chartPriceUsd,  // OHLC chart has highest priority for sync
			wsTokenInfo?.price_usd,
			marketData?.price_usd,
			(token as any).usd_price,
			(token as any).price_usd,
		) ?? 0;
	// Priority: chartMarketCapUsd (OHLC chart) > wsTokenInfo > marketData > token
	// Chart market cap has highest priority to ensure header stays in sync with displayed chart
	const effectiveMarketCap =
		coalesceNumber(
			chartMarketCapUsd,  // OHLC chart has highest priority for sync
			wsTokenInfo?.market_cap_usd,
			marketData?.market_cap_usd,
			(token as any).market_cap_usd,
			(token as any).fully_diluted_value,
			token.market_cap_usd,
		) ?? 0;
	const effectivePriceChange1h = coalesceNumber(
		(token as any)?.price_percent_change_1h,
		(token as any)?.price_change_1h,
		(token as any)?.price_change,
		(token as any)?.price_percent_change_24h,
		(token as any)?.price_change_24h,
	);

	// Keep watchlist entry hydrated with fresh price/percent/mcap when viewed on trade page
	useEffect(() => {
		if (!watchlistKey || !isWatched) return;

		// Only update when we have meaningful data
		const hasPrice = Number.isFinite(effectivePrice) && effectivePrice > 0;
		const hasMcap =
			Number.isFinite(effectiveMarketCap) && effectiveMarketCap > 0;
		const hasChange = Number.isFinite(effectivePriceChange1h ?? NaN);
		if (!hasPrice && !hasMcap && !hasChange) return;

		updateWatchlistToken({
			...token,
			price_usd: hasPrice ? effectivePrice : (token as any).price_usd,
			usd_price: hasPrice ? effectivePrice : (token as any).usd_price,
			market_cap_usd: hasMcap
				? effectiveMarketCap
				: (token as any).market_cap_usd,
			fully_diluted_value: hasMcap
				? effectiveMarketCap
				: (token as any).fully_diluted_value,
			price_percent_change_1h: hasChange
				? (effectivePriceChange1h as number)
				: (token as any).price_percent_change_1h,
			price_change_1h: hasChange
				? (effectivePriceChange1h as number)
				: (token as any).price_change_1h,
		} as any);
	}, [
		effectiveMarketCap,
		effectivePrice,
		effectivePriceChange1h,
		isWatched,
		token,
		updateWatchlistToken,
		watchlistKey,
	]);
	const mcap = effectiveMarketCap;
	const price = effectivePrice;

	// LIQUIDITY: Priority: wsTokenInfo (unified WebSocket) > token prop > marketData
	// Check if liquidity data actually exists (vs being undefined/null)
	const hasWsLiquidity =
		wsTokenInfo?.liquidity_usd !== undefined && wsTokenInfo.liquidity_usd > 0;
	const hasTokenLiquidity =
		(token as any).liquidity_usd !== undefined ||
		(token as any).total_liquidity_usd !== undefined;
	const tokenLiquidity =
		(token as any).liquidity_usd ?? (token as any).total_liquidity_usd ?? 0;
	// For Solana: Prefer unified WebSocket, fallback to token data
	// For Monad: Can also use marketData WebSocket as additional source
	const wsLiquidityFromMarketData = isSolanaToken
		? null
		: (marketData?.liquidity_usd ?? marketData?.volume_usd);
	// Unified WebSocket liquidity has highest priority
	const liq = hasWsLiquidity
		? wsTokenInfo!.liquidity_usd
		: wsLiquidityFromMarketData && wsLiquidityFromMarketData > 0
			? wsLiquidityFromMarketData
			: tokenLiquidity;
	// Track if we're still loading liquidity data (no source has provided it yet)
	const isLiquidityLoading = isSolanaToken
		? !hasWsLiquidity && !hasTokenLiquidity
		: !hasWsLiquidity && !hasTokenLiquidity && !wsLiquidityFromMarketData;
	const supply = (token as any).total_supply ?? (token as any).supply ?? 1_000_000_000;
	const formattedMarketCap = useMemo(() => formatMarketCap(mcap), [mcap]);
	const isLowLiquidity = Number(liq) < 1000;

	const curvePct = (() => {
		// Priority: wsTokenInfo.graduation_percent (real-time from WS) > token bonding fields > market cap fallback
		// graduation_percent from WS is already in percentage form (0-100)
		if (wsTokenInfo?.graduation_percent != null && wsTokenInfo.graduation_percent > 0) {
			// graduation_percent might be very small (e.g., 3.52e-9), multiply by 100 if it's < 1
			const gp = wsTokenInfo.graduation_percent;
			return gp < 1 ? gp * 100 : gp;
		}
		const v =
			(token as any).bonding_pct ??
			((token as any).bonding_curve_progress != null
				? (token as any).bonding_curve_progress * 100
				: undefined) ??
			(token as any).graduationPercent ??
			0;
		if (v) return v;
		const mc = effectiveMarketCap || (token as any).fully_diluted_value || 0;
		return mc ? Math.min((mc / 69000000) * 100, 100) : 0;
	})();

	/* ---------- canonical protocol resolution ---------- */
	const columnType = getColumnType(token);
	// protocolSource is used for getProtocolBranding below
	const protocolSource =
		(token as any).launchpad_protocol ||
		(token as any).protocol ||
		(token as any).launchpadName ||
		(token as any).amm ||
		extractProtocolRaw(token) ||
		undefined;
	// Note: isMonadContext is already defined at component level via useMemo

	let protocolColor: string;
	let tokenIcon: string;
	let fillProtocolBadge: boolean;

	if (isMonadContext) {
		const protocolBranding = getProtocolBranding(protocolSource || undefined);
		protocolColor = MONAD_BRAND.color;
		tokenIcon = protocolBranding.iconUrl || MONAD_BRAND.icon;
		fillProtocolBadge = protocolBranding.isFullCircle;
	} else {
		protocolColor = resolveProtocolColor(token, columnType);
		tokenIcon = resolveProtocolIcon(token);
		fillProtocolBadge = shouldFillProtocolBadge(token);
	}

	// IMAGE: Priority: wsTokenInfo.image_url (from URI metadata) > token prop
	// Unified WebSocket fetches image from URI metadata and provides it directly
	// Check multiple field names since different sources use different naming
	const tokenAny = token as any;
	const rawImg =
		wsTokenInfo?.image_url ||
		tokenAny.logo ||
		tokenAny.image ||
		tokenAny.image_url ||
		token.logo ||
		tokenAny.uri;
	const computedImgSrc = normalizeAssetUrl(rawImg);

	// Use ref to persist last valid image and prevent flickering
	const lastValidImgRef = useRef<string | null>(null);
	if (computedImgSrc) {
		lastValidImgRef.current = computedImgSrc;
	}
	const imgSrc = computedImgSrc || lastValidImgRef.current;

	const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
		token.symbol || token.name || "T",
	)}&background=0f1012&color=E6E7EA&size=36`;

	const twitterSearchQuery = useMemo(
		() => `${token.symbol || ""} ${token.name || ""}`.trim(),
		[token.symbol, token.name],
	);
	const twitterSearchUrl = useMemo(
		() =>
			twitterSearchQuery
				? `https://twitter.com/search?q=${encodeURIComponent(twitterSearchQuery)}`
				: `https://twitter.com/search?q=${encodeURIComponent(token.symbol || token.name || "")}`,
		[twitterSearchQuery, token.symbol, token.name],
	);
	const twitterBio = useMemo(() => {
		const candidates = [
			(token as any).description,
			(token as any).bio,
			(token as any).twitter_bio,
			(token as any).summary,
		];
		for (const candidate of candidates) {
			if (!candidate) continue;
			const value = String(candidate).trim();
			if (value) return value;
		}
		const base = token.symbol || token.name || "token";
		return `Official ${base} community. Join the conversation!`;
	}, [token]);

	useEffect(() => {
		return () => {
			if (typeof window === "undefined") return;
			if (xPreviewTimeoutRef.current != null) {
				window.clearTimeout(xPreviewTimeoutRef.current);
			}
			if (toastTimeoutRef.current != null) {
				window.clearTimeout(toastTimeoutRef.current);
			}
		};
	}, []);

	const handleWatchlistClick = () => {
		if (isWatched) {
			removeFromWatchlist(watchlistKey);
			showToast("Removed from watchlist");
		} else {
			// Store current effective values so watchlist has price/change/mcap immediately
			addToWatchlist({
				...(token as any),
				price_usd: effectivePrice,
				usd_price: effectivePrice,
				price_percent_change_1h:
					effectivePriceChange1h ?? (token as any).price_percent_change_1h,
				price_change_1h:
					effectivePriceChange1h ?? (token as any).price_change_1h,
				market_cap_usd: effectiveMarketCap,
				fully_diluted_value: effectiveMarketCap,
			} as any);
			showToast("Added to watchlist");
		}
	};

	const showToast = (message: string) => {
		if (typeof window !== "undefined" && toastTimeoutRef.current != null) {
			window.clearTimeout(toastTimeoutRef.current);
			toastTimeoutRef.current = null;
		}
		setToastMessage(message);
		if (typeof window !== "undefined") {
			toastTimeoutRef.current = window.setTimeout(() => {
				setToastMessage(null);
				toastTimeoutRef.current = null;
			}, 1600);
		}
	};

	const handleImageHover = (e: React.MouseEvent<HTMLDivElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const popupWidth = 150;
		const popupHeight = 150;

		// Default position to the right of the image
		let x = rect.right + 10;
		let y = rect.top + rect.height / 2 - popupHeight / 2;

		// Check if popup would go off the right edge of the screen
		if (x + popupWidth > window.innerWidth) {
			x = rect.left - popupWidth - 10; // Position to the left instead
		}

		// Check if popup would go off the top or bottom of the screen
		if (y < 10) {
			y = 10; // Keep some margin from top
		} else if (y + popupHeight > window.innerHeight - 10) {
			y = window.innerHeight - popupHeight - 10; // Keep some margin from bottom
		}

		setPopupPosition({ x, y });
		setShowPreview(true);
		setShowZoomPopup(true);
	};

	const handleImageLeave = () => {
		setShowPreview(false);
		setShowZoomPopup(false);
	};

	const isPumpToken = useMemo(
		() => (token.mint || "").slice(-4) === "pump",
		[token.mint],
	);

	const openLinkInNewTab = (url: string) => {
		if (!url) return;
		if (typeof window === "undefined") return;
		window.open(url, "_blank", "noopener,noreferrer");
	};

	const scheduleHideTwitterPreview = () => {
		if (typeof window === "undefined") {
			setShowXProfilePreview(false);
			return;
		}
		if (xPreviewTimeoutRef.current != null) {
			window.clearTimeout(xPreviewTimeoutRef.current);
		}
		xPreviewTimeoutRef.current = window.setTimeout(() => {
			setShowXProfilePreview(false);
		}, 120);
	};

	const handleTwitterProfileMouseEnter = (
		event: React.MouseEvent<HTMLButtonElement>,
	) => {
		if (!twitterProfileUrl) return;
		if (typeof window === "undefined") return;
		if (xPreviewTimeoutRef.current != null) {
			window.clearTimeout(xPreviewTimeoutRef.current);
		}
		const rect = event.currentTarget.getBoundingClientRect();
		setXPreviewPosition({
			x: rect.left + rect.width / 2,
			y: rect.bottom + 12,
		});
		setShowXProfilePreview(true);
	};

	const handleTwitterProfileMouseLeave = () => {
		scheduleHideTwitterPreview();
	};

	const handleTwitterPreviewMouseEnter = () => {
		if (typeof window !== "undefined" && xPreviewTimeoutRef.current != null) {
			window.clearTimeout(xPreviewTimeoutRef.current);
		}
		if (twitterProfileUrl) {
			setShowXProfilePreview(true);
		}
	};

	const handleTwitterPreviewMouseLeave = () => {
		scheduleHideTwitterPreview();
	};

	const handleTwitterProfileClick = (
		event: React.MouseEvent<HTMLButtonElement>,
	) => {
		event.preventDefault();
		event.stopPropagation();
		if (twitterProfileUrl) {
			openLinkInNewTab(twitterProfileUrl);
		} else if (twitterSearchUrl) {
			openLinkInNewTab(twitterSearchUrl);
		}
	};

	return (
		<>
			<div
				className="relative flex w-full flex-col gap-2 pl-1.5 py-1.5 sm:flex-row sm:items-center sm:gap-4 sm:pl-2 sm:py-2 md:gap-8 lg:gap-10 !font-geist"
				style={{ color: AX.text }}
			>
				{/* WS status banners hidden from users - errors logged to console only */}

				{/* LEFT: token avatar + meta */}
				<div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
					{/* Star icon - far left */}
					<button
						onClick={handleWatchlistClick}
						className="cursor-pointer flex-shrink-0 transition-colors hover:bg-white/10 rounded p-1"
						aria-label={
							isWatched ? "Remove from Watchlist" : "Add to Watchlist"
						}
						title={isWatched ? "Remove from Watchlist" : "Add to Watchlist"}
					>
						{isWatched ? (
							<FaStar className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-yellow-400" />
						) : (
							<FaRegStar className="w-4 h-4 sm:w-3.5 sm:h-3.5" style={{ color: AX.muted }} />
						)}
					</button>

					{/* Avatar with PulseTable-style border + protocol badge */}
					<div
						className="relative flex cursor-pointer items-center justify-center rounded-sm transition-all duration-300 ease-out"
						onMouseEnter={handleImageHover}
						onMouseLeave={handleImageLeave}
						style={{
							width: "clamp(36px, 8vw, 44px)",
							height: "clamp(36px, 8vw, 44px)",
							overflow: "visible",
							boxShadow: showPreview
								? `0 0 5px ${AX.glowCyan}, 0 0 10px ${AX.glowCyan}`
								: "none",
							transform: showPreview ? "scale(1.02)" : "scale(1)",
						}}
					>
						<div
							className="relative rounded-sm"
							style={{ border: "none", padding: 0 }}
						>
							<div
								className="relative rounded-sm"
								style={{
									border: `1px solid ${protocolColor}`,
									padding: 1,
									backgroundColor: "#06070b",
								}}
							>
								<div
									className="relative overflow-hidden rounded-sm"
									style={{ width: "clamp(28px, 6.5vw, 36px)", height: "clamp(28px, 6.5vw, 36px)" }}
								>
									<FastImage
										src={imgSrc ?? undefined}
										fallbackSrc={fallbackAvatar}
										alt={token.name || token.symbol || ""}
										width={36}
										height={36}
										className="h-full w-full object-cover transition-all duration-300"
										symbol={token.symbol}
										name={token.name}
										showBubble={false}
									/>
								</div>
							</div>
						</div>

						<div
							className="absolute right-0 bottom-0 z-10 flex translate-x-1/5 translate-y-1/4 transform items-center justify-center rounded-full bg-white"
							style={{
								width: "clamp(10px, 2.5vw, 12px)",
								height: "clamp(10px, 2.5vw, 12px)",
								border: `1px solid ${protocolColor}`,
								boxShadow: `0 0 2px ${protocolColor}60`,
							}}
							title="Protocol"
						>
							<img
								src={tokenIcon}
								alt={`${(token as any).launchpad_protocol || (token as any).protocol || (token as any).launchpadName || "Protocol"} logo`}
								className={`${fillProtocolBadge ? "h-full w-full object-cover" : "h-3/4 w-3/4 object-contain"} rounded-full`}
								style={{
									filter:
										protocolColor === "#eab308"
											? "sepia(1) saturate(3) hue-rotate(-10deg) brightness(1.1)"
											: "none",
								}}
								onError={(e) => {
									(e.target as HTMLImageElement).style.display = "none";
								}}
							/>
						</div>

						<div
							className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-all duration-300"
							style={{ opacity: showPreview ? 1 : 0 }}
						>
							<div
								className="flex items-center justify-center rounded-full p-1.5"
								style={{
									backgroundColor: AX.aiCyan,
									boxShadow: `0 0 8px ${AX.glowCyan}`,
								}}
							>
								<FaCamera
									size={14}
									className="sm:w-4 sm:h-4 drop-shadow-lg"
									style={{ color: "#000000" }}
								/>
							</div>
						</div>
					</div>

					{/* Name / symbol / age + quick actions */}
					<div className="flex min-w-0 flex-1 flex-col">
						<div className="flex items-center gap-1 sm:gap-1.5">
							<span className="truncate text-xs sm:text-xl">{token.symbol}</span>
							<span className="hidden truncate text-[10px] sm:inline sm:text-base" style={{ color: AX.muted }}>
								{token.name}
							</span>

							{!!token.mint && (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<button className="ml-0.5 sm:ml-1 p-0.5 sm:p-1 flex-shrink-0" style={{ color: AX.muted }}>
											<LuCopy size={12} className="sm:w-3.5 sm:h-3.5" />
										</button>
									</DropdownMenuTrigger>

									<DropdownMenuContent className="dark bg-popover border-border">
										<DropdownMenuItem
											className="dark:focus:bg-accent focus:bg-accent dark:text-popover-foreground"
											onClick={async () => {
												await navigator.clipboard.writeText(token.name);
												showToast(`${token.name} copied`);
											}}
										>
											Copy {token.name}
										</DropdownMenuItem>

										<DropdownMenuItem
											className="dark:focus:bg-accent focus:bg-accent dark:text-popover-foreground"
											onClick={async () => {
												await navigator.clipboard.writeText(token.pair_address);
												showToast(`Pair address copied`);
											}}
										>
											Copy {shortenAddress(token.pair_address)}
										</DropdownMenuItem>

										<DropdownMenuItem
											className="dark:focus:bg-accent focus:bg-accent dark:text-popover-foreground"
											onClick={() => {
												window.open(
													`https://www.google.com/search?q=${encodeURIComponent(token.name)}`,
													"_blank",
												);
											}}
										>
											Google for {token.name}
										</DropdownMenuItem>

										<DropdownMenuItem
											className="dark:focus:bg-accent focus:bg-accent dark:text-popover-foreground"
											onClick={() => {
												window.open(
													`https://x.com/search?q=${encodeURIComponent(token.name)}`,
													"_blank",
												);
											}}
										>
											X search for {token.name}
										</DropdownMenuItem>

										<DropdownMenuItem
											className="dark:focus:bg-accent focus:bg-accent dark:text-popover-foreground"
											onClick={() => {
												openSearch(token.name);
											}}
										>
											Search for {token.name}
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							)}

							<button
								className="ml-0.5 sm:ml-1 cursor-pointer flex-shrink-0"
								title="Share page link"
								onClick={async (e) => {
									e.stopPropagation();
									if (typeof window === "undefined") return;
									const shareUrl = window.location.href;
									try {
										await navigator.clipboard.writeText(shareUrl);
										showToast("Link copied to clipboard");
									} catch (err) {
										try {
											const textArea = document.createElement("textarea");
											textArea.value = shareUrl;
											textArea.style.position = "fixed";
											textArea.style.opacity = "0";
											document.body.appendChild(textArea);
											textArea.focus();
											textArea.select();
											document.execCommand("copy");
											document.body.removeChild(textArea);
											showToast("Link copied to clipboard");
										} catch { }
									}
								}}
								style={{ color: AX.muted }}
							>
								<IoShareSocialOutline size={12} className="sm:w-3.5 sm:h-3.5" />
							</button>
						</div>

						<div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] sm:gap-1 sm:text-xs lg:gap-2">
							<span className="whitespace-nowrap">{tokenAgeLabel}</span>
							{/* Socials */}
							<div className="relative flex items-center gap-0.5 text-neutral-400 sm:gap-1 lg:gap-1">
								{/* Pump.fun Link - only show for pump tokens */}
								{/* {token.mint.slice(-4) === "pump" && (
                              <Link
                                target="_blank"
                                href={`https://pump.fun/coin/${token.mint}`}
                                className="transition-colors duration-200"
                                style={{ color: "#ec397a" }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = "#ec397a";
                                  const tooltip = e.currentTarget
                                    .nextElementSibling as HTMLElement;
                                  if (tooltip) tooltip.style.opacity = "1";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = "#ec397a";
                                  const tooltip = e.currentTarget
                                    .nextElementSibling as HTMLElement;
                                  if (tooltip) tooltip.style.opacity = "0";
                                }}
                              >
                                <LuPill
                                  size={10}
                                  className="lg:h-3 lg:w-3"
                                  style={{ strokeWidth: "3" }}
                                />
                              </Link>
                            )} */}

								{/* X Profile Preview Button - PulseTable style */}
								<div className="relative">
									<button
										ref={xButtonRef}
										className="flex items-center justify-center rounded p-1 transition-colors duration-200 hover:bg-white/10"
										onClick={(e) => {
											e.stopPropagation();
											e.preventDefault();
											window.open(twitterProfileUrl, "_blank");
										}}
										onMouseEnter={() => {
											isOverXButton.current = true;
											if (xButtonRef.current) {
												const rect = xButtonRef.current.getBoundingClientRect();
												const previewHeight = 320; // Approximate height of X preview
												const previewWidth = 280; // Width of X preview
												const spaceAbove = rect.top;
												const openBelow = spaceAbove < previewHeight + 20;

												// Position to the right of button, ensuring it doesn't go off screen
												let leftPos = rect.right + 8; // 8px gap from button

												// If it would go off the right edge, position to the left instead
												if (leftPos + previewWidth > window.innerWidth - 10) {
													leftPos = rect.left - previewWidth - 8;
												}

												setXPreviewPos({
													left: leftPos,
													top: openBelow ? rect.top : rect.bottom - previewHeight,
													openBelow,
												});
											}
											setShowXPreview(true);
										}}
										onMouseLeave={() => {
											isOverXButton.current = false;
											// Delay to allow moving to popup
											setTimeout(() => {
												if (!isOverXPreview.current && !isOverXButton.current) {
													setShowXPreview(false);
												}
											}, 200);
										}}
									>
										<FaXTwitter size={14} className="sm:w-4 sm:h-4 text-neutral-400 hover:text-white" />
									</button>

									{/* X Profile Preview Popup - PulseTable style */}
									{showXPreview && (
										<div
											className="fixed z-[999999] pointer-events-auto"
											style={{
												left: `${xPreviewPos.left}px`,
												top: `${xPreviewPos.top}px`,
											}}
											onMouseEnter={() => {
												isOverXPreview.current = true;
											}}
											onMouseLeave={() => {
												isOverXPreview.current = false;
												setTimeout(() => {
													if (!isOverXPreview.current && !isOverXButton.current) {
														setShowXPreview(false);
													}
												}, 200);
											}}
										>
											<div
												className="overflow-hidden rounded-xl w-[280px]"
												style={{
													backgroundColor: "#16181c",
													border: "1px solid #2f3336",
													boxShadow: "0 8px 28px rgba(0, 0, 0, 0.75)",
												}}
											>
												{/* Header with X logo */}
												<div className="flex items-center justify-between px-4 py-3 border-b border-[#2f3336]">
													<div className="flex items-center gap-2">
														{/* Profile Picture */}
														<div className="h-12 w-12 rounded-full overflow-hidden bg-[#1a1a1a] flex-shrink-0">
															<img
																src={imgSrc || fallbackAvatar}
																alt={token.symbol}
																className="h-full w-full object-cover"
																onError={(e) => {
																	(e.target as HTMLImageElement).src = fallbackAvatar;
																}}
															/>
														</div>
														<div>
															<div className="flex items-center gap-1">
																<span className="text-white font-bold text-sm">{token.name || token.symbol}</span>
																<svg className="w-4 h-4 text-[#1d9bf0]" viewBox="0 0 24 24" fill="currentColor">
																	<path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z" />
																</svg>
															</div>
															<div className="flex items-center gap-1 text-gray-500 text-xs">
																<span>@{twitterHandle || token.symbol?.toLowerCase()}</span>
																<span>·</span>
																<span>+</span>
															</div>
														</div>
													</div>
													<FaXTwitter size={20} className="text-white" />
												</div>

												{/* Bio/Description */}
												<div className="px-4 py-3">
													<p className="text-white text-sm leading-relaxed">
														{token.description || `Official ${token.symbol} token`}
													</p>
												</div>

												{/* Stats - Joined Date */}
												<div className="px-4 pb-3 flex items-center gap-4 text-sm">
													<div className="flex items-center gap-1 text-gray-500">
														<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth="2" />
															<line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" />
															<line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" />
															<line x1="3" y1="10" x2="21" y2="10" strokeWidth="2" />
														</svg>
														<span>Joined {new Date(token.created_at || Date.now()).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
													</div>
												</div>

												{/* Following/Followers */}
												<div className="px-4 pb-3 flex items-center gap-4 text-sm">
													<span><strong className="text-white">--</strong> <span className="text-gray-500">Following</span></span>
													<span><strong className="text-white">--</strong> <span className="text-gray-500">Followers</span></span>
												</div>

												{/* CTA Button */}
												<div className="px-4 pb-4">
													<button
														className="w-full py-2.5 rounded-full text-[#1d9bf0] font-semibold text-sm border border-[#536471] hover:bg-[#1d9bf0]/10 transition-colors"
														onClick={(e) => {
															e.stopPropagation();
															window.open(twitterProfileUrl, "_blank");
														}}
													>
														See Profile on X
													</button>
												</div>
											</div>
										</div>
									)}
								</div>

								{token.links && (
									<button className="flex-shrink-0">
										<PiTelegramLogo size={14} className="sm:w-4 sm:h-4" />
									</button>
								)}

								{token.links && (
									<button className="flex-shrink-0">
										<FiGlobe size={14} className="sm:w-4 sm:h-4" />
									</button>
								)}

								{/* Search Button - show dropdown menu on hover */}
								<div className="relative">
									<button
										className="cursor-pointer transition-colors duration-200"
										style={{ color: showSearchMenu ? AX.aiCyan : AX.muted }}
										onMouseEnter={(e) => {
											isOverSearchButton.current = true;
											e.currentTarget.style.color = AX.aiCyan;
											const rect = e.currentTarget.getBoundingClientRect();
											const openAbove = rect.bottom + 200 > window.innerHeight;
											setSearchMenuPosition({
												left: rect.left + rect.width / 2,
												top: openAbove ? rect.top : rect.bottom + 4,
												openAbove,
											});
											setShowSearchMenu(true);
										}}
										onMouseLeave={(e) => {
											isOverSearchButton.current = false;
											e.currentTarget.style.color = showSearchMenu ? AX.aiCyan : AX.muted;
											// Delay to allow moving to the dropdown
											setTimeout(() => {
												if (!isOverSearchMenu.current && !isOverSearchButton.current) {
													setShowSearchMenu(false);
												}
											}, 200);
										}}
										onClick={(e) => {
											e.stopPropagation();
											e.preventDefault();
										}}
									>
										<LuSearch size={14} className="sm:w-4 sm:h-4" />
									</button>

									{/* Search Dropdown Menu */}
									{showSearchMenu && (
										<div
											ref={searchMenuRef}
											className="fixed min-w-[220px] rounded-lg border border-[#2a2b33] bg-[#16171C] py-1 z-[999999]"
											style={{
												left: `${Math.min(searchMenuPosition.left, window.innerWidth - 230)}px`,
												top: `${searchMenuPosition.top}px`,
												transform: searchMenuPosition.openAbove ? "translateY(-100%)" : "none",
												boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6)",
											}}
											onMouseEnter={() => {
												isOverSearchMenu.current = true;
											}}
											onMouseLeave={() => {
												isOverSearchMenu.current = false;
												setTimeout(() => {
													if (!isOverSearchMenu.current && !isOverSearchButton.current) {
														setShowSearchMenu(false);
													}
												}, 200);
											}}
										>
											{/* X Search for Address */}
											<button
												className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white hover:bg-white/10 transition-colors"
												onClick={(e) => {
													e.stopPropagation();
													const url = `https://twitter.com/search?q=${encodeURIComponent(token.mint || '')}`;
													window.open(url, "_blank");
													setShowSearchMenu(false);
												}}
											>
												<FaXTwitter size={14} className="text-neutral-400" />
												X Search for Address
											</button>

											{/* X Search for Name */}
											<button
												className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white hover:bg-white/10 transition-colors"
												onClick={(e) => {
													e.stopPropagation();
													const searchQuery = `${token.symbol} ${token.name}`.trim();
													const url = `https://twitter.com/search?q=${encodeURIComponent(searchQuery)}`;
													window.open(url, "_blank");
													setShowSearchMenu(false);
												}}
											>
												<FaXTwitter size={14} className="text-neutral-400" />
												X Search for Name
											</button>

											{/* Divider */}
											<div className="my-1 border-t border-[#2a2b33]" />

											{/* Google Search for Name */}
											<button
												className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white hover:bg-white/10 transition-colors"
												onClick={(e) => {
													e.stopPropagation();
													const searchQuery = `${token.symbol} ${token.name} crypto`.trim();
													const url = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
													window.open(url, "_blank");
													setShowSearchMenu(false);
												}}
											>
												<svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-neutral-400">
													<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
													<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
													<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
													<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
												</svg>
												Google Search for Name
											</button>

											{/* DexScreener Search */}
											<button
												className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white hover:bg-white/10 transition-colors"
												onClick={(e) => {
													e.stopPropagation();
													const url = `https://dexscreener.com/solana/${token.mint}`;
													window.open(url, "_blank");
													setShowSearchMenu(false);
												}}
											>
												<LuSearch size={14} className="text-[#36d8ff]" />
												View on DexScreener
											</button>
										</div>
									)}
								</div>

								<div className="ml-1 flex flex-row flex-wrap gap-1.5 sm:gap-2 font-light">
									{/* Check if this is a Monad token - hide icons for Monad */}
									{(() => {
										const protocol = extractProtocolRaw(token);
										const isMonad =
											protocol &&
											(protocol.includes("nad.fun") ||
												protocol.includes("nadfun") ||
												protocol.includes("flapsh") ||
												protocol.includes("flap.sh"));

										if (isMonad) {
											return null; // Hide all icons for Monad tokens
										}

										// Get dev token stats from wsTokenInfo
										const devCreated = wsTokenInfo?.dev_tokens_created ?? 0;
										const devMigrated = wsTokenInfo?.dev_tokens_migrated ?? 0;
										const devMigratedPct = devCreated > 0 ? Math.round((devMigrated / devCreated) * 100) : 0;

										// Get kol_count from holderSummary (priority) or token
										const kolCount = holderSummary?.kol_count ?? token.kol_count ?? 0;

										// Get total holders from holderSummary (priority), wsTokenInfo, or token
										const totalHolders = holderSummary?.total_holders ?? wsTokenInfo?.holder_count ?? token.holder_count ?? token.total_holders ?? (token as any).unique_wallets_24h ?? 0;

										return (
											<>
												{/* Crown Icon - Dev Migration Stats */}
												<div className="group/dev relative flex items-center gap-0.5 sm:gap-1 cursor-pointer">
													<PiCrownSimpleLight size={14} className="sm:w-4 sm:h-4" style={{ color: "#dcc13c" }} />
													<span className="text-xs sm:text-sm text-white">
														{devMigrated}/{devCreated}
													</span>
													{/* Dev Migration Tooltip - solid background, no shadow */}
													<div
														className="pointer-events-none absolute left-full top-0 ml-2 min-w-[180px] rounded-lg opacity-0 group-hover/dev:opacity-100 group-hover/dev:pointer-events-auto transition-opacity duration-100 z-[99999] overflow-hidden"
														style={{
															backgroundColor: AX.surface,
															border: `1px solid ${AX.border}`,
														}}
													>
														<div className="px-3 py-2 space-y-1.5">
															<div className="flex justify-between items-center">
																<span className="text-sm" style={{ color: AX.muted }}>Dev Migrated</span>
																<span className="text-sm font-medium" style={{ color: AX.text }}>{devMigrated}</span>
															</div>
															<div className="flex justify-between items-center">
																<span className="text-sm" style={{ color: AX.muted }}>Dev Launched</span>
																<span className="text-sm font-medium" style={{ color: AX.text }}>{devCreated}</span>
															</div>
															<div className="flex justify-between items-center">
																<span className="text-sm" style={{ color: AX.muted }}>Migrated</span>
																<span className="text-sm font-medium" style={{ color: AX.text }}>{devMigratedPct}%</span>
															</div>
														</div>
														<div className="px-3 py-2" style={{ borderTop: `1px solid ${AX.border}`, backgroundColor: AX.surface2 }}>
															<span className="text-xs" style={{ color: AX.muted }}>Click to open Dev Tokens</span>
														</div>
													</div>
												</div>

												{/* KOL Count - Trophy Icon */}
												<div className="group/kol relative flex items-center gap-0.5 sm:gap-1 text-violet-200">
													<CiTrophy size={14} className="sm:w-4 sm:h-4" />
													<span className="text-xs sm:text-sm text-white">{kolCount}</span>
													{/* Tooltip - solid background, no shadow */}
													<div
														className="pointer-events-none absolute left-full top-0 z-[99999] ml-2 rounded-lg px-3 py-2 whitespace-nowrap opacity-0 transition-opacity duration-100 group-hover/kol:opacity-100"
														style={{
															backgroundColor: AX.surface,
															border: `1px solid ${AX.border}`,
														}}
													>
														<span className="text-sm font-medium" style={{ color: AX.text }}>
															KOL Count
														</span>
														<p className="mt-0.5 text-xs" style={{ color: AX.muted }}>
															Key Opinion Leaders holding this token
														</p>
													</div>
												</div>

												{/* People Icon - Total Holders */}
												<div className="group/holder relative flex items-center gap-0.5 sm:gap-1">
													<div
														className="flex cursor-help items-center justify-center rounded"
														style={{ color: "#36d8ff" }}
													>
														<GoPeople size={14} className="sm:w-4 sm:h-4" />
													</div>
													<span className="text-xs sm:text-sm text-white">
														{(() => {
															const holders = totalHolders;
															if (holders >= 1e9)
																return `${(holders / 1e9).toFixed(1)}B`;
															if (holders >= 1e6)
																return `${(holders / 1e6).toFixed(1)}M`;
															if (holders >= 1e3)
																return `${(holders / 1e3).toFixed(1)}K`;
															return holders.toString();
														})()}
													</span>
													{/* Tooltip - solid background, no shadow */}
													<div
														className="pointer-events-none absolute left-full top-0 z-[99999] ml-2 rounded-lg px-3 py-2 whitespace-nowrap opacity-0 transition-opacity duration-100 group-hover/holder:opacity-100"
														style={{
															backgroundColor: AX.surface,
															border: `1px solid ${AX.border}`,
														}}
													>
														<span className="text-sm font-medium" style={{ color: AX.text }}>
															Holder Count
														</span>
														<p className="mt-0.5 text-xs" style={{ color: AX.muted }}>
															Total wallets holding this token
														</p>
													</div>
												</div>
												<div className="flex items-center gap-0.5 sm:gap-1 text-violet-200">
													<PiRobotLight size={14} className="sm:w-4 sm:h-4" />
													<span className="text-xs sm:text-sm text-white">0</span>
												</div>
											</>
										);
									})()}
								</div>

								{/* Pump.fun Tooltip */}
								{token.mint?.slice(-4) === "pump" && (
									<div
										className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 transform rounded px-2 py-1 text-xs font-medium whitespace-nowrap opacity-0 transition-opacity duration-200"
										style={{
											zIndex: 99999,
											backgroundColor: AX.surface,
											color: AX.text,
											border: `1px solid ${AX.border}`,
											boxShadow: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 0 8px ${AX.glowCyan}`,
										}}
									>
										View on Pump.fun
										{/* Tooltip arrow */}
										<div
											className="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 transform border-t-4 border-r-4 border-l-4 border-transparent"
											style={{ borderTopColor: AX.surface }}
										></div>
									</div>
								)}
							</div>
						</div>
					</div>
				</div>

				{/* CENTER: compact stats */}
				<div className="flex flex-1 flex-wrap items-center gap-3 sm:gap-4 lg:gap-6">
					<div className="text-left">
						<div className="flex items-center gap-1 text-sm sm:text-base lg:text-[20px] tabular-nums">
							{formattedMarketCap === "-" ? "-" : `$${formattedMarketCap}`}
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:gap-4">
						<StatInline label="Price">
							${<SubscriptNumber value={price} />}
						</StatInline>
						<StatInline label="Liquidity">
							<span className="inline-flex items-center gap-1">
								<span
									style={{
										color: isLiquidityLoading
											? AX.muted
											: isLowLiquidity
												? AX.warning
												: AX.text,
									}}
								>
									{isLiquidityLoading ? "..." : `$${formatSmartNumber(liq)}`}
								</span>
								{!isLiquidityLoading && isLowLiquidity && (
									<span className="group relative inline-flex items-center flex-shrink-0">
										<LuDroplet size={14} className="sm:w-4 sm:h-4" color={AX.warning} />
										<span
											className="absolute bottom-full left-1/2 z-50 mb-1.5 w-max -translate-x-1/2 rounded bg-black px-2 py-1 text-[9px] sm:text-[10px] font-medium text-yellow-200 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
											style={{ border: `1px solid rgba(250, 204, 21, 0.4)` }}
										>
											Warning: Low liquidity
										</span>
									</span>
								)}
							</span>
						</StatInline>
						{/* 24H VOL - inline after Liquidity */}
						{(() => {
							// Hide for Monad tokens
							const protocol = extractProtocolRaw(token);
							const isMonad =
								protocol &&
								(protocol.includes("nad.fun") ||
									protocol.includes("nadfun") ||
									protocol.includes("flapsh") ||
									protocol.includes("flap.sh") ||
									protocol.includes("kuru"));
							if (isMonad) return null;

							// SOL price for converting volume from SOL to USD
							const SOL_PRICE_USD = 200;
							const vol24h = wsVolume?.volume_24h;
							const buyVolSol = vol24h?.buy_volume_sol ?? 0;
							const sellVolSol = vol24h?.sell_volume_sol ?? 0;
							const totalVol24hUsd = (buyVolSol + sellVolSol) * SOL_PRICE_USD;

							// Only show if we have data
							if (!wsVolume || totalVol24hUsd === 0) return null;

							return (
								<StatInline label="24H Vol">
									${formatSmartNumber(totalVol24hUsd)}
								</StatInline>
							);
						})()}
						<StatInline label="Supply">{formatSmartNumber(supply)}</StatInline>
						{/* Gas Fees - Commented out per request
          <StatInline label="Gas Fees">
            {formatLamportsToSol(
              (wsTokenInfo as any)?.total_fees_lamports ??
                (token as any)?.total_fees_lamports,
            )}
          </StatInline>
          */}
						{columnType !== "migrated" && (
							<StatInline label="B. Curve">
								<div className="flex flex-row items-center gap-1 sm:gap-2">
									{Number.isFinite(Number(curvePct))
										? `${Number(curvePct).toFixed(1)}%`
										: "—"}
									<ColorFillBar
										value={curvePct * 100}
										color={isMonadContext ? MONAD_RED : undefined}
									/>
								</div>
							</StatInline>
						)}
					</div>
				</div>

				{onToggleRightPanel && (
					<button
						className={`hidden lg:flex ml-0.5 sm:ml-1 cursor-pointer flex-shrink-0 items-center justify-center ${isRightPanelVisible ? "-mr-2" : ""}`}
						title={isRightPanelVisible ? "Hide Trade Panel" : "Show Trade Panel"}
						onClick={(e) => {
							e.stopPropagation();
							onToggleRightPanel();
						}}
						style={{ color: AX.muted }}
					>
						{isRightPanelVisible ? (
							<div className="bg-[#27282E] py-1 px-0.5 rounded-sm border border-[#2d2f33]">
								<ChevronRight size={16} />
							</div>
						) : (
							<div className="bg-[#27282E] py-1 px-0.5 rounded-tl-sm rounded-bl-sm border border-[#2d2f33]">
								<ChevronLeft size={16} />
							</div>
						)}
					</button>
				)}

				{/* tiny toast */}
				{toastMessage && (
					<div className="fixed top-4 left-1/2 z-[99999] -translate-x-1/2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white">
						{toastMessage}
					</div>
				)}

				{showXProfilePreview && twitterProfileUrl && (
					<div
						className="pointer-events-auto fixed z-[99998]"
						style={{
							left: `${xPreviewPosition.x}px`,
							top: `${xPreviewPosition.y}px`,
							transform: "translate(-50%, 0)",
						}}
						onMouseEnter={handleTwitterPreviewMouseEnter}
						onMouseLeave={handleTwitterPreviewMouseLeave}
					>
						<div
							className="overflow-hidden rounded-xl"
							style={{
								width: 260,
								backgroundColor: AX.surface,
								border: `1px solid ${AX.border}`,
							}}
						>
							<div
								className="flex items-center justify-between border-b px-4 py-3"
								style={{ borderColor: "#2f3336" }}
							>
								<div className="flex items-center gap-3">
									<div
										className="flex h-7 w-7 items-center justify-center rounded-full"
										style={{ backgroundColor: "#1d9bf0" }}
									>
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="currentColor"
											style={{ color: "#ffffff" }}
										>
											<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
										</svg>
									</div>
									<div>
										<div
											className="text-sm font-semibold"
											style={{ color: AX.text }}
										>
											@{twitterHandle || "unknown"}
										</div>
										<div className="text-xs" style={{ color: AX.muted }}>
											Live Preview
										</div>
									</div>
								</div>
							</div>
							<div className="flex items-start gap-3 px-4 py-4">
								<div
									className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full"
									style={{
										border: "2px solid #2f3336",
										backgroundColor: "#101114",
									}}
								>
									<FastImage
										src={imgSrc ?? undefined}
										fallbackSrc={fallbackAvatar}
										alt={`${token.name || token.symbol || ""} avatar`}
										width={56}
										height={56}
										className="h-full w-full object-cover"
										symbol={token.symbol}
										name={token.name}
										showBubble={false}
									/>
								</div>
								<div className="flex flex-1 flex-col gap-1">
									<div
										className="text-sm font-semibold"
										style={{ color: AX.text }}
									>
										{token.symbol}
									</div>
									<div className="text-xs" style={{ color: AX.muted }}>
										{token.name}
									</div>
									<div
										className="text-[11px] leading-relaxed"
										style={{ color: AX.text }}
									>
										{twitterBio}
									</div>
								</div>
							</div>
							<div className="flex items-center gap-2 px-4 pb-4">
								<button
									className="flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors duration-200"
									style={{
										backgroundColor: "#ffffff",
										color: "#000000",
									}}
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										openLinkInNewTab(twitterProfileUrl);
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.backgroundColor = "#e7e9ea";
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.backgroundColor = "#ffffff";
									}}
								>
									View on X
								</button>
								<button
									className="rounded-full px-3 py-2 text-xs font-semibold transition-colors duration-200"
									style={{
										backgroundColor: "transparent",
										color: AX.muted,
										border: `1px solid ${AX.border}`,
									}}
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										openLinkInNewTab(twitterSearchUrl);
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.color = AX.aiCyan;
										e.currentTarget.style.borderColor = AX.aiCyan;
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.color = AX.muted;
										e.currentTarget.style.borderColor = AX.border;
									}}
								>
									Search
								</button>
							</div>
						</div>
					</div>
				)}

				{/* Zoom popup */}
				{showZoomPopup && (
					<div
						className="pointer-events-none fixed z-[99998] transition-all duration-300 ease-out"
						style={{
							left: `${popupPosition.x}px`,
							top: `${popupPosition.y}px`,
							opacity: showZoomPopup ? 1 : 0,
							transform: showZoomPopup
								? "scale(1) translateY(0)"
								: "scale(0.9) translateY(-10px)",
						}}
					>
						<div
							className="relative overflow-hidden rounded-lg shadow-2xl"
							style={{
								width: 150,
								height: 150,
								backgroundColor: AX.surface,
								border: `2px solid ${protocolColor}`,
								boxShadow: `0 0 20px ${AX.glowCyan}, 0 0 40px ${AX.glowCyan}40`,
							}}
						>
							<FastImage
								src={imgSrc ?? undefined}
								fallbackSrc={fallbackAvatar}
								alt={`${token.name || token.symbol || ""} - Zoomed`}
								width={150}
								height={150}
								className="h-full w-full object-cover"
								symbol={token.symbol}
								name={token.name}
								showBubble={false}
							/>

							{/* Overlay with token info */}
							<div
								className="absolute right-0 bottom-0 left-0 px-2 py-1"
								style={{
									background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
								}}
							>
								<div className="truncate text-xs font-medium text-white">
									{token.symbol}
								</div>
								<div className="truncate text-[10px] text-gray-300">
									{token.name}
								</div>
							</div>
						</div>
					</div>
				)}
			</div>
		</>
	);
};

export default TradeHeader;
