"use client";

import React, { useEffect, useRef, useState } from "react";
import { FaTrash } from "react-icons/fa";
import InterstatePopout from "./InterstatePopout";
import { addToHistory, clearHistory, getHistory } from "../utils/searchHistory";

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  /** Fired when a term is submitted or a history item is clicked */
  onSubmit?: (query: string) => void;
}

export default function SearchModal({ open, onClose, onSubmit }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleSubmit = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    addToHistory(trimmed);
    setHistory(getHistory());
    onSubmit?.(trimmed);
    onClose();
  };

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

      {/* History Section */}
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
            {history.map((item) => (
              <li key={item} className="py-2 text-sm cursor-pointer hover:bg-neutral-800 px-2 rounded" onClick={() => handleHistoryClick(item)}>
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>
    </InterstatePopout>
  );
} 