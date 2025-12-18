"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { FiArrowLeft, FiRefreshCw } from "react-icons/fi";

const BLOCKVISION_API_KEY = process.env.NEXT_PUBLIC_BLOCKVISION_API_KEY;

interface Transaction {
  hash: string;
  txId: number;
  blockNumber: number;
  transactionIndex: number;
  timestamp: number;
  from: string;
  to: string;
  value: string;
  transactionFee: string;
  gasUsed: number;
  contractAddress: string;
  status: number;
  methodID: string;
  methodName: string;
  fromAddress: {
    address: string;
    type: string;
    isContract: boolean;
    verified: boolean;
    ens: string;
    name: string;
    isContractCreated: boolean;
  };
  toAddress: {
    address: string;
    type: string;
    isContract: boolean;
    verified: boolean;
    ens: string;
    name: string;
    isContractCreated: boolean;
  };
}

interface BlockvisionResponse {
  code: number;
  reason: string;
  message: string;
  result: {
    data: Transaction[];
    nextPageCursor?: string;
  };
}

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

const formatTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleString();
};

const formatValue = (value: string) => {
  // Convert from wei to ETH/MONAD (18 decimals)
  const bigIntValue = BigInt(value);
  const divisor = BigInt(10 ** 18);
  const whole = bigIntValue / divisor;
  const remainder = bigIntValue % divisor;
  const decimals = remainder.toString().padStart(18, "0");
  const decimalPart = decimals.slice(0, 6).replace(/0+$/, "") || "0";
  return `${whole.toString()}.${decimalPart}`;
};

