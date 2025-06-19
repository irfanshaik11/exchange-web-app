import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState, useEffect } from "react";
import {
  FaGlobe,
  FaUser,
  FaSearch,
  FaCheckCircle,
  FaQuestionCircle,
  FaPowerOff,
  FaTimes,
  FaCopy,
  FaCog,
  FaFilter,
} from "react-icons/fa";
import Image from "next/image";
import { useUser } from "../components/UserContext";
import Cookies from "js-cookie";
import QRCode from "qrcode";
import Header from "../components/Header";
import type { Token } from "~/utils/db";
import InterstateButton from "../components/InterstateButton";
import InterstateTable from "../components/InterstateTable";
import toast from "react-hot-toast";
import { formatSmartNumber } from "~/utils/db";
import { useQuickBuy } from "~/components/QuickBuyContext";
import QuickBuySettingsModal from '../components/QuickBuySettingsModal';
import { useFilter } from '../components/FilterContext';
import InterstatePopout from '../components/InterstatePopout';

const navLinks = [
  { name: "Discover", href: "/" },
  { name: "Pulse", href: "/pulse" },
  { name: "Trackers", href: "#" },
  { name: "Perpetuals", href: "#" },
  { name: "Yield", href: "#" },
  { name: "Portfolio", href: "#" },
  { name: "Rewards", href: "#" },
];

function shuffleArray<T extends NonNullable<unknown>>(array: T[]): T[] {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    //@ts-ignore
    arr[i] = arr[j];
    //@ts-ignore
    arr[j] = temp;
  }
  return arr;
}

