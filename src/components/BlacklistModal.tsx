import React, { useState, useCallback } from "react";
import type { BlacklistCategory, BlacklistData } from "~/hooks/useBlacklist";
import { FaRegEyeSlash } from "react-icons/fa6";
import { IoClose } from "react-icons/io5";
import { FiTrash2, FiCopy, FiClipboard, FiCheck } from "react-icons/fi";

// AX color constants (same palette as PulseTable)
const AX = {
  bg: "#0b0c0e",
  surface: "#16171C",
  surface2: "#121317",
  border: "#24252C",
  text: "#f0f5f5",
  muted: "#9CA3AF",
  mint: "#31e3ac",
  sell: "#ed3a7a",
};

type TabKey = "all" | "ca" | "dev" | "twitterHandle";

const TAB_CONFIG: { key: TabKey; label: string; placeholder: string; helper: string }[] = [
  { key: "all", label: "All", placeholder: "", helper: "" },
  { key: "ca", label: "CA", placeholder: "Enter contract address...", helper: "Token contract address (mint)" },
  { key: "dev", label: "Dev", placeholder: "Enter dev wallet address...", helper: "Developer/creator wallet address" },
  { key: "twitterHandle", label: "Twitter Handle", placeholder: "Enter Twitter handle...", helper: "Twitter/X handle (without @)" },
];

