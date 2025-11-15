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
  });
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [questProgress, setQuestProgress] = useState({
    xp: 0,
    rank: "Unranked",
    nextRankXp: 200,
    completedQuests: [] as string[],
  });

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
                  {/* Email */}
                  <div>
                    <label className="block text-xs uppercase tracking-[0.24em] text-neutral-500 mb-2">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      value={waitlistForm.email}
                      onChange={(e) => setWaitlistForm(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="your.email@example.com"
                      required
                      className="w-full rounded-2xl border border-neutral-700/60 bg-neutral-900/70 px-5 py-4 text-white placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-xs uppercase tracking-[0.24em] text-neutral-500 mb-2">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={waitlistForm.name}
                      onChange={(e) => setWaitlistForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="John Doe"
                      className="w-full rounded-2xl border border-neutral-700/60 bg-neutral-900/70 px-5 py-4 text-white placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>

                  {/* Wallet Address (pre-filled, read-only) */}
                  <div>
                    <label className="block text-xs uppercase tracking-[0.24em] text-neutral-500 mb-2">
                      Wallet Address
                    </label>
                    <input
                      type="text"
                      value={waitlistForm.walletAddress}
                      readOnly
                      className="w-full rounded-2xl border border-neutral-700/60 bg-neutral-800/50 px-5 py-4 text-neutral-400 cursor-not-allowed"
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      Connected via {waitlistForm.walletType === "metamask" ? "MetaMask" : "Phantom"}
                    </p>
                  </div>

                  {/* Referral Source */}
                  <div>
                    <label className="block text-xs uppercase tracking-[0.24em] text-neutral-500 mb-2">
                      How did you hear about us?
                    </label>
                    <select
                      value={waitlistForm.referralSource}
                      onChange={(e) => setWaitlistForm(prev => ({ ...prev, referralSource: e.target.value }))}
                      className="w-full rounded-2xl border border-neutral-700/60 bg-neutral-900/70 px-5 py-4 text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    >
                      <option value="">Select an option</option>
                      <option value="twitter">Twitter / X</option>
                      <option value="discord">Discord</option>
                      <option value="friend">Friend Referral</option>
                      <option value="reddit">Reddit</option>
                      <option value="youtube">YouTube</option>
                      <option value="google">Google Search</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  {/* Additional Notes */}
                  <div>
                    <label className="block text-xs uppercase tracking-[0.24em] text-neutral-500 mb-2">
                      Additional Notes (Optional)
                    </label>
                    <textarea
                      value={waitlistForm.additionalNotes}
                      onChange={(e) => setWaitlistForm(prev => ({ ...prev, additionalNotes: e.target.value }))}
                      placeholder="Tell us about yourself, your trading experience, or what you're most excited about..."
                      rows={4}
                      className="w-full rounded-2xl border border-neutral-700/60 bg-neutral-900/70 px-5 py-4 text-white placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="flex gap-3 pt-4">
                    <InterstateButton
                      type="button"
                      fullWidth
                      onClick={() => {
                        setShowWaitlist(false);
                        grantAccess();
                      }}
                      className="h-12 text-base uppercase tracking-[0.4em] bg-neutral-800 text-white hover:bg-neutral-700"
                    >
                      Skip for Now
                    </InterstateButton>
                    <InterstateButton
                      type="submit"
                      fullWidth
                      loading={waitlistSubmitting}
                      className="h-12 text-base uppercase tracking-[0.4em] bg-blue-600 text-white hover:bg-blue-700"
                    >
                      Submit & Continue
                    </InterstateButton>
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
                      <div className="text-lg font-bold text-white">{questProgress.rank}</div>
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
                  <h2 className="text-2xl font-bold text-white mb-2">Complete Quests</h2>
                  <p className="text-sm text-neutral-400 mb-4">Earn XP to rank up and earn future rewards.</p>
                  
                  <div className="space-y-3">
                    {/* Link your X */}
                    <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-white font-medium mb-1">Link your X</div>
                        <div className="text-xs text-neutral-400">Earn 25 XP</div>
                      </div>
                      <InterstateButton
                        type="button"
                        onClick={() => {
                          // TODO: Implement X linking
                          window.open("https://twitter.com/intent/tweet?text=Check%20out%20Narrative!", "_blank");
                        }}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm"
                        disabled={questProgress.completedQuests.includes("link-x")}
                      >
                        {questProgress.completedQuests.includes("link-x") ? "Completed" : "Link X"}
                      </InterstateButton>
                    </div>

                    {/* Follow @TradeBoba */}
                    <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-white font-medium mb-1">Follow @TradeBoba</div>
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
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm"
                        disabled={questProgress.completedQuests.includes("follow-tradeboba")}
                      >
                        {questProgress.completedQuests.includes("follow-tradeboba") ? "Completed" : questProgress.completedQuests.includes("link-x") ? "Follow" : "Link X First"}
                      </InterstateButton>
                    </div>

                    {/* Like a post */}
                    <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-white font-medium mb-1">Like a post</div>
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
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm"
                        disabled={questProgress.completedQuests.includes("like-post")}
                      >
                        {questProgress.completedQuests.includes("like-post") ? "Completed" : questProgress.completedQuests.includes("link-x") ? "Like" : "Link X First"}
                      </InterstateButton>
                    </div>

                    {/* Repost a post */}
                    <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-white font-medium mb-1">Repost a post</div>
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
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm"
                        disabled={questProgress.completedQuests.includes("repost-post")}
                      >
                        {questProgress.completedQuests.includes("repost-post") ? "Completed" : questProgress.completedQuests.includes("link-x") ? "Repost" : "Link X First"}
                      </InterstateButton>
                    </div>

                    {/* Reply to a post */}
                    <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-white font-medium mb-1">Reply to a post</div>
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
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm"
                        disabled={questProgress.completedQuests.includes("reply-post")}
                      >
                        {questProgress.completedQuests.includes("reply-post") ? "Completed" : questProgress.completedQuests.includes("link-x") ? "Reply" : "Link X First"}
                      </InterstateButton>
                    </div>

                    {/* Connect Telegram */}
                    <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-white font-medium mb-1">Connect Telegram</div>
                        <div className="text-xs text-neutral-400">Earn 25 XP</div>
                      </div>
                      <InterstateButton
                        type="button"
                        onClick={() => {
                          // TODO: Implement Telegram connection
                        }}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm"
                        disabled={questProgress.completedQuests.includes("connect-telegram")}
                      >
                        {questProgress.completedQuests.includes("connect-telegram") ? "Completed" : "Connect"}
                      </InterstateButton>
                    </div>
                  </div>
                </div>

                {/* Bonus Quest */}
                <div className="mb-6">
                  <div className="text-center text-sm text-neutral-400 mb-4">Bonus Quest</div>
                  <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-white font-medium mb-1">Complete all quests</div>
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
                    className="h-12 text-base uppercase tracking-[0.4em] bg-purple-600 text-white hover:bg-purple-700"
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
                    className="h-12 text-base uppercase tracking-[0.4em] bg-black text-white hover:bg-neutral-900"
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
