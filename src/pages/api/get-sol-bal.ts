import type { NextApiRequest, NextApiResponse } from "next";
import {
  getSolBalance,
  getMonadBalance,
  getUsdcSplBalance,
  getBnbBalance,
} from "~/utils/functions";
import { parseQuoteCurrency, type QuoteCurrency } from "~/utils/quoteCurrency";
import { fetchBnbUsdPrice } from "~/utils/bnbToken";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Only allow GET requests
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const chain = typeof req.query.chain === "string" ? req.query.chain : "sol";

  // Validate address parameter exists
  if (!req.query.address || typeof req.query.address !== "string") {
    return res.status(400).json({ error: "Address parameter is required" });
  }

  const addr = decodeURIComponent(req.query.address as string);

  if (chain === "sol") {
    // Basic Solana address validation (should be 32-44 characters, base58)
    if (
      addr.length < 32 ||
      addr.length > 44 ||
      !/^[1-9A-HJ-NP-Za-km-z]+$/.test(addr)
    ) {
      return res.status(400).json({ error: "Invalid Solana address format" });
    }
  } else {
    // EVM-style validation for Monad or other chains
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      return res.status(400).json({ error: "Invalid EVM address format" });
    }
  }

  try {
    let balance: number | null = null;
    let usdBalance = 0;

    // Optional quote-currency selector. Absent / non-USDC keeps SOL behavior.
    const quote: QuoteCurrency = parseQuoteCurrency(req.query.token);

    if (chain === "sol" && quote === "USDC") {
      // USDC SPL balance; 1 USDC ≈ $1, so usdBalance ≈ balance.
      balance = await getUsdcSplBalance(addr);
      usdBalance = balance;
    } else if (chain === "sol") {
      balance = await getSolBalance(addr, false);

      if (balance !== null) {
        const ratio = await getSolPriceInUSDC();
        usdBalance = ratio ? ratio * balance : 0;
      }
    } else if (chain === "monad") {
      balance = await getMonadBalance(addr);
      // TODO: replace with real MON/USD price feed when available
      // For now we leave usdBalance = 0
    } else if (chain === 'bnb' || chain === 'bsc') {
      balance = await getBnbBalance(addr);
      if (balance !== null) {
        const bnbUsd = await fetchBnbUsdPrice();
        usdBalance = bnbUsd && bnbUsd > 0 ? bnbUsd * balance : 0;
      }
    } else {
      return res.status(400).json({ error: "Unsupported chain" });
    }

    // Handle case where balance fetch failed
    if (balance === null) {
      return res.status(500).json({ error: "Failed to fetch balance" });
    }

    res.status(200).json({ data: { balance, usdBalance } });
  } catch (e) {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getSolPriceInUSDC(): Promise<number | null> {
  try {
    // Pyth Network price feed for SOL/USD
    const SOL_USD_FEED =
      "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
    const res = await fetch(
      `https://hermes.pyth.network/v2/updates/price/latest?ids%5B%5D=${SOL_USD_FEED}`,
      { signal: AbortSignal.timeout(5000) },
    );

    if (res.ok) {
      const data = await res.json();
      const priceData = data.parsed?.[0]?.price;
      if (priceData?.price && priceData?.expo) {
        const price = Number(priceData.price) * Math.pow(10, priceData.expo);
        return price;
      }
    }
  } catch (error) {
    // Price fetch failed - returning null to allow graceful degradation
  }
  return null;
}
