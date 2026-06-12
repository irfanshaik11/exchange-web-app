interface TokenInfo {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenLogo: string;
  tokenDecimals: string; // could be converted to number if consistent
  pairTokenType: "token0" | "token1";
  liquidityUsd: number;
}

export interface DexPair {
  exchangeAddress: string;
  exchangeName: string;
  exchangeLogo: string;
  pairAddress: string;
  pairLabel: string;
  usdPrice: number;
  usdPrice24hrPercentChange: number;
  usdPrice24hrUsdChange: number;
  volume24hrNative: number;
  volume24hrUsd: number;
  liquidityUsd: number;
  baseToken: string;
  quoteToken: string;
  inactivePair: boolean;
  pair: TokenInfo[];
}

export interface DexPairsResponse {
  pairs: DexPair[];
}

export type Token = {
  id: number;
  mint: string;
  // Backend-assigned trending rank (1 = best). Present on rows sourced from the
  // trending WebSocket feed (NormalizedTrendingToken); absent elsewhere.
  rank?: number;
  standard: string;
  name: string;
  symbol: string;
  logo: string;
  decimals: number;
  metaplex: object | null; // The original value is [object Object], so it's likely a JSON object
  fully_diluted_value: number;
  total_supply: number;
  total_supply_formatted: number;
  links: object | null; // Similarly [object Object]
  description: string;
  is_verified_contract: boolean;
  possible_spam: boolean;
  total_buy_volume_1m: number;
  total_buy_volume_5m: number;
  total_buy_volume_30m: number;
  total_buy_volume_1h: number;
  total_sell_volume_1m: number;
  total_sell_volume_5m: number;
  total_sell_volume_30m: number;
  total_sell_volume_1h: number;
  total_buyers_1m: number;
  total_buyers_5m: number;
  total_buyers_30m: number;
  total_buyers_1h: number;
  total_sellers_1m: number;
  total_sellers_5m: number;
  total_sellers_30m: number;
  total_sellers_1h: number;
  total_buys_1m: number;
  total_buys_5m: number;
  total_buys_30m: number;
  total_buys_1h: number;
  total_sells_1m: number;
  total_sells_5m: number;
  total_sells_30m: number;
  total_sells_1h: number;
  unique_wallets_1m: number;
  unique_wallets_5m: number;
  unique_wallets_30m: number;
  unique_wallets_1h: number;
  price_percent_change_1m: number;
  price_percent_change_5m: number;
  price_percent_change_30m: number;
  price_percent_change_1h: number;
  sol_price: number;
  usd_price: number;
  market_cap_usd: number;
  total_liquidity_usd: number;
  total_fully_diluted_valuation: number;
  total_snipers: number;
  pair_address: string;
  migrated_pool_address?: string; // Migrated pool address for tokens that have been migrated
  total_holders: number;
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
  bonding_curve_progress: number | string;
  bonding_pct?: number; // Bonding percentage for fallback
  uri?: string; // IPFS metadata URI
  // Protocol/AMM information
  launchpad_protocol?: string; // Backend protocol field
  protocol?: string; // Alternative protocol field
  amm_id?: string; // AMM identifier
  launchpadProtocol?: string; // Alternative protocol field name
  // Total fees for all trades on this token (in lamports)
  total_fees_lamports?: number;
  // Holder and KOL metrics from WebSocket
  holder_count?: number;
  kol_count?: number;
  // Dev token tracking
  dev_tokens_created?: number;
  dev_tokens_migrated?: number;
  // Migration status from Go backend
  status?: string;
  migrated_time?: string;
  // Dev/creator wallet for blacklist
  dev_wallet?: string;
  creator_wallet?: string;
  // Mayhem Mode — true when token is inside the 24h Mayhem hot window.
  // Drives red border, red protocol-icon tint, and fire countdown badge.
  is_mayhem_mode?: boolean;
  launch_time?: string;
};

/**
 * Formats very small prices with subscript notation for leading zeros.
 * Examples:
 *   0.00035268 => "0.0₃52"
 *   0.00000012 => "0.0₆12"
 *   0.123456   => "0.123"
 *   0.5        => "0.5"
 */
