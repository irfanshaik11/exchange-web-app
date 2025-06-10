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

export interface Token {
  bonding_completion_percentage: string;
  bonding_status: string;
  bundlers: string;
  buy_transaction_count_1h: number;
  buy_transaction_count_5m: number;
  buy_transaction_count_6h: number;
  buy_transaction_count_24h: number;
  buy_volume_1h: string;
  buy_volume_5m: string;
  buy_volume_6h: string;
  buy_volume_24h: string;
  created_at: string;
  data_source: string;
  dev_holding_percentage: string;
  dev_tokens: string[];
  developer_address: string;
  dex_paid: boolean;
  global_fees_paid: string;
  holders: string[];
  holders_count: number;
  insiders: string;
  label: string;
  liquidity: string;
  logo: string;
  lp_burned: string;
  market_cap_total: string;
  name: string;
  paid_audit: boolean;
  price: string;
  price_change_1h: string;
  price_change_5m: string;
  price_change_6h: string;
  price_change_24h: string;
  price_native: string;
  pro_traders: number;
  sell_transaction_count_1h: number;
  sell_transaction_count_5m: number;
  sell_transaction_count_6h: number;
  sell_transaction_count_24h: number;
  sell_volume_1h: string;
  sell_volume_5m: string;
  sell_volume_6h: string;
  sell_volume_24h: string;
  snipers_holding: string;
  social_telegram: string | null;
  social_website: string | null;
  social_x: string | null;
  supply: string;
  token_address: string;
  top_holders_percentage: string;
  txn_change_1h: string;
  txn_change_5m: string;
  txn_change_6h: string;
  txn_change_24h: string;
  txns: number;
  updated_at: string;
  volume: string;
}

