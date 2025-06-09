import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState, useEffect } from "react";
import { FaGlobe, FaUser, FaSearch, FaCheckCircle, FaQuestionCircle, FaPowerOff, FaTimes, FaCopy } from "react-icons/fa";
import Image from "next/image";
import LoginModal from "../components/LoginModal";
import { useUser } from "../components/UserContext";
import Cookies from 'js-cookie';
import QRCode from 'qrcode';
import Header from "../components/Header";
import type { DexToken } from "~/utils/moralis";
import InterstateButton from "../components/InterstateButton";
import InterstateTable from "../components/InterstateTable";


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
  const [filteredTokens, setFilteredTokens] = useState<MemeCoin[]>(memecoins);
  useEffect(() => {
  const results = memecoins.filter(token =>
    token.name?.toLowerCase().includes(search.toLowerCase()) ||
    token.symbol?.toLowerCase().includes(search.toLowerCase())
  );
  setFilteredTokens(results);
}, [search]);
  const isDiscover = router.pathname === "/";
  const timeframes = ["1m", "5m", "30m", "1h"];
  const [selectedTimeframe, setSelectedTimeframe] = useState("5m");
  const [displayed, setDisplayed] = useState<MemeCoin[]>(memecoins.slice(0, 10));
  useEffect(() => {
    setDisplayed(filteredTokens.slice(0, 10));
  }, [filteredTokens]);
  const [loginOpen, setLoginOpen] = useState(false);
  const { user, loading: userLoading, refreshUser } = useUser();
  const [selectedTab, setSelectedTab] = useState<'dex' | 'trending'>('trending');

  const handleTimeframeClick = (tf: string) => {
    setSelectedTimeframe(tf);
    // Optionally, refetch or shuffle if needed, but for now just keep the same data
  };

  useEffect(() => {
    fetch('/api/tokens')
      .then(res => res.json())
      .then(data => {
        setDisplayed(data.result)
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const handler = () => setLoginOpen(true);
    window.addEventListener('open-login-modal', handler);
    return () => window.removeEventListener('open-login-modal', handler);
  }, []);

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
          <InterstateTable rows={displayed.map((token, i) => ({ token, i }))} />
        </main>
        <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      </div>
    </>
  );
}
