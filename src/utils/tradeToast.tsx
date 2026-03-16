import React from "react";
import toast from "react-hot-toast";

export const SOLANA_LOGO_URL =
  "https://avatars.githubusercontent.com/u/92743431?s=200&v=4";

export const ORDER_TOAST_STYLE: React.CSSProperties = {
  background: "#1a1a1a",
  border: "1px solid #333",
  borderRadius: "8px",
  padding: "12px",
};

/**
 * Animated toast matching the market buy/sell visual style.
 * Shows: token image + label + timer animation + green checkmark + Solana logo.
 *
 * If `txHash` is provided the Solana logo becomes a clickable Solscan link.
 * If omitted the logo renders dimmed / non-interactive.
 */
export function showExecutionToast(opts: {
  label: string;
  tokenImage?: string | null;
  tokenName: string;
  txHash?: string | null;
}): string {
  const id = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const startTime = Date.now();
  const timerCap = 0.4 + Math.random() * 0.2;
  let timerFinished = false;
  let handle: number | null = null;

  const explorerUrl = opts.txHash
    ? `https://solscan.io/tx/${opts.txHash}`
    : null;

  toast(
    (_t) => (
      <div className="flex items-center gap-3">
        {opts.tokenImage && (
          <img
            src={opts.tokenImage}
            alt={opts.tokenName}
            className="w-6 h-6 rounded-full flex-shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm text-neutral-200 truncate">
            {opts.label}
          </span>
          <span
            id={`timer-${id}`}
            className="text-xs text-neutral-400 flex-shrink-0"
          >
            (0.00s)
          </span>
          <span
            id={`check-${id}`}
            className="text-green-400 flex-shrink-0"
            style={{ display: timerFinished ? "inline" : "none" }}
          >
            ✓
          </span>
          <span className="flex-shrink-0" style={{ display: "inline-flex" }}>
            {explorerUrl ? (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80 transition-opacity"
              >
                <img
                  src={SOLANA_LOGO_URL}
                  alt="Solana"
                  className="w-4 h-4 rounded-full"
                  style={{ cursor: "pointer" }}
                />
              </a>
            ) : (
              <img
                src={SOLANA_LOGO_URL}
                alt="Solana"
                className="w-4 h-4 rounded-full opacity-70"
                style={{ cursor: "default" }}
              />
            )}
          </span>
        </div>
      </div>
    ),
    { id, duration: Infinity, style: ORDER_TOAST_STYLE }
  );

  const tick = () => {
    const elapsed = (Date.now() - startTime) / 1000;
    const timerEl = document.getElementById(`timer-${id}`);
    if (timerEl)
      timerEl.textContent = `(${Math.min(elapsed, timerCap).toFixed(2)}s)`;
    if (!timerFinished && elapsed >= timerCap) {
      timerFinished = true;
      const checkEl = document.getElementById(`check-${id}`);
      if (checkEl) checkEl.style.display = "block";
      handle = null;
      return;
    }
    handle = requestAnimationFrame(tick);
  };
  handle = requestAnimationFrame(tick);

  // Auto-dismiss after 10s
  setTimeout(() => {
    if (handle) cancelAnimationFrame(handle);
    toast.dismiss(id);
  }, 10_000);

  return id;
}

/**
 * Simple static toast for limit order lifecycle events (creation, cancellation, fill).
 * No timer animation, no tick — just token image + label + ✓ + optional Solscan link.
 *
 * Duration: 4s normally, 6s if txHash present (gives time to click link).
 */
export function showOrderToast(opts: {
  label: string;
  tokenImage?: string | null;
  tokenName: string;
  txHash?: string | null;
}): string {
  const id = `order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const explorerUrl = opts.txHash
    ? `https://solscan.io/tx/${opts.txHash}`
    : null;
  const duration = explorerUrl ? 6000 : 4000;

  toast(
    (_t) => (
      <div className="flex items-center gap-3">
        {opts.tokenImage && (
          <img
            src={opts.tokenImage}
            alt={opts.tokenName}
            className="w-6 h-6 rounded-full flex-shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm text-neutral-200 truncate">
            {opts.label}
          </span>
          <span className="text-green-400 flex-shrink-0">✓</span>
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-80 transition-opacity flex-shrink-0"
            >
              <img
                src={SOLANA_LOGO_URL}
                alt="Solana"
                className="w-4 h-4 rounded-full"
                style={{ cursor: "pointer" }}
              />
            </a>
          )}
        </div>
      </div>
    ),
    { id, duration, style: ORDER_TOAST_STYLE }
  );

  return id;
}

/**
 * Global listener for optimistic-mode trade failures.
 * The backend sends `tx_failed` via WS after the HTTP 200 already returned.
 * This is the ONLY way the user learns their optimistic trade didn't land.
 *
 * We intentionally do NOT listen for `solanaTxConfirmed` — the existing trade
 * flow UI (toast from HTTP response) already handles the success case.
 * Adding a second confirmation toast would be redundant.
 *
 * Call once at app startup (idempotent — guards against double-init).
 */
let confirmationListenersInitialized = false;

export function listenForConfirmationUpdates(): void {
  if (confirmationListenersInitialized) return;
  confirmationListenersInitialized = true;

  window.addEventListener('solanaTxFailed', ((e: CustomEvent) => {
    const { txHash, tokenAddress, tradeType, error } = e.detail ?? {};
    if (!txHash) return;
    const side = tradeType === 'sell' ? 'Sell' : 'Buy';
    const shortMint = tokenAddress ? `${tokenAddress.slice(0, 4)}…${tokenAddress.slice(-4)}` : '';
    const explorerUrl = `https://solscan.io/tx/${txHash}`;
    toast(
      (_t) => (
        <div className="flex items-center gap-3">
          <span className="text-red-400 flex-shrink-0">✗</span>
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-400 truncate">
                {side} failed {shortMint}
              </span>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80 transition-opacity flex-shrink-0"
              >
                <img
                  src={SOLANA_LOGO_URL}
                  alt="Solana"
                  className="w-4 h-4 rounded-full"
                  style={{ cursor: "pointer" }}
                />
              </a>
            </div>
            {error && (
              <span className="text-xs text-neutral-400 truncate">{error}</span>
            )}
          </div>
        </div>
      ),
      {
        duration: 6000,
        style: { ...ORDER_TOAST_STYLE, border: '1px solid #ef4444' },
      }
    );
  }) as EventListener);
}
