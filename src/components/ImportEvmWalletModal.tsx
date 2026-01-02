import React, { useCallback, useEffect, useRef, useState } from "react";
import { FaTimes } from "react-icons/fa";
import { AlertTriangle } from "lucide-react";
import { IframeStamper } from "@turnkey/iframe-stamper";
import { encryptPrivateKeyToBundle } from "@turnkey/crypto";
import Cookies from "js-cookie";
import toast from "react-hot-toast";

interface ImportEvmWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported?: () => Promise<void> | void;
}

export default function ImportEvmWalletModal({
  isOpen,
  onClose,
  onImported,
}: ImportEvmWalletModalProps) {
  const [importMode, setImportMode] = useState<"privateKey" | "mnemonic">("privateKey");
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
  const importInProgressRef = useRef<boolean>(false);

  const resetState = useCallback(() => {
    setImportMode("privateKey");
    setError("");
    setStatus("Preparing secure import…");
    setImportBundle(null);
    setOrganizationId(null);
    setImportUserId(null);
    setIframeReady(false);
    setPrivateKeyInput("");
    importInProgressRef.current = false;
    if (stamperRef.current) {
      try {
        stamperRef.current.clear();
      } catch (err) {
        console.warn("Failed to clear iframe stamper", err);
      }
      stamperRef.current = null;
    }
    // Manually remove iframe element if it still exists
    const existingIframe = document.getElementById("turnkey-import-evm-iframe");
    if (existingIframe) {
      existingIframe.remove();
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetState();
      return;
    }

    // Only need iframe for mnemonic mode
    if (importMode !== "mnemonic") {
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

        const initUrl = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/users/turnkey/import/init`;

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
          document.getElementById("turnkey-import-evm-iframe-container");

        const stamper = new IframeStamper({
          iframeUrl: "https://import.turnkey.com",
          iframeContainer: container || undefined,
          iframeElementId: "turnkey-import-evm-iframe",
          clearClipboardOnPaste: true,
        });

        await stamper.init();
        await stamper.applySettings({
          styles: {
            width: "280px",
            height: "120px",
            borderRadius: "8px",
            borderWidth: "1px",
            borderStyle: "solid",
            borderColor: "rgba(112, 224, 176, 0.35)",
            backgroundColor: "#0b0d0f",
            color: "#e5e7eb",
            fontSize: "14px"
          },
        });

        stamperRef.current = stamper;
        setIframeReady(true);
        setStatus("Enter your EVM/Monad recovery phrase in the secure field below.");
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
      // Manually remove iframe element if it still exists
      const existingIframe = document.getElementById("turnkey-import-evm-iframe");
      if (existingIframe) {
        existingIframe.remove();
      }
    };
  }, [isOpen, resetState, importMode]);

  const handleImport = async () => {
    // Prevent duplicate submissions
    if (importInProgressRef.current) {
      console.warn("Import already in progress, ignoring duplicate click");
      return;
    }

    importInProgressRef.current = true;
    setIsImporting(true);
    setError("");
    setStatus("Encrypting and importing…");

    try {
      const token = Cookies.get("token");
      if (!token) {
        throw new Error("Please log in first");
      }

      let encryptedBundle: string | null = null;
      let finalizeUrl: string;
      let body: any;

      if (importMode === "privateKey") {
        // Non-iframe method for EVM private keys (accepts hex directly)
        if (!privateKeyInput.trim()) {
          throw new Error("Please enter your private key");
        }

        // Initialize import
        const initRes = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/users/turnkey/import-key/init`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          }
        );
        const initData = await initRes.json().catch(() => ({}));
        if (!initRes.ok) {
          throw new Error(initData.error || "Failed to initialize import");
        }

        // Encrypt private key to bundle using @turnkey/crypto
        encryptedBundle = await encryptPrivateKeyToBundle({
          privateKey: privateKeyInput.trim(),
          keyFormat: "HEXADECIMAL",
          importBundle: initData.importBundle,
          userId: initData.importUserId || initData.userId,
          organizationId: initData.organizationId,
        });

        finalizeUrl = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/users/turnkey/import-key/finalize`;
        body = {
          encryptedBundle,
          keyFormat: "hexadecimal",
          privateKeyName: "Imported EVM Private Key",
        };
      } else {
        // Iframe method for mnemonic
        if (!iframeReady || !importBundle || !organizationId || !importUserId || !stamperRef.current) {
          throw new Error("Importer not ready. Please close and try again.");
        }

        const injected = await stamperRef.current.injectImportBundle(
          importBundle,
          organizationId,
          importUserId
        );
        if (!injected) {
          throw new Error("Failed to prepare secure iframe");
        }

        encryptedBundle = await stamperRef.current.extractWalletEncryptedBundle();
        if (!encryptedBundle) {
          throw new Error("Failed to encrypt import bundle");
        }

        finalizeUrl = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/users/turnkey/import/finalize`;
        body = {
          encryptedBundle,
          walletName: "Imported Wallet",
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

      // Clear the private key from memory
      setPrivateKeyInput("");

      toast.success("EVM/Monad wallet imported securely! Switch to MON chain to view it.", { duration: 5000 });
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
      importInProgressRef.current = false;
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
        className="bg-[#0b0d0f] rounded-lg shadow-2xl w-full max-w-[340px] relative border border-[#2A2B33]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[#2A2B33]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#f0f5f5]">
                Import EVM/Monad Wallet
              </h2>
              <p className="text-xs text-[#9CA3AF]">
                Secure Turnkey iframe import for EVM/Monad (MON)
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
              className={`flex-1 px-3 py-2 rounded-md border text-xs ${importMode === "privateKey" ? "border-[#70E0B0] text-[#f0f5f5]" : "border-[#2A2B33] text-[#9CA3AF]"}`}
              onClick={() => {
                if (!isImporting) {
                  setImportMode("privateKey");
                }
              }}
              disabled={isImporting}
            >
              Import Private Key
            </button>
            <button
          className={`flex-1 px-3 py-2 rounded-md border text-xs ${importMode === "mnemonic" ? "border-[#70E0B0] text-[#f0f5f5]" : "border-[#2A2B33] text-[#9CA3AF]"}`}
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

          {importMode === "privateKey" ? (
            <div className="p-3 rounded-lg bg-[#0b0c0f] border border-[#2A2B33]">
              <div className="text-xs text-[#9CA3AF] mb-2">
                Paste your EVM/Monad private key below (hex format with 0x prefix)
              </div>
              <textarea
                value={privateKeyInput}
                onChange={(e) => setPrivateKeyInput(e.target.value)}
                placeholder="Paste your EVM/Monad private key here (e.g., 0x...)"
                disabled={isImporting}
                className="w-full h-32 px-3 py-2 bg-[#1A1B23] border border-[#2A2B33] rounded-md text-sm text-[#f0f5f5] placeholder-[#6B7280] focus:border-[#70E0B0] focus:outline-none resize-none font-mono"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          ) : (
            <div>
              <div className="text-xs text-[#9CA3AF] mb-2">{status}</div>
              <div
                id="turnkey-import-evm-iframe-container"
                ref={containerRef}
                className="w-full"
                style={{ minHeight: "120px", minWidth: "280px" }}
              >
                {!iframeReady && (
                  <div className="rounded-lg bg-[#111319] border border-dashed border-[#2A2B33] flex items-center justify-center text-sm text-[#6B7280]" style={{ height: "120px", width: "280px" }}>
                    Loading secure iframe…
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-[#FF4D7F]/10 border border-[#FF4D7F]/20 text-sm text-[#FF4D7F]">
              {error}
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={
              isImporting ||
              (importMode === "privateKey" ? !privateKeyInput.trim() : (!iframeReady || !importBundle))
            }
            className="w-full py-2 rounded-lg bg-gradient-to-r from-[#70E0B0] to-[#58B890] text-[#1A1A1A] font-semibold text-sm transition-all duration-300 hover:from-[#58B890] hover:to-[#70E0B0] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isImporting ? "Importing…" : "Import EVM/Monad Wallet"}
          </button>

          <div className="p-3 rounded-lg bg-[#0b0c0f] border border-[#2A2B33] text-xs text-[#9CA3AF] flex gap-2">
            <AlertTriangle className="text-[#FFB74D] mt-0.5 flex-shrink-0" size={16} />
            <div>
              We never see your keys. They are encrypted directly to
              Turnkey using their hosted iframe, so keys stay under your control
              while remaining tradable from the backend.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
