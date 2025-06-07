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
import type { DexPair } from "~/utils/moralis";


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
  const isDiscover = router.pathname === "/";
  const timeframes = ["1m", "5m", "30m", "1h"];
  const [selectedTimeframe, setSelectedTimeframe] = useState("5m");
  const [displayed, setDisplayed] = useState<DexPair[]>([]);
  const [loginOpen, setLoginOpen] = useState(false);
  const { user, loading: userLoading, refreshUser } = useUser();

  const handleTimeframeClick = (tf: string) => {
    setSelectedTimeframe(tf);
    // Optionally, refetch or shuffle if needed, but for now just keep the same data
  };

  useEffect(() => {
    fetch('/api/tokens')
      .then(res => res.json())
      .then(data => {
        console.log(data)
        setDisplayed(data)
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
        {/* Section Header */}
        <div className="max-w-7xl mx-auto px-4 pt-8 pb-2 flex flex-col gap-2">
          <div className="flex items-center gap-4 text-lg font-semibold text-neutral-300">
            <span className="text-white">Trending</span>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium mt-2">
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
        </div>
        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 pb-10">
          <div className="bg-neutral-900/80 rounded-xl shadow-lg overflow-x-auto border border-neutral-800">
            <table className="min-w-full divide-y divide-neutral-800">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Pair Info</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Market Cap</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Liquidity</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Volume</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">TXNS</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {displayed.map((coin, i) => {
                  const fakeTxns = Math.floor(Math.random() * 4000) + 1000;
                  return (
                    <tr
                      className="hover:bg-neutral-800/60 transition cursor-pointer"
                      key={coin.pairAddress}
                      onClick={() => {
                        router.push({
                          pathname: `/trade/${coin.pairAddress}`,
                          query: {
                            price: coin.usdPrice,
                            volume: coin.volume24hrUsd,
                            liquidity: coin.liquidityUsd,
                          },
                        });
                      }}
                    >
                      {/* Pair Info */}
                      <td className="px-4 py-2 flex items-center gap-3 min-w-[220px]">
                        <div className="w-10 h-10 rounded bg-neutral-800 flex items-center justify-center overflow-hidden">
                          <img src={coin.pair[0].tokenLogo} alt={coin.pair[0].tokenName} width={60} height={60} />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-white leading-tight flex items-center gap-1 truncate">
                            {coin.pairLabel}
                          </span>
                          <span className="text-xs text-neutral-400 truncate">{coin.pair[0].tokenName}</span>
                          <div className="flex gap-2 mt-1 text-neutral-400 text-xs">
                            <FaUser />
                            <FaGlobe />
                            <FaSearch />
                          </div>
                        </div>
                      </td>
                      {/* Market Cap */}
                      <td className="px-4 py-2 align-middle">
                        <div className="flex flex-col">
                          <span className="font-semibold text-white">{formatUSD(coin.liquidityUsd)}</span>
                          <span className={`text-xs font-medium ${coin.usdPrice24hrPercentChange > 0 ? "text-emerald-400" : "text-red-400"}`}>{formatNumber(coin.volume24hrNative)}</span>
                        </div>
                      </td>
                      {/* Liquidity */}
                      <td className="px-4 py-2 text-neutral-300 align-middle">{formatUSD(coin.pair[0].liquidityUsd)}</td>
                      {/* Volume */}
                      <td className="px-4 py-2 text-neutral-300 align-middle">{formatUSD(coin.volume24hrUsd)}</td>
                      {/* TXNS */}
                      <td className="px-4 py-2 align-middle">
                        <div className="flex flex-col items-start">
                          <span className="font-semibold text-white">{fakeTxns}</span>
                          <span className="text-xs">
                            <span className="text-emerald-400">{Math.floor(fakeTxns * 0.6)}</span>
                            <span className="text-neutral-400"> / </span>
                            <span className="text-red-400">{Math.floor(fakeTxns * 0.4)}</span>
                          </span>
                        </div>
                      </td>
                      {/* Action */}
                      <td className="px-4 py-2 align-middle">
                        <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-md font-semibold transition">Buy</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>
        <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      </div>
    </>
  );
}
