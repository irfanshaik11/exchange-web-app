/**
 * Quote-currency primitives for Solana trades on the frontend.
 *
 * Mirror of memecoin-backend (4)/src/utils/quoteCurrency.ts — keep in sync.
 *
 * The single source of truth on the FE for:
 *   - which currencies the user can spend / receive
 *   - their mint addresses (for ATA lookups, balance fetches)
 *   - their on-chain decimals (UI -> raw conversion)
 */

export type QuoteCurrency = "SOL" | "USDC";

export const QUOTE_MINTS: Record<QuoteCurrency, string> = {
    SOL: "So11111111111111111111111111111111111111112",
    USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

export const QUOTE_DECIMALS: Record<QuoteCurrency, number> = {
    SOL: 9,
    USDC: 6,
};

/** UI -> raw multiplier. 1 SOL = 1e9 lamports; 1 USDC = 1e6 micro-USDC. */
export const quoteUnit = (c: QuoteCurrency): number => 10 ** QUOTE_DECIMALS[c];

/** Display symbol for the active currency. */
export const quoteSymbol = (c: QuoteCurrency): string => c;

/** Min trade amount in UI units per currency. Matches backend QUOTE_MIN_TRADE. */
export const QUOTE_MIN_TRADE: Record<QuoteCurrency, number> = {
    SOL: 0.0001,
    USDC: 0.01,
};

/** Max trade amount in UI units per currency. SOL ceiling preserved; USDC scaled to the equivalent USD. */
export const QUOTE_MAX_TRADE: Record<QuoteCurrency, number> = {
    SOL: 1000,
    USDC: 150000,
};

/** Sensible preset defaults per currency for the deep trade UIs. */
export const QUOTE_BUY_PRESETS: Record<QuoteCurrency, number[]> = {
    SOL: [0.01, 0.1, 0.5, 1],
    USDC: [1, 5, 25, 100],
};

/** Normalize an unknown value into a valid QuoteCurrency; defaults to SOL. */
export function parseQuoteCurrency(raw: unknown): QuoteCurrency {
    if (raw === "USDC" || raw === "usdc") return "USDC";
    return "SOL";
}

/** Default quote currency for any code path that lacks an explicit choice. */
export const DEFAULT_QUOTE_CURRENCY: QuoteCurrency = "SOL";

/** SOL gas-dust threshold required for non-SOL trades (must hold this much SOL for tx fees). */
export const NON_SOL_GAS_DUST_SOL = 0.002;

/**
 * Price of one token in the active quote currency's unit: SOL keeps price-in-SOL;
 * USDC converts to price-in-USD (priceInSol * solPrice). Returns 0 on unusable
 * inputs so callers can safely hide estimates.
 */
export function quoteUnitTokenPrice(
    tokenPriceInSol: number,
    solPriceUsd: number,
    quote: QuoteCurrency,
): number {
    if (!Number.isFinite(tokenPriceInSol) || tokenPriceInSol <= 0) return 0;
    if (quote === "USDC") {
        const sol =
            Number.isFinite(solPriceUsd) && solPriceUsd > 0 ? solPriceUsd : 0;
        return tokenPriceInSol * sol;
    }
    return tokenPriceInSol;
}

/**
 * Tokens received for a spend `amount` in the active quote currency.
 * SOL: amount / price-in-SOL. USDC: amount / price-in-USD. Single source of
 * truth for buy estimates so SOL/USDC token counts can't drift.
 */
export function tokensForAmount(
    amount: number,
    tokenPriceInSol: number,
    solPriceUsd: number,
    quote: QuoteCurrency,
): number {
    const a = Number(amount);
    const unitPrice = quoteUnitTokenPrice(tokenPriceInSol, solPriceUsd, quote);
    if (!Number.isFinite(a) || a <= 0 || unitPrice <= 0) return 0;
    return a / unitPrice;
}

/**
 * Seed the primary wallet's USDC balance into a per-wallet balance map when it
 * lacks a positive value, so trade allocation/validation always has a balance to
 * use. No-op for SOL. Both trade surfaces call this — one seed, no drift.
 */
export function seedPrimaryQuoteBalance(
    walletUsdcBalances: Record<string, number> | undefined,
    primaryAddress: string | undefined,
    fallbackBalance: number,
    quote: QuoteCurrency,
): Record<string, number> {
    const map = walletUsdcBalances ?? {};
    if (quote !== "USDC") return map;
    const addr = (primaryAddress ?? "").trim();
    if (!addr || (map[addr] ?? 0) > 0) return map;
    return { ...map, [addr]: Number(fallbackBalance) || 0 };
}
