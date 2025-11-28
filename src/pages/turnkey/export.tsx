import Head from "next/head";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Lock, ShieldCheck } from "lucide-react";
import { IframeStamper } from "@turnkey/iframe-stamper";
import { useRouter } from "next/router";

import Header from "~/components/Header";
import Footer from "~/components/Footer";
import {
  AuthState,
  ClientState,
  WalletSource,
  useTurnkey,
} from "~/lib/turnkeyWalletKit";

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

export default function TurnkeyExportPage() {
  const router = useRouter();
  const { walletId: walletIdQuery } = router.query;
  const turnkey = useTurnkey() as any;
  const { authState, clientState, wallets = [], session, exportWallet } =
    turnkey || {};

  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [iframeVisible, setIframeVisible] = useState(false);
  const [targetPublicKey, setTargetPublicKey] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  const iframeContainerRef = useRef<HTMLDivElement | null>(null);
  const iframeStamperRef = useRef<IframeStamper | null>(null);

  useEffect(() => {
    setIsClient(true);
    return () => {
      iframeStamperRef.current?.clear();
    };
  }, []);

  const walletOptions = useMemo(() => {
    return (wallets as any[]).reduce<
      { id: string; name: string; source?: string }[]
    >((acc, wallet) => {
      const id = wallet?.walletId || wallet?.id;
      if (!id) return acc;
      const name =
        wallet?.walletName ||
        wallet?.name ||
        `Wallet ${acc.length + 1}`;
      acc.push({
        id,
        name,
        source: wallet?.source,
      });
      return acc;
    }, []);
  }, [wallets]);

  useEffect(() => {
    if (selectedWalletId || !walletOptions.length) return;
    if (typeof walletIdQuery === "string") {
      const match = walletOptions.find((w) => w.id === walletIdQuery);
      if (match) {
        setSelectedWalletId(match.id);
        return;
      }
    }
    const embedded =
      walletOptions.find((w) => w.source === WalletSource.Embedded) ||
      walletOptions[0];
    setSelectedWalletId(embedded?.id ?? null);
  }, [selectedWalletId, walletOptions, walletIdQuery]);

  const isTurnkeyReady =
    authState === AuthState.Authenticated &&
    clientState === ClientState.Ready &&
    !!session?.organizationId &&
    !!selectedWalletId;

  const handleExport = useCallback(async () => {
    if (!isClient) return;
    setError(null);
    setIframeVisible(false);

    if (!isTurnkeyReady) {
      setError("Connect with Turnkey and pick a wallet before exporting.");
      setStatus("error");
      return;
    }
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
      // Ensure any stray iframe element is removed before creating a new stamper
      if (typeof document !== "undefined") {
        const existing = document.getElementById("turnkey-export-iframe");
        if (existing?.parentNode) {
          existing.parentNode.removeChild(existing);
        }
      }

      const stamper = new IframeStamper({
        iframeUrl: "https://export.turnkey.com",
        iframeElementId: "turnkey-export-iframe",
        iframeContainer: iframeContainerRef.current,
      });
      const publicKey = await stamper.init();
      await stamper.applySettings({
        styles: { fontSize: "16px" },
      });
      iframeStamperRef.current = stamper;
      setTargetPublicKey(publicKey);

      setStatus("requesting");
      const exportBundle: string = await exportWallet({
        walletId: selectedWalletId,
        targetPublicKey: publicKey,
        organizationId: session.organizationId,
      });

      setStatus("injecting");
      const injected = await stamper.injectWalletExportBundle(
        exportBundle,
        session.organizationId
      );

      if (!injected) {
        throw new Error("Failed to inject export bundle into iframe");
      }

      setIframeVisible(true);
      setStatus("done");
    } catch (err: any) {
      console.error("Turnkey wallet export failed", err);
      setStatus("error");
      setError(err?.message || "Wallet export failed");
    }
  }, [exportWallet, isClient, isTurnkeyReady, selectedWalletId, session?.organizationId]);

  const currentStatus = statusCopy[status];

  return (
    <>
      <Head>
        <title>Export Turnkey Wallet | Interstate</title>
      </Head>
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-100">
        <Header />
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 pt-12 pb-20 sm:px-8 lg:px-10">
          <div className="space-y-10">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.35em] text-neutral-500">
                  Secure export
                </p>
                <h1 className="text-4xl font-semibold text-[#f4f6f7] sm:text-5xl">
                  Export your Turnkey wallet
                </h1>
                <p className="max-w-2xl text-sm text-neutral-400 sm:text-base">
                  We use a sandboxed iframe hosted on <span className="font-semibold text-neutral-100">export.turnkey.com</span>{" "}
                  so only you can decrypt the mnemonic. Your organization never sees the plaintext phrase.
                </p>
              </div>
              <div className="w-full max-w-xs rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 shadow-lg shadow-black/20">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-10 w-10 text-emerald-400" />
                  <div>
                    <p className="text-sm text-neutral-400">Turnkey session</p>
                    <p className="text-lg font-semibold text-[#f4f6f7]">
                      {authState === AuthState.Authenticated
                        ? "Authenticated"
                        : "Sign in required"}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-neutral-500">
                  You must be logged in with your Turnkey session to sign the EXPORT_WALLET activity.
                </p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-6 shadow-xl shadow-black/15 lg:col-span-2">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-neutral-400">Wallet to export</p>
                    <p className="text-lg font-semibold text-neutral-100">
                      {walletOptions.find((w) => w.id === selectedWalletId)?.name ||
                        "No wallet detected"}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:w-64">
                    <label className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                      Select wallet
                    </label>
                    <select
                      className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 shadow-inner shadow-black/30 focus:border-emerald-500 focus:outline-none"
                      value={selectedWalletId ?? ""}
                      onChange={(e) => setSelectedWalletId(e.target.value)}
                      disabled={!walletOptions.length}
                    >
                      {!walletOptions.length && (
                        <option value="">No Turnkey wallets found</option>
                      )}
                      {walletOptions.map((wallet) => (
                        <option key={wallet.id} value={wallet.id}>
                          {wallet.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
                  <div className="flex items-start gap-3">
                    {currentStatus.tone === "success" ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" />
                    ) : currentStatus.tone === "warning" ? (
                      <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-400" />
                    ) : (
                      <Lock className="mt-0.5 h-5 w-5 text-sky-400" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-neutral-100">
                        {currentStatus.title}
                      </p>
                      <p className="text-sm text-neutral-400">
                        {currentStatus.description}
                      </p>
                    </div>
                  </div>
                  {targetPublicKey && (
                    <p className="break-all rounded-xl bg-neutral-900 px-3 py-2 text-[11px] text-neutral-400">
                      Iframe public key: {targetPublicKey}
                    </p>
                  )}
                  {error && (
                    <p className="rounded-xl bg-amber-900/30 px-3 py-2 text-sm text-amber-200">
                      {error}
                    </p>
                  )}
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-neutral-400">
                    The iframe stays hidden until the encrypted bundle is injected and decrypted.
                  </div>
                  <button
                    onClick={handleExport}
                    disabled={!isTurnkeyReady || status === "initializing" || status === "requesting" || status === "injecting"}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-neutral-900 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
                  >
                    {status === "initializing" ||
                    status === "requesting" ||
                    status === "injecting"
                      ? "Working..."
                      : "Start secure export"}
                  </button>
                </div>

                <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-neutral-100">
                      Export iframe
                    </p>
                    <span className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                      Hosted on export.turnkey.com
                    </span>
                  </div>
                  <div className="mt-3 rounded-xl border border-dashed border-neutral-800 bg-neutral-900/70 p-3">
                    <div
                      ref={iframeContainerRef}
                      style={{ display: iframeVisible ? "block" : "none" }}
                      className="overflow-hidden rounded-lg"
                    />
                    {!iframeVisible && (
                      <p className="text-sm text-neutral-500">
                        Start the export to reveal your mnemonic here. The words are only rendered inside the Turnkey iframe.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4 rounded-3xl border border-neutral-800 bg-neutral-900/70 p-6 shadow-xl shadow-black/15">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-6 w-6 text-amber-400" />
                  <div>
                    <p className="text-lg font-semibold text-neutral-100">
                      Security checklist
                    </p>
                    <p className="text-sm text-neutral-400">
                      Once exported, Turnkey cannot protect this wallet.
                    </p>
                  </div>
                </div>
                <ul className="space-y-3 text-sm text-neutral-300">
                  <li className="flex gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                    View and store the phrase somewhere offline and private.
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                    Never paste the mnemonic outside this iframe or share it with anyone.
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                    Close this page after saving the phrase to clear the iframe.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
}
