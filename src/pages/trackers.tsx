import React, { useState, useEffect, useRef } from "react";
import Head from "next/head";
import Header from "../components/Header";
import Footer from "../components/Footer";
import {
  getActivePositionsByUser,
  getStoredWallets,
  storeWallets,
} from "~/utils/functions";
import type { PositionRow, Wallet } from "~/utils/functions";
import AddWalletModal from "../components/AddWalletModal";
import WalletRow from "../components/WalletRow";
import ImportExportWalletModal from "../components/ImportExportWalletModal";
import WalletScanPanel from "../components/WalletScanPanel";

const TABS = ["Wallet Manager", "Live Trades"];
const EMOJIS = [
  "💰",
  "🚀",
  "🦄",
  "🐉",
  "🦊",
  "🐸",
  "🐼",
  "🐧",
  "🦁",
  "🐵",
  "🐻",
  "🐨",
  "🐯",
  "🦕",
  "🦖",
  "🐙",
  "🐳",
  "🐬",
  "🦋",
  "🌟",
  "🔥",
  "🌈",
  "🍀",
  "🍕",
  "🍔",
  "🍣",
  "🍩",
  "🍦",
  "🎲",
  "🎯",
  "🎮",
  "🎸",
  "🎹",
  "🏆",
  "🥇",
  "🥈",
  "🥉",
  "⚡",
  "💎",
  "🧊",
  "🪐",
  "🌌",
  "🌠",
  "🛸",
  "🛰️",
  "🚁",
  "🚢",
  "✈️",
  "🚗",
  "🏎️",
  "🚓",
  "🚑",
  "🚒",
  "🚜",
  "🚲",
  "🛴",
  "🛵",
  "🏍️",
  "🦽",
  "🦼",
  "🛹",
  "🛶",
  "⛵",
  "🚤",
  "🛥️",
  "🚀",
];

