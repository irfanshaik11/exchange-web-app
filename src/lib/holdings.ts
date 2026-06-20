// src/lib/holdings.ts
// Turns raw tokenBalances into a render-ready, zero-suppressed, token-first list.

export interface ChainBalance {
  chain: string;
  amount: number;
}
export interface TokenHolding {
  token: string; // 'USDC'
  total: number; // sum across chains
  chains: ChainBalance[]; // funded chains only, desc by amount
  singleChain: boolean; // true => render one collapsed line
}

/** Build a token-first holdings list. Drops any token/chain with no positive balance. */
export function buildHoldings(
  tokenBalances: Record<string, Record<string, number>>,
): TokenHolding[] {
  const holdings: TokenHolding[] = [];
  for (const [token, perChain] of Object.entries(tokenBalances || {})) {
    const chains = Object.entries(perChain)
      .filter(([, amt]) => amt > 0)
      .map(([chain, amount]) => ({ chain, amount }))
      .sort((a, b) => b.amount - a.amount);
    if (chains.length === 0) continue;
    const total = chains.reduce((s, c) => s + c.amount, 0);
    holdings.push({ token, total, chains, singleChain: chains.length === 1 });
  }
  return holdings.sort((a, b) => b.total - a.total);
}
