/**
 * Pre-trade frontend validation — catches obvious failures BEFORE showing the animated toast.
 *
 * Design principles:
 * - Buffers are LOWER than backend to avoid false rejections (let borderline cases reach backend)
 * - Skip validation when balance data is missing/stale (let backend validate with fresh on-chain data)
 * - Multi-wallet: sum all selected wallets' balances
 */

import React from "react";
import toast from "react-hot-toast";
import {
  type QuoteCurrency,
  QUOTE_MIN_TRADE,
  quoteSymbol,
  QUOTE_MAX_TRADE,
} from "./quoteCurrency";

// ── Constants (aligned with backend validation.ts, but slightly lower to avoid false rejections) ──

const FE_SOL_SAFETY_BUFFER = 0.0003; // Base buffer — below backend's 0.0005
const FE_SOL_ATA_RENT = 0.0025; // TOKEN-2022 ATA rent (~2,039,280 lamports + safety margin)
const FE_SOL_NETWORK_FEE = 0.00001; // Base Solana signature fee
const FE_SOL_WALLET_RESERVE = 0.001; // Backend requires ~0.000991 SOL to remain in wallet
const MIN_TRADE_AMOUNT = 0.0001; // Backend minimum
const MAX_TRADE_AMOUNT = 1000; // Backend maximum
const MONAD_GAS_UNITS = 300_000; // Default gas estimate
const MONAD_DEFAULT_GAS_GWEI = 50; // Default gas price in gwei
const FE_MONAD_BUFFER = 0.05; // Below backend's 0.1 to avoid false rejections

// ── Types ──

export type ValidationResult = {
  valid: boolean;
  error?: string;
};

type WalletListItem = {
  id?: string | null;
  ethereumAddress?: string | null;
  solanaAddress?: string | null;
  address?: string | null;
  isPrimary?: boolean;
  isArchived?: boolean;
};

// ── Error toast (matches transformToastToError styling) ──

