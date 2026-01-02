"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";

const BLOCKVISION_API_KEY = process.env.NEXT_PUBLIC_BLOCKVISION_API_KEY;

const ensureMs = (ts: unknown): number | null => {
  if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) return null;
  return ts < 1_000_000_000_000 ? ts * 1000 : ts;
};

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs = 10_000,
) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
};

export default function WalletTransactionsPage() {
  const router = useRouter();
  const { address } = router.query;
  const walletAddress = typeof address === "string" ? address : "";

  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchTransactions = async () => {
    console.log("[wallet:transactions] Starting fetch", {
      walletAddress,
      hasApiKey: !!BLOCKVISION_API_KEY,
    });

    if (!walletAddress || !BLOCKVISION_API_KEY) {
      console.warn("[wallet:transactions] Missing walletAddress or API key", {
        walletAddress,
        hasApiKey: !!BLOCKVISION_API_KEY,
      });
      setLoading(false);
      return;
    }

    try {
      const url = `https://api.blockvision.org/v2/monad/account/transactions?address=${encodeURIComponent(
        walletAddress,
      )}&limit=10&ascendingOrder=false`;

      console.log("[wallet:transactions] Making request to:", url);

      const resp = await fetchWithTimeout(
        url,
        {
          method: "GET",
          headers: {
            accept: "application/json",
            "x-api-key": BLOCKVISION_API_KEY,
          },
        },
        10_000,
      );

      console.log("[wallet:transactions] Response status:", resp.status, resp.statusText);

      const text = await resp.text();
      console.log("[wallet:transactions] Response text length:", text.length);
      console.log("[wallet:transactions] Response text preview:", text.slice(0, 500));

      let payload: any = null;
      try {
        payload = JSON.parse(text);
        console.log("[wallet:transactions] Parsed payload:", {
          hasPayload: !!payload,
          code: payload?.code,
          message: payload?.message,
          hasResult: !!payload?.result,
          hasData: !!payload?.result?.data,
          dataIsArray: Array.isArray(payload?.result?.data),
          dataLength: Array.isArray(payload?.result?.data) ? payload.result.data.length : 0,
        });
      } catch (parseError) {
        console.error("[wallet:transactions] JSON parse error:", parseError);
        payload = null;
      }

      if (!resp.ok) {
        const msg =
          (payload && (payload.message || payload.error)) ||
          `HTTP ${resp.status} ${resp.statusText}`;
        console.error("[wallet:transactions] Response not OK:", msg);
        throw new Error(msg);
      }

      const data = Array.isArray(payload?.result?.data) ? payload.result.data : [];
      console.log("[wallet:transactions] Extracted data:", {
        dataLength: data.length,
        firstTx: data[0] ? {
          hash: data[0].hash,
          from: data[0].from,
          to: data[0].to,
          value: data[0].value,
          timestamp: data[0].timestamp,
          status: data[0].status,
        } : null,
      });
      
      const normalized = data.map((tx: any, index: number) => {
        const normalizedTx = {
          ...tx,
          timestamp: ensureMs(tx.timestamp) || tx.timestamp,
        };
        console.log(`[wallet:transactions] Normalized tx ${index}:`, {
          hash: normalizedTx.hash,
          timestamp: normalizedTx.timestamp,
          hasHash: !!normalizedTx.hash,
          hasFrom: !!normalizedTx.from,
          hasTo: !!normalizedTx.to,
        });
        return normalizedTx;
      });
      
      console.log("[wallet:transactions] Setting transactions state:", {
        count: normalized.length,
        transactions: normalized,
      });
      
      setTransactions(normalized);
      setError(null);
    } catch (err: any) {
      console.error("[wallet:transactions] Error in fetchTransactions:", err);
      console.error("[wallet:transactions] Error stack:", err?.stack);
      setError(err?.message || "Failed to fetch transactions");
    } finally {
      console.log("[wallet:transactions] Setting loading to false");
      setLoading(false);
    }
  };

  // Add this useEffect to log state changes
  useEffect(() => {
    console.log("[wallet:transactions] State update:", {
      loading,
      error,
      transactionsCount: transactions.length,
      transactions: transactions,
      walletAddress,
      routerReady: router.isReady,
    });
  }, [loading, error, transactions, walletAddress, router.isReady]);

  // Initial fetch
  useEffect(() => {
    if (!router.isReady) {
      console.log("[wallet:transactions] Router not ready yet");
      return;
    }
    if (walletAddress) {
      console.log("[wallet:transactions] Router ready, fetching transactions");
      fetchTransactions();
    } else {
      console.log("[wallet:transactions] No wallet address");
      setLoading(false);
    }
  }, [walletAddress, router.isReady]);

  // Poll every 20 seconds
  useEffect(() => {
    if (!router.isReady || !walletAddress || !BLOCKVISION_API_KEY) return;

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    pollingIntervalRef.current = setInterval(() => {
      fetchTransactions();
    }, 20_000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [walletAddress, router.isReady]);

  if (!walletAddress) {
    console.log("[wallet:transactions] No wallet address");
    return (
      <div className="flex h-screen items-center justify-center bg-[#050608] text-neutral-400">
        <p>Invalid wallet address</p>
      </div>
    );
  }

  console.log("[wallet:transactions] Rendering with:", {
    loading,
    error,
    transactionsCount: transactions.length,
  });

  const formatValue = (value: string) => {
    if (!value) return "0";
    try {
      const bigIntValue = BigInt(value);
      const divisor = BigInt(10 ** 18);
      const whole = bigIntValue / divisor;
      const remainder = bigIntValue % divisor;
      if (remainder === BigInt(0)) {
        return whole.toString();
      }
      const decimals = remainder.toString().padStart(18, "0");
      const decimalPart = decimals.slice(0, 6).replace(/0+$/, "") || "0";
      return `${whole.toString()}.${decimalPart}`;
    } catch {
      return "0";
    }
  };

  const formatAddress = (address: string) => {
    if (!address) return "-";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="min-h-screen bg-[#050608] text-neutral-200">
      {/* Header */}
      <div className="border-b border-neutral-800/60 bg-[#050608] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">Wallet Transactions</h1>
            <p className="mt-1 text-sm font-mono text-neutral-400">
              {formatAddress(walletAddress)}
            </p>
          </div>
          <div className="text-xs text-neutral-500">
            Auto-refreshes every 20 seconds
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-neutral-600 border-t-[#70E0B0]"></div>
              <p className="text-sm text-neutral-400">Loading transactions...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <p className="mb-4 text-sm text-red-400">{error}</p>
            </div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-neutral-400">No transactions found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse">
              <thead>
                <tr className="border-b border-neutral-800/60">
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400">Hash</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400">From</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400">To</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-neutral-400">Value</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-neutral-400">Fee</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-neutral-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  if (!tx || !tx.hash) return null;
                  
                  return (
                    <tr
                      key={tx.hash}
                      className="border-b border-neutral-800/30 transition-colors hover:bg-neutral-800/20"
                    >
                      <td className="px-4 py-3">
                        <a
                          href={`https://monadscan.com/tx/${tx.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-[#70E0B0] hover:underline"
                        >
                          {formatAddress(tx.hash)}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-300">
                        {tx.timestamp
                          ? new Date(tx.timestamp).toLocaleString()
                          : "Unknown"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-neutral-300">
                          {formatAddress(tx.from || "")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-neutral-300">
                          {formatAddress(tx.to || "")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-green-400">
                        {formatValue(tx.value || "0")} MONAD
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-neutral-400">
                        {formatValue(tx.transactionFee || "0")} MONAD
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block rounded px-2 py-1 text-xs font-medium ${
                            tx.status === 1
                              ? "bg-green-500/20 text-green-400"
                              : "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {tx.status === 1 ? "Success" : "Failed"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
