// src/components/perpetuals/PerpFundingModal.tsx
// Sliding sidebar modal for funding a Hyperliquid perpetuals margin account.
// Tabs: Convert (Arb→HL), Deposit (QR + address), Buy (placeholder), Withdraw (HL→Arb).

import React, { useState, useEffect, useCallback, useRef } from "react";
import { FaTimes, FaCopy, FaArrowDown, FaWallet, FaExchangeAlt } from "react-icons/fa";
import QRCode from "qrcode";
import toast from "react-hot-toast";
import { fetchBalances, deposit, withdraw } from "../../utils/hyperliquidApi";

/* ---- AX palette (matches PerpTradePanel) ---- */
import { AX } from "./perpTheme";

type TabType = "convert" | "deposit" | "buy" | "withdraw";

interface PerpFundingModalProps {
  open: boolean;
  onClose: () => void;
  token: string;
  initialTab?: TabType;
}

const TAB_LABELS: { key: TabType; label: string }[] = [
  { key: "convert", label: "Convert" },
  { key: "deposit", label: "Deposit" },
  { key: "buy", label: "Buy" },
  { key: "withdraw", label: "Withdraw" },
];

const TABULAR: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

export default function PerpFundingModal({
  open,
  onClose,
  token,
  initialTab = "convert",
}: PerpFundingModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [arbBalance, setArbBalance] = useState<number>(0);
  const [hlBalance, setHlBalance] = useState<number>(0);
  const [hlWithdrawable, setHlWithdrawable] = useState<number>(0);
  const [arbAddress, setArbAddress] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- Fetch balances ----
  const noToken = !token;
  const loadBalances = useCallback(
    async (silent = false) => {
      if (!token) {
        if (!silent) setFetchFailed(true);
        return;
      }
      if (!silent) setBalancesLoading(true);
      try {
        const data = await fetchBalances(token);
        const arb = data?.arbitrum as Record<string, any> | undefined;
        const hl = data?.hyperliquid as Record<string, any> | undefined;
        // Backend shapes: arb = { usdc, address }, hl = { accountValue, totalMarginUsed, withdrawable, address }
        setArbBalance(parseFloat(String(arb?.usdc ?? "0")) || 0);
        setArbAddress(arb?.address ?? "");
        setHlBalance(parseFloat(String(hl?.accountValue ?? "0")) || 0);
        setHlWithdrawable(parseFloat(String(hl?.withdrawable ?? "0")) || 0);
        setFetchFailed(false);
      } catch {
        if (!silent) setFetchFailed(true);
        // silent poll failures keep last values
      } finally {
        if (!silent) setBalancesLoading(false);
      }
    },
    [token]
  );

  // Load + poll while open
  useEffect(() => {
    if (!open) return;
    loadBalances();
    pollRef.current = setInterval(() => loadBalances(true), 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, loadBalances]);

  // Generate QR code when address changes
  useEffect(() => {
    if (!arbAddress) return;
    QRCode.toDataURL(arbAddress, {
      width: 200,
      margin: 2,
      color: { dark: "#ffffff", light: "#00000000" },
    })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [arbAddress]);

  // Reset form state on close/tab change
  useEffect(() => {
    if (!open) {
      setAmount("");
      setError(null);
      setSubmitting(false);
      setCopied(false);
      setFetchFailed(false);
    }
  }, [open]);

  useEffect(() => {
    setAmount("");
    setError(null);
  }, [activeTab]);

  // ---- Actions ----
  const amountNum = parseFloat(amount) || 0;

  const handleConvert = useCallback(async () => {
    if (!token || amountNum <= 0 || amountNum > arbBalance) return;
    setSubmitting(true);
    setError(null);
    try {
      await deposit(token, amountNum);
      toast.success(`Deposited ${amountNum} USDC to Hyperliquid`);
      setAmount("");
      loadBalances(true);
    } catch (err: any) {
      const msg = err?.message || "Deposit failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }, [token, amountNum, arbBalance, loadBalances]);

  const handleWithdraw = useCallback(async () => {
    if (!token || amountNum <= 0 || amountNum > hlWithdrawable) return;
    setSubmitting(true);
    setError(null);
    try {
      await withdraw(token, amountNum);
      toast.success(`Withdrew ${amountNum} USDC to Arbitrum`);
      setAmount("");
      loadBalances(true);
    } catch (err: any) {
      const msg = err?.message || "Withdrawal failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }, [token, amountNum, hlWithdrawable, loadBalances]);

  const handleCopy = useCallback(() => {
    if (!arbAddress) return;
    navigator.clipboard.writeText(arbAddress);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 2000);
  }, [arbAddress]);

  if (!open) return null;

  const convertValid = amountNum > 0 && amountNum <= arbBalance && !submitting;
  const withdrawValid = amountNum > 0 && amountNum <= hlWithdrawable && !submitting;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[99998] bg-black/60 transition-opacity duration-300 opacity-100"
        onClick={onClose}
      />

      {/* Sidebar */}
      <div
        className="fixed top-0 right-0 bottom-0 z-[99999] w-full max-w-[480px] transform transition-transform duration-300 ease-out translate-x-0"
        style={{ backgroundColor: "#1a1b20" }}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: `1px solid ${AX.border}` }}
          >
            <h2 className="text-xl font-bold text-white">Fund Account</h2>
            <button
              onClick={onClose}
              className="text-neutral-400 transition-colors hover:text-white"
            >
              <FaTimes size={20} />
            </button>
          </div>

          {/* Tabs */}
          <div className="px-6 pt-5 pb-3">
            <div
              className="flex gap-1 rounded-xl p-1"
              style={{ backgroundColor: AX.bg }}
            >
              {TAB_LABELS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className="flex-1 py-2 text-[12px] font-semibold rounded-lg transition-all duration-150"
                  style={{
                    backgroundColor: activeTab === key ? AX.surface : "transparent",
                    color: activeTab === key ? AX.text : AX.mutedDim,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {balancesLoading && !arbBalance && !hlBalance ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${AX.mint} transparent ${AX.mint} ${AX.mint}` }} />
              </div>
            ) : fetchFailed ? (
              <div className="text-center py-16 space-y-3">
                <p className="text-sm" style={{ color: AX.muted }}>
                  {noToken ? "Please log in to fund your account" : "Failed to load balances"}
                </p>
                {!noToken && (
                  <button
                    onClick={() => loadBalances()}
                    className="px-4 py-2 rounded-lg text-sm font-medium"
                    style={{ backgroundColor: AX.surface, color: AX.mint, border: `1px solid ${AX.border}` }}
                  >
                    Retry
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* ---- CONVERT TAB ---- */}
                {activeTab === "convert" && (
                  <div className="space-y-4">
                    {/* Balance cards */}
                    <div className="space-y-2">
                      <BalanceCard label="Arbitrum USDC" value={arbBalance} icon={<FaWallet size={14} />} />
                      <BalanceCard label="Hyperliquid Margin" value={hlBalance} icon={<FaExchangeAlt size={14} />} accent />
                    </div>

                    {/* Direction indicator */}
                    <div className="flex items-center gap-3 py-1">
                      <div
                        className="flex-1 rounded-lg px-3 py-2 text-[12px] font-medium"
                        style={{ backgroundColor: AX.surface, color: AX.muted, border: `1px solid ${AX.border}` }}
                      >
                        From: Arbitrum
                      </div>
                      <FaArrowDown size={14} style={{ color: AX.mint, flexShrink: 0 }} />
                      <div
                        className="flex-1 rounded-lg px-3 py-2 text-[12px] font-medium"
                        style={{ backgroundColor: AX.surface, color: AX.mint, border: `1px solid rgba(112,224,176,0.2)` }}
                      >
                        To: Hyperliquid
                      </div>
                    </div>

                    {/* Amount input */}
                    <div
                      className="rounded-lg px-4 py-3"
                      style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}` }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px]" style={{ color: AX.muted }}>Amount</span>
                        <button
                          onClick={() => setAmount(arbBalance.toFixed(2))}
                          className="text-[11px] font-medium transition-colors hover:opacity-80"
                          style={{ color: AX.mint }}
                        >
                          Max
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="0.00"
                          className="flex-1 bg-transparent text-lg font-medium text-white focus:outline-none min-w-0"
                          style={TABULAR}
                        />
                        <span className="text-sm font-medium" style={{ color: AX.muted }}>USDC</span>
                      </div>
                    </div>

                    {/* Error */}
                    {error && <ErrorBanner message={error} />}

                    {/* Info */}
                    <p className="text-[11px] px-1" style={{ color: AX.mutedDim }}>
                      Deposits typically appear within 1–2 minutes.
                    </p>

                    {/* Confirm */}
                    <button
                      onClick={handleConvert}
                      disabled={!convertValid}
                      className="w-full py-3 rounded-lg font-bold text-[14px] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ backgroundColor: AX.mint, color: "#000" }}
                    >
                      {submitting ? "Depositing..." : "Confirm Deposit"}
                    </button>
                  </div>
                )}

                {/* ---- DEPOSIT TAB ---- */}
                {activeTab === "deposit" && (
                  <div className="space-y-4">
                    {/* QR */}
                    <div className="flex justify-center pt-2">
                      <div
                        className="rounded-xl p-4"
                        style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}` }}
                      >
                        {qrDataUrl ? (
                          <img src={qrDataUrl} alt="Arbitrum address QR" className="w-[180px] h-[180px]" />
                        ) : (
                          <div className="w-[180px] h-[180px] flex items-center justify-center">
                            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${AX.mint} transparent ${AX.mint} ${AX.mint}` }} />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Address */}
                    <div
                      className="rounded-lg px-4 py-3"
                      style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}` }}
                    >
                      <p className="text-[11px] mb-1.5" style={{ color: AX.muted }}>Your Arbitrum Address</p>
                      <div className="flex items-center gap-2">
                        <span
                          className="flex-1 text-[13px] font-mono break-all"
                          style={{ color: AX.text }}
                        >
                          {arbAddress || "Loading..."}
                        </span>
                        <button
                          onClick={handleCopy}
                          className="flex-shrink-0 p-2 rounded-lg transition-colors"
                          style={{ backgroundColor: copied ? "rgba(112,224,176,0.15)" : AX.bg, color: copied ? AX.mint : AX.muted }}
                        >
                          <FaCopy size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Warning */}
                    <div
                      className="rounded-lg px-4 py-3"
                      style={{ backgroundColor: "rgba(239, 68, 68, 0.06)", border: `1px solid rgba(239, 68, 68, 0.15)` }}
                    >
                      <p className="text-[12px] font-medium" style={{ color: AX.sell }}>
                        Send only USDC on Arbitrum One to this address
                      </p>
                      <p className="text-[11px] mt-1" style={{ color: AX.mutedDim }}>
                        Sending other tokens or using a different network may result in permanent loss.
                      </p>
                    </div>
                  </div>
                )}

                {/* ---- BUY TAB ---- */}
                {activeTab === "buy" && (
                  <div className="flex flex-col items-center justify-center py-16 space-y-3">
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}` }}
                    >
                      <FaWallet size={22} style={{ color: AX.mutedDim }} />
                    </div>
                    <p className="text-base font-semibold" style={{ color: AX.text }}>Coming Soon</p>
                    <p className="text-[13px] text-center max-w-[260px]" style={{ color: AX.mutedDim }}>
                      On-ramp integration for purchasing USDC directly is in development.
                    </p>
                  </div>
                )}

                {/* ---- WITHDRAW TAB ---- */}
                {activeTab === "withdraw" && (
                  <div className="space-y-4">
                    {/* Balance cards */}
                    <div className="space-y-2">
                      <BalanceCard label="Hyperliquid Margin" value={hlBalance} icon={<FaExchangeAlt size={14} />} />
                      <BalanceCard label="Withdrawable" value={hlWithdrawable} icon={<FaWallet size={14} />} accent />
                    </div>

                    {/* Amount input */}
                    <div
                      className="rounded-lg px-4 py-3"
                      style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}` }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px]" style={{ color: AX.muted }}>Amount</span>
                        <button
                          onClick={() => setAmount(hlWithdrawable.toFixed(2))}
                          className="text-[11px] font-medium transition-colors hover:opacity-80"
                          style={{ color: AX.mint }}
                        >
                          Max
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="0.00"
                          className="flex-1 bg-transparent text-lg font-medium text-white focus:outline-none min-w-0"
                          style={TABULAR}
                        />
                        <span className="text-sm font-medium" style={{ color: AX.muted }}>USDC</span>
                      </div>
                    </div>

                    {/* Error */}
                    {error && <ErrorBanner message={error} />}

                    {/* Info */}
                    <p className="text-[11px] px-1" style={{ color: AX.mutedDim }}>
                      Withdrawals go to your Arbitrum wallet. Processing may take a few minutes.
                    </p>

                    {/* Confirm */}
                    <button
                      onClick={handleWithdraw}
                      disabled={!withdrawValid}
                      className="w-full py-3 rounded-lg font-bold text-[14px] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ backgroundColor: AX.mint, color: "#000" }}
                    >
                      {submitting ? "Withdrawing..." : "Confirm Withdrawal"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ---- Small helper components ---- */

function BalanceCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between rounded-lg px-4 py-3"
      style={{
        backgroundColor: AX.surface,
        border: accent
          ? `1px solid rgba(24, 196, 140, 0.2)`
          : `1px solid ${AX.border}`,
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: accent ? AX.mint : AX.muted }}>{icon}</span>
        <span className="text-[12px]" style={{ color: AX.muted }}>
          {label}
        </span>
      </div>
      <span
        className="text-[14px] font-semibold"
        style={{ color: accent ? AX.mint : AX.text, fontVariantNumeric: "tabular-nums" }}
      >
        {value.toFixed(2)} USDC
      </span>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="text-[12px] px-3 py-2 rounded-lg"
      style={{
        color: AX.sell,
        backgroundColor: "rgba(239, 68, 68, 0.08)",
        border: `1px solid rgba(239, 68, 68, 0.15)`,
      }}
    >
      {message}
    </div>
  );
}