interface BlacklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  blacklist: BlacklistData;
  categoryCounts: { ca: number; dev: number; twitterHandle: number };
  totalCount: number;
  onAdd: (category: BlacklistCategory, value: string) => void;
  onRemove: (category: BlacklistCategory, value: string) => void;
  onClearCategory: (category: BlacklistCategory | "all") => void;
  onImport: (text: string) => boolean;
  onExport: () => string;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function BlacklistModal({
  isOpen,
  onClose,
  blacklist,
  categoryCounts,
  totalCount,
  onAdd,
  onRemove,
  onClearCategory,
  onImport,
  onExport,
}: BlacklistModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [inputValue, setInputValue] = useState("");
  const [showImportBox, setShowImportBox] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState(false);
  const [exportCopied, setExportCopied] = useState(false);

  const handleAdd = useCallback(() => {
    if (!inputValue.trim() || activeTab === "all") return;
    const val = activeTab === "twitterHandle" ? inputValue.trim().replace(/^@/, "") : inputValue.trim();
    onAdd(activeTab, val);
    setInputValue("");
  }, [inputValue, activeTab, onAdd]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAdd();
  }, [handleAdd]);

  const handleExportCopy = useCallback(() => {
    const json = onExport();
    navigator.clipboard.writeText(json).then(() => {
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 1500);
    });
  }, [onExport]);

  const handleImportApply = useCallback(() => {
    if (!importText.trim()) return;
    const ok = onImport(importText.trim());
    if (ok) {
      setImportText("");
      setShowImportBox(false);
      setImportError(false);
    } else {
      setImportError(true);
    }
  }, [importText, onImport]);

  // Build list of items for active tab
  const displayItems: { category: BlacklistCategory; value: string }[] = [];
  if (activeTab === "all") {
    blacklist.ca.forEach(v => displayItems.push({ category: "ca", value: v }));
    blacklist.dev.forEach(v => displayItems.push({ category: "dev", value: v }));
    blacklist.twitterHandle.forEach(v => displayItems.push({ category: "twitterHandle", value: v }));
  } else {
    blacklist[activeTab].forEach(v => displayItems.push({ category: activeTab, value: v }));
  }

  const tabConfig = TAB_CONFIG.find(t => t.key === activeTab)!;

  const getTabCount = (key: TabKey): number => {
    if (key === "all") return totalCount;
    return categoryCounts[key];
  };

  const getCategoryLabel = (cat: BlacklistCategory): string => {
    if (cat === "ca") return "CA";
    if (cat === "dev") return "Dev";
    return "Twitter";
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col overflow-hidden rounded-xl border"
        style={{
          backgroundColor: AX.surface,
          borderColor: AX.border,
          width: "420px",
          maxWidth: "90vw",
          maxHeight: "80vh",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${AX.border}` }}>
          <div className="flex items-center gap-2">
            <FaRegEyeSlash size={14} style={{ color: AX.muted }} />
            <span className="text-sm font-medium" style={{ color: AX.text }}>Blacklist</span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-md p-1 transition-colors hover:bg-white/10"
          >
            <IoClose size={16} style={{ color: AX.muted }} />
          </button>
        </div>

        {/* Input row (hidden on "All" tab) */}
        {activeTab !== "all" && (
          <div className="px-4 pt-3 pb-1">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={tabConfig.placeholder}
                className="flex-1 rounded-md border px-3 py-1.5 text-xs outline-none transition-colors focus:border-[#31e3ac40]"
                style={{
                  backgroundColor: AX.bg,
                  borderColor: AX.border,
                  color: AX.text,
                }}
              />
              <button
                onClick={handleAdd}
                disabled={!inputValue.trim()}
                className="rounded-md px-3 py-1.5 text-xs font-medium transition-all"
                style={{
                  backgroundColor: inputValue.trim() ? AX.mint : AX.border,
                  color: inputValue.trim() ? "#000" : AX.muted,
                  cursor: inputValue.trim() ? "pointer" : "default",
                }}
              >
                Add
              </button>
            </div>
            <p className="mt-1 text-[10px]" style={{ color: AX.muted }}>{tabConfig.helper}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-2 pb-2" style={{ borderBottom: `1px solid ${AX.border}` }}>
          {TAB_CONFIG.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = getTabCount(tab.key);
            return (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setInputValue(""); }}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-all"
                style={{
                  backgroundColor: isActive ? "rgba(49, 227, 172, 0.12)" : "transparent",
                  color: isActive ? AX.mint : AX.muted,
                }}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className="rounded-full px-1.5 py-0 text-[10px] font-medium"
                    style={{
                      backgroundColor: isActive ? "rgba(49, 227, 172, 0.2)" : "rgba(255,255,255,0.06)",
                      color: isActive ? AX.mint : AX.muted,
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-4 py-2" style={{ minHeight: "120px", maxHeight: "340px" }}>
          {displayItems.length === 0 ? (
            <div className="flex h-full items-center justify-center py-8">
              <p className="text-xs" style={{ color: AX.muted }}>No blacklisted items found</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {displayItems.map((item, i) => (
                <div
                  key={`${item.category}-${item.value}-${i}`}
                  className="group flex items-center justify-between rounded-md px-2.5 py-1.5 transition-colors hover:bg-white/[0.04]"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    {activeTab === "all" && (
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium"
                        style={{ backgroundColor: "rgba(255,255,255,0.06)", color: AX.muted }}
                      >
                        {getCategoryLabel(item.category)}
                      </span>
                    )}
                    <span
                      className="truncate font-mono text-xs"
                      style={{ color: AX.text }}
                      title={item.value}
                    >
                      {item.category === "twitterHandle" ? `@${item.value}` : truncateAddress(item.value)}
                    </span>
                  </div>
                  <button
                    onClick={() => onRemove(item.category, item.value)}
                    className="shrink-0 rounded p-1 opacity-0 transition-all hover:bg-white/10 group-hover:opacity-100"
                    title="Remove"
                  >
                    <IoClose size={12} style={{ color: AX.sell }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Import paste box */}
        {showImportBox && (
          <div className="px-4 pt-2 pb-1" style={{ borderTop: `1px solid ${AX.border}` }}>
            <textarea
              value={importText}
              onChange={(e) => { setImportText(e.target.value); setImportError(false); }}
              placeholder="Paste exported blacklist JSON here..."
              className="w-full rounded-md border px-3 py-2 font-mono text-[10px] outline-none transition-colors focus:border-[#31e3ac40]"
              style={{
                backgroundColor: AX.bg,
                borderColor: importError ? AX.sell : AX.border,
                color: AX.text,
                resize: "none",
                height: "80px",
              }}
            />
            {importError && (
              <p className="mt-0.5 text-[10px]" style={{ color: AX.sell }}>Invalid JSON format</p>
            )}
            <div className="mt-1.5 flex justify-end gap-2">
              <button
                onClick={() => { setShowImportBox(false); setImportText(""); setImportError(false); }}
                className="rounded-md px-2.5 py-1 text-[10px] transition-colors hover:bg-white/10"
                style={{ color: AX.muted }}
              >
                Cancel
              </button>
              <button
                onClick={handleImportApply}
                disabled={!importText.trim()}
                className="rounded-md px-2.5 py-1 text-[10px] font-medium transition-all"
                style={{
                  backgroundColor: importText.trim() ? AX.mint : AX.border,
                  color: importText.trim() ? "#000" : AX.muted,
                  cursor: importText.trim() ? "pointer" : "default",
                }}
              >
                Apply
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={{ borderTop: `1px solid ${AX.border}` }}
        >
          <span className="text-[10px]" style={{ color: AX.muted }}>
            {totalCount} / {1000}
          </span>

          <div className="flex items-center gap-2">
            {/* Import */}
            <button
              onClick={() => { setShowImportBox(!showImportBox); setImportError(false); }}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors hover:bg-white/10"
              style={{ color: showImportBox ? AX.mint : AX.muted }}
              title="Import blacklist from clipboard"
            >
              <FiClipboard size={10} />
              Import
            </button>

            {/* Export */}
            <button
              onClick={handleExportCopy}
              disabled={totalCount === 0}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors hover:bg-white/10"
              style={{ color: exportCopied ? AX.mint : totalCount > 0 ? AX.muted : AX.border }}
              title="Copy blacklist to clipboard"
            >
              {exportCopied ? <FiCheck size={10} /> : <FiCopy size={10} />}
              {exportCopied ? "Copied!" : "Export"}
            </button>

            {/* Delete category / all */}
            {(activeTab === "all" ? totalCount > 0 : getTabCount(activeTab) > 0) && (
              <button
                onClick={() => onClearCategory(activeTab === "all" ? "all" : activeTab)}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors hover:bg-red-500/10"
                style={{ color: AX.sell }}
                title={activeTab === "all" ? "Delete all" : `Delete ${tabConfig.label}`}
              >
                <FiTrash2 size={10} />
                {activeTab === "all" ? "Delete All" : `Delete ${tabConfig.label}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
