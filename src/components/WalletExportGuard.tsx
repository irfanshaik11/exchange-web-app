import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import ExportWalletModal from "./ExportWalletModal";
import { useUser } from "./UserContext";
import { acknowledgeWalletExport } from "../utils/api";

export default function WalletExportGuard() {
  const { user, refreshUser, primaryWalletAddresses, walletList } = useUser();
  const [forceOpen, setForceOpen] = useState(false);
  const [preferredChain, setPreferredChain] = useState<"sol" | "monad">("sol");

  const needsExportFlags = () => {
    if (typeof window === "undefined") {
      return { sol: false, monad: false };
    }
    const sol = window.localStorage.getItem("export_ack_sol") !== "true";
    const monad = window.localStorage.getItem("export_ack_monad") !== "true";
    return { sol, monad };
  };

  const { sol: needsSol, monad: needsMonad } = needsExportFlags();

  const mustForce = false; // disabled: !!user && (user.hasExportedWallet === false || needsSol || needsMonad);
  // Prefer backend wallet list (authoritative) over SDK-derived addresses
  const primaryWallet = walletList?.find((w: any) => w.isPrimary) ?? walletList?.[0];
  const derivedAddress =
    primaryWallet?.solanaAddress?.trim() ||
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

  if (!forceOpen) return null;

  return (
    <ExportWalletModal
      isOpen={forceOpen}
      onClose={handleClose}
      forceExport
      walletId={user?.walletId || undefined}
      walletAddress={derivedAddress}
      onForceExportConfirmed={handleConfirm}
    />
  );
}
