import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/router";
import InterstateButton from "./InterstateButton";
import { env } from "../env";
import { useUser } from "./UserContext";
import { useTurnkey } from "@turnkey/react-wallet-kit";
import { getWaitlistStatus, redeemAccessCode, completeAllQuests } from "../utils/api";
import Cookies from "js-cookie";
import { FaDiscord } from "react-icons/fa";
import { shouldShowWaitlistModal } from "../utils/waitlist";

type ReferralGateStatus = "checking" | "prompt" | "validating" | "granted";

interface ReferralAccessContextValue {
  status: ReferralGateStatus;
  hasAccess: boolean;
  grantAccess: () => void;
  revokeAccess: () => void;
}

const ReferralAccessContext = createContext<ReferralAccessContextValue | null>(
  null,
);

export function useReferralAccess() {
  const ctx = useContext(ReferralAccessContext);
  if (!ctx) {
    throw new Error(
      "useReferralAccess must be used within a ReferralAccessGate component",
    );
  }
  return ctx;
}

// All codes (including admin codes) must be validated server-side via redeemAccessCode
const STORAGE_FLAG_KEY = "referralAccess.granted"; // legacy (session)
const STORAGE_META_KEY = "referralAccess.meta"; // legacy (session)
const LS_KEY_PREFIX = "referralAccess.granted.user:"; // persistent per-user

type StoredAccessMeta = {
  grantedAt: number;
  userId?: string | null;
};

function normalizeReferralInput(raw: string): string {
  return raw.trim().toUpperCase();
}

function derivePrefillQuery(router: ReturnType<typeof useRouter>) {
  if (!router.isReady) return null;
  const candidates = [
    router.query.ref,
    router.query.referral,
    router.query.referrer,
    router.query.code,
    router.query.referralCode,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const value = Array.isArray(candidate) ? candidate[0] : candidate;
    if (value && typeof value === "string") {
      return normalizeReferralInput(value);
    }
  }

  return null;
}

function persistAccess(userId?: string | null) {
  if (typeof window === "undefined") return;
  const meta: StoredAccessMeta = {
    grantedAt: Date.now(),
    userId: userId ?? null,
  };
  try {
    // Legacy session storage (kept for compatibility)
    window.sessionStorage.setItem(STORAGE_FLAG_KEY, "true");
    window.sessionStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta));
    // Persistent per-user flag
    if (userId) {
      window.localStorage.setItem(`${LS_KEY_PREFIX}${userId}`, "true");
    }
  } catch (error) {
    console.warn("Failed to persist referral access state", error);
  }
}

function clearPersistedAccess() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_FLAG_KEY);
    window.sessionStorage.removeItem(STORAGE_META_KEY);
    // Do not clear per-user localStorage here; it should persist across sessions
  } catch (error) {
    console.warn("Failed to clear referral access state", error);
  }
}

function hasStoredAccess(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // Prefer per-user localStorage when user is known
    // Fallback to legacy session flag
    const session = window.sessionStorage.getItem(STORAGE_FLAG_KEY) === "true";
    return session;
  } catch {
    return false;
  }
}

function getStoredAccessMeta(): StoredAccessMeta | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(STORAGE_META_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as StoredAccessMeta;
    }
  } catch (error) {
    console.warn("Failed to parse referral access metadata", error);
  }
  return null;
}

