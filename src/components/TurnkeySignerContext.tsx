"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import bs58 from "bs58";
import { useTurnkey, ClientState, AuthState } from "../lib/turnkeyWalletKit";
import {
  Connection,
  VersionedTransaction,
  PublicKey,
} from "@solana/web3.js";

import { env } from "../env";

export type TurnkeySignerContextValue = {
  requestSignature: (params: {
    unsignedTxBase64: string;
    signerPublicKey: string;
  }) => Promise<{
    signedTransaction: VersionedTransaction;
    signature: string;
  }>;
  broadcastSignedTransaction: (params: {
    transaction: VersionedTransaction;
    rpcUrls?: string[];
  }) => Promise<{ signature: string; submittedTo: string[] }>;
  isTurnkeyReady: boolean;
};

const TurnkeySignerContext = createContext<TurnkeySignerContextValue | null>(null);

export const TurnkeySignerProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const turnkey = useTurnkey();
  const [isInitialized, setIsInitialized] = useState(false);

  const ensureWalletSelection = useCallback(async () => {
    // Check if Turnkey is ready based on clientState
    if (turnkey?.clientState === ClientState.Ready || turnkey?.authState === AuthState.Authenticated) {
      setIsInitialized(true);
      return;
    }
    // Initialize if needed
    if (turnkey?.clientState === ClientState.Loading || turnkey?.authState === AuthState.Unauthenticated) {
      // Wallet selection will happen automatically when signing
      setIsInitialized(true);
    }
  }, [turnkey]);

  const requestSignature = useCallback<TurnkeySignerContextValue["requestSignature"]>(
    async ({ unsignedTxBase64, signerPublicKey }) => {
      await ensureWalletSelection();

      const transaction = VersionedTransaction.deserialize(
        Buffer.from(unsignedTxBase64, "base64")
      );

      // Find the signer index in the transaction's message account keys
      const signerPublicKeyObj = new PublicKey(signerPublicKey);
      const signerIndex = transaction.message.staticAccountKeys.findIndex(
        (key) => key.equals(signerPublicKeyObj)
      );

      if (signerIndex === -1) {
        throw new Error("Signer public key not found in transaction account keys");
      }

      // Sign the transaction using Turnkey
      // Get the first wallet account if available
      const walletAccount = turnkey?.wallets?.[0]?.accounts?.[0];
      if (!walletAccount) {
        throw new Error("No wallet account available for signing");
      }

      const signatureBase64 = await turnkey?.signTransaction?.({
        unsignedTransaction: unsignedTxBase64,
        transactionType: "TRANSACTION_TYPE_SOLANA" as any,
        walletAccount: walletAccount,
      });

      if (!signatureBase64 || typeof signatureBase64 !== "string") {
        throw new Error("Turnkey signer did not return a signature");
      }

      const rawSignature = Buffer.from(signatureBase64, "base64");

      // Ensure signatures array is initialized
      if (!transaction.signatures || transaction.signatures.length === 0) {
        transaction.signatures = [new Uint8Array(64)];
      }

      // Set the signature at the correct index
      if (signerIndex < transaction.signatures.length) {
        transaction.signatures[signerIndex] = new Uint8Array(rawSignature);
      } else {
        // Extend array if needed
        while (transaction.signatures.length <= signerIndex) {
          transaction.signatures.push(new Uint8Array(64));
        }
        transaction.signatures[signerIndex] = new Uint8Array(rawSignature);
      }

      return {
        signedTransaction: transaction,
        signature: bs58.encode(rawSignature),
      };
    },
    [ensureWalletSelection, turnkey]
  );

  const broadcastSignedTransaction = useCallback<
    TurnkeySignerContextValue["broadcastSignedTransaction"]
  >(
    async ({ transaction, rpcUrls }) => {
      const endpoints = rpcUrls?.length
        ? rpcUrls
        : [env.NEXT_PUBLIC_SOLANA_RPC].filter(Boolean) as string[];

      if (!endpoints.length) {
        throw new Error("No RPC endpoints configured");
      }

      const serialized = transaction.serialize();
      const signature = transaction.signatures[0] 
        ? bs58.encode(transaction.signatures[0])
        : bs58.encode(Buffer.alloc(0));

      await Promise.all(
        endpoints.map(async (rpcUrl) => {
          const connection = new Connection(rpcUrl, "confirmed");
          try {
            await connection.sendRawTransaction(serialized, {
              skipPreflight: false,
              maxRetries: 2,
            });
          } catch (error) {
            console.warn("Failed to submit to RPC", rpcUrl, error);
          }
        })
      );

      return {
        signature,
        submittedTo: endpoints,
      };
    },
    []
  );

  const value = useMemo<TurnkeySignerContextValue>(
    () => ({
      requestSignature,
      broadcastSignedTransaction,
      isTurnkeyReady: isInitialized,
    }),
    [broadcastSignedTransaction, isInitialized, requestSignature]
  );

  return (
    <TurnkeySignerContext.Provider value={value}>
      {children}
    </TurnkeySignerContext.Provider>
  );
};

export const useTurnkeySigner = () => {
  return useContext(TurnkeySignerContext);
};
