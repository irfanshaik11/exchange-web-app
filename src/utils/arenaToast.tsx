/**
 * Arena toast helpers — matches the buy/sell trade toast style (see tradeToast.tsx).
 * Uses react-icons instead of emojis. Same dark card, border, padding, and
 * icon-on-left + label + trailing ✓ layout used by ORDER_TOAST_STYLE.
 */

import React from "react";
import toast from "react-hot-toast";
import { GiCoins, GiMedal, GiTrophy, GiTwoCoins } from "react-icons/gi";
import { FiCheck, FiAlertTriangle, FiGift } from "react-icons/fi";
import { IoRocketSharp } from "react-icons/io5";
import { HiSparkles } from "react-icons/hi";
import { ORDER_TOAST_STYLE } from "./tradeToast";

type ToastVariant = "success" | "error" | "info";

const ACCENT: Record<ToastVariant, string> = {
  success: "#22c55e",
  error: "#ef4444",
  info: "#a3a3a3",
};

function BaseToast({
  icon,
  label,
  detail,
  variant = "success",
  showCheck = true,
}: {
  icon: React.ReactNode;
  label: string;
  detail?: string;
  variant?: ToastVariant;
  showCheck?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full"
        style={{ background: `${ACCENT[variant]}22`, color: ACCENT[variant] }}
      >
        {icon}
      </div>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-sm text-neutral-200 truncate">{label}</span>
        {detail && (
          <span className="text-xs text-neutral-400 flex-shrink-0">
            {detail}
          </span>
        )}
        {showCheck && variant === "success" && (
          <FiCheck
            className="flex-shrink-0"
            style={{ color: ACCENT.success }}
            size={14}
          />
        )}
      </div>
    </div>
  );
}

/** Quest claimed — gold coin icon, amount as trailing detail. */
export function showQuestClaimedToast(gold: number): string {
  const id = `quest-claim-${Date.now()}`;
  toast(
    () => (
      <BaseToast
        icon={<GiCoins size={16} />}
        label="Quest claimed"
        detail={`+${gold.toLocaleString()}`}
      />
    ),
    { id, duration: 4000, style: ORDER_TOAST_STYLE }
  );
  return id;
}

/** Batch claim (claim-all) — stacked-coins icon. */
export function showBatchClaimToast(count: number, totalGold: number): string {
  const id = `batch-claim-${Date.now()}`;
  toast(
    () => (
      <BaseToast
        icon={<GiTwoCoins size={16} />}
        label={`Claimed ${count} quest${count === 1 ? "" : "s"}`}
        detail={`+${totalGold.toLocaleString()}`}
      />
    ),
    { id, duration: 4000, style: ORDER_TOAST_STYLE }
  );
  return id;
}

/** Key-tweet claim — sparkles icon + credits. */
export function showKeyTweetClaimedToast(credits: number): string {
  const id = `keytweet-claim-${Date.now()}`;
  toast(
    () => (
      <BaseToast
        icon={<HiSparkles size={16} />}
        label="Key tweet claimed"
        detail={`+${credits.toLocaleString()} credits`}
      />
    ),
    { id, duration: 4000, style: ORDER_TOAST_STYLE }
  );
  return id;
}

/** Rank-up — medal icon, emphasized. */
export function showRankUpToast(newRank: string, newLevel?: number): string {
  const id = `rank-up-${Date.now()}`;
  const levelRoman = newLevel ? ["", "I", "II", "III", "IV"][newLevel] : "";
  toast(
    () => (
      <BaseToast
        icon={<GiMedal size={16} />}
        label={`Ranked up to ${newRank}${levelRoman ? ` ${levelRoman}` : ""}`}
      />
    ),
    { id, duration: 5000, style: ORDER_TOAST_STYLE }
  );
  return id;
}

/** Honors tier upgrade — trophy icon. */
export function showHonorsUpgradeToast(tier: string): string {
  const id = `honors-${Date.now()}`;
  toast(
    () => (
      <BaseToast icon={<GiTrophy size={16} />} label={`Upgraded to ${tier}`} />
    ),
    { id, duration: 5000, style: ORDER_TOAST_STYLE }
  );
  return id;
}

/** Referral SOL claim — gift icon + optional Solscan link. */
export function showReferralClaimToast(
  sol: number,
  txSignature?: string
): string {
  const id = `ref-claim-${Date.now()}`;
  const explorerUrl = txSignature
    ? `https://solscan.io/tx/${txSignature}`
    : null;
  toast(
    () => (
      <div className="flex items-center gap-3">
        <div
          className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full"
          style={{ background: `${ACCENT.success}22`, color: ACCENT.success }}
        >
          <FiGift size={16} />
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm text-neutral-200 truncate">
            Claimed {sol.toFixed(4)} SOL
          </span>
          <FiCheck
            className="flex-shrink-0"
            style={{ color: ACCENT.success }}
            size={14}
          />
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 underline flex-shrink-0"
            >
              Solscan
            </a>
          )}
        </div>
      </div>
    ),
    { id, duration: explorerUrl ? 6000 : 4000, style: ORDER_TOAST_STYLE }
  );
  return id;
}

/** Cashback SOL claim — rocket icon + optional Solscan link. */
export function showCashbackClaimToast(
  sol: number,
  txSignature?: string
): string {
  const id = `cashback-claim-${Date.now()}`;
  const explorerUrl = txSignature
    ? `https://solscan.io/tx/${txSignature}`
    : null;
  toast(
    () => (
      <div className="flex items-center gap-3">
        <div
          className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full"
          style={{ background: `${ACCENT.success}22`, color: ACCENT.success }}
        >
          <IoRocketSharp size={16} />
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm text-neutral-200 truncate">
            Claimed {sol.toFixed(6)} SOL cashback
          </span>
          <FiCheck
            className="flex-shrink-0"
            style={{ color: ACCENT.success }}
            size={14}
          />
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 underline flex-shrink-0"
            >
              Solscan
            </a>
          )}
        </div>
      </div>
    ),
    { id, duration: explorerUrl ? 6000 : 4000, style: ORDER_TOAST_STYLE }
  );
  return id;
}

/** Generic error — red circle + ⚠ icon. */
export function showArenaErrorToast(message: string): string {
  const id = `arena-err-${Date.now()}`;
  toast(
    () => (
      <BaseToast
        icon={<FiAlertTriangle size={16} />}
        label={message}
        variant="error"
        showCheck={false}
      />
    ),
    { id, duration: 4000, style: ORDER_TOAST_STYLE }
  );
  return id;
}
