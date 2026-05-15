import React, { useRef, useState, useCallback } from "react";
import { X, Copy, Check, Download } from "lucide-react";
import { FaXTwitter } from "react-icons/fa6";
import html2canvas from "html2canvas";
import toast from "react-hot-toast";
import { formatSmallPrice, formatSmartNumber } from "~/utils/db";

interface PnlShareCardProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  totalPnl: number;
  totalPnlPercentage: number;
  realizedPnl: number;
  realizedPnlPercentage: number;
  unrealizedPnl: number;
  winningTrades: number;
  losingTrades: number;
  timeframe: string;
  chain: string;
}

export default function PnlShareCard({
  isOpen,
  onClose,
  username,
  totalPnl,
  totalPnlPercentage,
  realizedPnl,
  realizedPnlPercentage,
  unrealizedPnl,
  winningTrades,
  losingTrades,
  timeframe,
  chain,
}: PnlShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const isProfit = totalPnl >= 0;
  const winRate =
    winningTrades + losingTrades > 0
      ? ((winningTrades / (winningTrades + losingTrades)) * 100).toFixed(0)
      : "0";

  const captureCard = useCallback(async () => {
    if (!cardRef.current) return null;
    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      logging: false,
    });
    return canvas;
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      const canvas = await captureCard();
      if (!canvas) return;
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          setCopied(true);
          toast.success("Card copied to clipboard!");
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("Failed to copy image");
        }
      }, "image/png");
    } catch {
      toast.error("Failed to capture card");
    }
  }, [captureCard]);

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      const canvas = await captureCard();
      if (!canvas) return;
      const link = document.createElement("a");
      link.download = `interstate-pnl-${timeframe}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Card saved!");
    } catch {
      toast.error("Failed to save card");
    } finally {
      setSaving(false);
    }
  }, [captureCard, timeframe]);

  const handleShareX = useCallback(() => {
    const pnlSign = totalPnl >= 0 ? "+" : "-";
    const pnlText = `${pnlSign}$${formatSmallPrice(Math.abs(totalPnl))} (${totalPnlPercentage >= 0 ? "+" : ""}${formatSmallPrice(totalPnlPercentage)}%)`;
    const text = `My ${timeframe} PnL on @InterstateHQ: ${pnlText}\n\nWin rate: ${winRate}% | ${winningTrades}W / ${losingTrades}L\n\nTrade on Interstate:`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent("https://interstate.so")}`;
    window.open(url, "_blank");
  }, [totalPnl, totalPnlPercentage, timeframe, winRate, winningTrades, losingTrades]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 flex flex-col items-center gap-4 p-4 max-w-[420px] w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between w-full px-1">
          <span className="text-sm text-[#a1a1aa] font-medium">
            Share PnL Card
          </span>
          <button
            onClick={onClose}
            className="text-[#71717a] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* === THE CARD (captured as image) === */}
        <div
          ref={cardRef}
          className="w-full rounded-2xl overflow-hidden"
          style={{ background: "#080a0f" }}
        >
          {/* Top accent gradient bar */}
          <div
            className="h-1 w-full"
            style={{
              background: isProfit
                ? "linear-gradient(90deg, #18c48c 0%, #a3f7bf 50%, #18c48c 100%)"
                : "linear-gradient(90deg, #ef4444 0%, #fca5a5 50%, #ef4444 100%)",
            }}
          />

          <div className="p-5 pb-4">
            {/* Card header: logo + branding + timeframe */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <img
                  src="/interstate-logo-icon.png"
                  alt="Interstate"
                  className="w-8 h-8"
                  crossOrigin="anonymous"
                />
                <div>
                  <div className="text-[#f4f4f5] text-sm font-bold tracking-tight">
                    Interstate
                  </div>
                  <div className="text-[#52525b] text-[10px] uppercase tracking-widest font-medium">
                    {chain === "monad" ? "Monad" : "Solana"} Trading
                  </div>
                </div>
              </div>
              <div
                className="px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  color: "#71717a",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {timeframe}
              </div>
            </div>

            {/* Username */}
            <div className="text-[#a1a1aa] text-xs font-medium mb-2 truncate">
              {username}
            </div>

            {/* Big PnL number */}
            <div className="mb-4">
              <div
                className="text-4xl font-bold tabular-nums tracking-tight"
                style={{ color: isProfit ? "#18c48c" : "#ef4444" }}
              >
                {totalPnl >= 0 ? "+" : "-"}${formatSmallPrice(Math.abs(totalPnl))}
              </div>
              <div
                className="text-lg font-semibold tabular-nums mt-0.5"
                style={{
                  color: isProfit
                    ? "rgba(24,196,140,0.7)"
                    : "rgba(239,68,68,0.7)",
                }}
              >
                {totalPnlPercentage >= 0 ? "+" : ""}
                {formatSmallPrice(totalPnlPercentage)}%
              </div>
            </div>

            {/* Stats grid */}
            <div
              className="grid grid-cols-3 gap-3 rounded-xl p-3.5"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div>
                <div className="text-[#52525b] text-[10px] uppercase tracking-wider font-medium mb-1">
                  Realized
                </div>
                <div
                  className="text-sm font-semibold tabular-nums"
                  style={{
                    color: realizedPnl >= 0 ? "#18c48c" : "#ef4444",
                  }}
                >
                  {realizedPnl >= 0 ? "+" : "-"}$
                  {formatSmallPrice(Math.abs(realizedPnl))}
                </div>
              </div>
              <div>
                <div className="text-[#52525b] text-[10px] uppercase tracking-wider font-medium mb-1">
                  Win Rate
                </div>
                <div className="text-sm font-semibold text-[#f4f4f5] tabular-nums">
                  {winRate}%
                </div>
              </div>
              <div>
                <div className="text-[#52525b] text-[10px] uppercase tracking-wider font-medium mb-1">
                  Trades
                </div>
                <div className="text-sm font-semibold tabular-nums">
                  <span className="text-[#18c48c]">{winningTrades}W</span>
                  <span className="text-[#52525b] mx-0.5">/</span>
                  <span className="text-[#ef4444]">{losingTrades}L</span>
                </div>
              </div>
            </div>

            {/* Win/loss bar */}
            <div className="mt-3 flex gap-0.5 h-1.5 rounded-full overflow-hidden">
              {winningTrades + losingTrades > 0 ? (
                <>
                  <div
                    className="rounded-l-full"
                    style={{
                      width: `${(winningTrades / (winningTrades + losingTrades)) * 100}%`,
                      background:
                        "linear-gradient(90deg, #18c48c, #34d399)",
                    }}
                  />
                  <div
                    className="rounded-r-full"
                    style={{
                      width: `${(losingTrades / (winningTrades + losingTrades)) * 100}%`,
                      background:
                        "linear-gradient(90deg, #ef4444, #f87171)",
                    }}
                  />
                </>
              ) : (
                <div className="w-full rounded-full bg-white/[0.06]" />
              )}
            </div>

            {/* Footer branding */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.06]">
              <div className="flex items-center gap-1.5">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: "#18c48c",
                    boxShadow: "0 0 6px rgba(24,196,140,0.5)",
                  }}
                />
                <span className="text-[#52525b] text-[10px] font-medium">
                  interstate.so
                </span>
              </div>
              <span className="text-[#3f3f46] text-[9px]">
                {new Date().toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 w-full">
          <button
            onClick={handleShareX}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#a1a1aa] hover:bg-white/[0.08] hover:text-white transition-all text-sm font-medium cursor-pointer flex-1"
          >
            <FaXTwitter className="w-3.5 h-3.5" />
            Post
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#a1a1aa] hover:bg-white/[0.08] hover:text-white transition-all text-sm font-medium cursor-pointer flex-1"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-[#18c48c]" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium cursor-pointer flex-1 transition-all bg-[#18c48c] text-black hover:bg-[#20d99a] disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
