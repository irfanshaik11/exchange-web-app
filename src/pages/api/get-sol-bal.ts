import type { NextApiRequest, NextApiResponse } from "next";
import { getSolBalance } from "~/utils/functions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const addr = decodeURIComponent(req.query.address as string);

  try {
    const balance = await getSolBalance(addr);
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
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await res.json();
    return data.solana.usd;
  } catch (error) {
    console.error('Failed to fetch SOL price in USDC:', error);
    return null;
  }
}