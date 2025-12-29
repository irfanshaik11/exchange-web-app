import React, { useCallback, useEffect, useRef, useState } from "react";
import { FaTimes } from "react-icons/fa";
import { AlertTriangle } from "lucide-react";
import { IframeStamper, KeyFormat } from "@turnkey/iframe-stamper";
import Cookies from "js-cookie";
import toast from "react-hot-toast";

interface ImportWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported?: () => Promise<void> | void;
  chain?: "sol" | "monad";
}

export default function ImportWalletModal({
  isOpen,
  onClose,
  onImported,
  chain = "sol",
}: ImportWalletModalProps) {
  const [importMode, setImportMode] = useState<"privateKey" | "mnemonic">("privateKey");
  // Default keyFormat based on chain: "solana" for SOL, "hexadecimal" for EVM chains
  const [keyFormat, setKeyFormat] = useState<"solana" | "hexadecimal">(
    chain === "sol" ? "solana" : "hexadecimal"
  );
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<string>("Preparing secure import…");
  const [importBundle, setImportBundle] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [importUserId, setImportUserId] = useState<string | null>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const stamperRef = useRef<IframeStamper | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [privateKeyInput, setPrivateKeyInput] = useState<string>("");
  const [detectedFormat, setDetectedFormat] = useState<string>("");

  const resetState = useCallback(() => {
    setImportMode("privateKey");
    // Reset keyFormat to default based on chain
    setKeyFormat(chain === "sol" ? "solana" : "hexadecimal");
    setError("");
    setStatus("Preparing secure import…");
    setImportBundle(null);
    setOrganizationId(null);
    setImportUserId(null);
    setIframeReady(false);
    setPrivateKeyInput("");
    setDetectedFormat("");
    if (stamperRef.current) {
      try {
        stamperRef.current.clear();
      } catch (err) {
        console.warn("Failed to clear iframe stamper", err);
      }
      stamperRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetState();
      return;
    }

    let cancelled = false;

    const setupIframe = async () => {
      setIsImporting(true);
      setError("");
      setStatus("Preparing secure import…");
      try {
        const token = Cookies.get("token");
        if (!token) {
          throw new Error("Please log in first");
        }

        const initUrl =
          importMode === "privateKey"
            ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/users/turnkey/import-key/init`
            : `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/users/turnkey/import/init`;

        const initRes = await fetch(initUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        const initData = await initRes.json().catch(() => ({}));
        if (!initRes.ok) {
          throw new Error(
            initData.error || initData.message || "Failed to initialize import"
          );
        }
        if (cancelled) return;

        setImportBundle(initData.importBundle);
        setOrganizationId(initData.organizationId || null);
        setImportUserId(initData.importUserId || initData.userId || null);

        const container =
          containerRef.current ||
          document.getElementById("turnkey-import-iframe-container");

        const stamper = new IframeStamper({
          iframeUrl: "https://import.turnkey.com",
          iframeContainer: container || undefined,
          iframeElementId: "turnkey-import-iframe",
          clearClipboardOnPaste: true,
        });

        await stamper.init();
        await stamper.applySettings({
          styles: {
            width: "100%",
            height: "160px",
            borderRadius: "10px",
            borderWidth: "1px",
            borderStyle: "solid",
            borderColor: "rgba(112, 224, 176, 0.35)",
            backgroundColor: "#0b0c0f",
            color: "#e5e7eb",
            fontSize: "14px",
            padding: "12px",
          },
        });

        stamperRef.current = stamper;
        setIframeReady(true);
        setStatus(
          importMode === "privateKey"
            ? "Paste your key into Step 1 above for auto-detection, or paste directly into the secure field."
            : "Enter your recovery phrase in the secure iframe, then click Import."
        );
      } catch (err: any) {
        if (cancelled) return;
        console.error("Import init failed", err);
        setError(err?.message || "Failed to initialize import");
      } finally {
        if (!cancelled) {
          setIsImporting(false);
        }
      }
    };

    setupIframe();

    return () => {
      cancelled = true;
      if (stamperRef.current) {
        try {
          stamperRef.current.clear();
        } catch (err) {
          // ignore cleanup errors
        }
        stamperRef.current = null;
      }
    };
  }, [isOpen, resetState, importMode]);

  // Update keyFormat when chain prop changes
  useEffect(() => {
    if (!isImporting && importMode === "privateKey") {
      setKeyFormat(chain === "sol" ? "solana" : "hexadecimal");
    }
  }, [chain, isImporting, importMode]);

  // Auto-detect key format based on input
  const detectKeyFormat = (key: string): "solana" | "hexadecimal" | null => {
    const trimmed = key.trim();

    // Check for hex format (0x... or plain hex)
    if (trimmed.startsWith("0x") || /^[0-9a-fA-F]{64}$/.test(trimmed)) {
      return "hexadecimal";
    }

    // Check for base58 (Solana format) - typically 87-88 characters
    // Base58 uses characters: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
    if (/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(trimmed)) {
      return "solana";
    }

    // Check for shorter base58 (also valid)
    if (/^[1-9A-HJ-NP-Za-km-z]{43,88}$/.test(trimmed)) {
      return "solana";
    }

    return null;
  };

  // Handle private key input change with auto-detection
  const handlePrivateKeyChange = (value: string) => {
    setPrivateKeyInput(value);
    setError("");

    const detected = detectKeyFormat(value);
    if (detected) {
      setDetectedFormat(detected);
      setKeyFormat(detected);
    } else if (value.trim()) {
      setDetectedFormat("unknown");
    } else {
      setDetectedFormat("");
    }
  };

  // Inject private key into iframe (for private key mode)
  const injectKeyIntoIframe = async () => {
    if (!stamperRef.current || !privateKeyInput.trim() || importMode !== "privateKey") {
      return false;
    }

    try {
      // For Turnkey iframe, we need to programmatically set the input value
      // The iframe should be ready to accept the format we detected
      const iframe = document.getElementById("turnkey-import-iframe") as HTMLIFrameElement;
      if (!iframe || !iframe.contentWindow) {
        throw new Error("Iframe not ready");
      }

      // Use the stamper's public API if available to inject text
      // Note: This is a workaround - Turnkey iframe may not have a direct text injection API
      // If this doesn't work, we'll need to use clipboard injection

      // Try using clipboard injection as a fallback
      try {
        await navigator.clipboard.writeText(privateKeyInput.trim());
        setStatus("Key copied to clipboard. Paste it into the secure iframe below (Ctrl/Cmd+V).");
      } catch (clipErr) {
        console.warn("Clipboard write failed:", clipErr);
      }

      return true;
    } catch (err) {
      console.error("Failed to inject key:", err);
      return false;
    }
  };


  const handleImport = async () => {
    if (
      !iframeReady ||
      !importBundle ||
      !organizationId ||
      !importUserId ||
      !stamperRef.current
    ) {
      setError("Importer not ready. Please close and try again.");
      return;
    }

    setIsImporting(true);
    setError("");
    setStatus("Encrypting and importing…");

    try {
      const token = Cookies.get("token");
      if (!token) {
        throw new Error("Please log in first");
      }

      const injected = await stamperRef.current.injectImportBundle(
        importBundle,
        organizationId,
        importUserId
      );
      if (!injected) {
        throw new Error("Failed to prepare secure iframe");
      }

      let encryptedBundle: string | null = null;
      let finalizeUrl: string;
      let body: any;
      const walletLabelPrefix = "Imported Wallet";

      if (importMode === "privateKey") {
        // Map our keyFormat to Turnkey's expected KeyFormat enum
        // Turnkey expects: KeyFormat.Solana for base58 keys, KeyFormat.Hexadecimal for 0x keys
        const turnkeyFormat = keyFormat === "solana" ? KeyFormat.Solana : KeyFormat.Hexadecimal;

        encryptedBundle = await stamperRef.current.extractKeyEncryptedBundle(turnkeyFormat);

        if (!encryptedBundle) {
          throw new Error("Failed to encrypt private key bundle");
        }

        finalizeUrl = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/users/turnkey/import-key/finalize`;
        body = {
          encryptedBundle,
          keyFormat: keyFormat, // Backend will normalize this
          privateKeyName: `${walletLabelPrefix} Private Key`,
        };
      } else {
        encryptedBundle =
          await stamperRef.current.extractWalletEncryptedBundle();
        if (!encryptedBundle) {
          throw new Error("Failed to encrypt import bundle");
        }
        finalizeUrl = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/users/turnkey/import/finalize`;
        body = {
          encryptedBundle,
          walletName: walletLabelPrefix,
        };
      }

      const finalizeRes = await fetch(finalizeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const finalizeData = await finalizeRes.json().catch(() => ({}));
      if (!finalizeRes.ok) {
        throw new Error(
          finalizeData.error ||
            finalizeData.message ||
            "Failed to import wallet"
        );
      }

      // Determine which chain the imported wallet belongs to based on keyFormat
      const importedChain =
        importMode === "mnemonic"
          ? walletLabelPrefix.includes("Solana")
            ? "SOL"
            : "EVM/MON"
          : keyFormat === "solana"
            ? "SOL"
            : keyFormat === "hexadecimal"
              ? "EVM/MON"
              : "wallet";

      // Show helpful message if importing EVM wallet
      if (keyFormat === "hexadecimal") {
        toast.success(`${importedChain} wallet imported securely! Switch to MON chain to view it.`, { duration: 5000 });
      } else {
        toast.success(`${importedChain} wallet imported securely`);
      }

      if (onImported) {
        await onImported();
      }
      try {
        window.dispatchEvent(new Event("wallets-updated"));
      } catch {
        // ignore
      }
      handleClose();
    } catch (err: any) {
      console.error("Import failed", err);
      setError(err?.message || "Failed to import wallet");
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    if (isImporting) return;
    resetState();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={handleClose}
    >
      <div
        className="bg-[#101114] rounded-lg shadow-2xl w-full max-w-lg relative border border-[#2A2B33]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[#2A2B33]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#f0f5f5]">
                Import Wallet
              </h2>
              <p className="text-xs text-[#9CA3AF]">
                Secure Turnkey iframe import ({chain === "monad" ? "MON" : "SOL"}
                /EVM ready)
              </p>
            </div>
            <button
              className="text-[#9CA3AF] hover:text-[#f0f5f5] text-xl font-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleClose}
              disabled={isImporting}
              aria-label="Close import modal"
            >
              <FaTimes />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex gap-2">
            <button
              className={`flex-1 px-3 py-2 rounded-md border ${importMode === "privateKey" ? "border-[#70E0B0] text-[#f0f5f5]" : "border-[#2A2B33] text-[#9CA3AF]"}`}
              onClick={() => {
                if (!isImporting) {
                  setImportMode("privateKey");
                  // Reset to default format based on chain when switching modes
                  setKeyFormat(chain === "sol" ? "solana" : "hexadecimal");
                }
              }}
              disabled={isImporting}
            >
              Import Private Key
            </button>
            <button
          className={`flex-1 px-3 py-2 rounded-md border ${importMode === "mnemonic" ? "border-[#70E0B0] text-[#f0f5f5]" : "border-[#2A2B33] text-[#9CA3AF]"}`}
          onClick={() => {
            if (!isImporting) {
              setImportMode("mnemonic");
            }
          }}
          disabled={isImporting}
            >
              Import Recovery Phrase
            </button>
          </div>

          <div className="p-3 rounded-lg bg-[#0b0c0f] border border-[#2A2B33]">
            {importMode === "privateKey" && (
              <div className="space-y-3 mb-3">
                {/* Step 1: Paste private key here for auto-detection */}
                <div>
                  <div className="text-xs font-semibold text-[#f0f5f5] mb-2">
                    Step 1: Paste your private key here
                  </div>
                  <textarea
                    value={privateKeyInput}
                    onChange={(e) => handlePrivateKeyChange(e.target.value)}
                    placeholder="Paste your private key (base58 for Solana, 0x... for EVM)"
                    disabled={isImporting}
                    className="w-full h-20 px-3 py-2 bg-[#0b0c0f] border border-[#2A2B33] rounded-md text-sm text-[#f0f5f5] placeholder-[#6B7280] focus:border-[#70E0B0] focus:outline-none resize-none"
                    style={{ fontFamily: "monospace" }}
                  />
                  {detectedFormat && detectedFormat !== "unknown" && (
                    <div className="mt-1 text-xs text-[#70E0B0] flex items-center gap-1">
                      ✓ Detected: {detectedFormat === "solana" ? "Solana (base58)" : "EVM (hex)"}
                    </div>
                  )}
                  {detectedFormat === "unknown" && (
                    <div className="mt-1 text-xs text-[#FF6B35]">
                      ⚠️ Unrecognized format. Please check your key.
                    </div>
                  )}
                </div>

                {/* Step 2: Format confirmation */}
                {privateKeyInput.trim() && detectedFormat && detectedFormat !== "unknown" && (
                  <div>
                    <div className="text-xs font-semibold text-[#f0f5f5] mb-2">
                      Step 2: Confirm format
                    </div>
                    <div className="text-xs text-[#9CA3AF] bg-[#1A1B23] border border-[#2A2B33] rounded-md p-3">
                      Your key will be imported as:{" "}
                      <span className="text-[#70E0B0] font-semibold">
                        {keyFormat === "solana" ? "Solana wallet" : "EVM/Monad wallet"}
                      </span>
                    </div>
                  </div>
                )}

                {/* Step 3: Copy to secure field */}
                {privateKeyInput.trim() && detectedFormat && detectedFormat !== "unknown" && (
                  <div>
                    <div className="text-xs font-semibold text-[#f0f5f5] mb-2">
                      Step 3: Transfer to secure field
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(privateKeyInput.trim());
                          setStatus("✓ Copied! Now paste into the secure field below (Ctrl/Cmd+V)");
                          toast.success("Copied to clipboard");
                        } catch (err) {
                          setError("Failed to copy to clipboard. Please copy manually.");
                        }
                      }}
                      disabled={isImporting}
                      className="w-full px-4 py-2 bg-[#2A2B33] hover:bg-[#3A3B43] text-[#f0f5f5] rounded-md text-sm transition-colors"
                    >
                      📋 Copy key to clipboard
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Secure iframe field */}
            <div>
              <div className="text-xs text-[#9CA3AF] mb-2">{status}</div>
              <div
                id="turnkey-import-iframe-container"
                ref={containerRef}
                className="w-full"
              >
                {!iframeReady && (
                  <div className="h-40 rounded-lg bg-[#111319] border border-dashed border-[#2A2B33] flex items-center justify-center text-sm text-[#6B7280]">
                    Loading secure iframe…
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-[#FF4D7F]/10 border border-[#FF4D7F]/20 text-sm text-[#FF4D7F]">
              {error}
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={isImporting || !iframeReady || !importBundle || (importMode === "privateKey" && detectedFormat === "unknown")}
            className="w-full py-3 rounded-lg bg-gradient-to-r from-[#70E0B0] to-[#58B890] text-[#1A1A1A] font-semibold transition-all duration-300 hover:from-[#58B890] hover:to-[#70E0B0] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isImporting ? "Importing…" : "Import Wallet"}
          </button>
          {importMode === "privateKey" && detectedFormat === "unknown" && privateKeyInput.trim() && (
            <div className="text-xs text-[#FF6B35] text-center mt-2">
              Please enter a valid private key format
            </div>
          )}

          <div className="p-3 rounded-lg bg-[#0b0c0f] border border-[#2A2B33] text-xs text-[#9CA3AF] flex gap-2">
            <AlertTriangle className="text-[#FFB74D] mt-0.5 flex-shrink-0" size={16} />
            <div>
              We never see your recovery phrase. It is encrypted directly to
              Turnkey using their hosted iframe, so keys stay under your control
              while remaining tradable from the backend.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
