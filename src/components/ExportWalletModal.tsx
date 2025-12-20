import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Lock } from "lucide-react";
import { IframeStamper } from "@turnkey/iframe-stamper";
import dynamic from "next/dynamic";
import { FaTimes } from "react-icons/fa";
import toast from "react-hot-toast";

import {
  AuthState,
  ClientState,
  WalletSource,
  StamperType,
  useTurnkey,
} from "~/lib/turnkeyWalletKit";
import { useUser } from "~/components/UserContext";
import { normalizeMonadAddress } from "~/utils/normalizeMonadAddress";
import { clearTurnkeySession } from "~/components/TurnkeyRootProvider";

// Dynamically import LoginModal to avoid SSR issues
const LoginModal = dynamic(() => import("~/components/LoginModal"), {
  ssr: false,
});

type ExportStatus = "idle" | "initializing" | "requesting" | "injecting" | "done" | "error";

const statusCopy: Record<
  ExportStatus,
  { title: string; description: string; tone: "neutral" | "success" | "warning" }
> = {
  idle: {
    title: "Ready to export",
    description: "Generate a fresh iframe key and request an encrypted export bundle from Turnkey.",
    tone: "neutral",
  },
  initializing: {
    title: "Preparing secure iframe",
    description: "Creating an isolated iframe on export.turnkey.com and requesting its public key.",
    tone: "neutral",
  },
  requesting: {
    title: "Requesting export bundle",
    description: "Signing an EXPORT_WALLET activity to encrypt your mnemonic to the iframe key.",
    tone: "neutral",
  },
  injecting: {
    title: "Decrypting in iframe",
    description: "Passing the encrypted bundle into the iframe so it can be decrypted client-side.",
    tone: "neutral",
  },
  done: {
    title: "Export complete",
    description: "Your mnemonic is visible inside the iframe only. Save it securely.",
    tone: "success",
  },
  error: {
    title: "Something went wrong",
    description: "Check the error message below and try again.",
    tone: "warning",
  },
};

const toLowerCase = (value?: string): string =>
  (value || "").toString().toLowerCase();

const isWalletAuthSessionError = (err: any): boolean => {
  const message = toLowerCase(err?.message || err?.cause?.message);
  const cause = toLowerCase(err?.cause?.message);
  if (!message && !cause) return false;
  const baseMessage = `${message} ${cause}`;
  return (
    baseMessage.includes("could not find public key") ||
    baseMessage.includes("session public key") ||
    baseMessage.includes("403") ||
    (baseMessage.includes("fetch") &&
      baseMessage.includes("wallets") &&
      (baseMessage.includes("forbidden") ||
        baseMessage.includes("unauthenticated") ||
        baseMessage.includes("could not find public key")))
  );
};

const TURNKEY_AUTH_METHOD_EVENT = "turnkey-auth-method";
const TURNKEY_PASSKEY_READY_EVENT = "turnkey-passkey-ready";
const TURNKEY_APIKEY_READY_EVENT = "turnkey-apikey-ready";

interface ExportWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletId?: string;
  walletAddress?: string; // The actual wallet address to display
  forceExport?: boolean;
  onForceExportConfirmed?: () => Promise<void> | void;
}

