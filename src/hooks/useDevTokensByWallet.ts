import { useState, useEffect } from "react";

const isDev = process.env.NODE_ENV !== "production";

export interface DevTokenByWallet {
  token: {
    address: string;
    name: string;
    symbol: string;
    image?: string | null;
    launchpad_protocol?: string | null;
    createdAt: number;
    creatorAddress: string;
    migrated_pool_address?: string | null;
  };
  marketCap: string;
  liquidity: string;
  volume24: string;
}

interface DevTokensResponse {
  filterTokens?: { results?: DevTokenByWallet[] };
  results?: DevTokenByWallet[];
}

export default function useDevTokensByWallet(
  walletAddress: string | undefined,
  limit = 50,
) {
  const [tokens, setTokens] = useState<DevTokenByWallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) {
      setTokens([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchByParam = async (param: "creatorAddress" | "walletAddress") => {
      const baseUrl = process.env.NEXT_PUBLIC_GO_SERVICE_URL;
      const url = new URL(`${baseUrl}/v1/tokens/dev`);
      url.searchParams.set(param, walletAddress);
      url.searchParams.set("limit", String(limit));

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) return null;
      const result: DevTokensResponse = await response.json();
      return result.filterTokens?.results || result.results || [];
    };

    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        let results = await fetchByParam("creatorAddress");
        if (!results || results.length === 0) {
          results = await fetchByParam("walletAddress");
        }
        if (!cancelled) {
          setTokens(results || []);
          isDev &&
            console.log(
              `[DevTokensByWallet] Found ${results?.length || 0} tokens for ${walletAddress}`,
            );
        }
      } catch (err) {
        isDev && console.log("[DevTokensByWallet] Fetch error (handled):", err);
        if (!cancelled) setTokens([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [walletAddress, limit]);

  return { tokens, isLoading, error };
}
