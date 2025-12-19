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
      }
      if (apiKeyFlag === "true") {
        setHasApiKeySession(true);
      }

      // For wallet-authenticated users with a stored session, use undefined (no stampWith)
      // This lets the SDK use the stored session automatically - NO wallet signatures needed
      // Only set explicit stamper type for non-wallet auth methods
      if (stored === "wallet" && apiKeyFlag === "true") {
        // Wallet auth with stored session - don't pass stampWith, let SDK use stored session
        setPreferredStamperType(undefined);
      } else if (passkeyFlag === "true") {
        setPreferredStamperType(StamperType.Passkey);
      } else if (apiKeyFlag === "true") {
        setPreferredStamperType(StamperType.ApiKey);
      } else if (stored === "wallet") {
        // Wallet auth but no stored session - must use wallet stamper
        setPreferredStamperType(StamperType.Wallet);
      }
    } catch (err) {
      console.warn("[ExportWalletModal] Failed to read stored auth method", err);
    }

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<string | null>;
      const method = customEvent.detail;
      setLastAuthMethod(method || null);
      if (method === "wallet") {
        // Only adjust if no passkey yet; once passkey is ready we stick with it
        if (!hasPasskeySession) {
          setPreferredStamperType(StamperType.Wallet);
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
      setPreferredStamperType(StamperType.ApiKey);
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
      setPreferredStamperType(undefined);
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
    return (walletsSource as any[]).reduce<
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
    const combined = [
      ...(Array.isArray(wallets) ? wallets : []),
      ...(Array.isArray(fetchedWallets) ? fetchedWallets : []),
    ];
    return combined.some((wallet) => wallet?.source === WalletSource.Connected);
  }, [wallets, fetchedWallets]);

  const walletAuthHint = useMemo(() => {
    if (preferredStamperType === StamperType.Passkey) return false;
    if (preferredStamperType === StamperType.ApiKey) return false;
    if (preferredStamperType === StamperType.Wallet) return true;
    if (hasPasskeySession) return false;
    if (hasApiKeySession) return false;
    if (hasConnectedWallet) return true;
    return lastAuthMethod === "wallet";
  }, [preferredStamperType, hasConnectedWallet, lastAuthMethod, hasPasskeySession, hasApiKeySession]);

  // Set selected wallet from prop
  useEffect(() => {
    if (!isOpen) return;
    
    try {
      if (walletId) {
        // Wait for wallets to be loaded before trying to match
        if (walletOptions.length === 0) {
          // Wallets not loaded yet, will retry when walletOptions updates
          return;
        }
        
        const match = walletOptions.find((w) => w.id === walletId);
        if (match) {
          setSelectedWalletId(match.id);
          setError(null); // Clear any previous errors
          return;
        } else {
          // Wallet ID provided but not found in Turnkey wallets
          console.warn(`Wallet ID ${walletId} not found in available wallets. Available wallet IDs:`, walletOptions.map(w => w.id));
          setError(`Wallet not found. The wallet may not be managed by Turnkey or may not be available for export.`);
          setSelectedWalletId(null);
          return;
        }
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

  // Fetch wallets only when authenticated
  useEffect(() => {
    console.log("[ExportWalletModal] Wallet fetch check:", {
      isOpen,
      walletOptionsLength: walletOptions.length,
      walletsRequestRefCurrent: walletsRequestRef.current,
      isAuthenticated,
      hasSession: !!sessionFromContext,
      organizationId: sessionFromContext?.organizationId,
      userId: sessionFromContext?.userId,
      authState,
      clientState,
      hasValidSession,
      turnkeyAvailable: !!turnkey,
      hasRefreshWallets: typeof turnkey?.refreshWallets === "function",
      hasFetchWallets: typeof turnkey?.fetchWallets === "function",
      walletsFromContext: wallets,
      preferredStamperType,
    });

    // Must have a valid Turnkey SDK session (not just our app authentication)
    const hasTurnkeySDKSession =
      authState === AuthState.Authenticated &&
      clientState === ClientState.Ready &&
      sessionFromContext?.token;

    if (
      !isOpen ||
      walletOptions.length ||
      walletsRequestRef.current ||
      !isAuthenticated ||
      !hasTurnkeySDKSession ||
      !sessionFromContext?.organizationId ||
      !sessionFromContext?.userId
    ) {
      console.log("[ExportWalletModal] Skipping wallet fetch - conditions not met:", {
        isOpen,
        hasWalletOptions: walletOptions.length > 0,
        alreadyRequested: walletsRequestRef.current,
        isAuthenticated,
        hasTurnkeySDKSession,
        authState,
        clientState,
        hasToken: !!sessionFromContext?.token,
        hasOrgId: !!sessionFromContext?.organizationId,
        hasUserId: !!sessionFromContext?.userId,
      });
      return;
    }

    walletsRequestRef.current = true;
    console.log("[ExportWalletModal] Starting wallet fetch for org:", sessionFromContext.organizationId, {
      stamper: preferredStamperType || "default",
    });

    const handleFetchError = async (err: any) => {
      const errorMessage = toLowerCase(err?.message || err?.cause?.message);
      const causeMessage = toLowerCase(err?.cause?.message);

      if (isWalletAuthSessionError(err)) {
        setError(
          "We couldn't access your embedded wallet through Phantom/MetaMask. Reopen the Turnkey login, approve the wallet signature, and try again."
        );
      } else if (
        errorMessage.includes("no active session") ||
        errorMessage.includes("no_session_found") ||
        errorMessage.includes("requires a valid session")
      ) {
        console.warn(
          "[ExportWalletModal] No active Turnkey session, prompting re-auth..."
        );
        setError("Please sign in with Turnkey (Google or your wallet) to export your wallet.");
      } else if (
        errorMessage.includes("key not found") ||
        errorMessage.includes("key not found for publickey")
      ) {
        console.warn(
          "[ExportWalletModal] Stale session key detected, clearing session..."
        );
        await clearTurnkeySession();
        setError("Your session has expired. Please refresh the page and sign in again.");
        toast.error("Session expired - please refresh and sign in again");
      } else if (
        errorMessage.includes("session public key") ||
        (errorMessage.includes("session") &&
          (errorMessage.includes("not found") ||
            errorMessage.includes("expired") ||
            errorMessage.includes("invalid") ||
            errorMessage.includes("could not be found")))
      ) {
        setError("Your session has expired. Please open the Turnkey login and sign in again.");
      } else {
        setError(`Failed to load wallets: ${err?.message || "Unknown error"}. Please try again.`);
      }

      setFetchedWallets([]);
      walletsRequestRef.current = false;
    };

    (async () => {
      // If wallets are already in context from login, skip fetch entirely (0 signatures)
      const contextWallets = Array.isArray(wallets) ? wallets : [];
      if (contextWallets.length > 0) {
        console.log("[ExportWalletModal] Using wallets from context, skipping fetch");
        setFetchedWallets([]);
        setError(null);
        walletsRequestRef.current = false;
        return;
      }

      // Only fetch if context wallets are empty - requires 1 wallet signature
      const fetchWalletsWithStamp = async (): Promise<any[]> => {
        let fetchedWalletList: any[] = [];

        if (typeof turnkey?.refreshWallets === "function") {
          console.log("[ExportWalletModal] Calling refreshWallets with wallet stamp...");
          const refreshed = await turnkey.refreshWallets({
            organizationId: sessionFromContext.organizationId,
            userId: sessionFromContext.userId,
            stampWith: StamperType.Wallet,
          });
          console.log("[ExportWalletModal] refreshWallets result:", refreshed);
          if (Array.isArray(refreshed)) {
            fetchedWalletList = refreshed;
          }
        } else if (typeof turnkey?.fetchWallets === "function") {
          console.log("[ExportWalletModal] Calling fetchWallets with wallet stamp...");
          const result = await turnkey.fetchWallets({
            organizationId: sessionFromContext.organizationId,
            userId: sessionFromContext.userId,
            stampWith: StamperType.Wallet,
          });
          console.log("[ExportWalletModal] fetchWallets result:", result);
          if (Array.isArray(result)) {
            fetchedWalletList = result;
          }
        } else {
          console.warn("[ExportWalletModal] Neither refreshWallets nor fetchWallets available on turnkey object");
        }

        return fetchedWalletList;
      };

      try {
        const fetchedWalletList = await fetchWalletsWithStamp();

        setFetchedWallets(fetchedWalletList);

        if (fetchedWalletList.length === 0) {
          console.warn("[ExportWalletModal] No wallets available after fetch attempt");
          setError("No exportable wallet found. Please try signing in again with a fresh session.");
        } else {
          setError(null);
        }
      } catch (err: any) {
        console.error("[ExportWalletModal] Failed to load wallets:", {
          message: err?.message,
          name: err?.name,
          code: err?.code,
          status: err?.status,
          stack: err?.stack,
          cause: err?.cause,
          fullError: err,
        });

        await handleFetchError(err);
      }

      walletsRequestRef.current = false;
    })();
  }, [
    isOpen,
    isAuthenticated,
    sessionFromContext?.organizationId,
    sessionFromContext?.userId,
    turnkey,
    walletOptions.length,
    authState,
    clientState,
    hasValidSession,
    wallets,
    preferredStamperType,
    walletAuthHint,
    lastAuthMethod,
    hasApiKeySession,
  ]);

  const needsTurnkeySession =
    !hasValidSession ||
    !sessionFromContext?.organizationId ||
    !sessionFromContext?.userId;

  // Allow export only when fully authenticated and ready
  const isTurnkeyReady =
    isAuthenticated &&
    clientState === ClientState.Ready &&
    hasValidSession &&
    !!sessionFromContext?.organizationId &&
    !!selectedWalletId &&
    !!exportWallet;
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
      
      // Request export bundle with timeout (60 seconds)
      // Use wallet stamper directly - ONE confirmation
      let exportBundle: string | null = null;

      try {
        exportBundle = await withTimeout(
          exportWallet({
            walletId: selectedWalletId,
            targetPublicKey: publicKey,
            organizationId: currentSession.organizationId,
            stampWith: StamperType.Wallet,
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

  const handleLoginModalClose = useCallback(() => {
    setShowLoginModal(false);
  }, []);

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
          className="bg-[#101114] rounded-lg shadow-2xl w-full max-w-md relative border border-[#2A2B33]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-[#2A2B33]">
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
          <div className="px-6 py-6">
            {/* Authentication Status - Only show if not authenticated */}
            {clientState === ClientState.Ready && (!isAuthenticated || needsTurnkeySession) && (
              <div className="mb-6">
                <button
                  onClick={handleReauthenticate}
                  className="w-full inline-flex items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-medium text-[#1A1A1A] transition hover:bg-gray-100"
                >
                  <Lock className="w-4 h-4" />
                  Open Turnkey login
                </button>
                <p className="mt-3 text-xs text-[#FF4D7F] text-center">
                  Showing your private keys. DO NOT verify if you are not exporting your private keys.
                </p>
              </div>
            )}

            {/* Wallet Address */}
            {selectedWalletId && (
              <div className="mb-4 space-y-3">
                <div>
                  <label className="text-sm text-[#9CA3AF] mb-2 block">
                    Monad wallet (EVM)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={monadAddress}
                      className="flex-1 px-3 py-2 rounded-lg bg-[#17191E] border border-[#2A2B33] text-[#f0f5f5] text-sm font-mono"
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
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                    </button>
                  </div>
                </div>
                {/* Solana wallet field temporarily disabled */}
              </div>
            )}

            {/* Private Key Area */}
            <div className="mb-4">
              <label className="text-sm text-[#9CA3AF] mb-2 block">Private Key</label>
              <div className="rounded-lg border border-[#2A2B33] bg-[#17191E] p-4 min-h-[150px] relative">
                <div
                  ref={iframeContainerRef}
                  className={`w-full ${iframeVisible ? "block" : "hidden"}`}
                />
                {!iframeVisible && (
                  <div className="flex items-center justify-center min-h-[150px]">
                    <div className="text-center w-full">
                      <div className="blur-sm bg-[#2A2B33] rounded w-full h-20 mb-4 mx-auto"></div>
                      {isAuthenticated && (
                        <div className="flex items-center gap-2 justify-center">
                          {isActionInProgress ? (
                            <>
                              <button
                                onClick={handleCancel}
                                className="px-4 py-2 rounded-lg bg-[#FF4D7F] text-white text-sm font-medium hover:bg-[#FF3D6F] transition-colors inline-flex items-center gap-2"
                              >
                                Cancel
                              </button>
                              <div className="px-4 py-2 rounded-lg bg-[#374151] text-[#f0f5f5] text-sm font-medium inline-flex items-center gap-2">
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
                                className="px-4 py-2 rounded-lg bg-[#374151] text-[#f0f5f5] text-sm font-medium hover:bg-[#4B5563] transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
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
            </div>

            {/* Status Messages */}
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-[#FF4D7F]/10 border border-[#FF4D7F]/20 text-sm text-[#FF4D7F]">
                {error}
              </div>
            )}

            {status !== "idle" && status !== "error" && !iframeVisible && (
              <div className="mb-4 p-3 rounded-lg bg-[#17191E] border border-[#2A2B33] text-sm text-[#9CA3AF]">
                {currentStatus.description}
              </div>
            )}

            {/* Warning */}
            <div className="mt-6 p-3 rounded-lg bg-[#FF4D7F]/10 border border-[#FF4D7F]/20 flex items-start gap-2">
              <AlertTriangle className="text-[#FF4D7F] flex-shrink-0 mt-0.5" size={16} />
              <p className="text-xs text-[#FF4D7F]">
                <strong>WARNING:</strong> Your private key grants complete control over this wallet. NEVER SHARE IT WITH ANYONE. Store it somewhere only you can access and remember that keeping it safe is entirely your responsibility.
              </p>
            </div>

            {forceExport && status === "done" && iframeVisible && (
              <div className="mt-4 p-4 rounded-lg border border-[#2A2B33] bg-[#13151B]">
                <p className="text-sm text-[#f0f5f5]">
                  Carefully back up this key now. Write it down or save it in an encrypted manager that <em>you</em> control. We cannot recover it for you.
                </p>
                <p className="mt-2 text-xs text-[#9CA3AF]">
                  Once you acknowledge this step, you are confirming that you stored the key safely and understand it is solely your responsibility not to lose it.
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    onClick={handleConfirmStorage}
                    disabled={confirmingStorage || hasConfirmedStorage}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#70E0B0] px-4 py-2 text-sm font-semibold text-[#101114] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {confirmingStorage && <Loader2 className="h-4 w-4 animate-spin" />}
                    {hasConfirmedStorage ? "Confirmed" : "I stored this key safely"}
                  </button>
                </div>
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
