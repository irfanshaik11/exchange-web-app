import { useState, useEffect, useCallback, useRef } from "react";

const GO_SERVICE_URL = process.env.NEXT_PUBLIC_GO_SERVICE_URL || "";
const DEFAULT_SUPPLY = 1_000_000_000;

interface SupplyResponse {
  circulating_supply: string;
  total_supply: string;
  decimals: number;
  mint: string;
}

interface UseTokenSupplyResult {
  circulatingSupply: number;
  isLoading: boolean;
  refetch: () => void;
}

export default function useTokenSupply(mint: string | undefined | null): UseTokenSupplyResult {
  const [circulatingSupply, setCirculatingSupply] = useState<number>(DEFAULT_SUPPLY);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastMintRef = useRef<string | null>(null);

  const fetchSupply = useCallback(
    async (mintAddr: string) => {
      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      try {
        const res = await fetch(`${GO_SERVICE_URL}/v1/supply/${mintAddr}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: SupplyResponse = await res.json();
        const parsed = parseFloat(data.circulating_supply);
        setCirculatingSupply(
          Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SUPPLY,
        );
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        // Endpoint failed — fall back to 1B
        setCirculatingSupply(DEFAULT_SUPPLY);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!mint || mint.length < 20) {
      setCirculatingSupply(DEFAULT_SUPPLY);
      return;
    }
    // Don't refetch if the mint hasn't changed
    if (mint === lastMintRef.current) return;
    lastMintRef.current = mint;
    fetchSupply(mint);

    return () => {
      abortRef.current?.abort();
    };
  }, [mint, fetchSupply]);

  const refetch = useCallback(() => {
    if (mint && mint.length >= 20) {
      fetchSupply(mint);
    }
  }, [mint, fetchSupply]);

  return { circulatingSupply, isLoading, refetch };
}
