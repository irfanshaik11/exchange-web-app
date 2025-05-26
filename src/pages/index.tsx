import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState } from "react";
import { FaGlobe, FaUser, FaSearch, FaCheckCircle, FaQuestionCircle, FaPowerOff } from "react-icons/fa";
import Image from "next/image";

const navLinks = [
  { name: "Discover", href: "/" },
  { name: "Pulse", href: "#" },
  { name: "Trackers", href: "#" },
  { name: "Perpetuals", href: "#" },
  { name: "Yield", href: "#" },
  { name: "Portfolio", href: "#" },
  { name: "Rewards", href: "#" },
];

const memecoins = [
  {
    icon: "/pepe.png",
    name: "PEPUMP",
    label: "PEPE PUMP",
    age: "18h",
    marketCap: "$2.58M",
    marketCapChange: "+0.65%",
    marketCapChangePos: true,
    liquidity: "$401K",
    volume: "$205K",
    txns: "2.79K",
    txnsPos: "1.37K",
    txnsNeg: "1.43K",
    audit: { percent: "+14.27%", status: "???", power: false },
  },
  {
    icon: "/pornhub.png",
    name: "Pornhub",
    label: "PORNHUB OF...",
    age: "53m",
    marketCap: "$45.4M",
    marketCapChange: "-72.4%",
    marketCapChangePos: false,
    liquidity: "$40.4K",
    volume: "$31.7K",
    txns: "2.37K",
    txnsPos: "2.12K",
    txnsNeg: "250",
    audit: { percent: "+13.45%", status: "100%", power: true },
  },
  {
    icon: "/fur.png",
    name: "Fur",
    label: "Furification",
    age: "1h",
    marketCap: "$18.7M",
    marketCapChange: "+112.8%",
    marketCapChangePos: true,
    liquidity: "$26.2K",
    volume: "$4.89K",
    txns: "2.21K",
    txnsPos: "1.98K",
    txnsNeg: "224",
    audit: { percent: "+13.48%", status: "100%", power: true },
  },
  {
    icon: "/gobli.png",
    name: "GOBLI",
    label: "Gobli",
    age: "22m",
    marketCap: "$8.7M",
    marketCapChange: "-85.5%",
    marketCapChangePos: false,
    liquidity: "$177K",
    volume: "$26.6K",
    txns: "2.19K",
    txnsPos: "1.94K",
    txnsNeg: "251",
    audit: { percent: "+13.45%", status: "100%", power: true },
  },
  {
    icon: "/pigmoon.png",
    name: "pigmoon",
    label: "pigmoon",
    age: "1h",
    marketCap: "$90.7M",
    marketCapChange: "+26.42%",
    marketCapChangePos: true,
    liquidity: "$57.1K",
    volume: "$3.57K",
    txns: "2.01K",
    txnsPos: "1.81K",
    txnsNeg: "201",
    audit: { percent: "+13.46%", status: "100%", power: true },
  },
  {
    icon: "/moonwhale.png",
    name: "MOON WHALE",
    label: "MOON WHALE...",
    age: "36m",
    marketCap: "$150K",
    marketCapChange: "+10.5%",
    marketCapChangePos: true,
    liquidity: "$147K",
    volume: "$495K",
    txns: "1.98K",
    txnsPos: "971",
    txnsNeg: "1.01K",
    audit: { percent: "+9.09%", status: "???", power: false },
  },
  {
    icon: "/bbc.png",
    name: "BBC",
    label: "Billionaire Boy...",
    age: "37m",
    marketCap: "$75.4K",
    marketCapChange: "+4.66%",
    marketCapChangePos: true,
    liquidity: "$92.8K",
    volume: "$76.2K",
    txns: "1.95K",
    txnsPos: "980",
    txnsNeg: "971",
    audit: { percent: "+4.87%", status: "???", power: false },
  },
];

