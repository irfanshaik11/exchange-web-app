import type { NextApiRequest, NextApiResponse } from "next";

interface AddressInput {
  address: string;
  chain: "sol" | "monad";
}

interface BalanceResult {
  balance: number;
  usdBalance: number;
  cached?: boolean;
}

interface BatchBalanceResponse {
  ok: boolean;
  balances: Record<string, BalanceResult>;
  solPrice: number;
  timestamp: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { addresses } = req.body as { addresses?: AddressInput[] };

  if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
    return res.status(400).json({
      error: "addresses array is required",
      example: {
        addresses: [
          { address: "So11111111111111111111111111111111111111112", chain: "sol" },
          { address: "0x1234...", chain: "monad" }
        ]
      }
    });
  }

  // Validate addresses
  const validAddresses = addresses.filter(item => {
    if (!item.address || !item.chain) return false;
    if (item.chain === "sol") {
      return item.address.length >= 32 && item.address.length <= 44 &&
             /^[1-9A-HJ-NP-Za-km-z]+$/.test(item.address);
    } else if (item.chain === "monad") {
      return /^0x[a-fA-F0-9]{40}$/.test(item.address);
    }
    return false;
  });

  if (validAddresses.length === 0) {
    return res.status(400).json({ error: "No valid addresses provided" });
  }

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

  if (!backendUrl) {
    // Fallback to local balance fetching if backend URL is not configured
    return await fetchBalancesLocally(validAddresses, res);
  }

  try {
    const response = await fetch(`${backendUrl}/api/wallets/balances`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ addresses: validAddresses }),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`Backend responded with ${response.status}`);
    }

    const data: BatchBalanceResponse = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.warn("Backend batch balance fetch failed, falling back to local:", error);
    // Fallback to local fetching
    return await fetchBalancesLocally(validAddresses, res);
  }
}

/**
 * Fallback: Fetch balances locally if backend is not available
 */
async function fetchBalancesLocally(
  addresses: AddressInput[],
  res: NextApiResponse
) {
  const { getSolBalance, getMonadBalance } = await import("~/utils/functions");
  const { getSolPriceInUSDC } = await import("./get-sol-bal");

  const solPrice = await getSolPriceInUSDC();
  const balances: Record<string, BalanceResult> = {};

  // Fetch in parallel
  await Promise.all(
    addresses.map(async ({ address, chain }) => {
      try {
        let balance: number | null = null;

        if (chain === "sol") {
          balance = await getSolBalance(address, false);
        } else if (chain === "monad") {
          balance = await getMonadBalance(address);
        }

        balances[address] = {
          balance: balance ?? 0,
          usdBalance: chain === "sol" && solPrice && balance ? balance * solPrice : 0,
          cached: false,
        };
      } catch (error) {
        console.error(`Failed to fetch balance for ${address}:`, error);
        balances[address] = {
          balance: 0,
          usdBalance: 0,
          cached: false,
        };
      }
    })
  );

  return res.status(200).json({
    ok: true,
    balances,
    solPrice: solPrice || 0,
    timestamp: Date.now(),
  });
}
