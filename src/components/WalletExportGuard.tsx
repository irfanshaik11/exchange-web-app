import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import ExportWalletModal from "./ExportWalletModal";
import { useUser } from "./UserContext";
import { acknowledgeWalletExport } from "../utils/api";

export default function WalletExportGuard() {
  const { user, refreshUser, primaryWalletAddresses } = useUser();
  const [forceOpen, setForceOpen] = useState(false);
  const [preferredChain, setPreferredChain] = useState<"sol" | "monad">("monad");

  const needsExportFlags = () => {
    if (typeof window === "undefined") {
      return { sol: false, monad: false };
    }
    const sol = window.localStorage.getItem("export_ack_sol") !== "true";
    const monad = window.localStorage.getItem("export_ack_monad") !== "true";
    return { sol, monad };
  };

  const { sol: needsSol, monad: needsMonad } = needsExportFlags();

  const mustForce = !!user && (user.hasExportedWallet === false || needsSol || needsMonad);
  const derivedAddress =
    primaryWalletAddresses?.ethereum ||
    primaryWalletAddresses?.solana ||
    user?.publicKey ||
    undefined;

  useEffect(() => {
    setForceOpen(mustForce);
    if (needsSol) {
      setPreferredChain("sol");
    } else if (needsMonad) {
      setPreferredChain("monad");
    } else {
      setPreferredChain("monad");
    }
  }, [mustForce, needsMonad, needsSol]);

  const handleClose = useCallback(() => {
    if (mustForce) {
      toast.error("Please export and store your key safely before continuing.");
      return;
    }
    setForceOpen(false);
  }, [mustForce]);

  const handleConfirm = useCallback(async () => {
    if (!user?.bearerToken) {
      throw new Error("Missing authentication. Please log in again.");
    }
    try {
      await acknowledgeWalletExport(user.bearerToken);
      await refreshUser();
    } catch (error: any) {
      console.error("Failed to acknowledge wallet export", error);
      const message =
        error?.message || "Failed to confirm backup. Please try again.";
      throw new Error(message);
    }
  }, [refreshUser, user?.bearerToken]);

  const handleExported = useCallback(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("export_ack_sol", "true");
        window.localStorage.setItem("export_ack_monad", "true");
      }
    } catch {
      // ignore
    }
    setForceOpen(false);
  }, []);

  if (!forceOpen) return null;

  return (
    <ExportWalletModal
      isOpen={forceOpen}
      onClose={handleClose}
      forceExport
      walletId={user?.walletId || undefined}
      walletAddress={derivedAddress}
      onForceExportConfirmed={handleConfirm}
      onExported={handleExported}
    />
  );
}