export function ReferralAccessGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, loading: userLoading, refreshUser } = useUser();
  const hasMountedRef = useRef(false);
  const prefillAttemptedRef = useRef(false);

  const requireReferralAccess =
    env.NEXT_PUBLIC_REQUIRE_REFERRAL_ACCESS !== undefined
      ? env.NEXT_PUBLIC_REQUIRE_REFERRAL_ACCESS
      : false; // default to false to bypass referral gate for now

  const [status, setStatus] = useState<ReferralGateStatus>(() => {
    if (!requireReferralAccess) return "granted";
    if (typeof window !== "undefined" && hasStoredAccess()) {
      return "granted";
    }
    return "prompt";
  });
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [autoSubmitCode, setAutoSubmitCode] = useState<string | null>(null);
  const [showWalletOptions, setShowWalletOptions] = useState(false);
  const [phantomLoading, setPhantomLoading] = useState(false);
  const [metamaskLoading, setMetamaskLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [showQuests, setShowQuests] = useState(false);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [waitlistForm, setWaitlistForm] = useState({});
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [questProgress, setQuestProgress] = useState({
    xp: 0,
    rank: "Unranked",
    nextRankXp: 200,
    completedQuests: [] as string[],
  });
  const [twitterLinked, setTwitterLinked] = useState(false);
  const [twitterUsername, setTwitterUsername] = useState<string | null>(null);
  const [checkingTwitter, setCheckingTwitter] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState("");
  const [narrativeFollowed, setNarrativeFollowed] = useState(false);
  const [postLiked, setPostLiked] = useState(false);
  const [postReposted, setPostReposted] = useState(false);
  const [postReplied, setPostReplied] = useState(false);
  const [discordJoined, setDiscordJoined] = useState(false);
  const [showCongratsModal, setShowCongratsModal] = useState(false);
  const [waitlistNumber, setWaitlistNumber] = useState<number | null>(null);
  const [showValidatingPopup, setShowValidatingPopup] = useState(false);
  const [wasWindowBlurred, setWasWindowBlurred] = useState(false);

  // Calculate quest progress
  const questProgressData = useMemo(() => {
    const quests = [
      { id: 'twitter', completed: twitterLinked },
      { id: 'follow', completed: narrativeFollowed },
      { id: 'like', completed: postLiked },
      { id: 'repost', completed: postReposted },
      { id: 'reply', completed: postReplied },
      { id: 'discord', completed: discordJoined },
    ];
    
    const completedCount = quests.filter(q => q.completed).length;
    const totalQuests = quests.length;
    const xpPerQuest = 25;
    const totalXp = completedCount * xpPerQuest;
    const maxXp = totalQuests * xpPerQuest;
    const progressPercentage = (completedCount / totalQuests) * 100;
    
    // Determine rank based on XP
    let rank = "Unranked";
    let nextRankXp = 200;
    if (totalXp >= 150) {
      rank = "Master";
      nextRankXp = 0;
    } else if (totalXp >= 125) {
      rank = "Expert";
      nextRankXp = 150;
    } else if (totalXp >= 100) {
      rank = "Advanced";
      nextRankXp = 125;
    } else if (totalXp >= 75) {
      rank = "Intermediate";
      nextRankXp = 100;
    } else if (totalXp >= 50) {
      rank = "Beginner";
      nextRankXp = 75;
    } else if (totalXp >= 25) {
      rank = "Novice";
      nextRankXp = 50;
    }
    
    return {
      completedCount,
      totalQuests,
      totalXp,
      maxXp,
      progressPercentage,
      rank,
      nextRankXp,
      xpNeeded: nextRankXp > 0 ? nextRankXp - totalXp : 0,
    };
  }, [twitterLinked, narrativeFollowed, postLiked, postReposted, postReplied, discordJoined]);

  // Turnkey wallet authentication hooks
  const turnkey = useTurnkey();
  const fetchWalletProviders = turnkey?.fetchWalletProviders;
  const loginOrSignupWithWallet = turnkey?.loginOrSignupWithWallet;
  const logout = turnkey?.logout;

  const grantAccess = useCallback(() => {
    persistAccess(user?.id ?? null);
    setStatus("granted");
    setError(null);
    setInfo("Admin access granted.");
  }, [user]);

  const revokeAccess = useCallback(() => {
    clearPersistedAccess();
    setStatus("prompt");
    setError(null);
    setInfo(null);
    prefillAttemptedRef.current = false;
    setCodeInput("");
  }, []);

  const evaluateStoredAccess = useCallback(() => {
    if (!requireReferralAccess) {
      setStatus("granted");
      return;
    }

    if (userLoading) {
      return;
    }

    // Check persistent per-user localStorage first
    if (typeof window !== "undefined" && user?.id) {
      const lsGranted = window.localStorage.getItem(`${LS_KEY_PREFIX}${user.id}`) === "true";
      if (lsGranted) {
        setStatus("granted");
        setInfo("Welcome back.");
        return;
      }
    }

    // Fallback to legacy session check
    if (hasStoredAccess()) {
      const meta = getStoredAccessMeta();
      if (user && meta && meta.userId && meta.userId === user.id) {
        setStatus("granted");
        setInfo("Welcome back.");
        return;
      }
    }

    setStatus("prompt");
  }, [requireReferralAccess, userLoading, user, revokeAccess]);

  useEffect(() => {
    if (!requireReferralAccess) return;
    if (hasMountedRef.current) return;
    if (userLoading) return;
    hasMountedRef.current = true;
    evaluateStoredAccess();
  }, [requireReferralAccess, evaluateStoredAccess, userLoading]);

  useEffect(() => {
    if (!requireReferralAccess) return;
    if (!hasMountedRef.current) return;
    if (userLoading) return;
    evaluateStoredAccess();
  }, [requireReferralAccess, evaluateStoredAccess, userLoading, user]);

  // On login/user change, check server waitlist state; auto-grant if off waitlist
  useEffect(() => {
    if (!requireReferralAccess) return;
    if (userLoading || !user) return;
    // Only check once per user session
    if (status === "granted" || status === "checking") return;
    let cancelled = false;
    (async () => {
      try {
        const q = user?.id ? { userId: Number(user.id) } : undefined;
        if (!q) return;
        const resp = await getWaitlistStatus(q).catch(() => null);
        const wl = resp?.waitlist;
        if (cancelled) return;
        if (wl && !shouldShowWaitlistModal({ status: wl.status, waitlistNumber: wl.waitlistNumber })) {
          persistAccess(user.id);
          setStatus("granted");
          setInfo("Access restored.");
        } else if (!wl) {
          // Not on waitlist; avoid retry loop
          setStatus("prompt");
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requireReferralAccess, userLoading, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_FLAG_KEY || event.key === STORAGE_META_KEY) {
        evaluateStoredAccess();
      }
    };

    const handleReset = () => revokeAccess();

    window.addEventListener("storage", handleStorage);
    window.addEventListener("referral-access-reset", handleReset);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("referral-access-reset", handleReset);
    };
  }, [evaluateStoredAccess, revokeAccess]);

  useEffect(() => {
    if (!requireReferralAccess) return;
    if (!router.isReady) return;
    if (prefillAttemptedRef.current) return;

    const prefill = derivePrefillQuery(router);
    if (prefill) {
      setCodeInput(prefill);
      setAutoSubmitCode(prefill);
      prefillAttemptedRef.current = true;
      return;
    }

    prefillAttemptedRef.current = true;
  }, [router.isReady, router.asPath, requireReferralAccess, router]);

  const handleSubmit = useCallback(
    (incomingCode?: string) => {
      if (!requireReferralAccess) return;

      const raw = incomingCode ?? codeInput;
      const normalized = normalizeReferralInput(raw);
      if (!normalized) {
        setError("Enter a referral code to continue.");
        return;
      }

      setStatus("validating");
      setError(null);
      setInfo(null);

      // SECURITY: All access code validation happens server-side only.
      // No hardcoded secrets in client-side code. Backend validates all codes including admin codes.
      // Validate with backend and mark waitlist as activated (number -> 0) on success.
      // If the user has no waitlist row yet, create it and retry once.
      (async () => {
        try {
          if (!user) {
            setStatus("prompt");
            setError("Please login first.");
            return;
          }
          
          // All codes (including admin codes) are validated server-side only
          // Backend is the single source of truth for access control
          // SECURITY: userId is no longer sent - backend uses authenticated user from JWT token
          if (!user?.bearerToken) {
            setStatus("prompt");
            setError("Please login to activate Early Access.");
            return;
          }
          
          try {
            await redeemAccessCode({
              accessCode: normalized,
              authToken: user.bearerToken,
            });
          } catch (err: any) {
            // If no waitlist row, create it, then retry redeem once
            const statusCode = err?.status || err?.response?.status;
            if (statusCode === 404) {
              await completeAllQuests({ userId: Number(user.id) });
              await redeemAccessCode({
                accessCode: normalized,
                authToken: user.bearerToken,
              });
            } else {
              throw err;
            }
          }
          persistAccess(user.id);
          grantAccess();
        } catch (e: any) {
          setStatus("prompt");
          setError("That code is not recognized. Please double-check with your inviter.");
        }
      })();
    },
    [requireReferralAccess, codeInput, grantAccess, user],
  );

  useEffect(() => {
    if (!requireReferralAccess) return;
    if (userLoading || !user) return;
    if (!autoSubmitCode) return;
    if (status !== "prompt" && status !== "checking") return;
    handleSubmit(autoSubmitCode);
    setAutoSubmitCode(null);
  }, [autoSubmitCode, status, requireReferralAccess, handleSubmit, user, userLoading]);

  useEffect(() => {
    if (!router.isReady) return;
    const [pathPart, searchPart] = router.asPath.split("?");
    if (!searchPart) return;

    const params = new URLSearchParams(searchPart);
    const keysToDelete = [
      "ref",
      "referral",
      "referrer",
      "code",
      "referralCode",
    ];

    let mutated = false;
    keysToDelete.forEach((key) => {
      if (params.has(key)) {
        params.delete(key);
        mutated = true;
      }
    });

    if (!mutated) return;

    const cleaned = params.toString();
    router.replace(
      cleaned ? `${pathPart}?${cleaned}` : pathPart,
      undefined,
      {
        shallow: true,
      },
    );
  }, [router.isReady, router.asPath, router]);

  // No-op: Turnkey wallet auth doesn't require pre-refreshing connection state
  // The wallet providers are fetched on-demand when the user clicks to login

  // Check Twitter authentication status
  const checkTwitterAuth = useCallback(async () => {
    setCheckingTwitter(true);
    try {
      const response = await fetch('/api/twitter/verify-auth');
      const data = await response.json();
      if (data.authenticated && data.user) {
        setTwitterLinked(true);
        setTwitterUsername(data.user.username);
      } else {
        setTwitterLinked(false);
        setTwitterUsername(null);
      }
    } catch (error) {
      console.error('Error checking Twitter auth:', error);
      setTwitterLinked(false);
      setTwitterUsername(null);
    } finally {
      setCheckingTwitter(false);
    }
  }, []);

  // Check Twitter status when waitlist modal opens or URL changes (after OAuth callback)
  useEffect(() => {
    if (showWaitlist) {
      checkTwitterAuth();
    }
  }, [showWaitlist, checkTwitterAuth]);

  // Check for Twitter OAuth callback in URL - PRIORITY: Show waitlist immediately
  useEffect(() => {
    if (!router.isReady) return;
    const { twitter_error, twitter_success, show_quests } = router.query;
    
    if (twitter_success === 'true') {
      // IMMEDIATELY show waitlist modal to prevent referral overlay from showing
      setShowWaitlist(true);
      
      // Check Twitter auth and save Twitter info to database
      checkTwitterAuth().then(async () => {
        // Save Twitter info to database
        if (user?.id) {
          try {
            const response = await fetch('/api/twitter/verify-auth');
            const data = await response.json();
            if (data.authenticated && data.user) {
              // Save Twitter info to waitlist
              await completeAllQuests({
                userId: Number(user.id),
                twitterId: data.user.id,
                twitterUsername: data.user.username,
              }).catch(err => {
                console.error('Failed to save Twitter info to waitlist:', err);
              });
            }
          } catch (error) {
            console.error('Error saving Twitter info:', error);
          }
        }
      });
      
      // Clean up URL
      const [pathPart, searchPart] = router.asPath.split('?');
      if (searchPart) {
        const params = new URLSearchParams(searchPart);
        params.delete('twitter_success');
        params.delete('show_quests');
        const cleaned = params.toString();
        router.replace(
          cleaned ? `${pathPart}?${cleaned}` : pathPart,
          undefined,
          { shallow: true }
        );
      }
    } else if (twitter_error) {
      setError(`Twitter linking failed: ${twitter_error}`);
      // Clean up URL
      const [pathPart, searchPart] = router.asPath.split('?');
      if (searchPart) {
        const params = new URLSearchParams(searchPart);
        params.delete('twitter_error');
        const cleaned = params.toString();
        router.replace(
          cleaned ? `${pathPart}?${cleaned}` : pathPart,
          undefined,
          { shallow: true }
        );
      }
    }
  }, [router.isReady, router.query, router.asPath, router, checkTwitterAuth, user]);

  // Reset blur state when waitlist modal closes
  useEffect(() => {
    if (!showWaitlist) {
      setWasWindowBlurred(false);
      setShowValidatingPopup(false);
    }
  }, [showWaitlist]);

  // Detect when user returns to the page after opening quest links
  useEffect(() => {
    if (!showWaitlist) return;

    const handleBlur = () => {
      setWasWindowBlurred(true);
    };

    const handleFocus = async () => {
      if (wasWindowBlurred && showWaitlist) {
        // Show validating popup
        setShowValidatingPopup(true);
        
        // Verify quest status
        await checkTwitterAuth();
        
        // Check follow, like, repost, reply status via API
        try {
          const [followRes, likeRes, repostRes, replyRes] = await Promise.all([
            fetch('/api/twitter/check-follow').catch(() => null),
            fetch('/api/twitter/check-like').catch(() => null),
            fetch('/api/twitter/check-retweet').catch(() => null),
            fetch('/api/twitter/check-reply').catch(() => null),
          ]);

          if (followRes?.ok) {
            const data = await followRes.json();
            if (data.following) setNarrativeFollowed(true);
          }
          if (likeRes?.ok) {
            const data = await likeRes.json();
            if (data.liked) setPostLiked(true);
          }
          if (repostRes?.ok) {
            const data = await repostRes.json();
            if (data.retweeted) setPostReposted(true);
          }
          if (replyRes?.ok) {
            const data = await replyRes.json();
            if (data.replied) setPostReplied(true);
          }
        } catch (error) {
          console.error('Error checking quest status:', error);
        }

        // Hide validating popup after a delay
        setTimeout(() => {
          setShowValidatingPopup(false);
        }, 2000);
      }
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [showWaitlist, wasWindowBlurred, checkTwitterAuth]);

  // Retrieve waitlist number from URL query parameter or sessionStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (router.isReady) {
        const numberFromQuery = router.query.number;
        if (numberFromQuery && typeof numberFromQuery === "string") {
          const number = parseInt(numberFromQuery, 10);
          if (!isNaN(number)) {
            setWaitlistNumber(number);
            sessionStorage.setItem("waitlistNumber", number.toString());
            return;
          }
        }
      }
      
      // Fallback to sessionStorage
      const stored = sessionStorage.getItem("waitlistNumber");
      if (stored) {
        setWaitlistNumber(parseInt(stored, 10));
      }
    }
  }, [router.isReady, router.query.number]);

  // Handle Twitter linking
  const handleLinkTwitter = useCallback((e?: React.MouseEvent<HTMLButtonElement>) => {
    // Prevent any default behavior and stop propagation
    e?.preventDefault();
    e?.stopPropagation();
    
    // Prepare auth URL
    const currentPath = router.asPath.split('?')[0];
    const returnUrl = `${currentPath}?twitter_success=true`;
    const authUrl = `/api/twitter/auth?return_url=${encodeURIComponent(returnUrl)}`;
    
    // Open in a new tab
    window.open(authUrl, '_blank');
  }, [router.asPath]);

  // Handle Twitter disconnecting
  const handleDisconnectTwitter = useCallback(async (e?: React.MouseEvent<HTMLButtonElement>) => {
    // Prevent any default behavior and stop propagation
    e?.preventDefault();
    e?.stopPropagation();
    
    try {
      const response = await fetch('/api/twitter/disconnect', {
        method: 'POST',
      });
      
      if (response.ok) {
        // Update local state
        setTwitterLinked(false);
        setTwitterUsername(null);
      } else {
        console.error('Failed to disconnect Twitter account');
      }
    } catch (error) {
      console.error('Error disconnecting Twitter account:', error);
    }
  }, []);

  // Phantom Wallet Login handler - Uses Turnkey wallet authentication
  // After successful auth, TurnkeySessionBridge handles /api/users/turnkey/login + app JWT
  const handlePhantomLogin = useCallback(async () => {
    setPhantomLoading(true);
    setError(null);
    setWalletError(null);
    setInfo(null);
    
    try {
      console.log('[ReferralAccessGate] Using existing Turnkey session storage (no manual clearing)');
      
      if (!fetchWalletProviders || !loginOrSignupWithWallet) {
        setWalletError("Turnkey wallet authentication is not ready. Please try again.");
        return;
      }

      // Fetch available wallet providers
      const providers = await fetchWalletProviders();
      
      // Find Phantom provider (Solana namespace)
      const phantomProvider = providers.find((p: any) => {
        const providerName = p.info?.name?.toLowerCase() || '';
        const namespace = p.chainInfo?.namespace?.toLowerCase() || '';
        return providerName.includes('phantom') && namespace === 'solana';
      });

      if (!phantomProvider) {
        setWalletError("Phantom wallet not found. Please install Phantom wallet and refresh the page.");
        return;
      }

      // CRITICAL: Create an API key pair BEFORE wallet auth
      // This API key will be added to the sub-org during creation,
      // allowing subsequent operations (like export) without wallet signatures
      let apiKeyPublicKey: string | null = null;
      try {
        if (typeof turnkey?.createApiKeyPair === 'function') {
          apiKeyPublicKey = await turnkey.createApiKeyPair({ storeOverride: true });
          console.log('[ReferralAccessGate] API key pair created for Phantom auth');
        }
      } catch (apiKeyErr) {
        console.warn('[ReferralAccessGate] Failed to create API key pair:', apiKeyErr);
      }

      // Build createSubOrgParams with API key if available
      const createSubOrgParams: any = {
        // Create an embedded wallet during signup so user can export it later
        customWallet: {
          walletName: "Narrative Wallet",
          walletAccounts: [
            { curve: "CURVE_ED25519", pathFormat: "PATH_FORMAT_BIP32", path: "m/44'/501'/0'/0'", addressFormat: "ADDRESS_FORMAT_SOLANA" },
            { curve: "CURVE_SECP256K1", pathFormat: "PATH_FORMAT_BIP32", path: "m/44'/60'/0'/0/0", addressFormat: "ADDRESS_FORMAT_ETHEREUM" },
          ],
        },
      };

      // Add API key to sub-org if we created one - this enables API-key stamping for export
      if (apiKeyPublicKey) {
        createSubOrgParams.apiKeys = [
          {
            apiKeyName: "Session API Key",
            publicKey: apiKeyPublicKey,
            curveType: "API_KEY_CURVE_P256",
          },
        ];
      }

      // Authenticate with Turnkey using Phantom
      // This creates a Turnkey session, which TurnkeySessionBridge will detect
      // and call /api/users/turnkey/login to get the app JWT
      const result = await loginOrSignupWithWallet({
        walletProvider: phantomProvider,
        createSubOrgParams,
      });

      console.log('[ReferralAccessGate] loginOrSignupWithWallet result:', result);

      // Mark API key as ready for export operations
      if (apiKeyPublicKey && typeof window !== 'undefined') {
        window.localStorage.setItem("turnkeyApiKeyReady", "true");
        window.dispatchEvent(new CustomEvent("turnkey-apikey-ready"));
      }

      // Fetch and cache wallets for export modal
      if (result?.organizationId && result?.userId && typeof turnkey?.fetchWallets === 'function') {
        try {
          const fetched = await turnkey.fetchWallets({
            organizationId: result.organizationId,
            userId: result.userId,
          });
          if (Array.isArray(fetched) && fetched.length > 0) {
            (window as any).__turnkeyCachedWallets = fetched;
            console.log('[ReferralAccessGate] Wallets cached:', fetched.length);
          }
        } catch (fetchErr) {
          console.warn('[ReferralAccessGate] Wallet fetch failed:', fetchErr);
        }
      }

      // Success! TurnkeySessionBridge will handle the rest (JWT + refreshUser)
      setInfo("Authenticating with Phantom...");
      setShowWalletOptions(false);
      setShowWaitlist(true);
      
    } catch (error: any) {
      console.error("Phantom login error:", error);
      
      // Handle user rejection
      if (error.message?.includes('rejected') || error.message?.includes('cancelled') || error.message?.includes('denied')) {
        setWalletError("Connection request was rejected. Please try again.");
      } else if (error.message?.includes('not found') || error.message?.includes('not installed')) {
        setWalletError("Phantom wallet not found. Please install Phantom wallet.");
      } else {
        setWalletError(error?.message || "Phantom login failed. Please try again.");
      }
    } finally {
      setPhantomLoading(false);
    }
  }, [fetchWalletProviders, loginOrSignupWithWallet]);

  // MetaMask Wallet Login handler - Uses Turnkey wallet authentication
  // After successful auth, TurnkeySessionBridge handles /api/users/turnkey/login + app JWT
  const handleMetamaskLogin = useCallback(async () => {
    setMetamaskLoading(true);
    setError(null);
    setWalletError(null);
    setInfo(null);

    try {
      console.log('[ReferralAccessGate] Using existing Turnkey session storage (no manual clearing)');
      
      if (!fetchWalletProviders || !loginOrSignupWithWallet) {
        setWalletError("Turnkey wallet authentication is not ready. Please try again.");
        return;
      }

      // Fetch available wallet providers
      const providers = await fetchWalletProviders();
      
      // Find MetaMask provider (Ethereum/EIP-155 namespace)
      const metaMaskProvider = providers.find((p: any) => {
        const providerName = p.info?.name?.toLowerCase() || '';
        const namespace = p.chainInfo?.namespace?.toLowerCase() || '';
        // MetaMask can be on 'ethereum' or 'eip155' namespace depending on SDK version
        return providerName.includes('metamask') && (namespace === 'ethereum' || namespace === 'eip155');
      });

      if (!metaMaskProvider) {
        setWalletError("MetaMask wallet not found. Please install MetaMask extension and refresh the page.");
        return;
      }

      // CRITICAL: Create an API key pair BEFORE wallet auth
      // This API key will be added to the sub-org during creation,
      // allowing subsequent operations (like export) without wallet signatures
      let apiKeyPublicKey: string | null = null;
      try {
        if (typeof turnkey?.createApiKeyPair === 'function') {
          apiKeyPublicKey = await turnkey.createApiKeyPair({ storeOverride: true });
          console.log('[ReferralAccessGate] API key pair created for MetaMask auth');
        }
      } catch (apiKeyErr) {
        console.warn('[ReferralAccessGate] Failed to create API key pair:', apiKeyErr);
      }

      // Build createSubOrgParams with API key if available
      const createSubOrgParams: any = {
        // Create an embedded wallet during signup so user can export it later
        customWallet: {
          walletName: "Narrative Wallet",
          walletAccounts: [
            { curve: "CURVE_ED25519", pathFormat: "PATH_FORMAT_BIP32", path: "m/44'/501'/0'/0'", addressFormat: "ADDRESS_FORMAT_SOLANA" },
            { curve: "CURVE_SECP256K1", pathFormat: "PATH_FORMAT_BIP32", path: "m/44'/60'/0'/0/0", addressFormat: "ADDRESS_FORMAT_ETHEREUM" },
          ],
        },
      };

      // Add API key to sub-org if we created one - this enables API-key stamping for export
      if (apiKeyPublicKey) {
        createSubOrgParams.apiKeys = [
          {
            apiKeyName: "Session API Key",
            publicKey: apiKeyPublicKey,
            curveType: "API_KEY_CURVE_P256",
          },
        ];
      }

      // Authenticate with Turnkey using MetaMask
      // This creates a Turnkey session, which TurnkeySessionBridge will detect
      // and call /api/users/turnkey/login to get the app JWT
      const result = await loginOrSignupWithWallet({
        walletProvider: metaMaskProvider,
        createSubOrgParams,
      });

      console.log('[ReferralAccessGate] loginOrSignupWithWallet result:', result);

      // Mark API key as ready for export operations
      if (apiKeyPublicKey && typeof window !== 'undefined') {
        window.localStorage.setItem("turnkeyApiKeyReady", "true");
        window.dispatchEvent(new CustomEvent("turnkey-apikey-ready"));
      }

      // Fetch and cache wallets for export modal
      if (result?.organizationId && result?.userId && typeof turnkey?.fetchWallets === 'function') {
        try {
          const fetched = await turnkey.fetchWallets({
            organizationId: result.organizationId,
            userId: result.userId,
          });
          if (Array.isArray(fetched) && fetched.length > 0) {
            (window as any).__turnkeyCachedWallets = fetched;
            console.log('[ReferralAccessGate] Wallets cached:', fetched.length);
          }
        } catch (fetchErr) {
          console.warn('[ReferralAccessGate] Wallet fetch failed:', fetchErr);
        }
      }
      
      // Success! TurnkeySessionBridge will handle the rest (JWT + refreshUser)
      setInfo("Authenticating with MetaMask...");
      setShowWalletOptions(false);
      setShowWaitlist(true);
      
    } catch (error: any) {
      console.error("MetaMask login error:", error);

      // Handle user rejection
      if (error.message?.includes('rejected') || error.message?.includes('cancelled') || error.message?.includes('denied')) {
        setWalletError("Connection request was rejected. Please try again.");
      } else if (error.message?.includes('not found') || error.message?.includes('not installed')) {
        setWalletError("MetaMask wallet not found. Please install MetaMask extension.");
      } else {
        setWalletError(error?.message || "MetaMask login failed. Please try again.");
      }
    } finally {
      setMetamaskLoading(false);
    }
  }, [fetchWalletProviders, loginOrSignupWithWallet]);

  const contextValue = useMemo<ReferralAccessContextValue>(() => {
    return {
      status,
      hasAccess: status === "granted",
      grantAccess,
      revokeAccess,
    };
  }, [status, grantAccess, revokeAccess]);

  if (!requireReferralAccess) {
    return (
      <ReferralAccessContext.Provider value={contextValue}>
        {children}
      </ReferralAccessContext.Provider>
    );
  }

  // Don't show referral overlay if Twitter OAuth just completed (twitter_success in URL)
  const hasTwitterSuccess = router.isReady && router.query.twitter_success === 'true';
  // Show referral overlay after the user has signed in and referral access is not yet granted
  const showOverlay =
    !!user &&
    !userLoading &&
    (status === "prompt" || status === "validating") &&
    !showQuests &&
    !showWaitlist &&
    !hasTwitterSuccess;

  return (
    <ReferralAccessContext.Provider value={contextValue}>
      {status === "granted" ? children : null}
      {showOverlay && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-neutral-950/80 backdrop-blur-xl">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-24 left-16 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="absolute bottom-0 right-10 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />
            <div className="absolute top-1/3 right-1/4 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl" />
          </div>

          <div className="relative z-[9999] w-full max-w-lg px-6 md:px-0">
            <div className="rounded-3xl bg-gradient-to-br from-neutral-900/95 via-neutral-900/80 to-neutral-950/90 p-[1px] shadow-[0_40px_120px_rgba(16,185,129,0.12)]">
              <div className="rounded-[calc(1.5rem-1px)] bg-neutral-950/95 p-8 md:p-10">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-emerald-400/80">
                      Narrative Access
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-[#f0f5f5] md:text-3xl">
                      Enter your referral code
                    </h2>
                  </div>
                  <div className="hidden h-14 w-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 md:flex">
                    <span className="text-sm font-semibold tracking-widest">
                      REF
                    </span>
                  </div>
                </div>

                <p className="text-sm text-neutral-300/90 md:text-base">
                  To protect our community, access is invite-only. Provide the
                  referral code you received to unlock the Narrative trading
                  dashboard.
                </p>

                <form
                  className="mt-8 space-y-6"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleSubmit();
                  }}
                >
                  <label className="block text-xs uppercase tracking-[0.24em] text-neutral-500">
                    Referral Code
                  </label>
                  <div className="relative">
                    <input
                      value={codeInput}
                      onChange={(event) => {
                        setCodeInput(normalizeReferralInput(event.target.value));
                        setError(null);
                      }}
                      placeholder="ENTER-CODE-HERE"
                      className="w-full rounded-2xl border border-neutral-700/60 bg-neutral-900/70 px-5 py-4 font-semibold tracking-[0.2em] text-[#f0f5f5] placeholder:text-neutral-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                      maxLength={64}
                      spellCheck={false}
                      autoCapitalize="characters"
                      autoComplete="off"
                      autoFocus
                      disabled={status === "validating"}
                    />
                    {status === "validating" && (
                      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-emerald-400">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/40 border-t-transparent" />
                      </div>
                    )}
                  </div>

                  {error && (
                    <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                      {error}
                    </p>
                  )}
                  {info && !error && status === "prompt" && (
                    <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-200">
                      {info}
                    </p>
                  )}

                  <InterstateButton
                    type="submit"
                    fullWidth
                    loading={status === "validating"}
                    className="h-14 text-base uppercase tracking-[0.4em] !bg-black text-white hover:!bg-neutral-900 border-[0.5px] border-[#f0f5f5]"
                  >
                    Unlock Access
                  </InterstateButton>
                </form>

                <div className="mt-8 space-y-4 text-xs text-neutral-500 md:text-sm">
                  <p>
                    Lost your code? Reach out to the team on Discord to request
                    a new invitation.
                  </p>
                  <p>
                    No Code? Click here for access
                  </p>
                  <InterstateButton
                    type="button"
                    fullWidth
                    onClick={() => {
                      setShowWaitlist(true);
                    }}
                    className="h-14 text-base uppercase tracking-[0.4em] bg-black text-[#f0f5f5] hover:bg-neutral-900"
                  >
                    Join Waitlist
                  </InterstateButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Waitlist Modal */}
      {showWaitlist && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-neutral-950/80 backdrop-blur-xl overflow-y-auto">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-24 left-16 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="absolute bottom-0 right-10 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="absolute top-1/3 right-1/4 h-40 w-40 rounded-full bg-blue-400/10 blur-3xl" />
          </div>

          <div className="relative z-[9999] w-full max-w-md px-4 md:px-0 py-2">
            <div className="rounded-xl bg-gradient-to-br from-neutral-900/95 via-neutral-900/80 to-neutral-950/90 p-[1px] shadow-[0_40px_120px_rgba(59,130,246,0.12)]">
              <div className="rounded-[calc(1rem-1px)] bg-neutral-950/95 p-4 md:p-5">
                {/* Progress Bar */}
                <div className="mb-4 bg-neutral-800/50 rounded-lg p-3 border border-neutral-700/50">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-[#f0f5f5]">{questProgressData.rank}</div>
                      <div className="mt-1">
                        <div className="w-full h-1.5 bg-neutral-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all duration-300"
                            style={{ width: `${Math.min(questProgressData.progressPercentage, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-neutral-400">
                        {questProgressData.nextRankXp > 0 
                          ? `Next rank: ${questProgressData.xpNeeded} XP left`
                          : "Max rank achieved!"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mb-3">
                  <p className="text-xs uppercase tracking-[0.35em] text-blue-400/80">
                    Join Waitlist
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-[#f0f5f5] md:text-xl">
                    Get Early Access
                  </h2>
                </div>
                
                <p className="text-xs text-neutral-300/90 mb-3">
                  Help us get to know you better. Fill out the form below to join our waitlist and be among the first to access Narrative.
                </p>

                <form
                  className="space-y-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setWaitlistSubmitting(true);
                    
                    // Generate a random waitlist number if not already set
                    if (!waitlistNumber) {
                      const randomNumber = Math.floor(Math.random() * 10000) + 1;
                      setWaitlistNumber(randomNumber);
                      if (typeof window !== "undefined") {
                        sessionStorage.setItem("waitlistNumber", randomNumber.toString());
                      }
                    }
                    
                    // TODO: Submit waitlist data to backend
                    // For now, just log the data and grant access
                    const submissionData = {
                      ...waitlistForm,
                      telegram: telegramUsername,
                    };
                    console.log("Waitlist submission:", submissionData);
                    
                    // Simulate API call
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    setWaitlistSubmitting(false);
                    setShowWaitlist(false);
                    grantAccess();
                  }}
                >
                  {/* Link Twitter */}
                  <div>
                    <label className="block text-xs uppercase tracking-[0.24em] text-neutral-500 mb-1">
                      Link Your Twitter
                    </label>
                    {twitterLinked ? (
                      <div className="w-full rounded-lg border border-blue-500/50 bg-blue-500/10 px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                          </svg>
                          <div>
                            {twitterUsername ? (
                              <p className="text-[#f0f5f5] font-medium">@{twitterUsername}</p>
                            ) : (
                              <p className="text-[#f0f5f5] font-medium">Twitter Linked</p>
                            )}
                            <p className="text-xs text-blue-300/80">Twitter account linked</p>
                          </div>
                        </div>
                        <InterstateButton
                          type="button"
                          onClick={handleDisconnectTwitter}
                          className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-[#f0f5f5]"
                        >
                          Disconnect
                        </InterstateButton>
                      </div>
                    ) : (
                      <InterstateButton
                        type="button"
                        onClick={handleLinkTwitter}
                        loading={checkingTwitter}
                        fullWidth
                        className="h-9 text-xs uppercase tracking-[0.3em] bg-blue-600 text-[#f0f5f5] hover:bg-blue-700 flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                        Link Your Twitter
                      </InterstateButton>
                    )}
                  </div>

                  {/* Follow narrative_hq */}
                  <div>
                    <label className="block text-xs uppercase tracking-[0.24em] text-neutral-500 mb-1">
                      Follow @narrative_hq
                    </label>
                    {narrativeFollowed ? (
                      <div className="w-full rounded-lg border border-blue-500/50 bg-blue-500/10 px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                          </svg>
                          <div>
                            <p className="text-[#f0f5f5] font-medium">@narrative_hq</p>
                            <p className="text-xs text-blue-300/80">Following</p>
                          </div>
                        </div>
                        <InterstateButton
                          type="button"
                          onClick={() => {
                            window.open("https://twitter.com/narrative_hq", "_blank");
                          }}
                          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-[#f0f5f5]"
                        >
                          Open Twitter
                        </InterstateButton>
                      </div>
                    ) : (
                      <InterstateButton
                        type="button"
                        onClick={() => {
                          window.open("https://twitter.com/narrative_hq", "_blank");
                          setNarrativeFollowed(true);
                        }}
                        fullWidth
                        className="h-9 text-xs uppercase tracking-[0.3em] bg-blue-600 text-[#f0f5f5] hover:bg-blue-700 flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                        Follow @narrative_hq
                      </InterstateButton>
                    )}
                  </div>

                  {/* Like a post */}
                  <div>
                    <label className="block text-xs uppercase tracking-[0.24em] text-neutral-500 mb-1">
                      Like a post by @narrative_hq (Earn 25 xp)
                    </label>
                    {postLiked ? (
                      <div className="w-full rounded-lg border border-blue-500/50 bg-blue-500/10 px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"/>
                          </svg>
                          <div>
                            <p className="text-[#f0f5f5] font-medium">Post liked</p>
                            <p className="text-xs text-blue-300/80">Thank you for the like!</p>
                          </div>
                        </div>
                        <InterstateButton
                          type="button"
                          onClick={() => {
                            window.open("https://twitter.com/narrative_hq", "_blank");
                          }}
                          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-[#f0f5f5]"
                        >
                          View Posts
                        </InterstateButton>
                      </div>
                    ) : (
                      <InterstateButton
                        type="button"
                        onClick={() => {
                          window.open("https://twitter.com/narrative_hq", "_blank");
                          setPostLiked(true);
                        }}
                        fullWidth
                        className="h-9 text-xs uppercase tracking-[0.3em] bg-blue-600 text-[#f0f5f5] hover:bg-blue-700 flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"/>
                        </svg>
                        Like a Post
                      </InterstateButton>
                    )}
                  </div>

                  {/* Repost a post */}
                  <div>
                    <label className="block text-xs uppercase tracking-[0.24em] text-neutral-500 mb-1">
                      Repost a post by @narrative_hq
                    </label>
                    {postReposted ? (
                      <div className="w-full rounded-lg border border-blue-500/50 bg-blue-500/10 px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M4.75 3.79l4.603 4.3-1.706 1.82L6 8.38v7.24c0 .97.784 1.75 1.75 1.75H13V20H7.75c-2.347 0-4.25-1.9-4.25-4.25V8.38L1.853 9.91.147 8.09l4.603-4.3zm11.5 2.71H11V4h5.25c2.347 0 4.25 1.9 4.25 4.25v7.24l1.647-1.53 1.706 1.82-4.603 4.3-4.603-4.3 1.706-1.82L18 15.62V8.38c0-.97-.784-1.75-1.75-1.75z"/>
                          </svg>
                          <div>
                            <p className="text-[#f0f5f5] font-medium">Post reposted</p>
                            <p className="text-xs text-blue-300/80">Thank you for sharing!</p>
                          </div>
                        </div>
                        <InterstateButton
                          type="button"
                          onClick={() => {
                            window.open("https://twitter.com/narrative_hq", "_blank");
                          }}
                          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-[#f0f5f5]"
                        >
                          View Posts
                        </InterstateButton>
                      </div>
                    ) : (
                      <InterstateButton
                        type="button"
                        onClick={() => {
                          window.open("https://twitter.com/narrative_hq", "_blank");
                          setPostReposted(true);
                        }}
                        fullWidth
                        className="h-9 text-xs uppercase tracking-[0.3em] bg-blue-600 text-[#f0f5f5] hover:bg-blue-700 flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M4.75 3.79l4.603 4.3-1.706 1.82L6 8.38v7.24c0 .97.784 1.75 1.75 1.75H13V20H7.75c-2.347 0-4.25-1.9-4.25-4.25V8.38L1.853 9.91.147 8.09l4.603-4.3zm11.5 2.71H11V4h5.25c2.347 0 4.25 1.9 4.25 4.25v7.24l1.647-1.53 1.706 1.82-4.603 4.3-4.603-4.3 1.706-1.82L18 15.62V8.38c0-.97-.784-1.75-1.75-1.75z"/>
                        </svg>
                        Repost a Post
                      </InterstateButton>
                    )}
                  </div>

                  {/* Reply to a post */}
                  <div>
                    <label className="block text-xs uppercase tracking-[0.24em] text-neutral-500 mb-1">
                      Reply to a post by @narrative_hq
                    </label>
                    {postReplied ? (
                      <div className="w-full rounded-lg border border-blue-500/50 bg-blue-500/10 px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.09 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"/>
                          </svg>
                          <div>
                            <p className="text-[#f0f5f5] font-medium">Post replied</p>
                            <p className="text-xs text-blue-300/80">Thank you for engaging!</p>
                          </div>
                        </div>
                        <InterstateButton
                          type="button"
                          onClick={() => {
                            window.open("https://twitter.com/narrative_hq", "_blank");
                          }}
                          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-[#f0f5f5]"
                        >
                          View Posts
                        </InterstateButton>
                      </div>
                    ) : (
                      <InterstateButton
                        type="button"
                        onClick={() => {
                          window.open("https://twitter.com/narrative_hq", "_blank");
                          setPostReplied(true);
                        }}
                        fullWidth
                        className="h-9 text-xs uppercase tracking-[0.3em] bg-blue-600 text-[#f0f5f5] hover:bg-blue-700 flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.09 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"/>
                        </svg>
                        Reply to a Post
                      </InterstateButton>
                    )}
                  </div>

                  {/* Join Discord */}
                  <div>
                    <label className="block text-xs uppercase tracking-[0.24em] text-neutral-500 mb-1">
                      Join Discord
                    </label>
                    {discordJoined ? (
                      <div className="w-full rounded-lg border border-blue-500/50 bg-blue-500/10 px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FaDiscord className="w-5 h-5 text-blue-400" />
                          <div>
                            <p className="text-[#f0f5f5] font-medium">Discord Joined</p>
                            <p className="text-xs text-blue-300/80">You've joined our Discord</p>
                          </div>
                        </div>
                        <InterstateButton
                          type="button"
                          onClick={() => {
                            window.open("https://discord.gg/QZGmpmvCNE", "_blank");
                          }}
                          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-[#f0f5f5]"
                        >
                          Open Discord
                        </InterstateButton>
                      </div>
                    ) : (
                      <InterstateButton
                        type="button"
                        onClick={() => {
                          window.open("https://discord.gg/QZGmpmvCNE", "_blank");
                          setDiscordJoined(true);
                        }}
                        fullWidth
                        className="h-9 text-xs uppercase tracking-[0.3em] bg-blue-600 text-[#f0f5f5] hover:bg-blue-700 flex items-center justify-center gap-2"
                      >
                        <FaDiscord className="w-5 h-5" />
                        Join Discord
                      </InterstateButton>
                    )}
                  </div>

                  {/* Telegram Username Input */}
                  <div>
                    <label className="block text-xs uppercase tracking-[0.24em] text-neutral-500 mb-1">
                      Telegram Username
                    </label>
                    <input
                      type="text"
                      value={telegramUsername}
                      onChange={(e) => {
                        setTelegramUsername(e.target.value);
                        setWaitlistForm({ ...waitlistForm, telegram: e.target.value });
                      }}
                      placeholder="@username"
                      className="w-full rounded-lg border border-neutral-700/60 bg-neutral-900/70 px-3 py-2 text-sm text-[#f0f5f5] placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      disabled={waitlistSubmitting}
                    />
                  </div>

                </form>

                {/* Complete all quests button */}
                <div className="mt-4 pt-3 border-t border-neutral-700/60">
                  <InterstateButton
                    type="button"
                    onClick={() => {
                      // Generate a random waitlist number if not already set
                      if (!waitlistNumber) {
                        const randomNumber = Math.floor(Math.random() * 10000) + 1;
                        setWaitlistNumber(randomNumber);
                        if (typeof window !== "undefined") {
                          sessionStorage.setItem("waitlistNumber", randomNumber.toString());
                        }
                      }
                      setShowCongratsModal(true);
                    }}
                    fullWidth
                    disabled={questProgressData.completedCount < questProgressData.totalQuests || !telegramUsername.trim()}
                    className="h-10 text-xs uppercase tracking-[0.3em] bg-gradient-to-r from-blue-600 to-purple-600 text-[#f0f5f5] hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-blue-600 disabled:hover:to-purple-600"
                  >
                    Complete All Quests
                  </InterstateButton>
                  <p className="mt-2 text-xs text-center text-neutral-400">
                    {questProgressData.completedCount < questProgressData.totalQuests
                      ? `Complete all quests above to continue (${questProgressData.completedCount}/${questProgressData.totalQuests})`
                      : !telegramUsername.trim()
                      ? "Please enter your Telegram username to continue"
                      : "Click to join the waitlist and get early access"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Waitlist Confirmation Modal */}
      {showCongratsModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-neutral-950/80 backdrop-blur-xl p-4">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-24 left-16 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="absolute bottom-0 right-10 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />
            <div className="absolute top-1/3 right-1/4 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl" />
          </div>

          <div className="relative z-[10001] w-full max-w-md">
            <div className="rounded-2xl bg-gradient-to-br from-neutral-900/95 via-neutral-900/80 to-neutral-950/90 p-[1px] shadow-[0_40px_120px_rgba(16,185,129,0.12)]">
              <div className="rounded-[calc(1rem-1px)] bg-neutral-950/95 p-8 md:p-10">
                <div className="text-center">
                  <div className="mb-6 flex justify-center">
                    <div className="h-16 w-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                      <svg
                        className="w-8 h-8 text-emerald-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  </div>

                  <h1 className="text-2xl md:text-3xl font-bold text-[#f0f5f5] mb-3">
                    You are on the waitlist!
                  </h1>

                  {waitlistNumber ? (
                    <div className="mb-6">
                      <p className="text-sm text-neutral-400 mb-2">Your waitlist group</p>
                      <div className="inline-block px-6 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                        <span className="text-3xl md:text-4xl font-bold text-emerald-400">
                          Group A
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-6">
                      <div className="inline-block px-6 py-3 rounded-xl bg-neutral-800/50">
                        <div className="h-8 w-20 bg-neutral-700/50 rounded animate-pulse" />
                      </div>
                    </div>
                  )}

                  <p className="text-sm text-neutral-300/90 mb-8 max-w-sm mx-auto">
                    Thank you for completing all quests! You will get access in less than 2-3 weeks!
                  </p>

                  <InterstateButton
                    type="button"
                    onClick={() => {
                      window.location.href = "https://www.narrative.trade";
                    }}
                    fullWidth
                    className="h-12 text-base uppercase tracking-[0.4em] bg-emerald-600 text-[#f0f5f5] hover:bg-emerald-700"
                  >
                    Return Home
                  </InterstateButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Validating Popup */}
      {showValidatingPopup && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-neutral-950/50 backdrop-blur-sm">
          <div className="relative bg-neutral-900/95 border border-neutral-700/50 rounded-2xl p-8 shadow-2xl min-w-[280px]">
            <div className="flex flex-col items-center justify-center space-y-4">
              {/* X Logo */}
              <div className="w-16 h-16 flex items-center justify-center">
                <svg className="w-full h-full text-[#f0f5f5]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </div>
              {/* Loading Text */}
              <div className="flex flex-col items-center space-y-2">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#f0f5f5]/40 border-t-white" />
                <p className="text-base font-medium text-[#f0f5f5]">Validating</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quest System Overlay */}
      {showQuests && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-neutral-950/80 backdrop-blur-xl overflow-y-auto">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-24 left-16 h-64 w-64 rounded-full bg-purple-500/20 blur-3xl" />
            <div className="absolute bottom-0 right-10 h-72 w-72 rounded-full bg-purple-500/10 blur-3xl" />
            <div className="absolute top-1/3 right-1/4 h-40 w-40 rounded-full bg-purple-400/10 blur-3xl" />
          </div>

          <div className="relative z-[9999] w-full max-w-2xl px-6 md:px-0 py-8">
            <div className="rounded-3xl bg-gradient-to-br from-neutral-900/95 via-neutral-900/80 to-neutral-950/90 p-[1px] shadow-[0_40px_120px_rgba(147,51,234,0.12)]">
              <div className="rounded-[calc(1.5rem-1px)] bg-neutral-950/95 p-8 md:p-10">
                {/* Rank Section */}
                <div className="mb-8">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-500/30 flex items-center justify-center">
                      <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="text-lg font-bold text-[#f0f5f5]">{questProgress.rank}</div>
                      <div className="mt-2">
                        <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all duration-300"
                            style={{ width: `${Math.min((questProgress.xp / questProgress.nextRankXp) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-neutral-400">
                        Next rank: {Math.max(0, questProgress.nextRankXp - questProgress.xp)} XP left
                      </div>
                    </div>
                  </div>
                </div>

                {/* Complete Quests Section */}
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-[#f0f5f5] mb-2">Complete Quests</h2>
                  <p className="text-sm text-neutral-400 mb-4">Earn XP to rank up and earn future rewards.</p>
                  
                  <div className="space-y-3">
                    {/* Link your X */}
                    <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-[#f0f5f5] font-medium mb-1">Link your X</div>
                        <div className="text-xs text-neutral-400">Earn 25 XP</div>
                      </div>
                      <InterstateButton
                        type="button"
                        onClick={() => {
                          // TODO: Implement X linking
                          window.open("https://twitter.com/intent/tweet?text=Check%20out%20Narrative!", "_blank");
                        }}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-[#f0f5f5] text-sm"
                        disabled={questProgress.completedQuests.includes("link-x")}
                      >
                        {questProgress.completedQuests.includes("link-x") ? "Completed" : "Link X"}
                      </InterstateButton>
                    </div>

                    {/* Follow @TradeBoba */}
                    <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-[#f0f5f5] font-medium mb-1">Follow @TradeBoba</div>
                        <div className="text-xs text-neutral-400">Earn 25 XP</div>
                      </div>
                      <InterstateButton
                        type="button"
                        onClick={() => {
                          if (!questProgress.completedQuests.includes("link-x")) {
                            alert("Please link your X account first");
                            return;
                          }
                          // TODO: Implement follow action
                          window.open("https://twitter.com/TradeBoba", "_blank");
                        }}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-[#f0f5f5] text-sm"
                        disabled={questProgress.completedQuests.includes("follow-tradeboba")}
                      >
                        {questProgress.completedQuests.includes("follow-tradeboba") ? "Completed" : questProgress.completedQuests.includes("link-x") ? "Follow" : "Link X First"}
                      </InterstateButton>
                    </div>

                    {/* Like a post */}
                    <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-[#f0f5f5] font-medium mb-1">Like a post</div>
                        <div className="text-xs text-neutral-400">Earn 25 XP</div>
                      </div>
                      <InterstateButton
                        type="button"
                        onClick={() => {
                          if (!questProgress.completedQuests.includes("link-x")) {
                            alert("Please link your X account first");
                            return;
                          }
                          // TODO: Implement like action
                        }}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-[#f0f5f5] text-sm"
                        disabled={questProgress.completedQuests.includes("like-post")}
                      >
                        {questProgress.completedQuests.includes("like-post") ? "Completed" : questProgress.completedQuests.includes("link-x") ? "Like" : "Link X First"}
                      </InterstateButton>
                    </div>

                    {/* Repost a post */}
                    <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-[#f0f5f5] font-medium mb-1">Repost a post</div>
                        <div className="text-xs text-neutral-400">Earn 25 XP</div>
                      </div>
                      <InterstateButton
                        type="button"
                        onClick={() => {
                          if (!questProgress.completedQuests.includes("link-x")) {
                            alert("Please link your X account first");
                            return;
                          }
                          // TODO: Implement repost action
                        }}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-[#f0f5f5] text-sm"
                        disabled={questProgress.completedQuests.includes("repost-post")}
                      >
                        {questProgress.completedQuests.includes("repost-post") ? "Completed" : questProgress.completedQuests.includes("link-x") ? "Repost" : "Link X First"}
                      </InterstateButton>
                    </div>

                    {/* Reply to a post */}
                    <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-[#f0f5f5] font-medium mb-1">Reply to a post</div>
                        <div className="text-xs text-neutral-400">Earn 25 XP</div>
                      </div>
                      <InterstateButton
                        type="button"
                        onClick={() => {
                          if (!questProgress.completedQuests.includes("link-x")) {
                            alert("Please link your X account first");
                            return;
                          }
                          // TODO: Implement reply action
                        }}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-[#f0f5f5] text-sm"
                        disabled={questProgress.completedQuests.includes("reply-post")}
                      >
                        {questProgress.completedQuests.includes("reply-post") ? "Completed" : questProgress.completedQuests.includes("link-x") ? "Reply" : "Link X First"}
                      </InterstateButton>
                    </div>

                    {/* Join Discord */}
                    <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-[#f0f5f5] font-medium mb-1">Join Discord</div>
                        <div className="text-xs text-neutral-400">Earn 25 XP</div>
                      </div>
                      <InterstateButton
                        type="button"
                        onClick={() => {
                          window.open("https://discord.gg/QZGmpmvCNE", "_blank");
                          // TODO: Implement Discord join verification
                        }}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-[#f0f5f5] text-sm"
                        disabled={questProgress.completedQuests.includes("join-discord")}
                      >
                        {questProgress.completedQuests.includes("join-discord") ? "Completed" : "Join"}
                      </InterstateButton>
                    </div>
                  </div>
                </div>

                {/* Bonus Quest */}
                <div className="mb-6">
                  <div className="text-center text-sm text-neutral-400 mb-4">Bonus Quest</div>
                  <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-[#f0f5f5] font-medium mb-1">Complete all quests</div>
                      <div className="text-xs text-neutral-400">Earn 50 XP</div>
                    </div>
                    <div className="text-sm text-neutral-400">
                      {questProgress.completedQuests.length}/6 steps
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <InterstateButton
                    type="button"
                    fullWidth
                    onClick={() => {
                      setShowQuests(false);
                      grantAccess();
                    }}
                    className="h-12 text-base uppercase tracking-[0.4em] bg-purple-600 text-[#f0f5f5] hover:bg-purple-700"
                  >
                    Skip for Now
                  </InterstateButton>
                  <InterstateButton
                    type="button"
                    fullWidth
                    onClick={() => {
                      // TODO: Check if all quests completed, then grant access
                      if (questProgress.completedQuests.length >= 6) {
                        grantAccess();
                        setShowQuests(false);
                      } else {
                        alert("Complete more quests to unlock access!");
                      }
                    }}
                    className="h-12 text-base uppercase tracking-[0.4em] bg-black text-[#f0f5f5] hover:bg-neutral-900"
                    disabled={questProgress.completedQuests.length < 6}
                  >
                    Continue
                  </InterstateButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </ReferralAccessContext.Provider>
  );
}
