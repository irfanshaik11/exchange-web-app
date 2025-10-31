import { PublicKey } from "@solana/web3.js";

export function isValidSolanaAddress(address: string) {
  try {
    const pubkey = new PublicKey(address);
    const isValid = PublicKey.isOnCurve(pubkey.toBytes());
    return isValid;
  } catch (e) {
    return false;
  }
}