export default function ExportWalletModal({
  isOpen,
  onClose,
  walletId,
  walletAddress,
  forceExport = false,
  onForceExportConfirmed,
}: ExportWalletModalProps) {
  const turnkey = useTurnkey() as any;
  const { authState, clientState, wallets = [], exportWallet, user: turnkeyUser, session: turnkeySession } =
    turnkey || {};
  const session = turnkeySession || turnkey?.session;
  
  const { logout } = useUser();

  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [iframeVisible, setIframeVisible] = useState(false);
  const [targetPublicKey, setTargetPublicKey] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [fetchedWallets, setFetchedWallets] = useState<any[]>([]);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [preferredStamperType, setPreferredStamperType] = useState<StamperType | undefined>(undefined);
  const [lastAuthMethod, setLastAuthMethod] = useState<string | null>(null);
  const [hasPasskeySession, setHasPasskeySession] = useState(false);
  const [hasApiKeySession, setHasApiKeySession] = useState(false);
  const walletsRequestRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const pendingRevealRef = useRef(false);

  const iframeContainerRef = useRef<HTMLDivElement | null>(null);
  const iframeStamperRef = useRef<IframeStamper | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [hasConfirmedStorage, setHasConfirmedStorage] = useState(false);
  const [confirmingStorage, setConfirmingStorage] = useState(false);
  const [pastedKeyFirst, setPastedKeyFirst] = useState("");
  const [pastedKeySecond, setPastedKeySecond] = useState("");
  const [copyPasteValidated, setCopyPasteValidated] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem("turnkeyLastAuthMethod");
      const passkeyFlag = window.localStorage.getItem("turnkeyPasskeyReady");
      const apiKeyFlag = window.localStorage.getItem("turnkeyApiKeyReady");

      if (stored) {
        setLastAuthMethod(stored);
      }
      if (passkeyFlag === "true") {
        setHasPasskeySession(true);
        setPreferredStamperType(StamperType.Passkey);
      }
      if (apiKeyFlag === "true") {
        // API key is ready - prefer API key stamping for export operations
        setHasApiKeySession(true);
        // Only set ApiKey stamper if no passkey is available (passkey takes priority)
        if (passkeyFlag !== "true") {
          setPreferredStamperType(StamperType.ApiKey);
        }
      }

      // For wallet-authenticated users with API key ready, use API key stamping
      // This allows export without requiring additional wallet signatures
      if (stored === "wallet" && passkeyFlag !== "true") {
        if (apiKeyFlag === "true") {
          // We have an API key from wallet auth - use it for seamless export
          setPreferredStamperType(StamperType.ApiKey);
        } else {
          // No API key available - will need to use wallet stamper as fallback
          setPreferredStamperType(StamperType.Wallet);
        }
      }
    } catch (err) {
      console.warn("[ExportWalletModal] Failed to read stored auth method", err);
    }

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<string | null>;
      const method = customEvent.detail;
      setLastAuthMethod(method || null);
      if (method === "wallet") {
        // For wallet auth, check if API key is available (created during login)
        // API key takes priority over wallet stamper for seamless export
        if (!hasPasskeySession) {
          const apiKeyFlag = window.localStorage.getItem("turnkeyApiKeyReady");
          if (apiKeyFlag === "true") {
            setPreferredStamperType(StamperType.ApiKey);
            console.log("[ExportWalletModal] Wallet auth detected with API key - using ApiKey stamper");
          } else {
            setPreferredStamperType(StamperType.Wallet);
            console.log("[ExportWalletModal] Wallet auth detected without API key - using Wallet stamper");
          }
        }
      } else if (method === "google" || !method) {
        if (!hasPasskeySession) {
          setPreferredStamperType(undefined);
        }
      }
    };

    window.addEventListener(TURNKEY_AUTH_METHOD_EVENT, handler);
    const passkeyHandler = () => {
      setHasPasskeySession(true);
      setPreferredStamperType(StamperType.Passkey);
    };
    const apiKeyHandler = () => {
      setHasApiKeySession(true);
      // API key is now ready - use it for export if no passkey is available
      if (!hasPasskeySession) {
        setPreferredStamperType(StamperType.ApiKey);
        console.log("[ExportWalletModal] API key ready - setting preferred stamper to ApiKey for export");
      }
    };
    window.addEventListener(TURNKEY_PASSKEY_READY_EVENT, passkeyHandler);
    window.addEventListener(TURNKEY_APIKEY_READY_EVENT, apiKeyHandler);

    return () => {
      window.removeEventListener(TURNKEY_AUTH_METHOD_EVENT, handler);
      window.removeEventListener(TURNKEY_PASSKEY_READY_EVENT, passkeyHandler);
      window.removeEventListener(TURNKEY_APIKEY_READY_EVENT, apiKeyHandler);
    };
  }, []);

  // Check if authenticated
  const sessionFromContext = session || turnkey?.session;
  const hasValidSession = !!(
    sessionFromContext?.token &&
    sessionFromContext?.organizationId &&
    sessionFromContext?.userId
  );

  const isAuthenticated =
    authState === AuthState.Authenticated &&
    hasValidSession &&
    clientState === ClientState.Ready;

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      // Clear any timeouts
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      // Abort any ongoing operations
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      
      setStatus("idle");
      setError(null);
      setIframeVisible(false);
      setTargetPublicKey(null);
      setSelectedWalletId(null);
      setFetchedWallets([]);
      // Don't reset preferredStamperType here - it's set from localStorage on mount
      // and should persist across modal open/close cycles
      walletsRequestRef.current = false;
      pendingRevealRef.current = false;
      
      // Clear any existing iframe
      if (iframeStamperRef.current) {
        iframeStamperRef.current.clear();
      }
      if (typeof document !== "undefined") {
        const existing = document.getElementById("turnkey-export-iframe");
        if (existing?.parentNode) {
          existing.parentNode.removeChild(existing);
        }
      }
    } else {
      // Reset initialization on open
      hasInitializedRef.current = false;
      setHasConfirmedStorage(false);
      setConfirmingStorage(false);
      setPastedKeyFirst("");
      setPastedKeySecond("");
      setCopyPasteValidated(false);
      setValidationError(null);

      // Re-read localStorage flags when modal opens to pick up any auth changes
      if (typeof window !== 'undefined') {
        const apiKeyFlag = window.localStorage.getItem("turnkeyApiKeyReady");
        const passkeyFlag = window.localStorage.getItem("turnkeyPasskeyReady");

        if (passkeyFlag === "true") {
          setHasPasskeySession(true);
          setPreferredStamperType(StamperType.Passkey);
        } else if (apiKeyFlag === "true") {
          setHasApiKeySession(true);
          setPreferredStamperType(StamperType.ApiKey);
          console.log("[ExportWalletModal] Modal opened: API key detected, setting stamper to ApiKey");
        }
      }
    }
  }, [isOpen]);

  useEffect(() => {
    setIsClient(true);
    return () => {
      iframeStamperRef.current?.clear();
    };
  }, []);

  const walletsSource = useMemo(() => {
    const contextualWallets = Array.isArray(wallets) ? wallets : [];
    if (contextualWallets.length) return contextualWallets;
    return Array.isArray(fetchedWallets) ? fetchedWallets : [];
  }, [wallets, fetchedWallets]);

  const walletOptions = useMemo(() => {
    // Prefer cached wallets from LoginModal if available on the window (setCachedWallets)
    let sourceList: any[] = [];
    try {
      const cached = typeof window !== "undefined" ? (window as any).__turnkeyCachedWallets : null;
      if (Array.isArray(cached) && cached.length) {
        sourceList = cached;
      }
    } catch {}

    const baseSource =
      sourceList.length
        ? sourceList
        : Array.isArray(wallets) && wallets.length
        ? wallets
        : Array.isArray(fetchedWallets)
        ? fetchedWallets
        : [];

    return (baseSource as any[]).reduce<
      {
        id: string;
        name: string;
        address?: string;
        solanaAddress?: string;
        ethereumAddress?: string;
        source?: string;
      }[]
    >((acc, wallet) => {
      const id = wallet?.walletId || wallet?.id;
      if (!id) return acc;
      const name =
        wallet?.walletName ||
        wallet?.name ||
        `Wallet ${acc.length + 1}`;
      const solanaAddress =
        wallet?.solanaAddress ||
        wallet?.address ||
        (Array.isArray(wallet?.accounts)
          ? wallet.accounts.find((acct: any) =>
              typeof acct?.curve === "string"
                ? acct.curve.toUpperCase().includes("ED25519")
                : !String(acct?.address || "").startsWith("0x")
            )?.address
          : undefined) ||
        "";
      const rawEthAddress =
        wallet?.ethereumAddress ||
        (Array.isArray(wallet?.accounts)
          ? wallet.accounts.find((acct: any) =>
              typeof acct?.curve === "string"
                ? acct.curve.toUpperCase().includes("SECP")
                : String(acct?.address || "").startsWith("0x")
            )?.address
          : undefined) ||
        "";
      const normalizedEth = normalizeMonadAddress(rawEthAddress);
      const preferredAddress =
        normalizedEth || solanaAddress || wallet?.address || "";
      acc.push({
        id,
        name,
        address: preferredAddress,
        solanaAddress: solanaAddress || undefined,
        ethereumAddress: normalizedEth || undefined,
        source: wallet?.source,
      });
      return acc;
    }, []);
  }, [walletsSource]);

  const hasConnectedWallet = useMemo(() => {
    const combined = Array.isArray(wallets) ? wallets : [];
    return combined.some((wallet) => wallet?.source === WalletSource.Connected);
  }, [wallets]);

  // Helper: detect key-not-found/session stamper errors
  const isSessionKeyError = (err: any): boolean => {
    const msg = toLowerCase(err?.message || err?.cause?.message || err?.toString() || "");
    return (
      msg.includes("key not found") ||
      msg.includes("public key") ||
      msg.includes("session public key") ||
      msg.includes("could not be found")
    );
  };

  const walletAuthHint = useMemo(() => {
    if (preferredStamperType === StamperType.Passkey) return false;
    if (preferredStamperType === StamperType.ApiKey) return false;
    // Avoid forcing wallet stamping; let the SDK use the stored session stamper.
    if (preferredStamperType === StamperType.Wallet) return false;
    if (hasPasskeySession) return false;
    if (hasApiKeySession) return false;
    if (hasConnectedWallet) return true;
    return lastAuthMethod === "wallet";
  }, [preferredStamperType, hasConnectedWallet, lastAuthMethod, hasPasskeySession, hasApiKeySession]);

  // Set selected wallet from prop - if walletId is provided, use it DIRECTLY without waiting for fetch
  useEffect(() => {
    if (!isOpen) return;

    try {
      if (walletId) {
        // USE walletId DIRECTLY - no need to fetch or match against walletOptions
        // This enables 1-signature export flow
        console.log("[ExportWalletModal] Using walletId prop directly:", walletId);
        setSelectedWalletId(walletId);
        setError(null);
        return;
      }
      // Auto-select first available wallet if no walletId provided
      if (!selectedWalletId && walletOptions.length > 0) {
        const embedded =
          walletOptions.find((w) => w.source === WalletSource.Embedded) ||
          walletOptions[0];
        setSelectedWalletId(embedded?.id ?? null);
      }
    } catch (err: any) {
      console.error("Error setting selected wallet", err);
      setError("Failed to load wallet. Please try again.");
    }
  }, [isOpen, walletId, walletOptions, selectedWalletId]);

  // The SDK already manages wallets; skip custom fetches to avoid stale-session errors.
  useEffect(() => {
    return;
  }, []);

  const needsTurnkeySession =
    !hasValidSession ||
    !sessionFromContext?.organizationId ||
    !sessionFromContext?.userId;

  // Allow export only when fully authenticated and ready
  // We use our custom export flow (with exportWallet + IframeStamper), not handleExportWallet
  const isTurnkeyReady =
    isAuthenticated &&
    clientState === ClientState.Ready &&
    hasValidSession &&
    !!sessionFromContext?.organizationId &&
    !!exportWallet; // Just need exportWallet available - we'll auto-select wallet if needed
  const isActionInProgress =
    status === "initializing" ||
    status === "requesting" ||
    status === "injecting";

  // Helper function to create timeout promise
  const createTimeout = (ms: number, message: string): Promise<never> => {
    return new Promise((_, reject) => {
      timeoutRef.current = setTimeout(() => {
        reject(new Error(message));
      }, ms);
    });
  };

  // Helper function to wrap promise with timeout
  const withTimeout = async <T,>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> => {
    return Promise.race([
      promise,
      createTimeout(ms, errorMessage)
    ]);
  };

  const handleExport = useCallback(async () => {
    if (!isClient || !isOpen) return;

    // Ensure the active session matches this org to avoid stamper key mismatches
    if (turnkey?.getAllSessions && turnkey?.setActiveSession && sessionFromContext?.organizationId) {
      try {
        const all = await turnkey.getAllSessions();
        if (all) {
          const entries = Object.entries(all as Record<string, any>);
          const match = entries.find(([, s]) => s?.organizationId === sessionFromContext.organizationId);
          if (match) {
            await turnkey.setActiveSession(match[0]);
            console.log("[ExportWalletModal] setActiveSession for org", sessionFromContext.organizationId, match[1]);
          }
        }
      } catch (err) {
        console.warn("[ExportWalletModal] setActiveSession alignment failed (non-blocking)", err);
      }
    }

    // SKIP the Turnkey Wallet Kit built-in export flow (handleExportWallet)
    // because it requires importing Turnkey styles which conflicts with our app's styling.
    // Instead, use our custom iframe-based export flow with IframeStamper.
    // This gives us full control over the UI while still using Turnkey's secure export.
    const USE_CUSTOM_EXPORT_FLOW = true; // Set to false to use Turnkey's built-in UI

    if (!USE_CUSTOM_EXPORT_FLOW && turnkey?.handleExportWallet) {
      try {
        setError(null);
        const args: any = {};
        let walletIdToUse = selectedWalletId;
        if (!walletIdToUse) {
          const first = walletOptions[0];
          if (first?.id) {
            walletIdToUse = first.id;
            setSelectedWalletId(first.id);
          }
        }
        if (walletIdToUse) {
          args.walletId = walletIdToUse;
        }
        // Let the SDK choose stamper unless caller provided one
        await turnkey.handleExportWallet(args);
        // Close our modal so the Turnkey UI is fully interactive
        onClose();
        return;
      } catch (err: any) {
        const msg = err?.message || err?.toString() || "Failed to export wallet.";
        setError(msg);
        setStatus("error");
        return;
      }
    }

    // Clear any existing timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    // Create new abort controller
    abortControllerRef.current = new AbortController();
    
    setError(null);
    setIframeVisible(false);

    if (!isTurnkeyReady) {
      setError("Connect with Turnkey and pick a wallet before exporting.");
      setStatus("error");
      if (!isAuthenticated || needsTurnkeySession) {
        pendingRevealRef.current = true;
        setShowLoginModal(true);
      }
      return;
    }
    pendingRevealRef.current = false;
    if (!iframeContainerRef.current) {
      setError("Iframe container not ready.");
      setStatus("error");
      return;
    }
    if (!exportWallet) {
      setError("Turnkey export helper is unavailable in this session.");
      setStatus("error");
      return;
    }

    // Auto-select wallet if none is selected yet
    let walletIdToUse = selectedWalletId;

    console.log("[ExportWalletModal] Starting wallet selection:", {
      selectedWalletId,
      walletOptionsLength: walletOptions.length,
      walletsFromContext: wallets?.length || 0,
      fetchedWalletsLength: fetchedWallets.length,
      sessionOrgId: sessionFromContext?.organizationId,
      sessionUserId: sessionFromContext?.userId,
    });

    if (!walletIdToUse) {
      // Try multiple sources to find a wallet

      // Source 1: walletOptions (already processed)
      if (walletOptions.length > 0) {
        walletIdToUse = walletOptions[0].id;
        setSelectedWalletId(walletIdToUse);
        console.log("[ExportWalletModal] Selected from walletOptions:", walletIdToUse);
      }

      // Source 2: Cached wallets from window
      if (!walletIdToUse && typeof window !== "undefined") {
        const cached = (window as any).__turnkeyCachedWallets;
        if (Array.isArray(cached) && cached.length > 0) {
          const firstId = cached[0]?.walletId || cached[0]?.id;
          if (firstId) {
            walletIdToUse = firstId;
            setSelectedWalletId(firstId);
            console.log("[ExportWalletModal] Selected from cached wallets:", walletIdToUse);
          }
        }
      }

      // Source 3: wallets from Turnkey context
      if (!walletIdToUse && Array.isArray(wallets) && wallets.length > 0) {
        const firstId = (wallets[0] as any)?.walletId || (wallets[0] as any)?.id;
        if (firstId) {
          walletIdToUse = firstId;
          setSelectedWalletId(firstId);
          console.log("[ExportWalletModal] Selected from context wallets:", walletIdToUse);
        }
      }

      // Source 4: Fetch wallets from Turnkey API
      if (!walletIdToUse && sessionFromContext?.organizationId && sessionFromContext?.userId) {
        console.log("[ExportWalletModal] Fetching wallets from Turnkey API...");

        // Try turnkey.fetchWallets first
        // Skip extra fetch attempts; rely on context/session wallets
      }
    }

    if (!walletIdToUse) {
      console.error("[ExportWalletModal] No wallet found after all attempts");
      setError("No wallet available to export. Please ensure you have a Turnkey wallet created. Try logging out and back in.");
      setStatus("error");
      return;
    }

    console.log("[ExportWalletModal] Using wallet ID for export:", walletIdToUse);

    try {
      setStatus("initializing");
      if (iframeStamperRef.current) {
        iframeStamperRef.current.clear();
      }
      if (typeof document !== "undefined") {
        const existing = document.getElementById("turnkey-export-iframe");
        if (existing?.parentNode) {
          existing.parentNode.removeChild(existing);
        }
      }

      // Initialize iframe with timeout (30 seconds)
      let stamper: IframeStamper;
      let publicKey: string;
      
      try {
        stamper = new IframeStamper({
          iframeUrl: "https://export.turnkey.com",
          iframeElementId: "turnkey-export-iframe",
          iframeContainer: iframeContainerRef.current,
        });
        
        publicKey = await withTimeout(
          stamper.init(),
          30000,
          "Failed to initialize secure iframe. Please check your connection and try again."
        );
        
        await withTimeout(
          stamper.applySettings({ styles: { fontSize: "16px" } }),
          5000,
          "Failed to configure iframe settings."
        );
      } catch (initErr: any) {
        const initErrorMsg = initErr?.message || initErr?.toString() || "";
        if (initErrorMsg.includes("timed out") || initErrorMsg.includes("timeout")) {
          setError("Connection timeout. Please check your internet connection and try again.");
        } else {
          setError("Failed to initialize secure export. Please refresh the page and try again.");
        }
        setStatus("error");
        return;
      }
      
      iframeStamperRef.current = stamper;
      setTargetPublicKey(publicKey);

      setStatus("requesting");
      
      const currentSession = sessionFromContext || session;
      if (!currentSession?.organizationId) {
        setError("Your session is not available. Please open the Turnkey login to sign in again.");
        setStatus("error");
        return;
      }
      
      // Request export bundle with timeout (60 seconds) using the stored session stamper
      let exportBundle: string | null = null;

      // Determine the best stamper to use for export:
      // Priority: Passkey > ApiKey > Wallet > undefined (let SDK choose)
      let effectiveStamp: StamperType | undefined;
      if (preferredStamperType === StamperType.Passkey) {
        effectiveStamp = StamperType.Passkey;
      } else if (preferredStamperType === StamperType.ApiKey || hasApiKeySession) {
        // Use API key if available - this was created during wallet auth
        effectiveStamp = StamperType.ApiKey;
      } else if (preferredStamperType === StamperType.Wallet) {
        // Use wallet stamper as fallback - will prompt for wallet signature
        effectiveStamp = StamperType.Wallet;
      } else {
        // Let SDK choose the best available stamper
        effectiveStamp = undefined;
      }

      console.log("[ExportWalletModal] Using stamper for export:", effectiveStamp, {
        preferredStamperType,
        hasApiKeySession,
        hasPasskeySession,
      });

      try {
        exportBundle = await withTimeout(
          exportWallet({
            walletId: walletIdToUse, // Use the auto-selected wallet ID
            targetPublicKey: publicKey,
            organizationId: currentSession.organizationId,
          }),
          60000,
          "Export request timed out. Please try again."
        );
      } catch (exportErr: any) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        const exportErrorMsg = toLowerCase(exportErr?.message || exportErr?.toString());

        // No explicit fallback stamping; surface the error
        if (
          exportErrorMsg.includes("session public key") ||
          exportErrorMsg.includes("session public key could not be found")
        ) {
          setError("Your session has expired. Please open the Turnkey login to sign in again.");
          setStatus("error");
          setFetchedWallets([]);
          walletsRequestRef.current = false;
          return;
        }

        if (exportErrorMsg.includes("timed out") || exportErrorMsg.includes("timeout")) {
          setError("Export request timed out. Please try again.");
          setStatus("error");
          return;
        }

        throw exportErr;
      }

      if (!exportBundle) {
        throw new Error("Failed to export wallet bundle");
      }

      setStatus("injecting");
      
      // Inject bundle with timeout (30 seconds)
      let injected: boolean;
      try {
        injected = await withTimeout(
          stamper.injectWalletExportBundle(
            exportBundle,
            currentSession.organizationId
          ),
          30000,
          "Failed to inject export bundle. Please try again."
        );
      } catch (injectErr: any) {
        const injectErrorMsg = injectErr?.message || injectErr?.toString() || "";
        if (injectErrorMsg.includes("timed out") || injectErrorMsg.includes("timeout")) {
          setError("Export injection timed out. Please try again.");
        } else {
          setError("Failed to initialize secure export. Please try again.");
        }
        setStatus("error");
        return;
      }

      if (!injected) {
        setError("Failed to initialize secure export. Please try again.");
        setStatus("error");
        return;
      }

      // Clear timeout on success
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      setIframeVisible(true);
      setStatus("done");
    } catch (err: any) {
      // Clear timeout on error
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      console.error("Turnkey wallet export failed", err);
      setStatus("error");
      
      // Extract error message
      const errorMessage = err?.message || err?.toString() || "Unknown error occurred";
      const errorLower = errorMessage.toLowerCase();
      
      // Map common errors to user-friendly messages
      if (
        errorLower.includes("session public key") ||
        errorLower.includes("session public key could not be found") ||
        (errorLower.includes("session") && (
          errorLower.includes("not found") ||
          errorLower.includes("expired") ||
          errorLower.includes("invalid") ||
          errorLower.includes("could not be found")
        ))
      ) {
        setError("Your session has expired. Please open the Turnkey login to sign in again.");
        setFetchedWallets([]);
        walletsRequestRef.current = false;
      } else if (errorLower.includes("timed out") || errorLower.includes("timeout")) {
        setError("The export process timed out. Please try again.");
      } else if (errorLower.includes("network") || errorLower.includes("fetch") || errorLower.includes("connection")) {
        setError("Network error. Please check your connection and try again.");
      } else if (errorLower.includes("permission") || errorLower.includes("unauthorized")) {
        setError("You don't have permission to export this wallet. Please contact support.");
      } else if (errorLower.includes("wallet") && errorLower.includes("not found")) {
        setError("Wallet not found. Please try selecting a different wallet.");
      } else if (errorLower.includes("iframe") || errorLower.includes("stamper")) {
        setError("Failed to initialize secure export. Please refresh the page and try again.");
      } else if (
        errorLower.includes("idbobjectstore") ||
        errorLower.includes("indexeddb") ||
        errorLower.includes("key or key range")
      ) {
        setError("Secure iframe storage failed. Please refresh, sign back in, and try again.");
      } else {
        // Generic user-friendly error message
        setError("Failed to export wallet. Please try again or contact support if the issue persists.");
      }

      if (forceExport) {
        setShowLoginModal(true);
      }
    } finally {
      // Clean up abort controller
      abortControllerRef.current = null;
    }
  }, [
    exportWallet,
    isClient,
    isTurnkeyReady,
    selectedWalletId,
    sessionFromContext,
    session,
    isOpen,
    isAuthenticated,
    needsTurnkeySession,
    forceExport,
    preferredStamperType,
    lastAuthMethod,
    hasApiKeySession,
  ]);

  const handleReauthenticate = useCallback(() => {
    setShowLoginModal(true);
  }, []);

  const handleLoginModalClose = useCallback(async () => {
    setShowLoginModal(false);

    // After login modal closes, re-read localStorage flags and refresh session
    // This ensures we pick up the API key ready flag set during wallet auth
    if (typeof window !== 'undefined') {
      const apiKeyFlag = window.localStorage.getItem("turnkeyApiKeyReady");
      const passkeyFlag = window.localStorage.getItem("turnkeyPasskeyReady");

      if (apiKeyFlag === "true") {
        setHasApiKeySession(true);
        if (passkeyFlag !== "true") {
          setPreferredStamperType(StamperType.ApiKey);
          console.log("[ExportWalletModal] Post-login: API key detected, setting stamper to ApiKey");
        }
      }
      if (passkeyFlag === "true") {
        setHasPasskeySession(true);
        setPreferredStamperType(StamperType.Passkey);
      }
    }

    // Refresh the session to pick up new auth state
    // If user just authenticated and pending reveal was set, auto-trigger export
    if (pendingRevealRef.current) {
      console.log("[ExportWalletModal] Pending reveal detected, will auto-trigger export");
      // Small delay to let state settle
      setTimeout(() => {
        pendingRevealRef.current = false;
      }, 100);
    }
  }, [turnkey]);

  const isForceLockActive =
    forceExport &&
    !hasConfirmedStorage &&
    status !== "error" &&
    iframeVisible;
  const isCloseDisabled = isForceLockActive;

  useEffect(() => {
    if (!isOpen) return;
    if (pendingRevealRef.current && isTurnkeyReady) {
      handleExport();
    }
  }, [isOpen, isTurnkeyReady, handleExport]);

  // Watch for auth state changes - when user authenticates, fetch wallets and set up for export
  useEffect(() => {
    if (!isOpen) return;
    if (authState !== AuthState.Authenticated) return;
    if (!sessionFromContext?.organizationId || !sessionFromContext?.userId) return;

    // Re-read localStorage flags when auth state changes
    if (typeof window !== 'undefined') {
      const passkeyFlag = window.localStorage.getItem("turnkeyPasskeyReady");

      if (passkeyFlag === "true" && !hasPasskeySession) {
        setHasPasskeySession(true);
        setPreferredStamperType(StamperType.Passkey);
      }
    }

    // Avoid aggressive wallet fetch; let SDK/session supply wallets
  }, [isOpen, authState, sessionFromContext?.organizationId, sessionFromContext?.userId, walletOptions.length, hasApiKeySession, hasPasskeySession, turnkey, selectedWalletId]);

  // Skip aggressive pre-fetch; rely on session/context wallets

  const handleConfirmStorage = useCallback(async () => {
    if (hasConfirmedStorage || confirmingStorage) return;
    setConfirmingStorage(true);
    try {
      if (onForceExportConfirmed) {
        await onForceExportConfirmed();
      }
      setHasConfirmedStorage(true);
      toast.success("Backup confirmed. Store this key somewhere only you control.");
    } catch (err: any) {
      const message =
        err?.message || "Failed to confirm backup. Please try again.";
      toast.error(message);
    } finally {
      setConfirmingStorage(false);
    }
  }, [hasConfirmedStorage, confirmingStorage, onForceExportConfirmed]);

  const handleClose = () => {
    if (isCloseDisabled) {
      toast.error("Please confirm you've safely stored this key before closing.");
      return;
    }
    // Always allow closing, but clean up if in progress
    if (status === "initializing" || status === "requesting" || status === "injecting") {
      // Cancel ongoing operations
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setStatus("idle");
      setError(null);
    }
    pendingRevealRef.current = false;
    onClose();
  };

  const handleCancel = () => {
    // Cancel ongoing export
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus("idle");
    setError(null);
    setIframeVisible(false);
    setTargetPublicKey(null);
  };

  const handleLogout = () => {
    handleCancel();
    logout();
  };

  const currentStatus = statusCopy[status];
  const selectedWallet = useMemo(
    () => walletOptions.find((w) => w.id === selectedWalletId),
    [walletOptions, selectedWalletId]
  );
  const fallbackMonad = normalizeMonadAddress(selectedWallet?.address || "");
  const monadAddress =
    normalizeMonadAddress(walletAddress) ||
    selectedWallet?.ethereumAddress ||
    fallbackMonad ||
    "";
  const solanaAddress =
    selectedWallet?.solanaAddress &&
    selectedWallet.solanaAddress !== monadAddress
      ? selectedWallet.solanaAddress
      : null;

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onClick={isCloseDisabled ? undefined : handleClose}
      >
        <div
          className="bg-[#101114] rounded-lg shadow-2xl w-full max-w-[400px] max-h-[90vh] overflow-y-auto relative border border-[#2A2B33]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 py-3 border-b border-[#2A2B33]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[#f0f5f5]">Export Wallet</h2>
                {forceExport && (
                  <p className="text-xs text-[#FF4D7F] mt-1">
                    You must export and back up this key before continuing.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 rounded-md border border-[#2A2B33] text-xs font-medium text-[#f0f5f5] hover:bg-[#2A2B33] transition whitespace-nowrap"
                >
                  Log out
                </button>
                {!isCloseDisabled && (
                  <button 
                    className="text-[#9CA3AF] hover:text-[#f0f5f5] text-xl font-light transition-colors" 
                    onClick={handleClose}
                  >
                    <FaTimes />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-5 py-4">
            {/* Authentication Status - Only show if not authenticated */}
            {clientState === ClientState.Ready && (!isAuthenticated || needsTurnkeySession) && (
              <div className="mb-4">
                <button
                  onClick={handleReauthenticate}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-medium text-[#1A1A1A] transition hover:bg-gray-100"
                >
                  <Lock className="w-4 h-4" />
                  Open Turnkey login
                </button>
                <p className="mt-2 text-[11px] text-[#FF4D7F] text-center">
                  DO NOT verify if you are not exporting your private keys.
                </p>
              </div>
            )}

            {/* Wallet Address */}
            {selectedWalletId && (
              <div className="mb-3">
                <label className="text-xs text-[#9CA3AF] mb-1.5 block">
                  Monad wallet (EVM)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={monadAddress}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#17191E] border border-[#2A2B33] text-[#f0f5f5] text-xs font-mono"
                  />
                  <button
                    onClick={() => {
                      if (monadAddress) {
                        navigator.clipboard.writeText(monadAddress).then(
                          () => toast.success("Copied to clipboard"),
                          () => toast.error("Failed to copy")
                        );
                      }
                    }}
                    className="text-[#9CA3AF] hover:text-[#f0f5f5] transition-colors"
                  >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Private Key Area */}
            <div className="mb-3">
              <label className="text-xs text-[#9CA3AF] mb-1.5 block">Private Key</label>
              <div className="rounded-lg border border-[#2A2B33] bg-[#121212] p-3 min-h-[100px] relative">
                <div
                  ref={iframeContainerRef}
                  className={`w-full ${iframeVisible ? "block" : "hidden"}`}
                />
                {!iframeVisible && (
                  <div className="flex items-center justify-center min-h-[100px]">
                    <div className="text-center w-full">
                      <div className="blur-sm bg-[#2A2B33] rounded w-full h-16 mb-3 mx-auto"></div>
                      {isAuthenticated && (
                        <div className="flex items-center gap-2 justify-center">
                          {isActionInProgress ? (
                            <>
                              <button
                                onClick={handleCancel}
                                className="px-3 py-1.5 rounded-lg bg-[#FF4D7F] text-white text-sm font-medium hover:bg-[#FF3D6F] transition-colors inline-flex items-center gap-2"
                              >
                                Cancel
                              </button>
                              <div className="px-3 py-1.5 rounded-lg bg-[#374151] text-[#f0f5f5] text-sm font-medium inline-flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {status === "initializing" && "Initializing..."}
                                {status === "requesting" && "Requesting export..."}
                                {status === "injecting" && "Decrypting..."}
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center gap-2">
                              <button
                                onClick={handleExport}
                                disabled={isActionInProgress}
                                className="px-3 py-1.5 rounded-lg bg-[#374151] text-[#f0f5f5] text-sm font-medium hover:bg-[#4B5563] transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                              >
                                Reveal private key
                              </button>
                              {!isTurnkeyReady && (
                                <div className="flex flex-col items-center gap-2">
                                  <p className="text-xs text-[#FFB347] text-center max-w-[260px]">
                                    Sign back in with Turnkey (Google or your wallet) and ensure a Turnkey wallet is selected before exporting.
                                  </p>
                                  <button
                                    onClick={handleReauthenticate}
                                    className="px-3 py-1.5 rounded-md bg-white text-xs font-medium text-[#111] hover:bg-gray-100 inline-flex items-center gap-2"
                                  >
                                    <Lock className="w-3.5 h-3.5" />
                                    Open Turnkey login
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Copy-Paste Validation */}
              {iframeVisible && !copyPasteValidated && (
                <div className="mt-3 p-3 rounded-lg border border-[#2A2B33] bg-[#121212]">
                  <p className="text-xs text-[#9CA3AF] mb-2">
                    Copy your private key from above, then paste it twice to confirm:
                  </p>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={pastedKeyFirst}
                      onChange={(e) => {
                        setPastedKeyFirst(e.target.value);
                        setValidationError(null);
                      }}
                      placeholder="Paste your private key here..."
                      className="w-full px-3 py-2 rounded-lg bg-[#17191E] border border-[#2A2B33] text-[#f0f5f5] text-xs font-mono placeholder:text-[#6B7280]"
                    />
                    <input
                      type="text"
                      value={pastedKeySecond}
                      onChange={(e) => {
                        setPastedKeySecond(e.target.value);
                        setValidationError(null);
                      }}
                      placeholder="Paste it again to confirm..."
                      className="w-full px-3 py-2 rounded-lg bg-[#17191E] border border-[#2A2B33] text-[#f0f5f5] text-xs font-mono placeholder:text-[#6B7280]"
                    />
                    {validationError && (
                      <p className="text-[11px] text-[#FF4D7F]">{validationError}</p>
                    )}
                    <button
                      onClick={() => {
                        const first = pastedKeyFirst.trim();
                        const second = pastedKeySecond.trim();

                        if (!first || !second) {
                          setValidationError("Please paste your key in both fields.");
                          return;
                        }
                        if (first.length < 20) {
                          setValidationError("The pasted key seems too short. Please paste the complete key.");
                          return;
                        }
                        if (first !== second) {
                          setValidationError("The keys don't match. Please paste the same key in both fields.");
                          return;
                        }

                        setCopyPasteValidated(true);
                        setValidationError(null);
                        toast.success("Key verified! You've confirmed your backup.");
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-[#374151] text-[#f0f5f5] text-xs font-medium hover:bg-[#4B5563] transition-colors"
                    >
                      Verify Match
                    </button>
                  </div>
                </div>
              )}

              {/* Validation Success */}
              {copyPasteValidated && (
                <div className="mt-3 p-2 rounded-lg bg-[#70E0B0]/10 border border-[#70E0B0]/20 flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#70E0B0]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs text-[#70E0B0]">Private key backup verified</span>
                </div>
              )}
            </div>

            {/* Status Messages */}
            {error && (
              <div className="mb-3 p-2.5 rounded-lg bg-[#FF4D7F]/10 border border-[#FF4D7F]/20 text-xs text-[#FF4D7F]">
                {error}
              </div>
            )}

            {status !== "idle" && status !== "error" && !iframeVisible && (
              <div className="mb-3 p-2.5 rounded-lg bg-[#17191E] border border-[#2A2B33] text-xs text-[#9CA3AF]">
                {currentStatus.description}
              </div>
            )}

            {/* Warning */}
            <div className="mt-4 p-2.5 rounded-lg bg-[#FF4D7F]/10 border border-[#FF4D7F]/20 flex items-start gap-2">
              <AlertTriangle className="text-[#FF4D7F] flex-shrink-0 mt-0.5" size={14} />
              <p className="text-[11px] leading-tight text-[#FF4D7F]">
                <strong>WARNING:</strong> Your private key grants complete control over this wallet. NEVER SHARE IT. Store it securely.
              </p>
            </div>

            {forceExport && status === "done" && iframeVisible && (
              <div className="mt-3 p-3 rounded-lg border border-[#2A2B33] bg-[#121212]">
                <p className="text-xs text-[#f0f5f5]">
                  Back up this key now. Save it in an encrypted manager that <em>you</em> control.
                </p>
                <p className="mt-1.5 text-[11px] text-[#9CA3AF]">
                  By confirming, you acknowledge that storing this key safely is your responsibility.
                </p>
                <button
                  onClick={handleConfirmStorage}
                  disabled={confirmingStorage || hasConfirmedStorage || !copyPasteValidated}
                  className="mt-2.5 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#70E0B0] px-3 py-2 text-xs font-semibold text-[#101114] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {confirmingStorage && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {hasConfirmedStorage ? "Confirmed" : !copyPasteValidated ? "Verify key backup first" : "I stored this key safely"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Login modal for re-authentication */}
      {isClient && (
        <LoginModal
          open={showLoginModal}
          onClose={handleLoginModalClose}
        />
      )}

    </>
  );
}
