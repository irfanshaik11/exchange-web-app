import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import type { ReactNode } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/router";

import { getUserById, ApiError, updateUser } from "../utils/api";
import { showEnhancedToast } from "~/utils/enhancedToast";
const USER_CACHE_KEY = "codex_user_info_cache";
import {
  clearStoredReferralAccess,
  getStoredReferralCodeHint,
  clearStoredReferralCodeHint,
} from "../utils/referralStorage";
import type {
  OptimisticBalanceDetail,
  OptimisticRollbackDetail,
} from "../utils/optimisticBalance";
import { useTurnkey } from "@turnkey/react-wallet-kit";
import next from "next";
import { normalizeMonadAddress } from "~/utils/normalizeMonadAddress";

const isDev = process.env.NODE_ENV !== "production";

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  publicKey: string;
  bearerToken: string;
  walletId?: string;
  subOrgId?: string | null;
  hasExportedWallet: boolean;
  walletExportedAt?: string | null;
}

interface WalletInfo {
  id: string;
  label?: string;
  address?: string;
  solanaAddress?: string;
  ethereumAddress?: string;
  balance?: number;
  isPrimary?: boolean;
  isArchived?: boolean;
}

interface UserContextType {
  user: UserInfo | null;
  loading: boolean;
  solBalance: number;
  usdcBalance: number;
  refreshUser: () => Promise<void>;
  refreshBalance: (opts?: {
    chain?: string;
    address?: string;
    force?: boolean;
    updateChainBalance?: boolean; // Force update chainBalances[chain] regardless of isPrimaryWallet check
  }) => Promise<{ balance: number; usdBalance: number } | null>;
  refreshAllBalances: (
    wallets: Array<{ address: string; chain: string }>,
    force?: boolean,
  ) => Promise<void>;
  setUser: (user: UserInfo | null) => void;
  logout: () => void;
  primaryWalletAddresses: {
    solana: string | null;
    ethereum: string | null;
  };
  chainBalances: Record<string, number>;
  walletBalances: Record<string, number>; // All wallet balances by address
  walletList: WalletInfo[]; // Centralized wallet list
  walletListLoading: boolean;
  refreshWalletList: (force?: boolean) => Promise<void>;
  selectedWalletIds: { sol: string[]; monad: string[] };
  toggleWalletSelection: (walletId: string, chain?: "sol" | "monad") => void;
  setSelectedWalletsForChain: (
    walletIds: string[],
    chain?: "sol" | "monad",
  ) => void;
  selectAllWalletsForChain: (chain?: "sol" | "monad") => void;
  selectWalletsWithFunds: (
    chain?: "sol" | "monad",
    minimumBalance?: number,
  ) => void;
  clearSelectedWallets: (chain?: "sol" | "monad") => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  // Single Turnkey hook usage
  const turnkey = useTurnkey();
  const turnkeyUser = turnkey?.user;
  const session = turnkey?.session;
  const router = useRouter();

