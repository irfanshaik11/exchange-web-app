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
import { usePhantomWallet } from "../hooks/usePhantomWallet";
import { useMetaMaskWallet } from "../hooks/useMetaMaskWallet";
import { phantomLogin as apiPhantomLogin, metamaskLogin as apiMetamaskLogin } from "../utils/api";
import Cookies from "js-cookie";

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

const ADMIN_OVERRIDE_CODE = "NARRATIVE-ADMIN-247";
const STORAGE_FLAG_KEY = "referralAccess.granted";
const STORAGE_META_KEY = "referralAccess.meta";

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
    window.sessionStorage.setItem(STORAGE_FLAG_KEY, "true");
    window.sessionStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta));
  } catch (error) {
    console.warn("Failed to persist referral access state", error);
  }
}

function clearPersistedAccess() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_FLAG_KEY);
    window.sessionStorage.removeItem(STORAGE_META_KEY);
  } catch (error) {
    console.warn("Failed to clear referral access state", error);
  }
}

function hasStoredAccess(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const session = window.sessionStorage.getItem(STORAGE_FLAG_KEY);
    return session === "true";
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
      : true;

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
  const [waitlistForm, setWaitlistForm] = useState({
    email: "",
    name: "",
    walletAddress: "",
    referralSource: "",
    additionalNotes: "",
    walletType: "" as "metamask" | "phantom" | "",
    twitterLinked: false,
    twitterUsername: "",
  });
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [questProgress, setQuestProgress] = useState({
    xp: 0,
    rank: "Unranked",
    nextRankXp: 200,
    completedQuests: [] as string[],
  });
  const [showLinkXModal, setShowLinkXModal] = useState(false);
  const [linkXUsername, setLinkXUsername] = useState("");
  const [linkXLoading, setLinkXLoading] = useState(false);
  const [linkXError, setLinkXError] = useState<string | null>(null);

  // Wallet hooks
  const phantomWallet = usePhantomWallet();
  const metaMaskWallet = useMetaMaskWallet();

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

    if (!hasStoredAccess()) {
      setStatus("prompt");
      return;
    }

    const meta = getStoredAccessMeta();
    if (!user || !meta || !meta.userId || meta.userId !== user.id) {
      revokeAccess();
      return;
    }

    setStatus("granted");
    setInfo("Welcome back.");
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

      if (normalized === ADMIN_OVERRIDE_CODE) {
        grantAccess();
        return;
      }

      setStatus("prompt");
      setError("That code is not recognized. Please double-check with your inviter.");
    },
    [requireReferralAccess, codeInput, grantAccess],
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

  // Refresh wallet connection state when wallet options are shown
  useEffect(() => {
    if (showWalletOptions) {
      phantomWallet.refreshConnection();
      metaMaskWallet.refreshConnection();
    }
  }, [showWalletOptions, phantomWallet, metaMaskWallet]);

  // Phantom Wallet Login handler
  const handlePhantomLogin = useCallback(async () => {
    setPhantomLoading(true);
    setError(null);
    setWalletError(null);
    setInfo(null);
    
    try {
      // Check if Phantom is installed
      if (!phantomWallet.isInstalled) {
        setWalletError("Phantom wallet not found. Please install Phantom wallet.");
        return;
      }

      // Connect to Phantom wallet
      let connected;
      try {
        connected = await phantomWallet.connect();
      } catch (connectError: any) {
        console.error("Phantom connect error:", connectError);
        setWalletError("User rejected the connection request");
        return;
      }
      
      if (!connected) {
        setWalletError(phantomWallet.error || "Failed to connect to Phantom wallet");
        return;
      }

      // Create message and sign it
      const message = `Login to Interstate with nonce: ${Date.now()}`;
      const signResult = await phantomWallet.signMessage(message);
      
      // Check if signing failed
      if ("error" in signResult) {
        setWalletError((signResult as { error: string }).error);
        return;
      }
      
      // Send to backend for verification
      const { token } = await apiPhantomLogin(signResult.publicKey, signResult.signature, signResult.message);
      
      if (token) {
        Cookies.set("token", token, { expires: 7, path: "/" });
        await refreshUser();
        setInfo("Phantom login successful!");
        // Show waitlist modal after successful wallet login
        setShowWalletOptions(false);
        // Pre-fill wallet address in waitlist form
        if (phantomWallet.publicKey) {
          setWaitlistForm(prev => ({
            ...prev,
            walletAddress: phantomWallet.publicKey,
            walletType: "phantom",
          }));
        }
        setShowWaitlist(true);
      } else {
        setError("Phantom login failed - no token received");
      }
    } catch (error: any) {
      console.error("Phantom login error:", error);
      
      if (error.message?.includes("Internal server error")) {
        setWalletError("Backend server error. Please try again later.");
      } else if (error.message?.includes("Signature verification failed")) {
        setWalletError("Signature verification failed. Please try again.");
      } else if (error.message?.includes("Missing required fields")) {
        setWalletError("Missing required data. Please try again.");
      } else {
        setWalletError(error?.message || "Phantom login failed");
      }
    } finally {
      setPhantomLoading(false);
    }
  }, [phantomWallet, refreshUser, grantAccess]);

  // MetaMask Wallet Login handler
  const handleMetamaskLogin = useCallback(async () => {
    setMetamaskLoading(true);
    setError(null);
    setWalletError(null);
    setInfo(null);

    try {
      // Check if MetaMask is installed
      if (!metaMaskWallet.isInstalled) {
        setWalletError("MetaMask wallet not found. Please install MetaMask extension.");
        return;
      }

      // Connect to MetaMask wallet
      let connected = await metaMaskWallet.connect();

      // If connection failed due to pending request, wait and retry once
      if (!connected && metaMaskWallet.error?.includes("already")) {
        setWalletError("MetaMask is busy. Retrying in 2 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        connected = await metaMaskWallet.connect();
      }

      if (!connected) {
        setWalletError(metaMaskWallet.error || "Failed to connect to MetaMask wallet");
        return;
      }

      // Create message and sign it
      const message = `Login to Interstate with nonce: ${Date.now()}`;
      const signResult = await metaMaskWallet.signMessage(message);
      
      // Check if signing failed
      if ("error" in signResult) {
        setWalletError((signResult as { error: string }).error);
        return;
      }
      
      // Send to backend for verification
      const { token } = await apiMetamaskLogin(signResult.address, signResult.signature, signResult.message);
      
      if (token) {
        Cookies.set("token", token, { expires: 7, path: "/" });
        await refreshUser();
        setInfo("MetaMask login successful!");
        // Show waitlist modal after successful wallet login
        setShowWalletOptions(false);
        // Pre-fill wallet address in waitlist form
        if (metaMaskWallet.address) {
          setWaitlistForm(prev => ({
            ...prev,
            walletAddress: metaMaskWallet.address,
            walletType: "metamask",
          }));
        }
        setShowWaitlist(true);
      } else {
        setError("MetaMask login failed - no token received");
      }
    } catch (error: any) {
      console.error("MetaMask login error:", error);

      if (error.message?.includes("Internal server error")) {
        setWalletError("Backend server error. Please try again later.");
      } else if (error.message?.includes("Signature verification failed")) {
        setWalletError("Signature verification failed. Please try again.");
      } else if (error.message?.includes("Missing required fields")) {
        setWalletError("Missing required data. Please try again.");
      } else {
        setWalletError(error?.message || "MetaMask login failed");
      }
    } finally {
      setMetamaskLoading(false);
    }
  }, [metaMaskWallet, refreshUser, grantAccess]);

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

  const showOverlay = !!user && !userLoading && (status === "prompt" || status === "validating") && !showQuests && !showWaitlist;

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
                    <h2 className="mt-2 text-2xl font-semibold text-white md:text-3xl">
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
                      className="w-full rounded-2xl border border-neutral-700/60 bg-neutral-900/70 px-5 py-4 font-semibold tracking-[0.2em] text-white placeholder:text-neutral-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
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
                    className="h-14 text-base uppercase tracking-[0.4em] bg-black text-white hover:bg-neutral-900"
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
                      setShowWalletOptions(!showWalletOptions);
                      setWalletError(null);
                    }}
                    className="h-14 text-base uppercase tracking-[0.4em] bg-black text-white hover:bg-neutral-900"
                  >
                    Join Waitlist
                  </InterstateButton>

                  {walletError && (
                    <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                      {walletError}
                    </p>
                  )}

                  {/* Wallet Options */}
                  {showWalletOptions && (
                    <div className="mt-4 overflow-hidden transition-all duration-300 ease-in-out">
                      <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50">
                        <div className="text-xs text-neutral-400 mb-3 font-medium">Choose your wallet</div>
                        <div className="space-y-2">
                          {/* MetaMask */}
                          <button
                            type="button"
                            className={`w-full flex items-center justify-between p-3 rounded-lg transition-all duration-200 ${
                              metaMaskWallet.isConnected
                                ? "bg-green-700/50 hover:bg-green-600/50 border border-green-600/50 hover:border-green-500/50"
                                : "bg-neutral-700/50 hover:bg-neutral-600/50 border border-neutral-600/50 hover:border-neutral-500/50"
                            } ${metamaskLoading || metaMaskWallet.connecting ? "opacity-50 cursor-not-allowed" : ""}`}
                            onClick={() => {
                              setPhantomLoading(false);
                              handleMetamaskLogin();
                            }}
                            disabled={metamaskLoading || metaMaskWallet.connecting}
                          >
                            <div className="flex items-center gap-3">
                              <img src="/MetaMask-icon-fox.svg" alt="MetaMask" className="w-5 h-5" />
                              <div className="flex flex-col items-start">
                                <span className="font-medium text-sm">MetaMask</span>
                                {metaMaskWallet.isConnected && metaMaskWallet.address && (
                                  <span className="text-xs text-green-400">
                                    Connected: {metaMaskWallet.address.slice(0, 6)}...{metaMaskWallet.address.slice(-4)}
                                  </span>
                                )}
                                {metaMaskWallet.connecting && (
                                  <span className="text-xs text-yellow-400">Connecting...</span>
                                )}
                                {metaMaskWallet.error && !metaMaskWallet.isInstalled && (
                                  <span className="text-xs text-red-400">Not installed</span>
                                )}
                              </div>
                            </div>
                            {metaMaskWallet.isConnected && (
                              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                            )}
                          </button>

                          {/* Phantom */}
                          <button
                            type="button"
                            className={`w-full flex items-center justify-between p-3 rounded-lg transition-all duration-200 ${
                              phantomWallet.isConnected 
                                ? "bg-green-700/50 hover:bg-green-600/50 border border-green-600/50 hover:border-green-500/50" 
                                : "bg-neutral-700/50 hover:bg-neutral-600/50 border border-neutral-600/50 hover:border-neutral-500/50"
                            } ${phantomLoading || phantomWallet.connecting ? "opacity-50 cursor-not-allowed" : ""}`}
                            onClick={() => {
                              setMetamaskLoading(false);
                              handlePhantomLogin();
                            }}
                            disabled={phantomLoading || phantomWallet.connecting}
                          >
                            <div className="flex items-center gap-3">
                              <img src="/Phantom-Wallet-300x300.png" alt="Phantom" className="w-5 h-5 rounded-full" />
                              <div className="flex flex-col items-start">
                                <span className="font-medium text-sm">Phantom</span>
                                {phantomWallet.isConnected && phantomWallet.publicKey && (
                                  <span className="text-xs text-green-400">
                                    Connected: {phantomWallet.publicKey.slice(0, 4)}...{phantomWallet.publicKey.slice(-4)}
                                  </span>
                                )}
                                {phantomWallet.connecting && (
                                  <span className="text-xs text-yellow-400">Connecting...</span>
                                )}
                                {phantomWallet.error && !phantomWallet.isInstalled && (
                                  <span className="text-xs text-red-400">Not installed</span>
                                )}
                              </div>
                            </div>
                            {phantomWallet.isConnected && (
                              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
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

          <div className="relative z-[9999] w-full max-w-2xl px-6 md:px-0 py-8">
            <div className="rounded-3xl bg-gradient-to-br from-neutral-900/95 via-neutral-900/80 to-neutral-950/90 p-[1px] shadow-[0_40px_120px_rgba(59,130,246,0.12)]">
              <div className="rounded-[calc(1.5rem-1px)] bg-neutral-950/95 p-8 md:p-10">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-blue-400/80">
                      Join Waitlist
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-white md:text-3xl">
                      Get Early Access
                    </h2>
                  </div>
                  <InterstateButton
                    variant="icon"
                    size="sm"
                    onClick={() => {
                      setShowWaitlist(false);
                      grantAccess();
                    }}
                    className="text-xl"
                  >
                    ×
                  </InterstateButton>
                </div>

                <p className="text-sm text-neutral-300/90 md:text-base mb-6">
                  Help us get to know you better. Fill out the form below to join our waitlist and be among the first to access Narrative.
                </p>

                <form
                  className="space-y-6"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    
                    // Validate Twitter is linked
                    if (!waitlistForm.twitterLinked || !waitlistForm.twitterUsername) {
                      // Open link X modal if not linked
                      setShowLinkXModal(true);
                      setLinkXError(null);
                      setLinkXUsername("");
                      return;
                    }
                    
                    setWaitlistSubmitting(true);
                    
                    // TODO: Submit waitlist data to backend
                    // For now, just log the data and grant access
                    console.log("Waitlist submission:", waitlistForm);
                    
                    // Simulate API call
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    setWaitlistSubmitting(false);
                    setShowWaitlist(false);
                    grantAccess();
                  }}
                >
                  {/* Link Twitter */}
                  <div>
                    <label className="block text-xs uppercase tracking-[0.24em] text-neutral-500 mb-2">
                      Link your Twitter (Earn 25 XP)
                    </label>
                    {waitlistForm.twitterLinked ? (
                      <div className="w-full rounded-2xl border border-green-500/40 bg-green-500/10 px-5 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                          </svg>
                          <div>
                            <div className="text-white font-medium">@{waitlistForm.twitterUsername}</div>
                            <div className="text-xs text-green-400">Twitter account linked</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setWaitlistForm(prev => ({ ...prev, twitterLinked: false, twitterUsername: "" }));
                            setShowLinkXModal(true);
                            setLinkXError(null);
                            setLinkXUsername("");
                          }}
                          className="text-xs text-neutral-400 hover:text-white underline"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <InterstateButton
                        type="button"
                        fullWidth
                        onClick={() => {
                          setShowLinkXModal(true);
                          setLinkXError(null);
                          setLinkXUsername("");
                        }}
                        className="h-12 text-base uppercase tracking-[0.4em] bg-blue-600 text-white hover:bg-blue-700"
                      >
                        Link your Twitter
                      </InterstateButton>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-[0.24em] text-neutral-500 mb-2">
                      Follow @narrative_hq (Earn 25 XP)
                    </label>
                    {waitlistForm.twitterLinked ? (
                      <div className="w-full rounded-2xl border border-green-500/40 bg-green-500/10 px-5 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                          </svg>
                          <div>
                            <div className="text-white font-medium">@{waitlistForm.twitterUsername}</div>
                            <div className="text-xs text-green-400">Twitter account linked</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setWaitlistForm(prev => ({ ...prev, twitterLinked: false, twitterUsername: "" }));
                            setShowLinkXModal(true);
                            setLinkXError(null);
                            setLinkXUsername("");
                          }}
                          className="text-xs text-neutral-400 hover:text-white underline"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <InterstateButton
                        type="button"
                        fullWidth
                        onClick={() => {
                          setShowLinkXModal(true);
                          setLinkXError(null);
                          setLinkXUsername("");
                        }}
                        className="h-12 text-base uppercase tracking-[0.4em] bg-blue-600 text-white hover:bg-blue-700"
                      >
                        Follow @narrative_hq
                      </InterstateButton>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-[0.24em] text-neutral-500 mb-2">
                      Like a post (Earn 25 XP)
                    </label>
                    {waitlistForm.twitterLinked ? (
                      <div className="w-full rounded-2xl border border-green-500/40 bg-green-500/10 px-5 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                          </svg>
                          <div>
                            <div className="text-white font-medium">@{waitlistForm.twitterUsername}</div>
                            <div className="text-xs text-green-400">Twitter account linked</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setWaitlistForm(prev => ({ ...prev, twitterLinked: false, twitterUsername: "" }));
                            setShowLinkXModal(true);
                            setLinkXError(null);
                            setLinkXUsername("");
                          }}
                          className="text-xs text-neutral-400 hover:text-white underline"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <InterstateButton
                        type="button"
                        fullWidth
                        onClick={() => {
                          setShowLinkXModal(true);
                          setLinkXError(null);
                          setLinkXUsername("");
                        }}
                        className="h-12 text-base uppercase tracking-[0.4em] bg-blue-600 text-white hover:bg-blue-700"
                      >
                        Like a post
                      </InterstateButton>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-[0.24em] text-neutral-500 mb-2">
                      Repost a post (Earn 25 XP)
                    </label>
                    {waitlistForm.twitterLinked ? (
                      <div className="w-full rounded-2xl border border-green-500/40 bg-green-500/10 px-5 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                          </svg>
                          <div>
                            <div className="text-white font-medium">@{waitlistForm.twitterUsername}</div>
                            <div className="text-xs text-green-400">Twitter account linked</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setWaitlistForm(prev => ({ ...prev, twitterLinked: false, twitterUsername: "" }));
                            setShowLinkXModal(true);
                            setLinkXError(null);
                            setLinkXUsername("");
                          }}
                          className="text-xs text-neutral-400 hover:text-white underline"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <InterstateButton
                        type="button"
                        fullWidth
                        onClick={() => {
                          setShowLinkXModal(true);
                          setLinkXError(null);
                          setLinkXUsername("");
                        }}
                        className="h-12 text-base uppercase tracking-[0.4em] bg-blue-600 text-white hover:bg-blue-700"
                      >
                        Repost a post
                      </InterstateButton>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-[0.24em] text-neutral-500 mb-2">
                      Reply to a post (Earn 25 XP)
                    </label>
                    {waitlistForm.twitterLinked ? (
                      <div className="w-full rounded-2xl border border-green-500/40 bg-green-500/10 px-5 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                          </svg>
                          <div>
                            <div className="text-white font-medium">@{waitlistForm.twitterUsername}</div>
                            <div className="text-xs text-green-400">Twitter account linked</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setWaitlistForm(prev => ({ ...prev, twitterLinked: false, twitterUsername: "" }));
                            setShowLinkXModal(true);
                            setLinkXError(null);
                            setLinkXUsername("");
                          }}
                          className="text-xs text-neutral-400 hover:text-white underline"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <InterstateButton
                        type="button"
                        fullWidth
                        onClick={() => {
                          setShowLinkXModal(true);
                          setLinkXError(null);
                          setLinkXUsername("");
                        }}
                        className="h-12 text-base uppercase tracking-[0.4em] bg-blue-600 text-white hover:bg-blue-700"
                      >
                        Reply to a post
                      </InterstateButton>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-[0.24em] text-neutral-500 mb-2">
                      Follow @narrative_hq (Earn 25 XP)
                    </label>
                    {waitlistForm.twitterLinked ? (
                      <div className="w-full rounded-2xl border border-green-500/40 bg-green-500/10 px-5 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                          </svg>
                          <div>
                            <div className="text-white font-medium">@{waitlistForm.twitterUsername}</div>
                            <div className="text-xs text-green-400">Twitter account linked</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setWaitlistForm(prev => ({ ...prev, twitterLinked: false, twitterUsername: "" }));
                            setShowLinkXModal(true);
                            setLinkXError(null);
                            setLinkXUsername("");
                          }}
                          className="text-xs text-neutral-400 hover:text-white underline"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <InterstateButton
                        type="button"
                        fullWidth
                        onClick={() => {
                          setShowLinkXModal(true);
                          setLinkXError(null);
                          setLinkXUsername("");
                        }}
                        className="h-12 text-base uppercase tracking-[0.4em] bg-blue-600 text-white hover:bg-blue-700"
                      >
                        Connect Telegram
                      </InterstateButton>
                    )}
                  </div>

                </form>
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

          <div className="relative z-[9999] w-full max-w-lg px-6 md:px-0 py-8">
            <div className="rounded-3xl bg-gradient-to-br from-neutral-900/95 via-neutral-900/80 to-neutral-950/90 p-[1px] shadow-[0_40px_120px_rgba(147,51,234,0.12)]">
              <div className="rounded-[calc(1.5rem-1px)] bg-neutral-950/95 p-6 md:p-8">
                {/* Rank Section - Header */}
                <div className="mb-8">
                  <div className="flex items-start gap-4">
                    {/* Hexagonal icon */}
                    <div className="h-14 w-14 flex-shrink-0 relative">
                      <svg className="w-full h-full" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M24 2L42 10V26L24 34L6 26V10L24 2Z"
                          fill="url(#hexGradient)"
                          stroke="rgba(168, 85, 247, 0.4)"
                          strokeWidth="1.5"
                        />
                        <defs>
                          <linearGradient id="hexGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="rgba(168, 85, 247, 0.3)" />
                            <stop offset="100%" stopColor="rgba(147, 51, 234, 0.3)" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-lg font-semibold text-white mb-3">{questProgress.rank}</div>
                      <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden mb-2">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all duration-300"
                          style={{ width: `${Math.min((questProgress.xp / questProgress.nextRankXp) * 100, 100)}%` }}
                        />
                      </div>
                      <div className="text-sm text-neutral-400">
                        Next rank: {Math.max(0, questProgress.nextRankXp - questProgress.xp)} XP left
                      </div>
                    </div>
                  </div>
                </div>

                {/* Complete Quests Section */}
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-white mb-1">Complete Quests</h2>
                  <p className="text-sm text-neutral-400 mb-4">Earn XP to rank up and earn future rewards.</p>
                  
                  <div className="space-y-3">
                    {/* Link your X */}
                    <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-medium mb-0.5">Link your X</div>
                        <div className="text-xs text-neutral-400">Earn 25 XP</div>
                      </div>
                      <InterstateButton
                        type="button"
                        onClick={() => {
                          if (!questProgress.completedQuests.includes("link-x")) {
                            setShowLinkXModal(true);
                            setLinkXError(null);
                            setLinkXUsername("");
                          }
                        }}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg flex-shrink-0"
                        disabled={questProgress.completedQuests.includes("link-x")}
                      >
                        {questProgress.completedQuests.includes("link-x") ? "Completed" : "Link X"}
                      </InterstateButton>
                    </div>

                    {/* Follow @TradeBoba */}
                    <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-medium mb-0.5">Follow @TradeBoba</div>
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
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg flex-shrink-0"
                        disabled={questProgress.completedQuests.includes("follow-tradeboba")}
                      >
                        {questProgress.completedQuests.includes("follow-tradeboba") ? "Completed" : questProgress.completedQuests.includes("link-x") ? "Follow" : "Link X First"}
                      </InterstateButton>
                    </div>

                    {/* Like a post */}
                    <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-medium mb-0.5">Like a post</div>
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
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg flex-shrink-0"
                        disabled={questProgress.completedQuests.includes("like-post")}
                      >
                        {questProgress.completedQuests.includes("like-post") ? "Completed" : questProgress.completedQuests.includes("link-x") ? "Like" : "Link X First"}
                      </InterstateButton>
                    </div>

                    {/* Repost a post */}
                    <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-medium mb-0.5">Repost a post</div>
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
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg flex-shrink-0"
                        disabled={questProgress.completedQuests.includes("repost-post")}
                      >
                        {questProgress.completedQuests.includes("repost-post") ? "Completed" : questProgress.completedQuests.includes("link-x") ? "Repost" : "Link X First"}
                      </InterstateButton>
                    </div>

                    {/* Reply to a post */}
                    <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-medium mb-0.5">Reply to a post</div>
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
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg flex-shrink-0"
                        disabled={questProgress.completedQuests.includes("reply-post")}
                      >
                        {questProgress.completedQuests.includes("reply-post") ? "Completed" : questProgress.completedQuests.includes("link-x") ? "Reply" : "Link X First"}
                      </InterstateButton>
                    </div>

                    {/* Connect Telegram */}
                    <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-medium mb-0.5">Connect Telegram</div>
                        <div className="text-xs text-neutral-400">Earn 25 XP</div>
                      </div>
                      <InterstateButton
                        type="button"
                        onClick={() => {
                          // TODO: Implement Telegram connection
                        }}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg flex-shrink-0"
                        disabled={questProgress.completedQuests.includes("connect-telegram")}
                      >
                        {questProgress.completedQuests.includes("connect-telegram") ? "Completed" : "Connect"}
                      </InterstateButton>
                    </div>
                  </div>
                </div>

                {/* Bonus Quest Separator */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-neutral-700"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-neutral-950 px-3 text-sm text-neutral-400">Bonus Quest</span>
                  </div>
                </div>

                {/* Bonus Quest */}
                <div className="mb-6">
                  <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-medium mb-0.5">Complete all quests</div>
                      <div className="text-xs text-neutral-400">Earn 50 XP</div>
                    </div>
                    <button
                      type="button"
                      className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 text-sm rounded-lg flex-shrink-0 cursor-default"
                      disabled
                    >
                      {questProgress.completedQuests.length}/6 steps
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Link X Modal */}
      {showLinkXModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-neutral-950/80 backdrop-blur-xl">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-24 left-16 h-64 w-64 rounded-full bg-purple-500/20 blur-3xl" />
            <div className="absolute bottom-0 right-10 h-72 w-72 rounded-full bg-purple-500/10 blur-3xl" />
          </div>

          <div className="relative z-[10000] w-full max-w-md px-6 md:px-0">
            <div className="rounded-3xl bg-gradient-to-br from-neutral-900/95 via-neutral-900/80 to-neutral-950/90 p-[1px] shadow-[0_40px_120px_rgba(147,51,234,0.12)]">
              <div className="rounded-[calc(1.5rem-1px)] bg-neutral-950/95 p-8 md:p-10">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-purple-400/80">
                      Link Your X Account
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-white md:text-3xl">
                      Connect Twitter
                    </h2>
                  </div>
                  <InterstateButton
                    variant="icon"
                    size="sm"
                    onClick={() => {
                      setShowLinkXModal(false);
                      setLinkXError(null);
                      setLinkXUsername("");
                    }}
                    className="text-xl"
                    disabled={linkXLoading}
                  >
                    ×
                  </InterstateButton>
                </div>

                <p className="text-sm text-neutral-300/90 md:text-base mb-6">
                  Enter your X (Twitter) username to link your account and earn 25 XP.
                </p>

                <form
                  className="space-y-6"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setLinkXError(null);
                    
                    // Validate username
                    const cleanUsername = linkXUsername.trim().replace(/^@/, "");
                    if (!cleanUsername) {
                      setLinkXError("Please enter your X username");
                      return;
                    }
                    
                    // Basic Twitter username validation
                    if (!/^[A-Za-z0-9_]{1,15}$/.test(cleanUsername)) {
                      setLinkXError("Invalid X username format");
                      return;
                    }
                    
                    setLinkXLoading(true);
                    
                    try {
                      // TODO: Implement actual X account linking API call
                      // For now, simulate the linking process
                      await new Promise((resolve) => setTimeout(resolve, 1500));
                      
                      // Mark quest as completed and update XP
                      setQuestProgress((prev) => {
                        const newCompleted = [...prev.completedQuests, "link-x"];
                        const newXp = prev.xp + 25;
                        return {
                          ...prev,
                          completedQuests: newCompleted,
                          xp: newXp,
                        };
                      });
                      
                      // Update waitlist form if waitlist is open
                      if (showWaitlist) {
                        setWaitlistForm((prev) => ({
                          ...prev,
                          twitterLinked: true,
                          twitterUsername: cleanUsername,
                        }));
                      }
                      
                      setShowLinkXModal(false);
                      setLinkXUsername("");
                    } catch (error: any) {
                      setLinkXError(error?.message || "Failed to link X account. Please try again.");
                    } finally {
                      setLinkXLoading(false);
                    }
                  }}
                >
                  <div>
                    <label className="block text-xs uppercase tracking-[0.24em] text-neutral-500 mb-2">
                      X Username
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-neutral-400 text-lg">
                        @
                      </span>
                      <input
                        type="text"
                        value={linkXUsername}
                        onChange={(e) => {
                          const value = e.target.value.replace(/^@/, "");
                          setLinkXUsername(value);
                          setLinkXError(null);
                        }}
                        placeholder="yourusername"
                        required
                        disabled={linkXLoading}
                        className="w-full rounded-2xl border border-neutral-700/60 bg-neutral-900/70 px-5 py-4 pl-10 text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
                        maxLength={15}
                        pattern="[A-Za-z0-9_]{1,15}"
                      />
                    </div>
                    {linkXError && (
                      <p className="mt-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        {linkXError}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-neutral-500">
                      Enter your X username without the @ symbol
                    </p>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <InterstateButton
                      type="button"
                      fullWidth
                      onClick={() => {
                        setShowLinkXModal(false);
                        setLinkXError(null);
                        setLinkXUsername("");
                      }}
                      className="h-12 text-base uppercase tracking-[0.4em] bg-neutral-800 text-white hover:bg-neutral-700"
                      disabled={linkXLoading}
                    >
                      Cancel
                    </InterstateButton>
                    <InterstateButton
                      type="submit"
                      fullWidth
                      loading={linkXLoading}
                      className="h-12 text-base uppercase tracking-[0.4em] bg-purple-600 text-white hover:bg-purple-700"
                    >
                      Link Account
                    </InterstateButton>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </ReferralAccessContext.Provider>
  );
}

