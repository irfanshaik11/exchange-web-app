import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import ExportWalletModal from "./ExportWalletModal";
import { useUser } from "./UserContext";
import { acknowledgeWalletExport } from "../utils/api";

export default function WalletExportGuard() {
  const { user, refreshUser, primaryWalletAddresses } = useUser();
  const [forceOpen, setForceOpen] = useState(false);

  const mustForce =
    !!user && user.hasExportedWallet === false;
  const derivedAddress =
    primaryWalletAddresses?.ethereum ||
    primaryWalletAddresses?.solana ||
    user?.publicKey ||
    undefined;

  useEffect(() => {
    setForceOpen(mustForce);
  }, [mustForce]);

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
