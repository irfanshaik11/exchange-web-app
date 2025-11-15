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
  const { user, loading: userLoading } = useUser();
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

  const showOverlay = !!user && !userLoading && (status === "prompt" || status === "validating");

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
                    type="submit"
                    fullWidth
                    loading={status === "validating"}
                    className="h-14 text-base uppercase tracking-[0.4em] bg-black text-white hover:bg-neutral-900"
                  >
                    Join Waitlist
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
