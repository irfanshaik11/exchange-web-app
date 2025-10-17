import type { NextApiRequest, NextApiResponse } from "next";
import { getSolBalance } from "~/utils/functions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const addr = decodeURIComponent(req.query.address as string);


  // DEVNET _ TRUE
  try {
    const balance = await getSolBalance(addr, false);
    const ratio = await getSolPriceInUSDC();
    console.log(ratio)
    res.status(200).json({ data: { balance, usdBalance: ratio * balance }})
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e })
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
    console.error('Failed to fetch SOL price from Pyth:', error);
  }
  return null;
}