const formatAddress = (address: string) => {
  if (!address) return "-";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export default function WalletTransactionsPage() {
  const router = useRouter();
  const { address } = router.query;
  const walletAddress = typeof address === "string" ? address : "";

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fetchTransactionsRef = useRef<typeof fetchTransactions | null>(null);

  const fetchTransactions = async (showLoading = true) => {
    if (!walletAddress || !BLOCKVISION_API_KEY) {
      if (!BLOCKVISION_API_KEY) {
        setError("Blockvision API key not configured");
      }
      setLoading(false);
      return;
    }

    if (showLoading) {
      setIsRefreshing(true);
    }

    try {
      const url = `https://api.blockvision.org/v2/monad/account/transactions?address=${encodeURIComponent(
        walletAddress,
      )}&limit=10&ascendingOrder=false`;

      let resp: Response;
      try {
        resp = await fetchWithTimeout(
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
      } catch (fetchError: any) {
        // Check if it's a CORS error
        const msg = fetchError?.message || String(fetchError);
        if (/failed to fetch/i.test(msg) || /networkerror/i.test(msg) || fetchError?.name === "AbortError") {
          // Try fallback to proxy
          console.warn("[wallet:transactions] Direct fetch failed, trying proxy fallback");
          try {
            const proxyResp = await fetch("/api/blockvision/monad/last-active", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ wallets: [walletAddress], limit: 10 }),
            });
            const proxyPayload = await proxyResp.json().catch(() => null);
            if (
              proxyResp.ok &&
              proxyPayload?.ok === true &&
              Array.isArray(proxyPayload?.data) &&
              proxyPayload.data.length > 0
            ) {
              const item = proxyPayload.data[0];
              if (item?.wallet === walletAddress && item?.transactions) {
                // Proxy returns transactions in a different format, need to adapt
                // For now, let's just use the direct API call error handling
                throw new Error("Proxy response format not yet supported for full transaction list");
              }
            }
          } catch (proxyError) {
            console.error("[wallet:transactions] Proxy fallback failed:", proxyError);
          }
        }
        throw fetchError;
      }

      const text = await resp.text();
      let payload: any = null;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }

      if (!resp.ok) {
        const msg =
          (payload && (payload.message || payload.error || payload.reason)) ||
          `HTTP ${resp.status} ${resp.statusText}`;
        throw new Error(msg);
      }

      // Match the working implementation pattern - check result.data directly
      const data = Array.isArray(payload?.result?.data) ? payload.result.data : [];
      
      console.log("[wallet:transactions] API response", {
        walletAddress,
        hasPayload: !!payload,
        code: payload?.code,
        dataLength: data.length,
        firstTx: data[0] ? { hash: data[0].hash, timestamp: data[0].timestamp } : null,
      });
      
      // Normalize timestamps and set transactions
      const normalized = data.map((tx: any) => ({
        ...tx,
        timestamp: ensureMs(tx.timestamp) || tx.timestamp,
      }));
      setTransactions(normalized);
      setError(null);
      setLastFetchTime(new Date());
    } catch (err: any) {
      console.error("Failed to fetch transactions:", err);
      setError(err?.message || "Failed to fetch transactions");
      // Don't clear transactions on error, keep showing last successful fetch
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Store fetchTransactions in ref to avoid dependency issues
  fetchTransactionsRef.current = fetchTransactions;

  // Initial fetch - wait for router to be ready
  useEffect(() => {
    if (!router.isReady) return;
    if (walletAddress) {
      fetchTransactions(true);
    } else {
      setLoading(false);
    }
  }, [walletAddress, router.isReady]);

  // Set up polling every 20 seconds
  useEffect(() => {
    if (!router.isReady || !walletAddress || !BLOCKVISION_API_KEY) return;

    // Clear any existing interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Set up new interval - fetch every 20 seconds without showing loading state
    pollingIntervalRef.current = setInterval(() => {
      if (fetchTransactionsRef.current) {
        fetchTransactionsRef.current(false);
      }
    }, 20_000);

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [walletAddress, router.isReady]);

  const handleBack = () => {
    router.back();
  };

  const handleManualRefresh = () => {
    fetchTransactions(true);
  };

  if (!walletAddress) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#050608] text-neutral-400">
        <div className="text-center">
          <p className="mb-4">Invalid wallet address</p>
          <button
            onClick={handleBack}
            className="rounded-lg bg-neutral-800 px-4 py-2 text-sm text-white hover:bg-neutral-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050608] text-neutral-200">
      {/* Header */}
      <div className="border-b border-neutral-800/60 bg-[#050608] px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-400 transition-colors hover:bg-neutral-800/50 hover:text-white"
            >
              <FiArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white">
                Wallet Transactions
              </h1>
              <p className="mt-1 text-xs font-mono text-neutral-400">
                {formatAddress(walletAddress)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastFetchTime && (
              <span className="text-xs text-neutral-500">
                Last updated: {lastFetchTime.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                isRefreshing
                  ? "cursor-wait text-neutral-500"
                  : "text-neutral-400 hover:bg-neutral-800/50 hover:text-white"
              }`}
            >
              <FiRefreshCw
                className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 sm:px-6">
        {loading && transactions.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-neutral-600 border-t-[#70E0B0]"></div>
              <p className="text-sm text-neutral-400">Loading transactions...</p>
            </div>
          </div>
        ) : error && transactions.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <p className="mb-4 text-sm text-red-400">{error}</p>
              <button
                onClick={handleManualRefresh}
                className="rounded-lg bg-neutral-800 px-4 py-2 text-sm text-white hover:bg-neutral-700"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-neutral-400">
                Showing last 10 transactions
                {isRefreshing && (
                  <span className="ml-2 text-[#70E0B0]">(Refreshing...)</span>
                )}
              </p>
              {error && transactions.length > 0 && (
                <p className="text-xs text-yellow-400">
                  Warning: {error} (showing cached data)
                </p>
              )}
            </div>

            {transactions.length === 0 ? (
              <div className="flex h-64 items-center justify-center">
                <p className="text-sm text-neutral-400">
                  No transactions found
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-800/60">
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400">
                        Hash
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400">
                        Time
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400">
                        From
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400">
                        To
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-neutral-400">
                        Value
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-neutral-400">
                        Fee
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-neutral-400">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
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
                          {formatTimestamp(tx.timestamp)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-neutral-300">
                            {formatAddress(tx.from)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-neutral-300">
                            {formatAddress(tx.to)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-green-400">
                          {formatValue(tx.value)} MONAD
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-neutral-400">
                          {formatValue(tx.transactionFee)} MONAD
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