export function formatSmallPrice(
  val: string | number | null | undefined,
): string {
  if (val === null || val === undefined) return "-";

  const num = typeof val === "string" ? parseFloat(val) : val;

  if (isNaN(num) || !isFinite(num)) {
    return "-";
  }

  // Handle negative numbers
  const isNegative = num < 0;
  const abs = Math.abs(num);

  // If number is >= 0.01, use regular formatting
  // For very small numbers (< 0.01), use subscript notation
  if (abs >= 0.01) {
    return (isNegative ? "-" : "") + abs.toFixed(abs >= 1 ? 2 : 4);
  }

  // For very small numbers, convert to string to count leading zeros
  const str = abs.toString();

  // For scientific notation like "3.526868e-4", convert to decimal
  let decimalStr: string;
  if (str.includes("e")) {
    const [base, exponent] = str.split("e");
    const exp = parseInt(exponent);
    decimalStr = (parseFloat(base) * Math.pow(10, exp)).toFixed(
      Math.abs(exp) + 10,
    );
  } else if (str.includes(".")) {
    decimalStr = str;
  } else {
    decimalStr = abs.toFixed(20);
  }

  // Count leading zeros after decimal point
  const match = decimalStr.match(/\.(0*)([1-9].*)/);

  if (!match) {
    // No leading zeros, just format normally
    return (isNegative ? "-" : "") + abs.toFixed(4);
  }

  const [, leadingZeros, significantDigits] = match;
  const zeroCount = leadingZeros.length;

  // Format significant digits (take first 2 digits)
  const formattedDigits = significantDigits.slice(0, 2);

  // Convert zero count to subscript
  const subscript = zeroCount
    .toString()
    .split("")
    .map((d) => String.fromCharCode(0x2080 + parseInt(d)))
    .join("");

  return (isNegative ? "-" : "") + `0.0${subscript}${formattedDigits}`;
}

/**
 * Formats a number into a human-readable abbreviated form.
 * Examples:
 *   1234567    => "1.23M"
 *   1000       => "1K"
 *   0.0054321  => "0.0054"
 *   0.00000012 => "0.00000012"
 *   "abc"      => "-"
 */
export function formatSmartNumber(
  val: string | number | null | undefined,
): string {
  if (val === null || val === undefined) return "-";

  const num = typeof val === "string" ? parseFloat(val) : val;

  if (isNaN(num) || !isFinite(num)) {
    return "-";
  }

  const abs = Math.abs(num);

  // Handle very small values (< $0.01) with subscript notation: 0.0₅123
  if (abs > 0 && abs < 0.01) {
    const str = abs.toFixed(20);
    const decIdx = str.indexOf(".");
    if (decIdx !== -1) {
      let zeroCount = 0;
      let sigDigits = "";
      for (let i = decIdx + 1; i < str.length; i++) {
        if (str[i] === "0") {
          zeroCount++;
        } else {
          sigDigits = str
            .substring(i, Math.min(i + 4, str.length))
            .replace(/0+$/, "");
          break;
        }
      }
      if (zeroCount >= 2 && sigDigits) {
        const subMap: Record<string, string> = {
          "0": "₀",
          "1": "₁",
          "2": "₂",
          "3": "₃",
          "4": "₄",
          "5": "₅",
          "6": "₆",
          "7": "₇",
          "8": "₈",
          "9": "₉",
        };
        const sub = zeroCount
          .toString()
          .split("")
          .map((c) => subMap[c] || c)
          .join("");
        return `${num < 0 ? "-" : ""}0.0${sub}${sigDigits}`;
      }
    }
    return num.toFixed(1);
  }

  // Handle small values (< $1) with 1 decimal place
  if (abs < 1) {
    return num.toFixed(1);
  }

  // Handle values < $1000 with 1 decimal place
  if (abs < 1000) {
    return num.toFixed(1);
  }

  const abbreviations = [
    { value: 1e12, suffix: "T" },
    { value: 1e9, suffix: "B" },
    { value: 1e6, suffix: "M" },
    { value: 1e3, suffix: "K" },
  ];

  for (const { value, suffix } of abbreviations) {
    if (abs >= value) {
      const formatted = (num / value).toFixed(1);
      return formatted.endsWith(".0")
        ? `${parseInt(formatted)}${suffix}`
        : `${formatted}${suffix}`;
    }
  }

  // Fallback for values >= $1000 but < $1K (shouldn't happen with above logic)
  return num.toFixed(1);
}

/**
 * Formats market cap values with 2 decimal places (100th place) instead of 3.
 * Examples:
 *   1234567    => "1.23M"
 *   1000       => "1.00K"
 *   346141     => "346.14K"
 *   1438000    => "1.44M"
 */
export function formatMarketCap(
  val: string | number | null | undefined,
): string {
  if (val === null || val === undefined) return "-";

  const num = typeof val === "string" ? parseFloat(val) : val;

  if (isNaN(num) || !isFinite(num)) {
    return "-";
  }

  const abs = Math.abs(num);

  // Handle very small values (< $0.01) with 1 decimal place
  if (abs > 0 && abs < 0.01) {
    return num.toFixed(1);
  }

  // Handle small values (< $1) with 1 decimal place
  if (abs < 1) {
    return num.toFixed(1);
  }

  // Handle values < $1000 with 1 decimal place
  if (abs < 1000) {
    return num.toFixed(1);
  }

  const abbreviations = [
    { value: 1e12, suffix: "T" },
    { value: 1e9, suffix: "B" },
    { value: 1e6, suffix: "M" },
    { value: 1e3, suffix: "K" },
  ];

  for (const { value, suffix } of abbreviations) {
    if (abs >= value) {
      const formatted = (num / value).toFixed(1);
      return formatted.endsWith(".0")
        ? `${parseInt(formatted)}${suffix}`
        : `${formatted}${suffix}`;
    }
  }

  // Fallback for values >= $1000 but < $1K (shouldn't happen with above logic)
  return num.toFixed(1);
}

