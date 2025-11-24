import { generateP256KeyPair } from "@turnkey/crypto";

const STORAGE_KEYS = {
  publicKey: "turnkey:session:public",
  publicKeyUncompressed: "turnkey:session:public_uncompressed",
  privateKey: "turnkey:session:private",
};

export type TurnkeySessionKeypair = {
  publicKey: string;
  publicKeyUncompressed: string;
  privateKey: string;
};

const isBrowser = () => typeof window !== "undefined";

export function persistTurnkeySessionKeypair(keypair: TurnkeySessionKeypair) {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEYS.publicKey, keypair.publicKey);
    window.sessionStorage.setItem(
      STORAGE_KEYS.publicKeyUncompressed,
      keypair.publicKeyUncompressed,
    );
    window.sessionStorage.setItem(STORAGE_KEYS.privateKey, keypair.privateKey);
  } catch (error) {
    console.warn("Failed to persist Turnkey session keypair", error);
  }
}

export function clearTurnkeySessionKeypair() {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEYS.publicKey);
    window.sessionStorage.removeItem(STORAGE_KEYS.publicKeyUncompressed);
    window.sessionStorage.removeItem(STORAGE_KEYS.privateKey);
  } catch (error) {
    console.warn("Failed to clear Turnkey session keypair", error);
  }
}

export function getStoredTurnkeySession(): TurnkeySessionKeypair | null {
  if (!isBrowser()) return null;
  const publicKey = window.sessionStorage.getItem(STORAGE_KEYS.publicKey);
  const publicKeyUncompressed = window.sessionStorage.getItem(
    STORAGE_KEYS.publicKeyUncompressed,
  );
  const privateKey = window.sessionStorage.getItem(STORAGE_KEYS.privateKey);

  if (!publicKey || !publicKeyUncompressed || !privateKey) {
    return null;
  }

  return { publicKey, publicKeyUncompressed, privateKey };
}

export function generateTurnkeySessionKeypair(): TurnkeySessionKeypair {
  const keypair = generateP256KeyPair();
  const sessionKeypair: TurnkeySessionKeypair = {
    publicKey: keypair.publicKey,
    publicKeyUncompressed: keypair.publicKeyUncompressed,
    privateKey: keypair.privateKey,
  };
  persistTurnkeySessionKeypair(sessionKeypair);
  return sessionKeypair;
}

export function generatePkceVerifier(length = 64) {
  const verifierLength = Math.min(Math.max(length, 43), 128);
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  if (!isBrowser() || typeof window.crypto?.getRandomValues !== "function") {
    let fallback = "";
    for (let i = 0; i < verifierLength; i++) {
      fallback += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return fallback;
  }

  const randomValues = new Uint8Array(verifierLength);
  window.crypto.getRandomValues(randomValues);

  return Array.from(randomValues)
    .map((value) => charset.charAt(value % charset.length))
    .join("");
}