export default function Home() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [allTokens, setAllTokens] = useState<Token[]>([]);
  const [filteredTokens, setFilteredTokens] = useState<Token[]>([]);
  const [displayed, setDisplayed] = useState<Token[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const isDiscover = router.pathname === "/";
  const timeframes = ["5m", "1h", "6h", "24h"] as const;
  const [selectedTimeframe, setSelectedTimeframe] =
    useState<(typeof timeframes)[number]>("24h");
  const { user, loading: userLoading, refreshUser } = useUser();
  const [selectedTab, setSelectedTab] = useState<"dex" | "trending">(
    "trending",
  );
  const [sortKey, setSortKey] = useState<
    "market_cap_total" | "liquidity" | "volume" | "txns" | "name"
  >("volume");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [quickBuyAmount, setQuickBuyAmount] = useState(0.05);
  const { quickBuySettings, presets, setPresets, activePreset, setActivePreset } = useQuickBuy();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFilterPopoutOpen, setIsFilterPopoutOpen] = useState(false);
  const { filter, setFilter } = useFilter();

  useEffect(() => {
    console.log(sortKey);
  }, [sortKey]);

  // Fetch tokens from API on mount
  useEffect(() => {
    setLoadingTokens(true);
    setTokenError(null);
    fetch("/api/getAllTokens")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch tokens");
        return res.json();
      })
      .then((data: { result: Token[] }) => {
        console.log(data);
        if (
          !data.result ||
          !Array.isArray(data.result) ||
          data.result.length === 0
        ) {
          setAllTokens([]);
          setFilteredTokens([]);
          setDisplayed([]);
        } else {
          setAllTokens(data.result);
          setFilteredTokens(data.result);
          setDisplayed(data.result.slice(0, 10));
        }
      })
      .catch((err) => {
        setTokenError("No tokens found or failed to load tokens.");
        setAllTokens([]);
        setFilteredTokens([]);
        setDisplayed([]);
      })
      .finally(() => setLoadingTokens(false));
  }, []);

  // Filter tokens when search changes
  useEffect(() => {
    if (!search) {
      setFilteredTokens(allTokens);
      setDisplayed(Array.isArray(allTokens) ? allTokens.slice(0, 10) : []);
      return;
    }
    const results = Array.isArray(allTokens)
      ? allTokens.filter(
          (token) =>
            token.name?.toLowerCase().includes(search.toLowerCase()) ||
            token.symbol?.toLowerCase().includes(search.toLowerCase()),
        )
      : [];
    setFilteredTokens(results);
    setDisplayed(results.slice(0, 10));
  }, [search, allTokens]);

  const handleTimeframeClick = (tf: string) => {
    setSelectedTimeframe(tf as (typeof timeframes)[number]);
    setSortKey("volume");
    setSortDirection("desc");
    // Sort by volume for the new timeframe
    if (Array.isArray(filteredTokens)) {
      const sorted = [...filteredTokens].sort((a, b) => {
        // Use the new timeframe's volume fields
        const aVol =
          (a[`total_buy_volume_${tf}`] || 0) +
          (a[`total_sell_volume_${tf}`] || 0);
        const bVol =
          (b[`total_buy_volume_${tf}`] || 0) +
          (b[`total_sell_volume_${tf}`] || 0);
        return bVol - aVol;
      });
      setDisplayed(sorted);
    }
  };

  // QUICK BUY handler
  async function handleQuickBuy(token: Token) {
    if (!user) {
      return;
    }
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL || ""}/api/trade/buy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.bearerToken}`,
          },
          body: JSON.stringify({
            tokenAddress: token.token_address,
            amount: 0.05,
            mevProtection: 0,
          }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        toast.success(
          `Quick Buy successful! Bought ${data.amount} ${token.symbol}`,
        );
      } else {
        toast.error(data?.error || "Quick Buy failed");
      }
    } catch (e) {
      toast.error("Quick Buy failed");
    }
  }

  useEffect(() => {
    if (selectedTab === "trending") {
      setSortKey("volume");
      setSortDirection("desc");
    }
  }, [selectedTab]);

  useEffect(() => {
    if (selectedTab === "trending") {
      const sortedTokens = Array.isArray(filteredTokens)
        ? [...filteredTokens]
        : [];
      sortedTokens.sort((a, b) => {
        const aVal = Number(a[sortKey]) || 0;
        const bVal = Number(b[sortKey]) || 0;
        if (sortDirection === "asc") {
          return aVal - bVal;
        } else {
          return bVal - aVal;
        }
      });
      setDisplayed(sortedTokens);
    } else {
      setDisplayed(filteredTokens.slice(0, 10));
    }
  }, [selectedTab, filteredTokens, sortKey, sortDirection]);

  // Sorting handler for table headers
  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  // When activePreset changes, update quickBuySettings to match preset
  useEffect(() => {
    if (presets && presets[activePreset]) {
      // Optionally, update quickBuySettings globally if needed
      // setQuickBuySettings(presets[activePreset].quickBuySettings);
    }
  }, [activePreset, presets]);

  // Helper function to render Min/Max inputs
  const renderMinMaxInputs = (label: string) => (
    <div>
      <h3 className="text-neutral-300 text-sm font-semibold mb-2">{label}</h3>
      <div className="grid grid-cols-2 gap-4">
        <input type="number" placeholder="Min" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <input type="number" placeholder="Max" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>
    </div>
  );

  return (
    <>
      <Head>
        <title>Interstate Memeboard | Discover</title>
        <meta name="description" content="Interstate dashboard" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className="min-h-screen bg-neutral-950 text-neutral-100">
        {/* Header */}
        <Header search={search} setSearch={setSearch} />
        {/* Tab Navigation */}
        <div className="mx-auto my-4 flex flex-row items-center justify-between gap-6 px-20">
          <div className="flex max-w-7xl items-center gap-6">
            <button
              className={`text-lg font-semibold transition-colors ${selectedTab === "dex" ? "text-white" : "text-neutral-400"} cursor-pointer`}
              onClick={() => setSelectedTab("dex")}
            >
              DEX Screener
            </button>
            <button
              className={`text-lg font-semibold transition-colors ${selectedTab === "trending" ? "text-white" : "text-neutral-400"} cursor-pointer`}
              onClick={() => setSelectedTab("trending")}
            >
              Trending
            </button>
          </div>
          {/* Quick Buy pill UI */}
          <div className="flex flex-row items-center gap-4">
            {/* Timeframes Row (for both tabs) */}
            <div className="flex max-w-7xl items-center gap-4 text-sm font-medium">
              {timeframes.map((tf) => (
                <button
                  key={tf}
                  className={
                    (selectedTimeframe === tf
                      ? "text-emerald-400 "
                      : "text-neutral-400 ") +
                    "cursor-pointer transition-colors"
                  }
                  onClick={() => handleTimeframeClick(tf)}
                >
                  {tf}
                </button>
              ))}
            </div>
            {/* Settings*/}
            <button className="group cursor-pointer text-neutral-400 transition-colors hover:text-white" onClick={() => setSettingsOpen(true)}>
              <FaCog className="transition-transform duration-300 group-hover:rotate-90" />
            </button>
            <button
              className="relative flex flex-row items-center rounded-full bg-neutral-900 px-4 py-1.5 shadow-inner border border-neutral-800 group mr-2"
              onClick={() => setIsFilterPopoutOpen(true)}
            >
              <FaFilter className="text-lg mr-2 text-white" />
              <span className="font-semibold text-white text-base">Filters</span>
              <svg className="ml-2 w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              <span className="absolute left-3 top-1 w-2 h-2 bg-blue-400 rounded-full"></span>
            </button>
            <div className="flex items-center flex-row rounded-full border border-neutral-800 px-4 py-1.5 shadow-inner">
              <span className="mr-2 text-sm text-neutral-400">
                Quick Buy
              </span>
              <input value={quickBuyAmount} onChange={(e) => setQuickBuyAmount(e.target.value as unknown as number)} className="text-sm text-neutral-200 focus:outline-none outline-none w-12" />
              <img
                src="https://axiom.trade/images/sol-fill.svg"
                alt="Solana"
                className="mr-4 h-5 w-5"
              />
              {[0, 1, 2].map((i) => (
                <button
                  key={i}
                  className={`mr-2 cursor-pointer font-semibold ${activePreset === i ? "text-emerald-300" : "text-neutral-400"}`}
                  onClick={() => setActivePreset(i)}
                >
                  {`P${i + 1}`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filter Popout */}
        <InterstatePopout
          open={isFilterPopoutOpen}
          onClose={() => setIsFilterPopoutOpen(false)}
          align="center"
          className="bg-neutral-900 rounded-xl shadow-2xl w-full max-w-md p-6 relative text-neutral-100"
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Filters</h2>
              <button onClick={() => setIsFilterPopoutOpen(false)} className="text-neutral-400 hover:text-white text-xl">×</button>
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="text-neutral-300 text-sm font-semibold mb-2">Protocols</h3>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="form-checkbox text-purple-600 rounded" defaultChecked /> Raydium
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="form-checkbox text-purple-600 rounded" defaultChecked /> Pump
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="form-checkbox text-purple-600 rounded" defaultChecked /> Moonit
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-neutral-300 text-sm font-semibold mb-1">Search Keywords</label>
                  <input type="text" placeholder="keyword1, keyword2..." className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-neutral-300 text-sm font-semibold mb-1">Exclude Keywords</label>
                  <input type="text" placeholder="keyword1, keyword2..." className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>

              <label className="flex items-center gap-2">
                <input type="checkbox" className="form-checkbox text-purple-600 rounded" /> Dex Paid
              </label>

              {/* Min/Max Input Fields */}
              {renderMinMaxInputs("Top 10 Holders %")}
              {renderMinMaxInputs("Liquidity ($)")}
              {renderMinMaxInputs("Volume ($)")}
              {renderMinMaxInputs("Market Cap ($)")}
              {renderMinMaxInputs("Txns")}

            </div>
            <div className="flex justify-between items-center mt-6">
              <button onClick={() => { /* Reset logic here */ setIsFilterPopoutOpen(false); }} className="text-neutral-400 hover:text-white flex items-center gap-2">
                <FaPowerOff /> Reset
              </button>
              <InterstateButton variant="primary" onClick={() => {
                // Save filters to localStorage by updating the filter state
                setFilter({ ...filter });
                setIsFilterPopoutOpen(false);
              }}>Apply all</InterstateButton>
            </div>
          </div>
        </InterstatePopout>

        {/* Main Content */}
        <main className="mx-auto px-20 pb-10">
          {loadingTokens ? (
            <div className="py-10 text-center text-neutral-400">
              Loading tokens...
            </div>
          ) : tokenError ? (
            <div className="py-10 text-center text-red-400">{tokenError}</div>
          ) : displayed.length === 0 ? (
            <div className="py-10 text-center text-neutral-400">
              No tokens found.
            </div>
          ) : (
            <InterstateTable
              rows={displayed.map((token, i) => ({ token, i }))}
              onQuickBuy={handleQuickBuy}
              sortKey={sortKey}
              sortDirection={sortDirection}
              setSort={handleSort}
              selectedTimeframe={selectedTimeframe}
              quickBuyAmount={quickBuyAmount}
            />
          )}
        </main>
        <QuickBuySettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    </>
  );
}