export default function TrackersPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddWalletModal, setShowAddWalletModal] = useState(false);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [toast, setToast] = useState("");
  const [scannedWallet, setScannedWallet] = useState<Wallet | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(384); // 384px = w-96
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    // Load wallets from localStorage on component mount
    setWallets(getStoredWallets());
  }, []);

  useEffect(() => {
    if (activeTab === 1) {
      setLoading(true);
      // Use a hardcoded userId for now
      getActivePositionsByUser("demo-user")
        .then(setPositions)
        .finally(() => setLoading(false));
    }
  }, [activeTab]);

  // Handle sidebar resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      // Min width 300px, max width 800px
      setSidebarWidth(Math.max(300, Math.min(800, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  const handleAddWallet = (address: string, name: string) => {
    const newWallet: Wallet = {
      address,
      name: name || `Wallet ${wallets.length + 1}`,
      createdAt: Date.now(),
      emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
    };
    const updatedWallets = [...wallets, newWallet];
    setWallets(updatedWallets);
    storeWallets(updatedWallets);
    setShowAddWalletModal(false);
  };

  const handleRemoveWallet = (addressToRemove: string) => {
    let updatedWallets: Wallet[];
    if (addressToRemove === "all") {
      updatedWallets = [];
    } else {
      updatedWallets = wallets.filter(
        (wallet) => wallet.address !== addressToRemove,
      );
    }
    setWallets(updatedWallets);
    storeWallets(updatedWallets);
  };

  // Helper to format date
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  };

  // Filter wallets based on search term
  const filteredWallets = wallets.filter(
    (wallet) =>
      wallet.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wallet.address.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Export: copy addresses to clipboard and show toast
  const handleExportAddresses = () => {
    const addresses = wallets.map((w) => w.address).join(", ");
    navigator.clipboard.writeText(addresses);
    setToast("Wallets copied to clipboard");
    setTimeout(() => setToast(""), 2000);
  };

  // Import wallets from JSON file
  const handleImportWallets = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported)) {
          setWallets(imported);
          storeWallets(imported);
        } else {
          alert("Invalid wallet file format.");
        }
      } catch {
        alert("Failed to import wallets.");
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be imported again if needed
    e.target.value = "";
  };

  return (
    <>
      <Head>
        <title>Trackers | Interstate Memeboard</title>
      </Head>
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-100">
        <Header />
        <div className="w-full flex-grow">
          {/* Main Content Area: Two Columns */}
          <div className="flex h-full flex-row">
            {/* Left Column: Wallet Manager / Live Trades Table */}
            <div className="h-full min-h-[530px] flex-1 border border-neutral-800/50 bg-neutral-900/50 px-4 shadow-xl backdrop-blur-sm">
              <div className="flex gap-4 border-b border-neutral-800/50 py-2">
                {TABS.map((tab, i) => (
                  <button
                    key={tab}
                    className={`cursor-pointer rounded-lg px-2 py-1 text-xs transition-all duration-300 ${
                      activeTab === i
                        ? "bg-[#21222B] font-medium text-white"
                        : "font-medium text-neutral-400 hover:bg-neutral-800/50 hover:text-white"
                    }`}
                    onClick={() => setActiveTab(i)}
                  >
                    {tab}
                    {tab === "Live Trades" && (
                      <span className="ml-1 animate-pulse text-sm text-pink-400">
                        •
                      </span>
                    )}
                  </button>
                ))}
                <div className="flex-1" />
                {/* Search and actions */}
                <input
                  type="text"
                  placeholder="Search by name or addr..."
                  className="mr-4 w-60 rounded-full border border-neutral-800 bg-neutral-900/50 px-4 py-0 text-xs text-neutral-200 backdrop-blur-sm transition-all duration-300 focus:border-transparent focus:ring-2 focus:ring-blue-500/50 focus:outline-none"
                  disabled={activeTab === 1}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {activeTab === 0 && (
                  <>
                    <button
                      className="mr-2 rounded-full bg-neutral-800/50 px-4 py-1 text-xs font-semibold text-white backdrop-blur-sm transition-all duration-300 hover:bg-neutral-700"
                      onClick={() => setShowImportModal(true)}
                    >
                      Import
                    </button>
                    <button
                      className="mr-2 rounded-full bg-neutral-800/50 px-4 py-1 text-xs font-semibold text-white backdrop-blur-sm transition-all duration-300 hover:bg-neutral-700"
                      onClick={handleExportAddresses}
                    >
                      Export
                    </button>
                    <button
                      className="rounded-full bg-gradient-to-r from-blue-600 to-blue-800 px-4 py-1 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 transition-all duration-300 hover:from-blue-500 hover:to-blue-700"
                      onClick={() => setShowAddWalletModal(true)}
                    >
                      Add Wallet
                    </button>
                  </>
                )}
              </div>
              {activeTab === 0 ? (
                <>
                  <div className="border-neutral-800/50p flex items-center border-b py-1">
                    <div className="flex flex-1 gap-8 text-sm text-neutral-400">
                      <span className="w-32">Created</span>
                      <span className="flex-1">Name</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-neutral-400">Actions</span>
                      <button className="text-neutral-400 transition-colors duration-300 hover:text-white">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="h-4 w-4"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.04 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
                          />
                        </svg>
                      </button>
                      <button className="text-neutral-400 transition-colors duration-300 hover:text-white">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="h-4 w-4"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.92c-1.01 0-1.85-.75-1.992-1.874L5.323 6.075m1.022-.165L5.754 5.105a1.125 1.125 0 011.992-.858L12 8.752l3.254-4.505a1.125 1.125 0 011.992.858z"
                          />
                        </svg>
                      </button>
                      <button
                        className="ml-4 text-xs font-semibold text-red-400 transition-colors duration-300 hover:text-red-300"
                        onClick={() => handleRemoveWallet("all")}
                      >
                        Remove All
                      </button>
                    </div>
                  </div>
                  {wallets.length === 0 ? (
                    <div className="flex h-64 flex-col items-center justify-center">
                      <span className="text-neutral-400">
                        No wallets added yet.
                      </span>
                    </div>
                  ) : (
                    <table className="mt-2 w-full text-xs">
                      <tbody>
                        {filteredWallets.map((wallet) => (
                          <WalletRow
                            key={wallet.address}
                            wallet={wallet}
                            onRemove={handleRemoveWallet}
                            onClick={setScannedWallet}
                          />
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between border-b border-neutral-800/50 pb-4">
                    <div className="flex flex-1 gap-8 text-sm text-neutral-400">
                      <span className="w-48">Name</span>
                      <span className="w-48">Token</span>
                      <span className="w-32">Amount</span>
                      <span className="w-32">MC</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-neutral-400">Paused</span>
                      <button className="text-neutral-400 transition-colors duration-300 hover:text-white">
                        &#9646;&#9646;
                      </button>
                      <span className="text-neutral-400">P1</span>
                      <span className="text-neutral-400">0.0</span>
                      <button className="text-neutral-400 transition-colors duration-300 hover:text-white">
                        Customize Feed
                      </button>
                    </div>
                  </div>
                  {loading ? (
                    <div className="flex h-64 flex-col items-center justify-center">
                      <span className="text-neutral-400">Loading...</span>
                    </div>
                  ) : positions.length === 0 ? (
                    <div className="flex h-64 flex-col items-center justify-center">
                      <span className="text-neutral-400">
                        No transactions yet.
                      </span>
                    </div>
                  ) : (
                    <table className="mt-2 w-full text-xs">
                      <tbody>
                        {positions.map((pos, idx) => (
                          <tr
                            key={pos.tokenAddress || idx}
                            className="border-b border-neutral-800/50 transition-colors duration-300 hover:bg-neutral-800/30"
                          >
                            <td className="w-48 px-2 py-2 font-mono">
                              WalletName
                            </td>
                            <td className="w-48 px-2 py-2 font-mono">
                              {pos.tokenAddress}
                            </td>
                            <td className="w-32 px-2 py-2">{pos.remaining}</td>
                            <td className="w-32 px-2 py-2">
                              ${pos.remainingUsdValue}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>

            {/* Resizer Handle */}
            <div
              className="group relative flex h-full min-h-[530px] w-1 cursor-ew-resize items-center justify-center transition-colors hover:bg-blue-500/30"
              onMouseDown={() => setIsResizing(true)}
            >
              <div className="absolute h-16 w-1 rounded-full bg-neutral-700 transition-colors group-hover:bg-blue-500" />
            </div>

            {/* Right Column: Twitter Alerts */}
            <div
              className="flex h-full min-h-[530px] flex-col border border-neutral-800/50 bg-neutral-900/50 px-2 shadow-xl backdrop-blur-sm"
              style={{
                width: `${sidebarWidth}px`,
                minWidth: "300px",
                maxWidth: "800px",
              }}
            >
              <div className="flex gap-4 border-b border-neutral-800/50 py-2">
                {TABS.map((tab, i) => (
                  <button
                    key={tab}
                    className={`cursor-pointer rounded-lg px-2 py-1 text-xs text-nowrap transition-all duration-300 ${
                      activeTab === i
                        ? "bg-[#21222B] font-medium text-white"
                        : "font-medium text-neutral-400 hover:bg-neutral-800/50 hover:text-white"
                    }`}
                    onClick={() => setActiveTab(i)}
                  >
                    {tab}
                    {tab === "Live Trades" && (
                      <span className="ml-1 animate-pulse text-sm text-pink-400">
                        •
                      </span>
                    )}
                  </button>
                ))}
                <div className="flex-1" />
                {/* Search and actions */}
                {activeTab === 0 && (
                  <>
                    <button
                      className="mr-2 rounded-full bg-neutral-800/50 px-4 py-1 text-xs font-semibold text-white backdrop-blur-sm transition-all duration-300 hover:bg-neutral-700"
                      onClick={() => setShowImportModal(true)}
                    >
                      Import
                    </button>
                    <button
                      className="mr-2 rounded-full bg-neutral-800/50 px-4 py-1 text-xs font-semibold text-white backdrop-blur-sm transition-all duration-300 hover:bg-neutral-700"
                      onClick={handleExportAddresses}
                    >
                      Export
                    </button>
                    {/* <button
                      className="rounded-full bg-gradient-to-r from-blue-600 to-blue-800 px-4 py-1 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 transition-all duration-300 hover:from-blue-500 hover:to-blue-700"
                      onClick={() => setShowAddWalletModal(true)}
                    >
                      Add Wallet
                    </button> */}
                  </>
                )}
              </div>
              <div className="mb-4 flex items-center justify-between border-b border-neutral-800/50 pb-4">
                <h3 className="text-lg font-semibold text-white">
                  Twitter Alerts
                </h3>
              </div>
              <div className="flex h-full flex-col items-center justify-center py-8 text-center">
                <span className="mb-4 text-neutral-400">
                  Start tracking accounts to see Twitter alerts!
                </span>
                <button className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-800 px-6 py-3 font-semibold text-white shadow-lg shadow-blue-500/20 transition-all duration-300 hover:from-blue-500 hover:to-blue-700">
                  Add Twitter Handles
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <AddWalletModal
        isOpen={showAddWalletModal}
        onClose={() => setShowAddWalletModal(false)}
        onAddWallet={handleAddWallet}
      />
      <ImportExportWalletModal
        mode={"import"}
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={(imported) => {
          setWallets(imported);
          storeWallets(imported);
        }}
        wallets={wallets}
      />
      {toast && (
        <div className="animate-fade-in fixed top-8 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-neutral-900 px-6 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
      {scannedWallet && (
        <WalletScanPanel
          wallet={scannedWallet}
          onClose={() => setScannedWallet(null)}
        />
      )}

      {/* Bottom Navigation/Footer */}
      <div className="fixed bottom-0 left-0 z-40 flex w-full items-center justify-between border-t border-emerald-950/50 bg-neutral-900/80 px-6 py-3 text-xs backdrop-blur-md">
        <div className="flex gap-6">
          <button className="flex items-center gap-2 font-semibold text-emerald-400 transition-colors duration-300 hover:text-emerald-300">
            <span className="text-lg">📊</span> Wallet Tracker
          </button>
          <button className="flex items-center gap-2 font-semibold text-sky-400 transition-colors duration-300 hover:text-sky-300">
            <span className="text-lg">🐦</span> Twitter Tracker
          </button>
          <button className="flex items-center gap-2 font-semibold text-gray-400 transition-colors duration-300 hover:text-gray-300">
            <span className="text-lg">📈</span> PnL Tracker
          </button>
        </div>
        <div className="flex items-center gap-6 text-neutral-400">
          <span className="flex items-center gap-2">
            <span className="text-emerald-400">💰</span> $106.8K
          </span>
          <span className="flex items-center gap-2">
            <span className="text-blue-400">💎</span> $2581
          </span>
          <span className="flex items-center gap-2">
            <span className="text-green-400">💸</span> $152.42
          </span>
          <span className="flex items-center gap-2">
            <span className="text-neutral-400">🔗</span> Connection is stable
          </span>
          <span className="flex items-center gap-2">
            <span className="text-neutral-400">🌐</span> US-W
          </span>
          <span className="cursor-pointer text-neutral-400 transition-colors duration-300 hover:text-white">
            Docs
          </span>
        </div>
      </div>
      <Footer />
    </>
  );
}
