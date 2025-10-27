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
  total_buy_volume_5m: number;
  total_buy_volume_1h: number;
  total_buy_volume_6h: number;
  total_buy_volume_24h: number;
  total_sell_volume_5m: number;
  total_sell_volume_1h: number;
  total_sell_volume_6h: number;
  total_sell_volume_24h: number;
  total_buyers_5m: number;
  total_buyers_1h: number;
  total_buyers_6h: number;
  total_buyers_24h: number;
  total_sellers_5m: number;
  total_sellers_1h: number;
  total_sellers_6h: number;
  total_sellers_24h: number;
  total_buys_5m: number;
  total_buys_1h: number;
  total_buys_6h: number;
  total_buys_24h: number;
  total_sells_5m: number;
  total_sells_1h: number;
  total_sells_6h: number;
  total_sells_24h: number;
  unique_wallets_5m: number;
  unique_wallets_1h: number;
  unique_wallets_6h: number;
  unique_wallets_24h: number;
  price_percent_change_5m: number;
  price_percent_change_1h: number;
  price_percent_change_6h: number;
  price_percent_change_24h: number;
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
};

/**
 * Formats very small prices with subscript notation for leading zeros.
 * Examples:
 *   0.00035268 => "0.0₃52268"
 *   0.00000012 => "0.0₆12"
 *   0.123456   => "0.123"
 *   0.5        => "0.5"
 */
export function formatSmallPrice(val: string | number | null | undefined): string {
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
    return (isNegative ? '-' : '') + abs.toFixed(abs >= 1 ? 2 : 4);
  }

  // For very small numbers, convert to string to count leading zeros
  const str = abs.toString();
  
  // For scientific notation like "3.526868e-4", convert to decimal
  let decimalStr: string;
  if (str.includes('e')) {
    const [base, exponent] = str.split('e');
    const exp = parseInt(exponent);
    decimalStr = (parseFloat(base) * Math.pow(10, exp)).toFixed(Math.abs(exp) + 10);
  } else if (str.includes('.')) {
    decimalStr = str;
  } else {
    decimalStr = abs.toFixed(20);
  }

  // Count leading zeros after decimal point
  const match = decimalStr.match(/\.(0*)([1-9].*)/);
  
  if (!match) {
    // No leading zeros, just format normally
    return (isNegative ? '-' : '') + abs.toFixed(4);
  }

  const [, leadingZeros, significantDigits] = match;
  const zeroCount = leadingZeros.length;

  // Format significant digits (take first 6-7 digits)
  const formattedDigits = significantDigits.slice(0, 6);
  
  // Convert zero count to subscript
  const subscript = zeroCount.toString().split('').map(d => 
    String.fromCharCode(0x2080 + parseInt(d))
  ).join('');

  return (isNegative ? '-' : '') + `0.0${subscript}${formattedDigits}`;
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
export function formatSmartNumber(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "-";

  const num = typeof val === "string" ? parseFloat(val) : val;

  if (isNaN(num) || !isFinite(num)) {
    return "-";
  }

  const abs = Math.abs(num);

  // Handle very small values (< $0.01) with 3 decimal places
  if (abs > 0 && abs < 0.01) {
    return num.toFixed(3);
  }

  // Handle small values (< $1) with 3 decimal places
  if (abs < 1) {
    return num.toFixed(3);
  }

  // Handle values < $1000 with 3 decimal places
  if (abs < 1000) {
    return num.toFixed(3);
  }

  const abbreviations = [
    { value: 1e12, suffix: "T" },
    { value: 1e9, suffix: "B" },
    { value: 1e6, suffix: "M" },
    { value: 1e3, suffix: "K" },
  ];

  for (const { value, suffix } of abbreviations) {
    if (abs >= value) {
      const formatted = (num / value).toFixed(3);
      return formatted.endsWith(".000")
        ? `${parseInt(formatted)}${suffix}`
        : `${formatted}${suffix}`;
    }
  }

  // Fallback for values >= $1000 but < $1K (shouldn't happen with above logic)
  return num.toFixed(3);
}