export function showTradeValidationError(
  errorMsg: string,
  tokenImage?: string | null,
  tokenName?: string,
) {
  toast(
    (t) => (
      <div className="flex w-full items-start gap-2.5">
        {tokenImage && (
          <img
            src={tokenImage}
            alt={tokenName || "Token"}
            className="mt-0.5 h-6 w-6 flex-shrink-0 rounded-full"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <span className="min-w-0 flex-1 break-words text-sm leading-snug text-red-400">
          {errorMsg}
        </span>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => toast.dismiss(t.id)}
          className="-m-1.5 flex flex-shrink-0 cursor-pointer items-center justify-center rounded p-1.5 text-neutral-500 transition-colors hover:text-neutral-200"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    ),
    {
      duration: 5000,
      style: {
        background: "#1a1a1a",
        border: "1px solid #ef4444",
        borderRadius: "8px",
        padding: "12px 14px",
        width: "340px",
      },
    },
  );
}

// ── Solana Buy Validation ──

export function validateSolanaBuy(
  amount: number,
  allocations: { amount: number; balance: number }[],
  walletBalances?: Record<string, number>,
  walletList?: WalletListItem[],
  selectedWalletIds?: string[],
  priorityFee?: number,
  bribe?: number,
  ataExists?: boolean | null, // null = unknown, true = exists, false = needs creation
  quoteCurrency: QuoteCurrency = "SOL",
  solBalanceForGas?: number,
): ValidationResult {
  const minAmount = QUOTE_MIN_TRADE[quoteCurrency];
  if (!Number.isFinite(amount) || amount < minAmount) {
    return {
      valid: false,
      error: `Minimum trade amount is ${minAmount} ${quoteSymbol(quoteCurrency)}`,
    };
  }
  const maxTrade = QUOTE_MAX_TRADE[quoteCurrency];
  if (amount > maxTrade) {
    return {
      valid: false,
      error: `Maximum trade amount is ${maxTrade} ${quoteSymbol(quoteCurrency)}`,
    };
  }
  if (allocations.length === 0) {
    return {
      valid: false,
      error: "Insufficient balance available!",
    };
  }

  // Direct balance check via sumWalletBalances (same pattern as validateMonadBuy)
  const { total, foundCount } = sumWalletBalances(
    walletBalances,
    walletList,
    selectedWalletIds,
    "solana",
  );
  if (foundCount > 0) {
    if (quoteCurrency === "SOL") {
      const ataBuffer =
        ataExists === false ? FE_SOL_ATA_RENT : FE_SOL_SAFETY_BUFFER;
      const fees =
        (priorityFee || 0) +
        (bribe || 0) +
        FE_SOL_NETWORK_FEE +
        ataBuffer +
        FE_SOL_WALLET_RESERVE;
      const totalRequired = amount + fees;
      if (total < totalRequired) {
        return { valid: false, error: "Insufficient balance available!" };
      }
    } else {
      // USDC: first ensure enough USDC for the spend amount.
      if (total < amount) {
        return {
          valid: false,
          error: `Insufficient USDC — you have $${total.toFixed(2)}, need $${amount.toFixed(2)}.`,
        };
      }
      // USDC trades still pay network/priority fees in SOL — surface a specific,
      // actionable message (not the generic one) when SOL can't cover gas.
      if (typeof solBalanceForGas === "number") {
        const ataBuffer =
          ataExists === false ? FE_SOL_ATA_RENT : FE_SOL_SAFETY_BUFFER;
        const gasNeeded =
          (priorityFee || 0) +
          (bribe || 0) +
          FE_SOL_NETWORK_FEE +
          ataBuffer +
          FE_SOL_WALLET_RESERVE;
        if (solBalanceForGas < gasNeeded) {
          return {
            valid: false,
            error: `Not enough SOL for gas fees. Add ~${gasNeeded.toFixed(3)} SOL — USDC trades still pay network fees in SOL.`,
          };
        }
      }
    }
  }
  // If foundCount === 0: no cached balance data — skip check, let backend validate

  return { valid: true };
}

// ── Solana Sell Validation ──

export function validateSolanaSell(percentage: number): ValidationResult {
  if (!Number.isFinite(percentage) || percentage <= 0) {
    return { valid: false, error: "Enter a valid sell percentage" };
  }
  if (percentage > 100) {
    return { valid: false, error: "Sell percentage cannot exceed 100%" };
  }
  return { valid: true };
}

// ── Monad Buy Validation ──

export function validateMonadBuy(
  amount: number,
  walletBalances: Record<string, number> | undefined,
  walletList: WalletListItem[] | undefined,
  selectedWalletIds: string[] | undefined,
  gasPrice?: number,
): ValidationResult {
  if (!Number.isFinite(amount) || amount < MIN_TRADE_AMOUNT) {
    return {
      valid: false,
      error: `Minimum trade amount is ${MIN_TRADE_AMOUNT} MON`,
    };
  }
  if (amount > MAX_TRADE_AMOUNT) {
    return {
      valid: false,
      error: `Maximum trade amount is ${MAX_TRADE_AMOUNT} MON`,
    };
  }

  const { total, foundCount } = sumWalletBalances(
    walletBalances,
    walletList,
    selectedWalletIds,
    "monad",
  );

  // Skip balance check if we have no balance data (cache may be stale)
  if (foundCount === 0) {
    return { valid: true };
  }

  const gasCost =
    ((gasPrice || MONAD_DEFAULT_GAS_GWEI) * MONAD_GAS_UNITS) / 1e9;
  const totalRequired = amount + gasCost + FE_MONAD_BUFFER;

  if (total < totalRequired && total > 0) {
    return {
      valid: false,
      error: `Insufficient MON balance. Need ~${totalRequired.toFixed(4)} MON but have ${total.toFixed(4)} MON`,
    };
  }

  return { valid: true };
}

// ── Wallet balance aggregation helper ──

export function sumWalletBalances(
  walletBalances: Record<string, number> | undefined,
  walletList: WalletListItem[] | undefined,
  selectedWalletIds: string[] | undefined,
  chain: "solana" | "monad",
): { total: number; foundCount: number } {
  if (!walletBalances || !walletList) {
    return { total: 0, foundCount: 0 };
  }

  const selection = new Set((selectedWalletIds || []).filter(Boolean));

  // If no wallets explicitly selected, prefer the user's PRIMARY wallet.
  // Fallback to first-non-archived only if no primary is flagged.
  // Bug fix: previously used slice(0, 1) unconditionally, which picked the
  // first wallet in the list even when the user had set a different one as
  // primary — producing false "insufficient balance" errors when the primary
  // wallet had funds but the first-listed wallet didn't.
  const primaryWallet = walletList.find((w) => w.isPrimary && !w.isArchived);
  const walletsToCheck =
    selection.size > 0
      ? walletList.filter((w) => w.id && selection.has(w.id))
      : primaryWallet
        ? [primaryWallet]
        : walletList.filter((w) => !w.isArchived).slice(0, 1);

  let total = 0;
  let foundCount = 0;
  const seenAddresses = new Set<string>();

  for (const wallet of walletsToCheck) {
    const rawAddr =
      chain === "monad"
        ? wallet.ethereumAddress || wallet.address
        : wallet.solanaAddress || wallet.address;
    if (!rawAddr) continue;

    const lowerAddr = rawAddr.toLowerCase();
    if (seenAddresses.has(lowerAddr)) continue;
    seenAddresses.add(lowerAddr);

    // Try lowercase first (Monad addresses are stored lowercase in walletBalances),
    // then original case as fallback
    const bal =
      walletBalances[lowerAddr] ?? walletBalances[rawAddr] ?? undefined;
    if (bal !== undefined) {
      total += bal;
      foundCount++;
    }
  }

  return { total, foundCount };
}
