import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState } from "react";
import { FaGlobe, FaUser, FaSearch, FaCheckCircle, FaQuestionCircle, FaPowerOff } from "react-icons/fa";
import Image from "next/image";
import { memecoins } from "../data/memecoins";
import type { MemeCoin } from "../data/memecoins";

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

export default function Home() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const isDiscover = router.pathname === "/";
  const timeframes = ["1m", "5m", "30m", "1h"];
  const [selectedTimeframe, setSelectedTimeframe] = useState("5m");
  const [displayed, setDisplayed] = useState(() => memecoins.slice(0, 10));

  const handleTimeframeClick = (tf: string) => {
    setSelectedTimeframe(tf);
    setDisplayed(shuffleArray(memecoins).slice(0, 10));
  };

  return (
    <>
      <Head>
        <title>Interstate Memeboard | Discover</title>
        <meta name="description" content="Interstate dashboard" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className="min-h-screen bg-neutral-950 text-neutral-100">
        {/* Header */}
        <header className="w-full border-b border-neutral-800 bg-neutral-900/90 backdrop-blur sticky top-0 z-20">
          <div className="max-w-full flex items-center justify-between px-8 py-3">
            <div className="flex items-center gap-10 min-w-0">
              <span className="text-2xl font-extrabold tracking-tight text-white select-none flex items-center">
                <img src="/logo.png" className="w-12 h-auto" />
                <span className="rounded-full inline-block mr-1" />
                Interstate
              </span>
              <nav className="flex items-center gap-6 ml-8">
                {navLinks.map((link) => (
                  <Link
                    key={link.name}
                    href={link.href}
                    className={`px-1.5 py-0.5 font-medium transition-colors text-base ${
                      link.name === "Discover" && isDiscover
                        ? "text-emerald-400 border-b-2 border-emerald-400"
                        : "text-neutral-200 hover:text-emerald-400"
                    }`}
                  >
                    {link.name}
                  </Link>
                ))}
              </nav>
            </div>
            {/* Right: Search, Deposit, Wallet */}
            <div className="flex items-center gap-4 min-w-0">
              <div className="relative flex items-center">
                <span className="absolute left-3 text-neutral-400">
                  <FaSearch size={16} />
                </span>
                <input
                  type="text"
                  placeholder="Search by token or CA..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="bg-neutral-800 border border-neutral-700 rounded-full pl-9 pr-3 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition w-64"
                />
              </div>
             {/*  <button className="ml-2 px-5 py-1.5 rounded-full font-semibold bg-emerald-600 hover:bg-emerald-700 text-white text-base transition shadow focus:outline-none">
                Deposit
              </button> */}
              <div className="ml-2">
                <ConnectButton.Custom>
                  {({
                    account,
                    chain,
                    openAccountModal,
                    openChainModal,
                    openConnectModal,
                    authenticationStatus,
                    mounted,
                  }) => {
                    const ready = mounted && authenticationStatus !== "loading";
                    const connected =
                      ready &&
                      account &&
                      chain &&
                      (!authenticationStatus || authenticationStatus === "authenticated");

                    return (
                      <div
                        {...(!ready && {
                          'aria-hidden': true,
                          style: {
                            opacity: 0,
                            pointerEvents: 'none',
                            userSelect: 'none',
                          },
                        })}
                      >
                        {(() => {
                          if (!connected) {
                            return (
                              <button
                                onClick={openConnectModal}
                                type="button"
                                className="ml-2 px-5 py-1.5 rounded-full font-semibold bg-emerald-600 hover:bg-emerald-700 text-white text-base transition shadow focus:outline-none"
                              >
                                Connect Wallet
                              </button>
                            );
                          }
                          if (chain.unsupported) {
                            return (
                              <button
                                onClick={openChainModal}
                                type="button"
                                className="ml-2 px-5 py-1.5 rounded-full font-semibold bg-red-600 hover:bg-red-700 text-white text-base transition shadow focus:outline-none"
                              >
                                Wrong network
                              </button>
                            );
                          }
                          return (
                            <button
                              onClick={openAccountModal}
                              type="button"
                              className="ml-2 px-5 py-1.5 rounded-full font-semibold bg-emerald-600 hover:bg-emerald-700 text-white text-base transition shadow focus:outline-none"
                            >
                              {account.displayName}
                              {account.displayBalance ? ` (${account.displayBalance})` : ''}
                            </button>
                          );
                        })()}
                      </div>
                    );
                  }}
                </ConnectButton.Custom>
              </div>
            </div>
          </div>
        </header>
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Audit Log</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {displayed.map((coin, i) => (
                  <Link href={`/trade/${memecoins.indexOf(coin)}`} passHref legacyBehavior key={i}>
                    <tr className="hover:bg-neutral-800/60 transition cursor-pointer">
                      {/* Pair Info */}
                      <td className="px-4 py-2 flex items-center gap-3 min-w-[220px]">
                        <div className="w-10 h-10 rounded bg-neutral-800 flex items-center justify-center overflow-hidden">
                          <img src={coin.icon} alt={coin.name} width={60} height={60} />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-white leading-tight flex items-center gap-1 truncate">
                            {coin.name}
                            {coin.name === "Pornhub" && (
                              <FaCheckCircle className="text-emerald-400 ml-1" size={16} />
                            )}
                          </span>
                          <span className="text-xs text-neutral-400 truncate">{coin.label}</span>
                          <span className="text-xs text-neutral-500 mt-0.5">{coin.age}</span>
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
                          <span className="font-semibold text-white">{coin.marketCap}</span>
                          <span className={`text-xs font-medium ${coin.marketCapChangePos ? "text-emerald-400" : "text-red-400"}`}>{coin.marketCapChange}</span>
                        </div>
                      </td>
                      {/* Liquidity */}
                      <td className="px-4 py-2 text-neutral-300 align-middle">{coin.liquidity}</td>
                      {/* Volume */}
                      <td className="px-4 py-2 text-neutral-300 align-middle">{coin.volume}</td>
                      {/* TXNS */}
                      <td className="px-4 py-2 align-middle">
                        <div className="flex flex-col items-start">
                          <span className="font-semibold text-white">{coin.txns}</span>
                          <span className="text-xs">
                            <span className="text-emerald-400">{coin.txnsPos}</span>
                            <span className="text-neutral-400"> / </span>
                            <span className="text-red-400">{coin.txnsNeg}</span>
                          </span>
                        </div>
                      </td>
                      {/* Audit Log */}
                      <td className="px-4 py-2 align-middle">
                        <div className="flex flex-col gap-1">
                          <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1">
                            <FaCheckCircle className="inline" /> {coin.audit.percent}
                          </span>
                          <span className={`text-xs font-semibold flex items-center gap-1 ${coin.audit.status === "???" ? "text-red-400" : "text-emerald-400"}`}>
                            {coin.audit.status === "???" ? <FaQuestionCircle /> : <FaCheckCircle />} {coin.audit.status}
                          </span>
                          <span className={`text-xs flex items-center gap-1 ${coin.audit.power ? "text-emerald-400" : "text-neutral-400"}`}>
                            <FaPowerOff /> Off
                          </span>
                        </div>
                      </td>
                      {/* Action */}
                      <td className="px-4 py-2 align-middle">
                        <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-md font-semibold transition">Buy</button>
                      </td>
                    </tr>
                  </Link>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </>
  );
}