/**
 * Formats lamports to SOL with appropriate abbreviation.
 * 1 SOL = 1,000,000,000 lamports
 * Examples:
 *   5000000000  => "5 SOL"
 *   1500000000  => "1.5 SOL"
 *   500000000   => "0.5 SOL"
 *   50000000000 => "50 SOL"
 */
export function formatLamportsToSol(
  lamports: number | null | undefined,
): string {
  if (lamports === null || lamports === undefined || lamports === 0) return "-";

  const sol = lamports / 1_000_000_000;

  if (sol >= 1000) {
    return formatSmartNumber(sol) + " SOL";
  } else if (sol >= 1) {
    return sol.toFixed(2) + " SOL";
  } else {
    return sol.toFixed(4) + " SOL";
  }
}

/**
 * Normalize a timestamp value to milliseconds.
 * Handles multiple formats:
 * - Unix timestamp in seconds (number): 1737470242
 * - Unix timestamp in milliseconds (number): 1737470242000
 * - Unix timestamp as string: "1737470242" or "1737470242000"
 * - ISO date string: "2026-01-21T14:37:22.657244Z"
 * - Object formats: { Time: "..." }, { seconds: 123 }, { millis: 123 }
 * - Date objects
 *
 * @param value - The timestamp value to normalize
 * @param options - Optional configuration
 * @param options.rejectUnreasonable - If true, reject dates > 5 years in past (default: true)
 * @returns Timestamp in milliseconds, or null if invalid/unreasonable
 */
export function normalizeTimestampMs(
  value: any,
  options?: { rejectUnreasonable?: boolean },
): number | null {
  const { rejectUnreasonable = true } = options || {};

  if (value === null || value === undefined || value === "") return null;

  let v: any = value;

  // Handle object formats (e.g., { Time: "..." }, { seconds: 123 })
  if (typeof v === "object" && v !== null) {
    if ("Time" in v && typeof v.Time === "string") v = v.Time;
    else if ("time" in v && typeof v.time === "string") v = v.time;
    else if ("seconds" in v && typeof v.seconds === "number")
      v = v.seconds * 1000;
    else if ("millis" in v && typeof v.millis === "number") v = v.millis;
    else if (v instanceof Date) v = v.getTime();
    else return null;
  }

  let ts: number | null = null;

  if (typeof v === "number") {
    // Heuristic: 13+ digits = milliseconds, 10-12 digits = seconds
    if (v > 1e12) ts = v;
    else if (v > 1e9) ts = v * 1000;
    else ts = null;
  } else if (typeof v === "string") {
    // First try parsing as a numeric string (Unix timestamp)
    const num = Number(v);
    if (!Number.isNaN(num) && num > 0) {
      if (num > 1e12) ts = num;
      else if (num > 1e9) ts = num * 1000;
    }
    // If not a valid number, try parsing as ISO date string
    if (ts === null) {
      const parsed = Date.parse(v);
      if (!Number.isNaN(parsed)) ts = parsed;
    }
  }

  if (ts === null) return null;

  // Sanity check: reject dates that are clearly unreasonable for token ages
  // - More than 5 years in the past (no crypto token is that old in this context)
  // - More than 1 day in the future (clock skew tolerance)
  if (rejectUnreasonable) {
    const now = Date.now();
    const fiveYearsMs = 5 * 365 * 24 * 60 * 60 * 1000;
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (ts < now - fiveYearsMs) {
      console.warn(
        "[normalizeTimestampMs] Rejecting unreasonable timestamp (>5 years old):",
        { value, parsedTs: ts, parsedDate: new Date(ts).toISOString() },
      );
      return null;
    }
    if (ts > now + oneDayMs) {
      console.warn(
        "[normalizeTimestampMs] Rejecting unreasonable timestamp (>1 day in future):",
        { value, parsedTs: ts, parsedDate: new Date(ts).toISOString() },
      );
      return null;
    }
  }

  return ts;
}

/**
 * Normalize a timestamp value to an ISO string.
 * Use this when storing/passing timestamp data to ensure consistent format.
 *
 * @returns ISO string like "2026-01-21T14:37:22.657Z", or null if invalid
 */
export function normalizeTimestampToISO(value: any): string | null {
  const ts = normalizeTimestampMs(value);
  if (ts === null) return null;
  return new Date(ts).toISOString();
}
