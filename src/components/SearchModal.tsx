"use client";

import React, { useEffect, useRef, useState } from "react";
import type { Token } from "~/utils/db";
import { formatSmartNumber } from "~/utils/db";
import { FaTrash } from "react-icons/fa";
import { FaBolt } from "react-icons/fa";
import InterstatePopout from "./InterstatePopout";
import { addToHistory, clearHistory, getHistory, type SearchHistoryItem } from "../utils/searchHistory";

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  /** Fired when a term is submitted or a history item is clicked */
  onSubmit?: (query: string) => void;
  /** Fired on every query change (debounced) while typing */
  onQueryChange?: (query: string) => void;
}

export default function SearchModal({ open, onClose, onSubmit, onQueryChange }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<Token[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const latestQueryRef = useRef<string>("");

  // Load history when the modal opens
  useEffect(() => {
    if (open) {
      setHistory(getHistory());
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    } else {
      setQuery("");
    }
  }, [open]);

  const handleSubmit = (tokenAddress: string) => {
    const trimmed = tokenAddress.trim();
    if (!trimmed) return;
    onSubmit?.(trimmed);
    onClose();
  };

  const handleSelectToken = (token: Token) => {
    const item: SearchHistoryItem = {
      token_address: token.token_address,
      symbol: token.symbol,
      name: token.name,
      logo: token.logo,
      total_fully_diluted_valuation: token.total_fully_diluted_valuation,
      total_buy_volume_24h: token.total_buy_volume_24h,
      total_sell_volume_24h: token.total_sell_volume_24h,
      total_liquidity_usd: token.total_liquidity_usd,
    };
    addToHistory(item);
    setHistory(getHistory());
    handleSubmit(token.token_address);
  };

  // Notify parent of query changes with 300ms debounce
  useEffect(() => {
    if (!open || !onQueryChange) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onQueryChange(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, onQueryChange, open]);

  // Fetch token results for display inside modal (debounced via same ref)
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      return;
    }

    const isAddress = trimmed.length >= 10;
    const param = isAddress ? "tokenaddress" : "name";

    const isLocalhost = typeof window !== "undefined" && window.location.hostname === "localhost";
    const baseURL = isLocalhost
      ? "/api/token-search"
      : process.env.NEXT_PUBLIC_TOKEN_SERVICE_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "";

    if (!baseURL) return;

    const url = isLocalhost
      ? `${baseURL}?${param}=${encodeURIComponent(trimmed)}`
      : `${baseURL}/search?${param}=${encodeURIComponent(trimmed)}`;

    // Abort any previous in-flight request
    if (controllerRef.current) controllerRef.current.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    latestQueryRef.current = trimmed;

    setLoadingResults(true);
    fetch(url, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        // Only process if this response matches the latest query
        if (latestQueryRef.current !== trimmed) return;
        const list: Token[] = Array.isArray(data?.result)
          ? data.result
          : Array.isArray(data)
          ? data
          : data
          ? [data]
          : [];
        setResults(list);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setResults([]);
        }
      })
      .finally(() => {
        if (latestQueryRef.current === trimmed) {
          setLoadingResults(false);
        }
      });

    return () => controller.abort();

  }, [query, open]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit(query);
    }
  };

  const handleHistoryClick = (term: string) => {
    handleSubmit(term);
  };

  const handleClearHistory = () => {
    clearHistory();
    setHistory([]);
  };

  if (!open) return null;

  return (
    <InterstatePopout open={open} onClose={onClose} align="center" overlayClassName="bg-[#090909]/80 backdrop-blur-[2px]" className="relative mx-4 w-full max-w-xl min-h-[500px] -translate-y-8 rounded-md border border-neutral-700 bg-neutral-950 pt-6 pb-10 px-6 text-neutral-100 shadow-2xl">
      {/* Top Utility Row */}
      <div className="flex items-center gap-2 mb-4 text-xs font-medium">
        {/* Sorting pills (placeholders) */}
        <button className="flex items-center gap-1 px-3 py-1 rounded border border-neutral-700 bg-neutral-800/50 hover:bg-neutral-700/40 transition select-none">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          Pump
        </button>
        <button className="flex items-center gap-1 px-3 py-1 rounded border border-neutral-700 bg-neutral-800/50 hover:bg-neutral-700/40 transition select-none">
          <span className="w-2 h-2 rounded-full bg-violet-400" />
          Raydium
        </button>
      </div>
      {/* Search input */}
      <div className="relative -mx-6 px-4 mb-6 border-b border-neutral-700">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by name, ticker, or CA…"
          className="w-full bg-transparent pr-3 py-3 text-lg text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-0"
        />
        {/* Esc badge */}
        <span className="absolute right-4 top-1/2 -translate-y-1/2 bg-neutral-800 text-neutral-300 rounded px-2 py-0.5 text-[10px]">Esc</span>
      </div>

      {/* Results Section visible only when query length >=3 */}
      {query.trim().length >= 3 && (
        <div className="flex-1 overflow-hidden mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-neutral-400 text-sm uppercase tracking-wider">Results</span>
            {loadingResults && <span className="text-neutral-500 text-xs">Loading…</span>}
          </div>
          {results.length === 0 && !loadingResults ? (
            <p className="text-neutral-500 text-sm">No matches.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-neutral-800 pr-1 scroll">
              {results.map((t) => {
                const mc = formatSmartNumber(t.total_fully_diluted_valuation || t.fully_diluted_value);
                const vol = formatSmartNumber((t.total_buy_volume_24h || 0) + (t.total_sell_volume_24h || 0));
                const liq = formatSmartNumber(t.total_liquidity_usd || 0);
                return (
                  <li
                    key={t.token_address}
                    className="py-2 text-sm cursor-pointer hover:bg-neutral-800 px-2 rounded flex gap-3 items-center"
                    onClick={() => handleSelectToken(t)}
                  >
                    {/* logo */}
                    {t.logo ? (
                      <img
                        src={t.logo}
                        alt={t.symbol}
                        className="w-8 h-8 rounded-full object-contain border border-neutral-700"
                        onError={(e) => (e.currentTarget.style.display = "none")}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center border border-neutral-700">
                        <span className="text-neutral-400 text-sm font-bold">
                          {t.symbol?.charAt(0) || "?"}
                        </span>
                      </div>
                    )}
                    {/* name & symbol */}
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-neutral-100 truncate block max-w-full">
                        {t.symbol} <span className="text-neutral-400 font-normal">{t.name}</span>
                      </span>
                    </div>
                    {/* stats */}
                    <div className="flex gap-4 text-xs whitespace-nowrap items-center">
                      <span className="text-neutral-400">MC <span className="text-blue-400 font-bold">${mc}</span></span>
                      <span className="text-neutral-400">V <span className="text-white font-bold">${vol}</span></span>
                      <span className="text-neutral-400">L <span className="text-white font-bold">${liq}</span></span>
                      <FaBolt className="text-emerald-400 ml-2" />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* History Section - visible only when no active query */}
      {query.trim().length === 0 && (
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-neutral-400 text-sm uppercase tracking-wider">History</span>
            {history.length > 0 && (
              <button onClick={handleClearHistory} title="Clear history" className="text-neutral-500 hover:text-red-400 transition-colors">
                <FaTrash size={14} />
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="text-neutral-500 text-sm">No recent searches.</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y divide-neutral-800 pr-1 scroll">
              {history.map((h) => {
                const mc = formatSmartNumber(h.total_fully_diluted_valuation);
                const vol = formatSmartNumber((h.total_buy_volume_24h || 0) + (h.total_sell_volume_24h || 0));
                const liq = formatSmartNumber(h.total_liquidity_usd || 0);
                return (
                  <li
                    key={h.token_address}
                    className="py-2 text-sm cursor-pointer hover:bg-neutral-800 px-2 rounded flex gap-3 items-center"
                    onClick={() => handleSubmit(h.token_address)}
                  >
                    {h.logo ? (
                      <img src={h.logo} alt={h.symbol} className="w-6 h-6 rounded-full object-contain border border-neutral-700" onError={(e)=>{e.currentTarget.style.display='none';}} />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center border border-neutral-700">
                        <span className="text-neutral-400 text-xs font-bold">{h.symbol?.charAt(0) || "?"}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-neutral-100 truncate block max-w-full">
                        {h.symbol} <span className="text-neutral-400 font-normal">{h.name}</span>
                      </span>
                    </div>
                    <div className="flex gap-3 text-[10px] whitespace-nowrap items-center">
                      <span className="text-neutral-400">MC <span className="text-blue-400 font-bold">${mc}</span></span>
                      <span className="text-neutral-400">V <span className="text-white font-bold">${vol}</span></span>
                      <span className="text-neutral-400">L <span className="text-white font-bold">${liq}</span></span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </InterstatePopout>
  );
} 