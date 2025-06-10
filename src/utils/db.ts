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
  token_address: string;
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
  usd_price: number;
  total_liquidity_usd: number;
  total_fully_diluted_valuation: number;
  total_snipers: number;
  pair_address: string;
  total_holders: number;
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
};

export function formatSmartNumber(val: string | number): string {
  let num = typeof val === "string" ? Number(val) : val;
  if (isNaN(num)) return "-";
  const absNum = Math.abs(num);
  if (absNum >= 1e12) {
    return (num / 1e12).toFixed(2).replace(/\.00$/, "") + "T";
  } else if (absNum >= 1e9) {
    return (num / 1e9).toFixed(2).replace(/\.00$/, "") + "B";
  } else if (absNum >= 1e6) {
    return (num / 1e6).toFixed(2).replace(/\.00$/, "") + "M";
  } else if (absNum >= 1e3) {
    return (num / 1e3).toFixed(2).replace(/\.00$/, "") + "K";
  }
  if (absNum >= 0.01) {
    return num.toFixed(2);
  }
  const str = absNum.toString();
  const match = str.match(/^0\.0*(\d{1,2})/);
  if (match) {
    const firstNonZero = str.match(/^0\.0*([1-9]\d?)/);
    if (firstNonZero) {
      const idx = str.indexOf(firstNonZero[1]) + firstNonZero[1].length;
      return num < 0 ? "-" + str.slice(0, idx) : str.slice(0, idx);
    }
  }
  return num.toString();
}