  const [user, setUserState] = useState<UserInfo | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const cached = window.localStorage.getItem(USER_CACHE_KEY);
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === "object") {
        return {
          ...parsed,
          hasExportedWallet: !!parsed.hasExportedWallet,
          walletExportedAt: parsed.walletExportedAt ?? null,
        } as UserInfo;
      }
      return null;
    } catch (error) {
      console.warn("Failed to parse cached user, clearing cache", error);
      window.localStorage.removeItem(USER_CACHE_KEY);
      return null;
    }
  });

  const [loading, setLoading] = useState(true);
  const [solBalance, setSolBalance] = useState(0);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [lastNotifiedBalance, setLastNotifiedBalance] = useState<
    Record<string, number>
  >({});
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [primaryWalletAddresses, setPrimaryWalletAddresses] = useState<{
    solana: string | null;
    ethereum: string | null;
  }>({ solana: null, ethereum: null });
  const [chainBalances, setChainBalances] = useState<Record<string, number>>({
    sol: 0,
  });
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>(
    {},
  );
  const [walletList, setWalletList] = useState<WalletInfo[]>([]);
  const [walletListLoading, setWalletListLoading] = useState(false);
  const MIN_SELECTABLE_BALANCE = 0.00021; // priority fee + safety buffer from pre-transaction check
  const [selectedWalletIds, setSelectedWalletIds] = useState<{
    sol: string[];
    monad: string[];
  }>(() => {
    if (typeof window === "undefined") {
      return { sol: [], monad: [] };
    }
    try {
      const saved = window.localStorage.getItem("walletSelections_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          sol: Array.isArray(parsed?.sol) ? parsed.sol : [],
          monad: Array.isArray(parsed?.monad) ? parsed.monad : [],
        };
      }
    } catch {
      // ignore parsing errors
    }
    return { sol: [], monad: [] };
  });
  const chainBalancesRef = useRef<Record<string, number>>({ sol: 0 });
  const batchFetchInProgressRef = useRef(false);
  const lastBatchFetchRef = useRef(0);
  const walletListFetchInProgressRef = useRef(false);
  const lastWalletListFetchRef = useRef(0);
  const walletListFetchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const BATCH_FETCH_COOLDOWN_MS = 5000; // 5 seconds cooldown for batch fetches
  const WALLET_LIST_COOLDOWN_MS = 2000; // 2 seconds cooldown for wallet list fetches
  const normalizeAddressForChain = (
    address?: string | null,
    chain: "sol" | "monad" = "sol",
  ): string => {
    if (!address || typeof address !== "string") return "";
    if (chain === "monad") {
      return normalizeMonadAddress(address);
    }
    return address.trim();
  };
  // Cache balances by address to avoid cross-wallet contamination
  const addressBalanceCacheRef = useRef<Record<string, number>>({});
  const solUsdBalanceRef = useRef(0);
  const solBalanceRef = useRef(0);
  const lastNotifiedBalanceRef = useRef<Record<string, number>>({});
  const lastBalanceFetchRef = useRef<Record<string, number>>({});
  const balanceCheckInProgressRef = useRef<Record<string, boolean>>({});
  const hasSyncedProfileRef = useRef(false);
  const BALANCE_REFRESH_COOLDOWN_MS = 20000; // prevent hammering the balance endpoint

  // Optimistic balance deltas applied pre-trade; cleared when the real balance arrives
  // via gRPC push or REST refresh. Keyed by tradeId so rollback can reverse a specific entry.
  // `baselines` stores the pre-optimistic balance per wallet so the gRPC handler can
  // distinguish stale pre-tx pushes (value === baseline → ignore) from real post-tx
  // pushes (value differs → accept and clear pending).
  type PendingOptimistic = {
    chain: "sol";
    side: "buy" | "sell";
    perWalletDeltas: Array<{ address: string; deltaSol: number }>;
    baselines: Record<string, number>;
    expiresAt: number;
    timerId: ReturnType<typeof setTimeout> | null;
  };
  const pendingOptimisticDeltasRef = useRef<Map<string, PendingOptimistic>>(
    new Map(),
  );
  const OPTIMISTIC_TTL_MS = 15000;
  const STALE_GRPC_TOLERANCE_SOL = 1e-6; // 0.000001 SOL

  const persistUser = useCallback((value: UserInfo | null) => {
    if (typeof window === "undefined") return;
    try {
      if (value) {
        window.localStorage.setItem(USER_CACHE_KEY, JSON.stringify(value));
      } else {
        window.localStorage.removeItem(USER_CACHE_KEY);
      }
    } catch (error) {
      console.warn("Failed to persist user cache", error);
    }
  }, []);

  const normalizeUserPayload = useCallback((raw: any) => {
    if (!raw || typeof raw !== "object") return null;
    return {
      ...raw,
      subOrgId: raw.subOrgId ?? null,
      hasExportedWallet: !!raw.hasExportedWallet,
      walletExportedAt: raw.walletExportedAt ?? null,
    };
  }, []);

  const persistSelectedWallets = useCallback(
    (next: { sol: string[]; monad: string[] }) => {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(
          "walletSelections_v1",
          JSON.stringify(next),
        );
      } catch {
        // ignore storage errors
      }
    },
    [],
  );

  // Keep selected wallet ids in sync with available wallets
  useEffect(() => {
    if (!walletList || walletList.length === 0) return;

    setSelectedWalletIds((prev) => {
      const validSolIds = new Set(
        walletList
          .filter((w) => w.solanaAddress && !w.isArchived)
          .map((w) => w.id),
      );
      const validMonadIds = new Set(
        walletList
          .filter((w) => w.ethereumAddress && !w.isArchived)
          .map((w) => w.id),
      );

      const nextSol = prev.sol.filter((id) => validSolIds.has(id));
      const nextMonad = prev.monad.filter((id) => validMonadIds.has(id));

      if (
        nextSol.length === prev.sol.length &&
        nextMonad.length === prev.monad.length
      ) {
        return prev;
      }

      const next = { sol: nextSol, monad: nextMonad };
      persistSelectedWallets(next);
      return next;
    });
  }, [walletList, persistSelectedWallets]);

  const setSelectedWalletsForChain = useCallback(
    (walletIds: string[], chain: "sol" | "monad" = "sol") => {
      setSelectedWalletIds((prev) => {
        const deduped = Array.from(new Set(walletIds.filter(Boolean)));
        const next = { ...prev, [chain]: deduped };
        persistSelectedWallets(next);
        return next;
      });
    },
    [persistSelectedWallets],
  );

  const toggleWalletSelection = useCallback(
    (walletId: string, chain: "sol" | "monad" = "sol") => {
      setSelectedWalletIds((prev) => {
        const current = new Set(prev[chain] || []);
        if (current.has(walletId)) {
          current.delete(walletId);
        } else {
          current.add(walletId);
        }
        const next = { ...prev, [chain]: Array.from(current) };
        persistSelectedWallets(next);
        return next;
      });
    },
    [persistSelectedWallets],
  );

  const selectAllWalletsForChain = useCallback(
    (chain: "sol" | "monad" = "sol") => {
      const ids =
        walletList
          ?.filter((w) =>
            chain === "monad"
              ? w.ethereumAddress && !w.isArchived
              : w.solanaAddress && !w.isArchived,
          )
          .map((w) => w.id) || [];
      setSelectedWalletIds((prev) => {
        const next = { ...prev, [chain]: ids };
        persistSelectedWallets(next);
        return next;
      });
    },
    [walletList, persistSelectedWallets],
  );

  const selectWalletsWithFunds = useCallback(
    (
      chain: "sol" | "monad" = "sol",
      minimumBalance: number = MIN_SELECTABLE_BALANCE,
    ) => {
      const ids =
        walletList
          ?.filter((w) => {
            if (w.isArchived) return false;
            const address =
              chain === "monad"
                ? normalizeMonadAddress(w.ethereumAddress) || ""
                : (w.solanaAddress || "").trim();
            if (!address) return false;
            const bal = walletBalances[address] ?? 0;
            return bal >= minimumBalance;
          })
          .map((w) => w.id) || [];

      setSelectedWalletIds((prev) => {
        const next = { ...prev, [chain]: ids };
        persistSelectedWallets(next);
        return next;
      });
    },
    [walletList, walletBalances, persistSelectedWallets],
  );

  const clearSelectedWallets = useCallback(
    (chain: "sol" | "monad" = "sol") => {
      setSelectedWalletIds((prev) => {
        const next = { ...prev, [chain]: [] };
        persistSelectedWallets(next);
        return next;
      });
    },
    [persistSelectedWallets],
  );

  useEffect(() => {
    chainBalancesRef.current = chainBalances;
  }, [chainBalances]);

  useEffect(() => {
    solUsdBalanceRef.current = usdcBalance;
  }, [usdcBalance]);

  useEffect(() => {
    solBalanceRef.current = solBalance;
  }, [solBalance]);

  useEffect(() => {
    lastNotifiedBalanceRef.current = lastNotifiedBalance;
  }, [lastNotifiedBalance]);

  // Derive primary wallet addresses from Turnkey if available
  useEffect(() => {
    const deriveWalletsFromTurnkey = () => {
      isDev && console.log("Deriving wallets from Turnkey:", turnkey?.wallets);
      const accounts = (turnkey?.wallets || []).flatMap((w: any) =>
        Array.isArray(w?.accounts) ? w.accounts : [],
      );
      if (!accounts.length) return null;

      const solAccount = accounts.find((acct: any) =>
        typeof acct?.curve === "string"
          ? acct.curve.toUpperCase().includes("ED25519")
          : !String(acct?.address || "").startsWith("0x"),
      );
      const evmAccount = accounts.find((acct: any) =>
        typeof acct?.curve === "string"
          ? acct.curve.toUpperCase().includes("SECP")
          : String(acct?.address || "").startsWith("0x"),
      );

      const solanaAddress =
        (typeof solAccount?.address === "string" &&
        solAccount.address.trim().length > 0
          ? solAccount.address.trim()
          : typeof solAccount?.publicKey === "string" &&
              solAccount.publicKey.trim().length > 0
            ? solAccount.publicKey.trim()
            : null) ?? null;
      const ethereumAddress =
        normalizeMonadAddress(evmAccount?.address) || null;

      return {
        solana: solanaAddress,
        ethereum: ethereumAddress,
      };
    };

    const turnkeyAddresses = deriveWalletsFromTurnkey();
    if (turnkeyAddresses?.solana || turnkeyAddresses?.ethereum) {
      // Only apply SDK addresses when backend hasn't loaded wallet data yet.
      // Backend wallet list is authoritative — prevents FE Turnkey sub-org
      // from overwriting the backend-created wallet address (Google OAuth fix).
      setPrimaryWalletAddresses((prev) => {
        if (prev.solana || prev.ethereum) {
          return prev; // backend already set addresses — don't overwrite
        }
        return {
          solana: turnkeyAddresses.solana ?? null,
          ethereum: turnkeyAddresses.ethereum ?? null,
        };
      });
    }
    // REMOVED: Redundant fetchPrimaryWallets - now handled by refreshWalletList
  }, [turnkey?.wallets]);

  const setUser = useCallback(
    (value: UserInfo | null) => {
      setUserState(value);
      persistUser(value);
    },
    [persistUser],
  );

  // Centralized wallet list fetch with debouncing to prevent thousands of calls
  const refreshWalletList = useCallback(
    async (force = false): Promise<void> => {
      if (!user?.id || !user?.bearerToken) {
        setWalletList([]);
        return;
      }

      if (!process.env.NEXT_PUBLIC_BACKEND_URL) {
        return;
      }

      // Debounce: Clear any pending fetch
      if (walletListFetchDebounceRef.current) {
        clearTimeout(walletListFetchDebounceRef.current);
        walletListFetchDebounceRef.current = null;
      }

      // Check cooldown unless force is true
      if (!force) {
        const timeSinceLastFetch = Date.now() - lastWalletListFetchRef.current;
        if (timeSinceLastFetch < WALLET_LIST_COOLDOWN_MS) {
          isDev &&
            console.log(
              `Wallet list fetch on cooldown, skipping (${timeSinceLastFetch}ms)`,
            );
          return;
        }
      }

      // Prevent multiple simultaneous fetches
      if (walletListFetchInProgressRef.current) {
        isDev && console.log("Wallet list fetch already in progress, skipping");
        return;
      }

      walletListFetchInProgressRef.current = true;
      lastWalletListFetchRef.current = Date.now();
      setWalletListLoading(true);

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/users/wallet`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${user.bearerToken}`,
            },
          },
        );

        if (!res.ok) {
          throw new Error(`Failed to fetch wallets: ${res.status}`);
        }

        const data = await res.json();
        if (Array.isArray(data?.wallets)) {
          const normalizedWallets = data.wallets.map((wallet: any) => {
            const normalizedEthereum =
              normalizeMonadAddress(wallet?.ethereumAddress) ||
              normalizeMonadAddress(wallet?.address);
            return {
              ...wallet,
              ethereumAddress:
                normalizedEthereum ||
                (typeof wallet?.ethereumAddress === "string"
                  ? wallet.ethereumAddress
                  : undefined),
            };
          });

          setWalletList(normalizedWallets);

          // Also update primary wallet addresses
          const primary =
            normalizedWallets.find((w: any) => w.isPrimary) ??
            normalizedWallets[0];
          if (primary) {
            const primarySolana =
              typeof primary?.solanaAddress === "string" &&
              primary.solanaAddress.trim().length > 0
                ? primary.solanaAddress.trim()
                : typeof primary?.address === "string" &&
                    primary.address.trim().length > 0
                  ? primary.address.trim()
                  : null;
            const primaryEthereum =
              normalizeMonadAddress(primary?.ethereumAddress) || null;

            setPrimaryWalletAddresses({
              solana: primarySolana,
              ethereum: primaryEthereum,
            });
          }
        }
      } catch (error) {
        console.warn("Failed to fetch wallet list:", error);
      } finally {
        walletListFetchInProgressRef.current = false;
        setWalletListLoading(false);
      }
    },
    [user?.id, user?.bearerToken],
  );

  // Listen for wallets-updated event with debouncing
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleWalletsUpdated = () => {
      // Debounce: Schedule wallet list refresh after 300ms
      // This prevents cascade of fetches when multiple events fire rapidly
      if (walletListFetchDebounceRef.current) {
        clearTimeout(walletListFetchDebounceRef.current);
      }
      walletListFetchDebounceRef.current = setTimeout(() => {
        refreshWalletList(true); // Force refresh on explicit event
        walletListFetchDebounceRef.current = null;
      }, 300);
    };
    window.addEventListener("wallets-updated", handleWalletsUpdated);
    return () => {
      window.removeEventListener("wallets-updated", handleWalletsUpdated);
      if (walletListFetchDebounceRef.current) {
        clearTimeout(walletListFetchDebounceRef.current);
      }
    };
  }, [refreshWalletList]);

  const refreshBalance = useCallback(
    async (options?: {
      chain?: string;
      address?: string;
      force?: boolean;
      updateChainBalance?: boolean;
    }): Promise<{ balance: number; usdBalance: number } | null> => {
      const chain = options?.chain === "monad" ? "monad" : "sol";
      const overrideAddress = options?.address;
      const fallbackAddress =
        chain === "sol"
          ? primaryWalletAddresses.solana || user?.publicKey
          : primaryWalletAddresses.ethereum;
      const targetAddress = normalizeAddressForChain(
        overrideAddress || fallbackAddress,
        chain,
      );

      if (!targetAddress) return null;

      const checkKey = `${chain}:${targetAddress}`;
      const isPrimaryWallet =
        !overrideAddress ||
        (chain === "sol" && targetAddress === primaryWalletAddresses.solana) ||
        (chain === "monad" &&
          targetAddress === primaryWalletAddresses.ethereum);

      if (!options?.force) {
        const lastFetch = lastBalanceFetchRef.current[checkKey];
        if (lastFetch && Date.now() - lastFetch < BALANCE_REFRESH_COOLDOWN_MS) {
          // Return the cached balance for THIS specific address, not the chain-level balance
          const cachedBalance = addressBalanceCacheRef.current[checkKey];
          const cachedUsdBalance =
            chain === "sol" ? solUsdBalanceRef.current : 0;
          if (typeof cachedBalance === "number") {
            return { balance: cachedBalance, usdBalance: cachedUsdBalance };
          }
          return null;
        }
      }

      // Prevent multiple simultaneous balance checks for the same address
      // force: true bypasses the lock so init effects are never blocked by a competing non-forced fetch
      if (balanceCheckInProgressRef.current[checkKey] && !options?.force) {
        isDev &&
          console.log(`Balance check already in progress for ${checkKey}`);
        return null;
      }

      balanceCheckInProgressRef.current[checkKey] = true;
      lastBalanceFetchRef.current[checkKey] = Date.now();

      try {
        const response = await fetch(
          `/api/get-sol-bal?chain=${encodeURIComponent(
            chain,
          )}&address=${encodeURIComponent(targetAddress)}`,
        );

        if (!response.ok) {
          console.warn(
            "Failed to fetch SOL balance:",
            response.status,
            response.statusText,
          );
          return null;
        }

        const data = await response.json();

        // Check if the response has the expected structure
        if (!data || !data.data || typeof data.data.balance === "undefined") {
          console.warn("Invalid balance response structure:", data);
          return null;
        }

        const newBalance = data.data.balance;
        const newUsdBalance = data.data.usdBalance;

        // REST queries may return pre-tx blockchain state for ~1s after a
        // trade's backend ack (before the tx lands on-chain). If there's a
        // pending optimistic delta for this wallet, skip the state setters
        // so REST can't overwrite the optimistic value with a stale balance.
        // gRPC (authoritative, post-confirmation) or the 15s TTL will
        // reconcile. The caller still gets the fetched values from the
        // return statement below.
        const hasPendingOptimistic =
          chain === "sol" &&
          Array.from(pendingOptimisticDeltasRef.current.values()).some((e) =>
            e.perWalletDeltas.some((d) => d.address === targetAddress),
          );
        if (hasPendingOptimistic) {
          return { balance: newBalance, usdBalance: newUsdBalance };
        }

        // Cache the balance for this specific address
        addressBalanceCacheRef.current[checkKey] = newBalance;

        // Also populate walletBalances so pre-trade validation works
        // without requiring refreshAllBalances() (only called from Portfolio)
        setWalletBalances((prev) => ({ ...prev, [targetAddress]: newBalance }));

        // Update chainBalances for the primary wallet OR if explicitly requested
        // This allows Portfolio to force update chainBalances when setting a new primary wallet
        // even before primaryWalletAddresses is updated in UserContext
        if (isPrimaryWallet || options?.updateChainBalance) {
          setChainBalances((prev) => ({
            ...prev,
            [chain]: newBalance,
          }));
        }

        if (chain === "sol") {
          const lastNotified =
            lastNotifiedBalanceRef.current[targetAddress] ?? newBalance;

          isDev &&
            console.log(
              `Balance check for ${targetAddress}: current=${solBalanceRef.current.toFixed(
                4,
              )}, new=${newBalance.toFixed(
                4,
              )}, lastNotified=${lastNotified.toFixed(4)}`,
            );

          const depositAmount = newBalance - lastNotified;
          const isSignificantIncrease = depositAmount > 0.0001;
          const hasPreviousBalance =
            lastNotified !== newBalance && lastNotified > 0;

          if (
            isSignificantIncrease &&
            hasPreviousBalance &&
            notificationsEnabled
          ) {
            isDev &&
              console.log(
                `DEPOSIT DETECTED: ${depositAmount.toFixed(
                  4,
                )} SOL (from ${lastNotified.toFixed(
                  4,
                )} to ${newBalance.toFixed(4)})`,
              );
            setLastNotifiedBalance((prev) => ({
              ...prev,
              [targetAddress]: newBalance,
            }));
            isDev &&
              console.log(
                `Updated lastNotifiedBalance for ${targetAddress} to: ${newBalance.toFixed(
                  4,
                )}`,
              );
          } else if (
            isSignificantIncrease &&
            hasPreviousBalance &&
            !notificationsEnabled
          ) {
            isDev &&
              console.log(
                `DEPOSIT DETECTED but notifications disabled: ${depositAmount.toFixed(
                  4,
                )} SOL`,
              );
            setLastNotifiedBalance((prev) => ({
              ...prev,
              [targetAddress]: newBalance,
            }));
          } else {
            if (!lastNotifiedBalance[targetAddress]) {
              setLastNotifiedBalance((prev) => ({
                ...prev,
                [targetAddress]: newBalance,
              }));
              isDev &&
                console.log(
                  `Initialized lastNotifiedBalance for ${targetAddress}: ${newBalance.toFixed(
                    4,
                  )}`,
                );
            } else {
              setLastNotifiedBalance((prev) => ({
                ...prev,
                [targetAddress]: newBalance,
              }));
              isDev &&
                console.log(
                  "No deposit detected. Balance unchanged or already notified.",
                );
            }
          }

          setSolBalance(newBalance);
          setUsdcBalance(newUsdBalance);
        }
        return { balance: newBalance, usdBalance: newUsdBalance };
      } catch (error) {
        console.error("Failed to refresh balance:", error);
        return null;
      } finally {
        delete balanceCheckInProgressRef.current[checkKey];
        lastBalanceFetchRef.current[checkKey] = Date.now();
      }
    },
    [
      primaryWalletAddresses.solana,
      primaryWalletAddresses.ethereum,
      user?.publicKey,
      notificationsEnabled,
    ],
  );

  // Batch refresh all wallet balances using the optimized batch endpoint
  const refreshAllBalances = useCallback(
    async (
      wallets: Array<{ address: string; chain: string }>,
      force = false,
    ): Promise<void> => {
      if (!wallets || wallets.length === 0) return;

      const normalizedWallets = wallets
        .map((wallet) => {
          const chain: "sol" | "monad" =
            wallet.chain === "monad" ? "monad" : "sol";
          const normalizedAddress = normalizeAddressForChain(
            wallet.address,
            chain,
          );
          if (!normalizedAddress) return null;
          return { address: normalizedAddress, chain };
        })
        .filter(
          (wallet): wallet is { address: string; chain: "sol" | "monad" } =>
            Boolean(wallet),
        );

      if (normalizedWallets.length === 0) return;

      // Deduplicate addresses per chain
      const seenAddresses = new Set<string>();
      const uniqueWallets: Array<{ address: string; chain: "sol" | "monad" }> =
        [];
      normalizedWallets.forEach((wallet) => {
        const key = `${wallet.chain}:${wallet.address}`;
        if (seenAddresses.has(key)) return;
        seenAddresses.add(key);
        uniqueWallets.push(wallet);
      });

      // Prevent rapid consecutive batch fetches
      if (!force) {
        const timeSinceLastFetch = Date.now() - lastBatchFetchRef.current;
        if (timeSinceLastFetch < BATCH_FETCH_COOLDOWN_MS) {
          isDev &&
            console.log(
              `Batch fetch on cooldown, skipping (${timeSinceLastFetch}ms since last fetch)`,
            );
          return;
        }
      }

      // Prevent multiple simultaneous batch fetches
      if (batchFetchInProgressRef.current) {
        isDev && console.log("Batch fetch already in progress, skipping");
        return;
      }

      batchFetchInProgressRef.current = true;
      lastBatchFetchRef.current = Date.now();

      try {
        if (uniqueWallets.length === 0) {
          return;
        }

        isDev &&
          console.log(
            `Batch fetching ${uniqueWallets.length} unique wallet balances...`,
          );

        const addressChainMap = new Map<string, "sol" | "monad">();
        uniqueWallets.forEach(({ address, chain }) => {
          addressChainMap.set(address, chain);
        });

        const response = await fetch("/api/get-batch-balances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addresses: uniqueWallets }),
        });

        if (!response.ok) {
          throw new Error(`Batch balance fetch failed: ${response.status}`);
        }

        const data = await response.json();

        if (!data.ok || !data.balances) {
          throw new Error("Invalid batch balance response");
        }

        // Update walletBalances state with all fetched balances
        const newWalletBalances: Record<string, number> = {};
        for (const [rawAddress, balanceData] of Object.entries(data.balances)) {
          const inferredChain =
            addressChainMap.get(rawAddress) ||
            (rawAddress.startsWith("0x")
              ? addressChainMap.get(normalizeMonadAddress(rawAddress))
              : addressChainMap.get(rawAddress.trim()));

          const chain: "sol" | "monad" =
            inferredChain || (rawAddress.startsWith("0x") ? "monad" : "sol");

          const normalizedAddress =
            chain === "monad"
              ? normalizeMonadAddress(rawAddress)
              : rawAddress.trim();

          if (!normalizedAddress) continue;

          const { balance } = balanceData as {
            balance: number;
            usdBalance: number;
          };
          newWalletBalances[normalizedAddress] = balance;

          const cacheKey = `${chain}:${normalizedAddress}`;
          addressBalanceCacheRef.current[cacheKey] = balance;
          lastBalanceFetchRef.current[cacheKey] = Date.now();
        }

        // Drop addresses with pending optimistic deltas from this batch update
        // (REST may still reflect pre-tx state ~1s post-backend-ack; overwriting
        // would flash the old value until gRPC arrives).
        const pendingAddresses = new Set<string>();
        for (const entry of pendingOptimisticDeltasRef.current.values()) {
          for (const d of entry.perWalletDeltas) {
            if (d.address) pendingAddresses.add(d.address);
          }
        }
        const filteredWalletBalances: Record<string, number> = {};
        for (const [addr, bal] of Object.entries(newWalletBalances)) {
          if (!pendingAddresses.has(addr)) filteredWalletBalances[addr] = bal;
        }
        if (Object.keys(filteredWalletBalances).length > 0) {
          setWalletBalances((prev) => ({ ...prev, ...filteredWalletBalances }));
        }

        // Update chainBalances for primary wallets (skip if pending optimistic)
        const normalizedSolAddress =
          primaryWalletAddresses.solana?.trim() ||
          primaryWalletAddresses.solana ||
          null;
        if (
          normalizedSolAddress &&
          data.balances[normalizedSolAddress] &&
          !pendingAddresses.has(normalizedSolAddress)
        ) {
          const solData = data.balances[normalizedSolAddress] as {
            balance: number;
            usdBalance: number;
          };
          setChainBalances((prev) => ({ ...prev, sol: solData.balance }));
          setSolBalance(solData.balance);
          setUsdcBalance(solData.usdBalance);
        }

        const normalizedMonAddress = normalizeMonadAddress(
          primaryWalletAddresses.ethereum,
        );
        if (normalizedMonAddress && data.balances[normalizedMonAddress]) {
          const monadData = data.balances[normalizedMonAddress] as {
            balance: number;
          };
          setChainBalances((prev) => ({ ...prev, monad: monadData.balance }));
        }

        isDev &&
          console.log(
            `Batch fetch complete: ${Object.keys(newWalletBalances).length} balances updated`,
          );
      } catch (error) {
        console.error("Failed to batch fetch balances:", error);
      } finally {
        batchFetchInProgressRef.current = false;
      }
    },
    [primaryWalletAddresses.solana, primaryWalletAddresses.ethereum],
  );

  // Removed redundant balance-fetch effect that raced with initializeAndStartPolling below.
  // That effect called refreshBalance without force:true, claimed balanceCheckInProgressRef,
  // and blocked the init effect (which has the correct flags) from updating chainBalances.

  const refreshUser = useCallback(async () => {
    const token = Cookies.get("token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      isDev && console.log("Refreshing user with token:", token);

      // // Use Turnkey user + session if available to update backend
      // if (
      //   turnkeyUser?.userEmail &&
      //   turnkeyUser?.userName &&
      //   session?.userId
      // ) {
      //   console.log("Updating user profile on backend from Turnkey data:", {
      //     email: turnkeyUser.userEmail,
      //     name: turnkeyUser.userName,
      //     userId: session.userId,
      //   });
      //   await updateUser(
      //     token,
      //     turnkeyUser.userEmail,
      //     turnkeyUser.userName,
      //     session.userId
      //   );
      // }

      const userPromise = getUserById(token);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("getUserById timed out after 15s")),
          15000,
        ),
      );
      const { user: fetchedUser } = await Promise.race([
        userPromise,
        timeoutPromise,
      ]);

      isDev && console.log("Fetched user from API:", fetchedUser);
      if (fetchedUser) {
        let nextUser = fetchedUser;

        // If Turnkey provided user info differs, update backend once
        const desiredEmail = turnkeyUser?.userEmail;
        const desiredName = turnkeyUser?.userName;
        const needsEmailUpdate =
          desiredEmail &&
          typeof desiredEmail === "string" &&
          desiredEmail.trim().length > 0 &&
          desiredEmail !== fetchedUser.email;
        const needsNameUpdate =
          desiredName &&
          typeof desiredName === "string" &&
          desiredName.trim().length > 0 &&
          desiredName !== fetchedUser.name;
        isDev && console.log("UPDATED USER --- >", nextUser);
        if (
          !hasSyncedProfileRef.current &&
          (needsEmailUpdate || needsNameUpdate) &&
          token
        ) {
          try {
            const { user: updatedUser } = await updateUser(
              token,
              needsEmailUpdate ? desiredEmail! : fetchedUser.email,
              needsNameUpdate ? desiredName! : fetchedUser.name,
              session?.userId || fetchedUser.userId || fetchedUser.id,
            );
            if (updatedUser) {
              nextUser = updatedUser;
            }
            hasSyncedProfileRef.current = true;
          } catch (syncErr) {
            console.warn(
              "Failed to sync Turnkey user profile to backend",
              syncErr,
            );
            // Avoid tight retry loops; only retry on next app session
            hasSyncedProfileRef.current = true;
          }
        }

        const normalizedUser = normalizeUserPayload(nextUser) || nextUser;
        setUser({ bearerToken: token, ...normalizedUser });

        // Clear stored referral code hint after successful login
        // (referral tracking is now handled by exchange-backend during user creation)
        const referralCode = getStoredReferralCodeHint();
        if (referralCode) {
          clearStoredReferralCodeHint();
        }
      } else {
        Cookies.remove("token");
        setUser(null);
      }
    } catch (error) {
      console.error("Failed to refresh user", error);
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        Cookies.remove("token");
        setUser(null);
      } else {
        if (!user) {
          if (typeof window !== "undefined") {
            try {
              const cached = window.localStorage.getItem(USER_CACHE_KEY);
              if (cached) {
                const parsed = JSON.parse(cached);
                const normalized = normalizeUserPayload(parsed);
                if (normalized) {
                  setUserState(normalized as UserInfo);
                }
              }
            } catch (cacheError) {
              console.warn(
                "Failed to restore cached user after refresh failure",
                cacheError,
              );
            }
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, [
    setUser,
    turnkeyUser?.userEmail,
    turnkeyUser?.userName,
    session?.userId,
    normalizeUserPayload,
  ]);

  const logout = useCallback(() => {
    const doLogout = async () => {
      if (typeof window !== "undefined") {
        (window as any).__turnkeyLoggingOut = true;
      }

      try {
        const sessionKey = (turnkey as any)?.session?.sessionKey;
        if (turnkey?.clearSession && sessionKey) {
          await turnkey.clearSession({ sessionKey });
        } else {
          await turnkey?.clearAllSessions?.();
        }
        await turnkey?.logout?.();
      } catch (err) {
        console.warn("[logout] Failed to clear Turnkey session", err);
      } finally {
        if (typeof window !== "undefined") {
          delete (window as any).__turnkeyLoggingOut;
        }
      }

      Cookies.remove("token");
      setUser(null);
      setPrimaryWalletAddresses({ solana: null, ethereum: null });
      setSolBalance(0);
      setUsdcBalance(0);
      setChainBalances({ sol: 0 });
      setWalletBalances({});
      setWalletList([]);
      setLastNotifiedBalance({});
      chainBalancesRef.current = { sol: 0 };
      addressBalanceCacheRef.current = {}; // Clear address-specific cache on logout
      batchFetchInProgressRef.current = false;
      lastBatchFetchRef.current = 0;
      walletListFetchInProgressRef.current = false;
      lastWalletListFetchRef.current = 0;
      solUsdBalanceRef.current = 0;
      solBalanceRef.current = 0;
      lastNotifiedBalanceRef.current = {};
      balanceCheckInProgressRef.current = {};
      if (typeof window !== "undefined") {
        clearStoredReferralAccess();
        window.dispatchEvent(new Event("referral-access-reset"));
      }

      if (typeof window !== "undefined") {
        import("posthog-js").then(({ default: posthog }) => posthog.reset());
      }

      router
        .push("/pulse?chain=sol")
        .catch((err) =>
          console.warn("[logout] Failed to navigate to login", err),
        );
    };

    void doLogout();
  }, [turnkey, setUser, router]);

  useEffect(() => {
    if (hasSyncedProfileRef.current) return;
    // initial refresh when provider mounts (and when turnkey data changes)
    refreshUser();
  }, [refreshUser]);

  // Fetch wallet list when user logs in
  useEffect(() => {
    if (user?.id && user?.bearerToken) {
      refreshWalletList();
    }
  }, [user?.id, user?.bearerToken, refreshWalletList]);

  useEffect(() => {
    if (user) {
      const initializeAndStartPolling = async () => {
        try {
          const address = primaryWalletAddresses.solana || user.publicKey;
          if (!address) return;

          const res = await refreshBalance({
            chain: "sol",
            address,
            force: true,
            updateChainBalance: true,
          });

          if (!res) {
            console.warn("Failed to initialize Solana balance");
            return;
          }

          const currentBalance = res.balance;
          const currentUsdBalance = res.usdBalance;

          setLastNotifiedBalance((prev) => ({
            ...prev,
            [address]: currentBalance,
          }));
          setSolBalance(currentBalance);
          setUsdcBalance(currentUsdBalance);

          isDev &&
            console.log(
              `INITIALIZED balance tracking for ${address}: ${currentBalance.toFixed(
                4,
              )} SOL (lastNotifiedBalance set to ${currentBalance.toFixed(4)})`,
            );

          setTimeout(() => {
            setNotificationsEnabled(true);
          }, 3000);
        } catch (error) {
          console.error("Failed to initialize balance:", error);
        }

        // Also initialize Monad/Ethereum balance if available
        const ethAddress = primaryWalletAddresses.ethereum;
        if (ethAddress) {
          await refreshBalance({
            chain: "monad",
            address: ethAddress,
            force: true,
            updateChainBalance: true,
          });
        }
      };

      initializeAndStartPolling();

      let intervalId: NodeJS.Timeout;
      const timeoutId = setTimeout(() => {
        intervalId = setInterval(() => {
          if (typeof document !== "undefined" && document.hidden) {
            return;
          }
          const address = primaryWalletAddresses.solana || user.publicKey;
          if (!address) return;
          refreshBalance({ chain: "sol", address });
        }, 30000); // Reduced from 10s to 30s - Portfolio/Header use batch endpoint
      }, 2000);

      return () => {
        clearTimeout(timeoutId);
        if (intervalId) {
          clearInterval(intervalId);
        }
      };
    }
  }, [
    user?.publicKey,
    primaryWalletAddresses.solana,
    primaryWalletAddresses.ethereum,
    refreshBalance,
  ]);

  // Listen for balance-refresh events dispatched from trade surfaces
  useEffect(() => {
    if (!user) return;
    let debounceTimer: NodeJS.Timeout | null = null;
    const handleBalanceRefresh = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const chain = detail?.chain || "sol";
      if (debounceTimer) clearTimeout(debounceTimer);
      // Short debounce only coalesces multi-leg dispatches (e.g. multi-wallet trades that fire
      // several balance-refresh events in quick succession). 500ms was needlessly conservative.
      debounceTimer = setTimeout(() => {
        refreshBalance({ chain, force: true, updateChainBalance: true }).catch(
          (err) => {
            console.warn(
              "[UserContext] Failed to refresh balance from event:",
              err,
            );
          },
        );
      }, 75);
    };
    window.addEventListener("balance-refresh", handleBalanceRefresh);
    return () => {
      window.removeEventListener("balance-refresh", handleBalanceRefresh);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [user?.publicKey, refreshBalance]);

  // gRPC push: instant SOL balance updates via WebSocket (bypasses 20s cooldown).
  // Must update chainBalances + walletBalances in addition to solBalance because
  // Header.tsx reads chainBalances.sol as the source of truth — updating only
  // solBalance leaves the header showing stale data when REST returns pre-finality.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleGrpcBalance = (event: Event) => {
      const { solBalance: newBal, wallet } =
        (event as CustomEvent).detail || {};
      if (
        !(
          typeof newBal === "number" &&
          Number.isFinite(newBal) &&
          newBal >= 0
        )
      ) {
        return;
      }

      const matchAddr =
        typeof wallet === "string" && wallet.length > 0
          ? wallet
          : primaryWalletAddresses.solana;

      // Find pending entries touching this wallet
      const matchingPendings: Array<[string, PendingOptimistic]> = [];
      if (matchAddr) {
        for (const [id, entry] of pendingOptimisticDeltasRef.current) {
          if (entry.perWalletDeltas.some((d) => d.address === matchAddr)) {
            matchingPendings.push([id, entry]);
          }
        }
      }

      // Stale-push filter: if a pending optimistic exists and the incoming
      // value equals the pre-optimistic baseline for this wallet, this push
      // reflects pre-tx state (tx hasn't landed yet). Ignore it so the
      // optimistic stays on screen. The real post-tx push will differ from
      // the baseline and get accepted below.
      if (matchAddr && matchingPendings.length > 0) {
        const baseline = matchingPendings[0][1].baselines[matchAddr];
        if (
          typeof baseline === "number" &&
          Math.abs(newBal - baseline) < STALE_GRPC_TOLERANCE_SOL
        ) {
          return;
        }
      }

      // Real update — apply to state
      setSolBalance(newBal);
      solBalanceRef.current = newBal;
      if (typeof wallet === "string" && wallet.length > 0) {
        setWalletBalances((prev) => ({ ...prev, [wallet]: newBal }));
        addressBalanceCacheRef.current[`sol:${wallet}`] = newBal;
        if (wallet === primaryWalletAddresses.solana) {
          setChainBalances((prev) => ({ ...prev, sol: newBal }));
        }
      } else {
        // Fallback: no wallet in payload — assume primary
        setChainBalances((prev) => ({ ...prev, sol: newBal }));
      }

      // Reconcile: this gRPC push is the post-tx truth. Clear matching
      // pendings and their TTL timers.
      for (const [id, entry] of matchingPendings) {
        if (entry.timerId) clearTimeout(entry.timerId);
        pendingOptimisticDeltasRef.current.delete(id);
      }
    };
    window.addEventListener("solanaBalanceUpdate", handleGrpcBalance);
    return () => {
      window.removeEventListener("solanaBalanceUpdate", handleGrpcBalance);
    };
  }, [primaryWalletAddresses.solana]);

  // Optimistic balance: pre-trade dispatch applies delta instantly so header
  // reflects the click before the backend responds. Real value arrives via
  // gRPC / REST and clears the pending entry (see reconcile blocks above).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOptimistic = (event: Event) => {
      const detail = (event as CustomEvent<OptimisticBalanceDetail>).detail;
      if (!detail || detail.chain !== "sol") return;
      const { tradeId, side, perWalletDeltas, expiresAt } = detail;
      if (!tradeId || !Array.isArray(perWalletDeltas)) return;

      const primary = primaryWalletAddresses.solana;
      const baselines: Record<string, number> = {};
      let primaryDelta = 0;
      setWalletBalances((prev) => {
        const next = { ...prev };
        for (const { address, deltaSol } of perWalletDeltas) {
          if (!address || !Number.isFinite(deltaSol) || deltaSol === 0) continue;
          const current = next[address] ?? 0;
          baselines[address] = current;
          next[address] = Math.max(0, current + deltaSol);
          if (primary && address === primary) primaryDelta += deltaSol;
        }
        return next;
      });
      if (primaryDelta !== 0) {
        // Snapshot the pre-optimistic primary baseline for the gRPC stale check
        baselines[primary as string] = solBalanceRef.current;
        setSolBalance((prev) => Math.max(0, prev + primaryDelta));
        solBalanceRef.current = Math.max(
          0,
          solBalanceRef.current + primaryDelta,
        );
        setChainBalances((prev) => ({
          ...prev,
          sol: Math.max(0, (prev.sol ?? 0) + primaryDelta),
        }));
      }

      // TTL: if gRPC/REST never arrives, force-refresh and drop the optimistic.
      const ttl = Math.max(0, (expiresAt ?? 0) - Date.now()) || OPTIMISTIC_TTL_MS;
      const timerId = setTimeout(() => {
        const existing = pendingOptimisticDeltasRef.current.get(tradeId);
        if (!existing) return;
        pendingOptimisticDeltasRef.current.delete(tradeId);
        if (primary) {
          refreshBalance({ chain: "sol", address: primary, force: true }).catch(
            () => {},
          );
        }
      }, ttl);

      pendingOptimisticDeltasRef.current.set(tradeId, {
        chain: "sol",
        side,
        perWalletDeltas,
        baselines,
        expiresAt: expiresAt ?? Date.now() + OPTIMISTIC_TTL_MS,
        timerId,
      });
    };

    const handleRollback = (event: Event) => {
      const detail = (event as CustomEvent<OptimisticRollbackDetail>).detail;
      if (!detail?.tradeId) return;
      const entry = pendingOptimisticDeltasRef.current.get(detail.tradeId);
      if (!entry) return;
      if (entry.timerId) clearTimeout(entry.timerId);
      pendingOptimisticDeltasRef.current.delete(detail.tradeId);

      const primary = primaryWalletAddresses.solana;
      let primaryDelta = 0;
      setWalletBalances((prev) => {
        const next = { ...prev };
        for (const { address, deltaSol } of entry.perWalletDeltas) {
          if (!address || !Number.isFinite(deltaSol) || deltaSol === 0) continue;
          const current = next[address] ?? 0;
          next[address] = Math.max(0, current - deltaSol);
          if (primary && address === primary) primaryDelta += deltaSol;
        }
        return next;
      });
      if (primaryDelta !== 0) {
        setSolBalance((prev) => Math.max(0, prev - primaryDelta));
        solBalanceRef.current = Math.max(
          0,
          solBalanceRef.current - primaryDelta,
        );
        setChainBalances((prev) => ({
          ...prev,
          sol: Math.max(0, (prev.sol ?? 0) - primaryDelta),
        }));
      }
    };

    window.addEventListener("balance-optimistic", handleOptimistic);
    window.addEventListener("balance-optimistic-rollback", handleRollback);
    return () => {
      window.removeEventListener("balance-optimistic", handleOptimistic);
      window.removeEventListener("balance-optimistic-rollback", handleRollback);
    };
  }, [primaryWalletAddresses.solana, refreshBalance]);

  // Clear all pending optimistic entries when the primary wallet changes —
  // a delta from wallet A shouldn't hang around displayed against wallet B.
  useEffect(() => {
    for (const entry of pendingOptimisticDeltasRef.current.values()) {
      if (entry.timerId) clearTimeout(entry.timerId);
    }
    pendingOptimisticDeltasRef.current.clear();
  }, [primaryWalletAddresses.solana]);

  // Auto-logout when backend returns TOKEN_EXPIRED / INVALID_TOKEN / UNAUTHORIZED
  useEffect(() => {
    if (typeof window === "undefined") return;
    let logoutTriggered = false;
    const handleSessionExpired = () => {
      if (logoutTriggered) return;
      logoutTriggered = true;
      showEnhancedToast("error", "Session expired. Please log in again.");
      logout();
    };
    window.addEventListener("auth-session-expired", handleSessionExpired);
    return () => {
      window.removeEventListener("auth-session-expired", handleSessionExpired);
    };
  }, [logout]);

  const value = useMemo(
    () => ({
      user,
      loading,
      solBalance,
      usdcBalance,
      refreshUser,
      refreshBalance,
      refreshAllBalances,
      setUser,
      logout,
      primaryWalletAddresses,
      chainBalances,
      walletBalances,
      walletList,
      walletListLoading,
      refreshWalletList,
      selectedWalletIds,
      toggleWalletSelection,
      setSelectedWalletsForChain,
      selectAllWalletsForChain,
      selectWalletsWithFunds,
      clearSelectedWallets,
    }),
    [
      user,
      loading,
      solBalance,
      usdcBalance,
      refreshUser,
      refreshBalance,
      refreshAllBalances,
      setUser,
      logout,
      primaryWalletAddresses,
      chainBalances,
      walletBalances,
      walletList,
      walletListLoading,
      refreshWalletList,
      selectedWalletIds,
      toggleWalletSelection,
      setSelectedWalletsForChain,
      selectAllWalletsForChain,
      selectWalletsWithFunds,
      clearSelectedWallets,
    ],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within a UserProvider");
  return ctx;
}
