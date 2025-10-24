import type { NextApiRequest, NextApiResponse } from "next";
import { getSolBalance } from "~/utils/functions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate address parameter exists
  if (!req.query.address || typeof req.query.address !== 'string') {
    return res.status(400).json({ error: 'Address parameter is required' });
  }

  const addr = decodeURIComponent(req.query.address as string);

  // Basic Solana address validation (should be 32-44 characters, base58)
  if (addr.length < 32 || addr.length > 44 || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(addr)) {
    return res.status(400).json({ error: 'Invalid Solana address format' });
  }

  try {
    const balance = await getSolBalance(addr, false);

    // Handle case where balance fetch failed
    if (balance === null) {
      return res.status(500).json({ error: 'Failed to fetch balance' });
    }

    const ratio = await getSolPriceInUSDC();
    const usdBalance = ratio ? ratio * balance : 0;

    res.status(200).json({ data: { balance, usdBalance }});
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getSolPriceInUSDC(): Promise<number | null> {
  try {
    // Pyth Network price feed for SOL/USD
    const SOL_USD_FEED = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
    const res = await fetch(
      `https://hermes.pyth.network/v2/updates/price/latest?ids%5B%5D=${SOL_USD_FEED}`,
      { signal: AbortSignal.timeout(5000) }
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