import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState, useEffect } from "react";
import { FaGlobe, FaUser, FaSearch, FaCheckCircle, FaQuestionCircle, FaPowerOff, FaTimes, FaCopy } from "react-icons/fa";
import Image from "next/image";
import { useUser } from "../components/UserContext";
import Cookies from 'js-cookie';
import QRCode from 'qrcode';
import Header from "../components/Header";
import type { Token } from "~/utils/db";
import InterstateButton from "../components/InterstateButton";
import InterstateTable from "../components/InterstateTable";
import toast from "react-hot-toast";


const navLinks = [
  { name: "Discover", href: "/" },
  { name: "Pulse", href: "#" },
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

function formatUSD(value: number | string | undefined) {
  if (value === undefined || value === null || isNaN(Number(value))) return '-';
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatNumber(value: number | string | undefined) {
  if (value === undefined || value === null || isNaN(Number(value))) return '-';
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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
  const timeframes = ["1m", "5m", "30m", "1h"];
  const [selectedTimeframe, setSelectedTimeframe] = useState("5m");
  const { user, loading: userLoading, refreshUser } = useUser();
  const [selectedTab, setSelectedTab] = useState<'dex' | 'trending'>('trending');

  // Fetch tokens from API on mount
  useEffect(() => {
    setLoadingTokens(true);
    setTokenError(null);
    fetch('/api/getAllTokens')
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch tokens");
        return res.json();
      })
      .then((data: { result: Token[] }) => {
        console.log(data)
        if (!data.result || !Array.isArray(data.result) || data.result.length === 0) {
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
      ? allTokens.filter(token =>
          token.name?.toLowerCase().includes(search.toLowerCase()) ||
          token.label?.toLowerCase().includes(search.toLowerCase())
        )
      : [];
    setFilteredTokens(results);
    setDisplayed(results.slice(0, 10));
  }, [search, allTokens]);

  const handleTimeframeClick = (tf: string) => {
    setSelectedTimeframe(tf);
    // Optionally, refetch or shuffle if needed, but for now just keep the same data
  };

  // QUICK BUY handler
  async function handleQuickBuy(token: Token) {
    if (!user) {
      return;
    }
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || ''}/api/trade/buy`, {
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
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Quick Buy successful! Bought ${data.amount} ${token.label}`);
      } else {
        toast.error(data?.error || "Quick Buy failed");
      }
    } catch (e) {
      toast.error("Quick Buy failed");
    }
  }

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
        <div className="max-w-7xl mx-auto px-4 pt-8 flex items-center gap-6">
          <button
            className={`text-lg font-semibold transition-colors ${selectedTab === 'dex' ? 'text-white' : 'text-neutral-400'} cursor-pointer`}
            onClick={() => setSelectedTab('dex')}
          >
            DEX Screener
          </button>
          <button
            className={`text-lg font-semibold transition-colors ${selectedTab === 'trending' ? 'text-white' : 'text-neutral-400'} cursor-pointer`}
            onClick={() => setSelectedTab('trending')}
          >
            Trending
          </button>
        </div>
        {/* Timeframes Row (for both tabs) */}
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-4 text-xs font-medium">
          {timeframes.map(tf => (
            <button
              key={tf}
              className={
                (selectedTimeframe === tf ? "text-emerald-400 " : "text-neutral-400 ") +
                "transition-colors"
              }
              onClick={() => handleTimeframeClick(tf)}
            >
              {tf}
            </button>
          ))}
        </div>
        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 pb-10">
          {loadingTokens ? (
            <div className="text-center text-neutral-400 py-10">Loading tokens...</div>
          ) : tokenError ? (
            <div className="text-center text-red-400 py-10">{tokenError}</div>
          ) : displayed.length === 0 ? (
            <div className="text-center text-neutral-400 py-10">No tokens found.</div>
          ) : (
            <InterstateTable rows={displayed.map((token, i) => ({ token, i }))} onQuickBuy={handleQuickBuy} />
          )}
        </main>
      </div>
    </>
  );
}
