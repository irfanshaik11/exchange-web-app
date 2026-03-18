import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { IframeStamper } from "@turnkey/iframe-stamper";
import { generateP256KeyPair, decryptExportBundle } from "@turnkey/crypto";
import dynamic from "next/dynamic";
import { FaTimes } from "react-icons/fa";
import toast from "react-hot-toast";
import Cookies from "js-cookie";

import { AuthState, ClientState, WalletSource, useTurnkey } from "~/lib/turnkeyWalletKit";
import { useUser } from "~/components/UserContext";
import { normalizeMonadAddress } from "~/utils/normalizeMonadAddress";

const isDev = process.env.NODE_ENV !== 'production';

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
    description: "Requesting encrypted export bundle from Turnkey to securely display your key.",
    tone: "neutral",
  },
  injecting: {
    title: "Decrypting in iframe",
    description: "Passing the encrypted bundle into the iframe so it can be decrypted client-side.",
    tone: "neutral",
  },
  done: {
    title: "Export complete",
    description: "Your private key or recovery phrase is visible inside the iframe only. Save it securely.",
    tone: "success",
  },
  error: {
    title: "Something went wrong",
    description: "Check the error message below and try again.",
    tone: "warning",
  },
};

const toLowerCase = (value?: string): string => (value || "").toString().toLowerCase();

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

interface ExportWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletId?: string;
  walletAddress?: string;
  forceExport?: boolean;
  onForceExportConfirmed?: () => Promise<void> | void;
  onExported?: (chain: "sol" | "monad" | "both") => void;
}