export default function Home() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const isDiscover = router.pathname === "/";

  return (
    <>
      <Head>
        <title>Meme Dashboard</title>
        <meta name="description" content="Memecoin dashboard" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className="min-h-screen bg-neutral-950 text-neutral-100">
        {/* Header */}
        <header className="w-full border-b border-neutral-800 bg-neutral-900/90 backdrop-blur sticky top-0 z-20">
          <div className="max-w-full flex items-center justify-between px-8 py-3">
            {/* Left: Logo and Nav */}
            <div className="flex items-center gap-10 min-w-0">
              <span className="text-2xl font-extrabold tracking-tight text-white select-none flex items-center gap-2">
                <span className="w-6 h-6 bg-emerald-500 rounded-full inline-block mr-1" />
                Meme
                <span className="text-xs font-semibold text-neutral-400 ml-1">Pro</span>
              </span>
              <nav className="flex items-center gap-6 ml-8">
                {navLinks.map((link) => (
                  <Link
                    key={link.name}
                    href={link.href}
                    className={`px-1.5 py-0.5 rounded font-medium transition-colors text-base ${
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
              <button className="ml-2 px-5 py-1.5 rounded-full font-semibold bg-emerald-600 hover:bg-emerald-700 text-white text-base transition shadow focus:outline-none">
                Deposit
              </button>
              <div className="ml-2">
                <ConnectButton showBalance={false} chainStatus="icon" />
              </div>
            </div>
          </div>
        </header>
        {/* Section Header */}
        <div className="max-w-7xl mx-auto px-4 pt-8 pb-2 flex flex-col gap-2">
          <div className="flex items-center gap-4 text-lg font-semibold text-neutral-300">
            <span className="text-white">Trending</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-neutral-400 font-medium mt-2">
            <span className="">1m</span>
            <span className="text-emerald-400">5m</span>
            <span className="">30m</span>
            <span className="">1h</span>
            <span className="ml-4">Filter</span>
            <span className="ml-auto">Quick Buy</span>
            <span>Amount</span>
            <span>P1</span>
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
                {memecoins.map((coin, i) => (
                  <tr key={i} className="hover:bg-neutral-800/60 transition">
                    {/* Pair Info */}
                    <td className="px-4 py-3 flex items-center gap-3 min-w-[220px]">
                      <div className="w-10 h-10 rounded bg-neutral-800 flex items-center justify-center overflow-hidden">
                        <Image src={coin.icon} alt={coin.name} width={40} height={40} />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-white leading-tight flex items-center gap-1">
                          {coin.name}
                          {coin.name === "Pornhub" && (
                            <FaCheckCircle className="text-emerald-400 ml-1" size={16} />
                          )}
                        </span>
                        <span className="text-xs text-neutral-400">{coin.label}</span>
                        <span className="text-xs text-neutral-500 mt-0.5">{coin.age}</span>
                        <div className="flex gap-2 mt-1 text-neutral-400 text-xs">
                          <FaUser />
                          <FaGlobe />
                          <FaSearch />
                        </div>
                      </div>
                    </td>
                    {/* Market Cap */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-semibold text-white">{coin.marketCap}</span>
                        <span className={
                          `text-xs font-medium ${coin.marketCapChangePos ? "text-emerald-400" : "text-red-400"}`
                        }>{coin.marketCapChange}</span>
                      </div>
                    </td>
                    {/* Liquidity */}
                    <td className="px-4 py-3 text-neutral-300">{coin.liquidity}</td>
                    {/* Volume */}
                    <td className="px-4 py-3 text-neutral-300">{coin.volume}</td>
                    {/* TXNS */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-semibold text-white">{coin.txns}</span>
                        <span className="text-xs">
                          <span className="text-emerald-400">{coin.txnsPos}</span>
                          <span className="text-neutral-400"> / </span>
                          <span className="text-red-400">{coin.txnsNeg}</span>
                        </span>
                      </div>
                    </td>
                    {/* Audit Log */}
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3">
                      <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-md font-semibold transition">Buy</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </>
  );
}
