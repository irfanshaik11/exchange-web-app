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


export interface DexToken {
  tokenAddress: string;
  name: string;
  symbol: string;
  logo: string;
  decimals: string;
  priceNative: string;
  priceUsd: string;
  liquidity: string;
  fullyDilutedValuation: string;
  bondingCurveProgress: number;
}

export interface DexTokenResponse {
  result: DexToken[];
}