export default function ExportWalletModal({
  isOpen,
  onClose,
  walletId,
  walletAddress,
  forceExport = false,
  onForceExportConfirmed,
  onExported,
}: ExportWalletModalProps) {
  const turnkey = useTurnkey() as any;
  const { authState, clientState, session: turnkeySession, exportWallet, wallets = [] } = turnkey || {};
  const sessionFromContext = turnkeySession || turnkey?.session;

  const { logout, user, walletList, refreshWalletList } = useUser();

  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [iframeVisible, setIframeVisible] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [fetchedWallets, setFetchedWallets] = useState<any[]>([]);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const pendingRevealRef = useRef(false);
  const exportNotifiedRef = useRef(false);

  const iframeContainerRef = useRef<HTMLDivElement | null>(null);
  const iframeStamperRef = useRef<IframeStamper | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const organizationIdRef = useRef<string | null>(null);

  const [hasConfirmedStorage, setHasConfirmedStorage] = useState(false);
  const [confirmingStorage, setConfirmingStorage] = useState(false);
  const [pastedKeyFirst, setPastedKeyFirst] = useState("");
  const [pastedKeySecond, setPastedKeySecond] = useState("");
  const [copyPasteValidated, setCopyPasteValidated] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [lastAuthMethod, setLastAuthMethod] = useState<string | null>(null);
  const walletsRequestRef = useRef(false);
  const hasAuthenticatedThisVisitRef = useRef(false);

  // Direct decryption for Solana keys (no iframe)
  const [decryptedSolanaKey, setDecryptedSolanaKey] = useState<string>("");

  useEffect(() => {
    setIsClient(true);
    return () => {
      iframeStamperRef.current?.clear();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem("turnkeyLastAuthMethod");
      if (stored) setLastAuthMethod(stored);
    } catch (err) {
      console.warn("[ExportWalletModal] Failed to read stored auth method", err);
    }
  }, []);

  const inferredWalletAuth =
    lastAuthMethod === "wallet" ||
    (!sessionFromContext?.organizationId && !!Cookies.get("token"));
  const isWalletAuth = inferredWalletAuth;
  const hasSdkSession =
    !!(sessionFromContext?.token && sessionFromContext?.organizationId && sessionFromContext?.userId);
  const isGoogleAuthenticated =
    !isWalletAuth &&
    authState === AuthState.Authenticated &&
    clientState === ClientState.Ready &&
    hasSdkSession;
  const isAuthenticated = isWalletAuth || isGoogleAuthenticated;

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
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
      setSelectedWalletId(null);
      setFetchedWallets([]);
      walletsRequestRef.current = false;
      hasAuthenticatedThisVisitRef.current = false;
      organizationIdRef.current = null;
      pendingRevealRef.current = false;
      setShowLoginModal(false);
      exportNotifiedRef.current = false;

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
      setHasConfirmedStorage(false);
      setConfirmingStorage(false);
      setPastedKeyFirst("");
      setPastedKeySecond("");
      setCopyPasteValidated(false);
      setValidationError(null);
      setDecryptedSolanaKey("");
      hasAuthenticatedThisVisitRef.current = false;
    }
  }, [isOpen]);

  // Track when Google auth succeeds
  useEffect(() => {
    if (clientState !== ClientState.Ready || !isOpen || isWalletAuth) return;

    const justAuthenticated =
      authState === AuthState.Authenticated &&
      hasSdkSession &&
      !hasAuthenticatedThisVisitRef.current;

    if (justAuthenticated) {
      hasAuthenticatedThisVisitRef.current = true;
      setShowLoginModal(false);
      setError(null);
    }
  }, [authState, clientState, hasSdkSession, isOpen, isWalletAuth]);

  // Pull latest backend wallets when modal opens (all auth paths)
  useEffect(() => {
    if (!isOpen) return;
    refreshWalletList?.(true);
  }, [isOpen, refreshWalletList]);

  // Prompt Google login when needed — but skip if backend wallets exist
  // (export will use the backend API path, no SDK session required)
  const hasBackendWalletsForPrompt = Array.isArray(walletList) && walletList.length > 0;
  useEffect(() => {
    if (!isOpen || isWalletAuth || hasBackendWalletsForPrompt) return;
    if (!isGoogleAuthenticated) {
      setShowLoginModal(true);
    }
  }, [isOpen, isWalletAuth, isGoogleAuthenticated, hasBackendWalletsForPrompt]);

  const walletsSource = useMemo(() => {
    // Always prefer backend wallet list — it's authoritative for both
    // wallet-auth (Phantom/MetaMask) AND Google OAuth users.
    // The backend creates and owns the sub-org + wallet, so the backend
    // wallet list has the correct walletId and address.
    if (Array.isArray(walletList) && walletList.length) return walletList;

    // Fallback to SDK wallets only if backend list is empty
    if (!isWalletAuth) {
      let sourceList: any[] = [];
      try {
        const cached =
          typeof window !== "undefined" ? (window as any).__turnkeyCachedWallets : null;
        if (Array.isArray(cached) && cached.length) {
          sourceList = cached;
        }
      } catch {
        // Ignore caching errors
      }

      if (!sourceList.length && Array.isArray(wallets) && wallets.length) {
        sourceList = wallets;
      }
      if (!sourceList.length) {
        sourceList = Array.isArray(fetchedWallets) ? fetchedWallets : [];
      }

      return sourceList;
    }

    return Array.isArray(fetchedWallets) ? fetchedWallets : [];
  }, [isWalletAuth, walletList, wallets, fetchedWallets]);

  const walletOptions = useMemo(() => {
    return (walletsSource as any[]).reduce<
      {
        id: string;
        name: string;
        address?: string;
        solanaAddress?: string;
        ethereumAddress?: string;
        walletAccountId?: string | null;
        organizationId?: string | null;
        source?: string;
      }[]
    >((acc, wallet) => {
      const id = wallet?.walletId || wallet?.id;
      if (!id) return acc;
      const name = wallet?.walletName || wallet?.name || `Wallet ${acc.length + 1}`;
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
      const preferredAddress = normalizedEth || solanaAddress || wallet?.address || "";

      acc.push({
        id,
        name,
        address: preferredAddress,
        solanaAddress: solanaAddress || undefined,
        ethereumAddress: normalizedEth || undefined,
        walletAccountId: (wallet as any)?.walletAccountId || null,
        organizationId: isWalletAuth
          ? (wallet as any)?.organizationId || user?.subOrgId || null
          : (wallet as any)?.organizationId || sessionFromContext?.organizationId || null,
        source: wallet?.source,
      });
      return acc;
    }, []);
  }, [walletsSource, isWalletAuth, sessionFromContext?.organizationId, user?.subOrgId]);

  // Fetch SDK wallets for Google auth if not already available
  useEffect(() => {
    if (
      !isOpen ||
      isWalletAuth ||
      walletOptions.length ||
      walletsRequestRef.current ||
      !isGoogleAuthenticated ||
      !sessionFromContext?.organizationId ||
      !sessionFromContext?.userId
    ) {
      return;
    }

    walletsRequestRef.current = true;
    (async () => {
      try {
        const refreshFn =
          typeof turnkey?.refreshWallets === "function"
            ? turnkey.refreshWallets
            : typeof turnkey?.fetchWallets === "function"
            ? turnkey.fetchWallets
            : null;

        if (refreshFn) {
          const result = await refreshFn({
            organizationId: sessionFromContext.organizationId,
            userId: sessionFromContext.userId,
          });
          if (Array.isArray(result)) {
            setFetchedWallets(result);
          }
        }
      } catch (err: any) {
        console.error("Failed to load Turnkey wallets for export", err);
        const errorMessage = toLowerCase(err?.message || "");
        if (
          errorMessage.includes("session public key") ||
          (errorMessage.includes("session") &&
            (errorMessage.includes("not found") ||
              errorMessage.includes("expired") ||
              errorMessage.includes("invalid") ||
              errorMessage.includes("could not be found")))
        ) {
          hasAuthenticatedThisVisitRef.current = false;
          setError("Your session has expired. Please click 'Continue with Google' to sign in again.");
          setFetchedWallets([]);
          walletsRequestRef.current = false;
          setShowLoginModal(true);
        } else {
          setError("Failed to load wallets. Please try again.");
          walletsRequestRef.current = false;
        }
      }
    })();
  }, [
    isOpen,
    isWalletAuth,
    walletOptions.length,
    isGoogleAuthenticated,
    sessionFromContext?.organizationId,
    sessionFromContext?.userId,
    turnkey,
  ]);

  // Set selected wallet from prop
  useEffect(() => {
    if (!isOpen) return;

    try {
      if (walletId) {
        if (walletOptions.length === 0) {
          return;
        }

        const match = walletOptions.find((w) => w.id === walletId);
        if (match) {
          setSelectedWalletId(match.id);
          setError(null);
          return;
        } else {
          setError("Wallet not found. Please select a different wallet.");
          setSelectedWalletId(null);
          return;
        }
      }

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

  const isTurnkeyReady = isWalletAuth
    ? walletOptions.length > 0
    : isGoogleAuthenticated &&
      walletOptions.length > 0 &&
      !!sessionFromContext?.organizationId &&
      typeof exportWallet === "function";

  const isActionInProgress =
    status === "initializing" || status === "requesting" || status === "injecting";

  // Helper function to create timeout promise
  const createTimeout = (ms: number, message: string): Promise<never> => {
    return new Promise((_, reject) => {
      timeoutRef.current = setTimeout(() => {
        reject(new Error(message));
      }, ms);
    });
  };

  // Helper function to wrap promise with timeout
  const withTimeout = async <T,>(
    promise: Promise<T>,
    ms: number,
    errorMessage: string
  ): Promise<T> => {
    return Promise.race([promise, createTimeout(ms, errorMessage)]);
  };

  const handleExport = useCallback(async () => {
    if (!isClient || !isOpen) return;

    if (isGoogleAuthenticated && showLoginModal) {
      setShowLoginModal(false);
    }

    // Use backend export path for ALL users when backend wallet list is available.
    // This ensures Google OAuth users export from the backend-created sub-org
    // (which the backend has delegated API access to), not the FE-created sub-org.
    const hasBackendWallets = Array.isArray(walletList) && walletList.length > 0;
    const isGooglePath =
      !hasBackendWallets &&
      !isWalletAuth &&
      isGoogleAuthenticated &&
      typeof exportWallet === "function" &&
      !!sessionFromContext?.organizationId;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    abortControllerRef.current = new AbortController();

    setError(null);
    setIframeVisible(false);
    exportNotifiedRef.current = false;

    if (!isTurnkeyReady) {
      if (isGooglePath) {
        setError("Connect with Turnkey and pick a wallet before exporting.");
        setShowLoginModal(true);
      } else {
        setError("No wallet available to export. Please refresh and try again.");
      }
      setStatus("error");
      return;
    }

    const walletIdToUse = selectedWalletId || walletOptions[0]?.id || null;
    const walletMeta = walletOptions.find((w) => w.id === walletIdToUse);
    const organizationIdForWallet = isGooglePath
      ? sessionFromContext?.organizationId || null
      : walletMeta?.organizationId || user?.subOrgId || null;
    const addressForWallet =
      walletMeta?.solanaAddress ||
      walletMeta?.ethereumAddress ||
      walletMeta?.address ||
      walletAddress ||
      undefined;

    if (!walletIdToUse) {
      if (isGooglePath) {
        setError("No Turnkey wallet found. Please sign in again to refresh your wallet list.");
        setShowLoginModal(true);
      } else {
        setError("No wallet available to export. Please refresh and try again.");
      }
      setStatus("error");
      return;
    }

    if (!iframeContainerRef.current) {
      setError("Iframe container not ready.");
      setStatus("error");
      return;
    }

    try {
      setStatus("initializing");

      // Check if this is a Solana-only wallet (we'll decrypt directly for better UX)
      const isSolanaOnly = !!solanaAddress && !monadAddress;

      let publicKey: string;
      let keyPair: { publicKey: string; publicKeyUncompressed: string; privateKey: string } | null = null;
      let stamper: IframeStamper | null = null;

      if (isSolanaOnly) {
        // For Solana-only wallets, generate our own key pair for decryption
        // This allows us to show the key in base58 format directly
        isDev && console.log("[ExportWalletModal] Using direct decryption for Solana key");
        keyPair = generateP256KeyPair();
        publicKey = keyPair.publicKeyUncompressed;
      } else {
        // For EVM or multi-chain wallets, use iframe (standard flow)
        isDev && console.log("[ExportWalletModal] Using iframe for wallet export");
        if (iframeStamperRef.current) {
          iframeStamperRef.current.clear();
        }
        if (typeof document !== "undefined") {
          const existing = document.getElementById("turnkey-export-iframe");
          if (existing?.parentNode) {
            existing.parentNode.removeChild(existing);
          }
        }

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
      }

      setStatus("requesting");

      let exportBundle: string | null = null;
      let isPrivateKeyExport = false;
      try {
        if (isGooglePath) {
          exportBundle = await withTimeout(
            exportWallet!({
              walletId: walletIdToUse,
              targetPublicKey: publicKey,
              organizationId: sessionFromContext?.organizationId,
            }),
            60000,
            "Export request timed out. Please try again."
          );
          organizationIdRef.current = sessionFromContext?.organizationId || null;
          isPrivateKeyExport = false; // Google path doesn't support private key exports currently
        } else {
          if (!BACKEND_URL) {
            throw new Error("Backend URL is not configured.");
          }
          const token = Cookies.get("token");
          if (!token) {
            throw new Error("Please log in again to export your wallet.");
          }

          const response = await withTimeout(
            fetch(`${BACKEND_URL}/api/users/wallet/export`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                walletId: walletIdToUse,
                walletAccountId: walletMeta?.walletAccountId,
                address: addressForWallet,
                targetPublicKey: publicKey,
              }),
              signal: abortControllerRef.current?.signal,
            }),
            60000,
            "Export request timed out. Please try again."
          );

          const responseBody = await response.json().catch(() => ({} as any));
          if (!response.ok) {
            const exportError =
              responseBody?.error || `Failed to export wallet (status ${response.status})`;
            throw new Error(exportError);
          }

          exportBundle = responseBody?.exportBundle || null;
          organizationIdRef.current =
            responseBody?.organizationId || organizationIdForWallet || null;

          // Store whether this is a private key export (uses different iframe method)
          isPrivateKeyExport = responseBody?.isPrivateKey === true;
        }
      } catch (exportErr: any) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        const exportErrorMsg = toLowerCase(exportErr?.message || exportErr?.toString());

        if (
          isGooglePath &&
          (exportErrorMsg.includes("session public key") ||
            exportErrorMsg.includes("session public key could not be found") ||
            (exportErrorMsg.includes("session") &&
              (exportErrorMsg.includes("not found") ||
                exportErrorMsg.includes("expired") ||
                exportErrorMsg.includes("invalid") ||
                exportErrorMsg.includes("could not be found"))))
        ) {
          hasAuthenticatedThisVisitRef.current = false;
          setError("Your session has expired. Please click 'Continue with Google' to sign in again.");
          setStatus("error");
          setFetchedWallets([]);
          walletsRequestRef.current = false;
          setShowLoginModal(true);
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

      if (isSolanaOnly && keyPair) {
        // For Solana-only wallets, decrypt directly and show in base58 format
        isDev && console.log("[ExportWalletModal] Decrypting Solana key directly");
        try {
          // decryptExportBundle with keyFormat: "SOLANA" returns the key in Base58 format directly!
          const base58Key = await decryptExportBundle({
            exportBundle,
            embeddedKey: keyPair.privateKey,
            organizationId: organizationIdRef.current || organizationIdForWallet || "",
            returnMnemonic: false,
            keyFormat: "SOLANA",
          });

          isDev && console.log("[ExportWalletModal] Decrypted Solana key (Base58):", base58Key);

          if (!base58Key || typeof base58Key !== 'string') {
            throw new Error("Failed to decrypt private key");
          }

          // Key is already in Base58 format - no conversion needed!
          setDecryptedSolanaKey(base58Key);
          setIframeVisible(false); // Don't show iframe for Solana
          setStatus("done");
        } catch (decryptErr: any) {
          console.error("Failed to decrypt Solana key:", decryptErr);
          setError(decryptErr?.message || "Failed to decrypt private key");
          setStatus("error");
          return;
        }
      } else {
        // For EVM or multi-chain wallets, use iframe (standard flow)
        if (!stamper) {
          throw new Error("Stamper not initialized");
        }

        let injected: boolean;
        try {
          if (isPrivateKeyExport) {
            // For imported private keys, use injectKeyExportBundle
            isDev && console.log("[ExportWalletModal] Injecting private key export bundle");
            injected = await withTimeout(
              stamper.injectKeyExportBundle(
                exportBundle,
                organizationIdRef.current || organizationIdForWallet || ""
              ),
              30000,
              "Failed to inject export bundle. Please try again."
            );
          } else {
            // For wallets (mnemonic), use injectWalletExportBundle
            isDev && console.log("[ExportWalletModal] Injecting wallet export bundle");
            injected = await withTimeout(
              stamper.injectWalletExportBundle(
                exportBundle,
                organizationIdRef.current || organizationIdForWallet || ""
              ),
              30000,
              "Failed to inject export bundle. Please try again."
            );
          }
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

        setIframeVisible(true);
        setStatus("done");
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    } catch (err: any) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      console.error("Wallet export failed", err);
      setStatus("error");

      const errorMessage = err?.message || err?.toString() || "Unknown error occurred";
      const errorLower = errorMessage.toLowerCase();

      if (
        errorLower.includes("session public key") ||
        errorLower.includes("session public key could not be found") ||
        (errorLower.includes("session") &&
          (errorLower.includes("not found") ||
            errorLower.includes("expired") ||
            errorLower.includes("invalid") ||
            errorLower.includes("could not be found")))
      ) {
        hasAuthenticatedThisVisitRef.current = false;
        setError("Your session has expired. Please click 'Continue with Google' to sign in again.");
        setFetchedWallets([]);
        walletsRequestRef.current = false;
        if (!isWalletAuth) {
          setShowLoginModal(true);
        }
      } else if (errorLower.includes("timed out") || errorLower.includes("timeout")) {
        setError("The export process timed out. Please try again.");
      } else if (
        errorLower.includes("network") ||
        errorLower.includes("fetch") ||
        errorLower.includes("connection")
      ) {
        setError("Network error. Please check your connection and try again.");
      } else if (errorLower.includes("permission") || errorLower.includes("unauthorized")) {
        setError("You don't have permission to export this wallet. Please contact support.");
      } else if (errorLower.includes("wallet") && errorLower.includes("not found")) {
        setError("Wallet not found. Please try selecting a different wallet.");
      } else if (errorLower.includes("iframe") || errorLower.includes("stamper")) {
        setError("Failed to initialize secure export. Please refresh the page and try again.");
      } else {
        setError("Failed to export wallet. Please try again or contact support if the issue persists.");
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [
    isClient,
    isOpen,
    isWalletAuth,
    isGoogleAuthenticated,
    isTurnkeyReady,
    walletOptions,
    selectedWalletId,
    exportWallet,
    sessionFromContext?.organizationId,
    user?.subOrgId,
  ]);

  const handleLoginModalClose = useCallback(async () => {
    setShowLoginModal(false);
    pendingRevealRef.current = false;
  }, []);

  const handleReauthenticate = useCallback(() => {
    setShowLoginModal(true);
  }, []);

  const isForceLockActive = forceExport && !hasConfirmedStorage && status !== "error" && iframeVisible;
  const isCloseDisabled = isForceLockActive;

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
      const message = err?.message || "Failed to confirm backup. Please try again.";
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
    if (status === "initializing" || status === "requesting" || status === "injecting") {
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
    selectedWallet?.solanaAddress && selectedWallet.solanaAddress !== monadAddress
      ? selectedWallet.solanaAddress
      : null;

  useEffect(() => {
    if (!isOpen) return;
    if (status !== "done") return;
    if (exportNotifiedRef.current) return;
    try {
      // Bundle contains both chains; mark both as exported.
      if (typeof window !== "undefined") {
        window.localStorage.setItem("export_ack_sol", "true");
        window.localStorage.setItem("export_ack_monad", "true");
      }
    } catch {
      // Ignore storage failures
    }
    exportNotifiedRef.current = true;
    onExported?.("both");
  }, [isOpen, onExported, status]);

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
            {!isWalletAuth && clientState === ClientState.Ready && !isGoogleAuthenticated && (
              <div className="mb-4">
                <button
                  onClick={handleReauthenticate}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-medium text-[#1A1A1A] transition hover:bg-gray-100"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </button>
                <p className="mt-2 text-[11px] text-[#FF4D7F] text-center">
                  Showing your private keys. DO NOT verify if you are not exporting your private keys.
                </p>
              </div>
            )}

            {/* Wallet Addresses */}
            {selectedWalletId && (
              <div className="mb-3 space-y-2">
                {monadAddress && (
                  <div>
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
                          <rect
                            x="9"
                            y="9"
                            width="13"
                            height="13"
                            rx="2"
                            ry="2"
                            stroke="currentColor"
                            strokeWidth="2"
                          />
                          <path
                            d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                            stroke="currentColor"
                            strokeWidth="2"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                {solanaAddress && (
                  <div>
                    <label className="text-xs text-[#9CA3AF] mb-1.5 block">
                      Solana wallet
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={solanaAddress}
                        className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#17191E] border border-[#2A2B33] text-[#f0f5f5] text-xs font-mono"
                      />
                      <button
                        onClick={() => {
                          if (solanaAddress) {
                            navigator.clipboard.writeText(solanaAddress).then(
                              () => toast.success("Copied to clipboard"),
                              () => toast.error("Failed to copy")
                            );
                          }
                        }}
                        className="text-[#9CA3AF] hover:text-[#f0f5f5] transition-colors"
                      >
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                          <rect
                            x="9"
                            y="9"
                            width="13"
                            height="13"
                            rx="2"
                            ry="2"
                            stroke="currentColor"
                            strokeWidth="2"
                          />
                          <path
                            d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                            stroke="currentColor"
                            strokeWidth="2"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                {monadAddress && solanaAddress && (
                  <p className="text-[11px] text-[#9CA3AF]">
                    Wallets created from recovery phrases export both chains. Imported private keys export the single key.
                  </p>
                )}
              </div>
            )}

            {/* Private Key Area */}
            <div className="mb-3">
              <label className="text-xs text-[#9CA3AF] mb-1.5 block">
                {solanaAddress && !monadAddress ? "Solana Private Key (Base58)" : "Private Key"}
              </label>
              <div className="rounded-lg border border-[#2A2B33] bg-[#121212] p-3 min-h-[100px] relative">
                {/* Solana key display (Base58 format) */}
                {decryptedSolanaKey && (
                  <div className="space-y-2">
                    <div className="relative">
                      <textarea
                        value={decryptedSolanaKey}
                        readOnly
                        className="w-full h-24 px-3 py-2 pr-20 rounded-lg bg-[#17191E] border border-[#70E0B0] text-[#70E0B0] text-xs font-mono resize-none"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(decryptedSolanaKey).then(
                            () => toast.success("Private key copied!"),
                            () => toast.error("Failed to copy")
                          );
                        }}
                        className="absolute top-2 right-2 px-3 py-1.5 bg-[#70E0B0] text-[#1A1A1A] rounded text-xs font-semibold hover:bg-[#58B890] transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="text-xs text-[#9CA3AF]">
                      This is your Solana private key in Base58 format. Use it to import into Phantom, Solflare, or any Solana wallet.
                    </p>
                  </div>
                )}

                {/* Iframe for EVM/multi-chain wallets */}
                <div ref={iframeContainerRef} className={`w-full ${iframeVisible ? "block" : "hidden"}`} />

                {/* Loading state */}
                {!iframeVisible && !decryptedSolanaKey && (
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
                                disabled={!isTurnkeyReady || isActionInProgress}
                                className="px-3 py-1.5 rounded-lg bg-[#374151] text-[#f0f5f5] text-sm font-medium hover:bg-[#4B5563] transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                              >
                                Reveal private key
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Copy-Paste Validation */}
              {(iframeVisible || decryptedSolanaKey) && !copyPasteValidated && (
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

            {forceExport && status === "done" && (iframeVisible || decryptedSolanaKey) && (
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
                  {hasConfirmedStorage
                    ? "Confirmed"
                    : !copyPasteValidated
                    ? "Verify key backup first"
                    : "I stored this key safely"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Login modal for re-authentication */}
      {isClient && !isWalletAuth && (
        <LoginModal open={showLoginModal} onClose={handleLoginModalClose} />
      )}
    </>
  );
}
