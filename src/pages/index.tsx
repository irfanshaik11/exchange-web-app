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
  const [displayed, setDisplayed] = useState<DexToken[]>([]);
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
          <div className="bg-neutral-900/80 shadow-lg overflow-x-auto border border-neutral-800">
            <table className="min-w-full divide-y divide-neutral-800">
              <thead>
                <tr className="bg-neutral-800/80">
                  <th className="px-3 py-4 text-left text-xs font-bold tracking-wide uppercase text-neutral-200">Pair Info</th>
                  <th className="px-3 py-4 text-left text-xs font-bold tracking-wide uppercase text-neutral-200">Market Cap</th>
                  <th className="px-3 py-4 text-left text-xs font-bold tracking-wide uppercase text-neutral-200">Liquidity</th>
                  <th className="px-3 py-4 text-left text-xs font-bold tracking-wide uppercase text-neutral-200">Volume</th>
                  <th className="px-3 py-4 text-left text-xs font-bold tracking-wide uppercase text-neutral-200 flex items-center gap-1">TXNS <span className="text-[10px]">↓</span></th>
                  <th className="px-3 py-4 text-left text-xs font-bold tracking-wide uppercase text-neutral-200">Audit Log</th>
                  <th className="px-3 py-4 text-left text-xs font-bold tracking-wide uppercase text-neutral-200">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {displayed.map((token, i) => (
                  <tr
                    className="hover:bg-neutral-800/60 transition cursor-pointer"
                    key={token.tokenAddress}
                  >
                    {/* Pair Info */}
                    <td className="px-3 py-2 w-auto align-middle">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-neutral-800 flex items-center justify-center overflow-hidden border border-yellow-400">
                          <img src={token.logo} alt={token.name} width={32} height={32} className="object-cover w-8 h-8" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-white text-xs leading-tight truncate">{token.name}</span>
                            <span className="text-neutral-400 text-[11px] font-medium truncate">Father Of Fartcoin</span>
                            <FaCopy className="ml-1 text-neutral-500 text-xs cursor-pointer" />
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-emerald-400 text-[11px] font-semibold">{[56,26,31,14][i%4]}m</span>
                            <FaUser className="text-sky-400 text-xs" />
                            <FaGlobe className="text-sky-400 text-xs" />
                            <FaSearch className="text-sky-400 text-xs" />
                            {i === 1 && <span className="text-red-600"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186c-.197-.74-.777-1.32-1.517-1.517C20.34 4.333 12 4.333 12 4.333s-8.34 0-9.981.336c-.74.197-1.32.777-1.517 1.517C.166 7.827.166 12 .166 12s0 4.173.336 5.814c.197.74.777 1.32 1.517 1.517C3.66 19.667 12 19.667 12 19.667s8.34 0 9.981-.336c.74-.197 1.32-.777 1.517-1.517.336-1.641.336-5.814.336-5.814s0-4.173-.336-5.814zM9.797 15.568V8.432l6.568 3.568-6.568 3.568z"/></svg></span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    {/* Market Cap */}
                    <td className="px-3 py-2 align-middle">
                      <div className="text-neutral-100 text-xs">{formatUSD([397000,189000,36000,4010][i%4])}</div>
                      <div className={`text-[11px] font-semibold mt-0.5 ${i === 3 ? 'text-red-400' : 'text-emerald-400'}`}>{['+18.43%','+103.5%','+35.71%','-96.2%'][i%4]}</div>
                    </td>
                    {/* Liquidity */}
                    <td className="px-3 py-2 align-middle">
                      <div className="text-neutral-100 text-xs">{formatUSD([72700,47500,43900,6890][i%4])}</div>
                    </td>
                    {/* Volume */}
                    <td className="px-3 py-2 align-middle">
                      <div className="text-neutral-100 text-xs">{formatUSD([168000,117000,136000,147000][i%4])}</div>
                    </td>
                    {/* TXNS */}
                    <td className="px-3 py-2 align-middle">
                      <div className="text-neutral-100 text-xs">{[1550,1500,1390,1380][i%4]/1000}K</div>
                      <div className="text-[11px] font-semibold mt-0.5">
                        <span className="text-emerald-400">{[804,736,829,507][i%4]}</span>
                        <span className="text-neutral-400"> / </span>
                        <span className="text-red-400">{[751,764,563,875][i%4]}</span>
                      </div>
                    </td>
                    {/* Audit Log */}
                    <td className="px-3 py-2 align-middle">
                      <div className="flex flex-col gap-0.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-400 px-1.5 py-0.5 rounded"><FaUser className="text-red-400 text-xs" /> {['18.27%','21.67%','17.77%','6.9%'][i%4]}</span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400  px-1.5 py-0.5 rounded"><FaCheckCircle className="text-emerald-400 text-xs" /> {['100%','100%','???','100%'][i%4]}</span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-300 px-1.5 py-0.5 rounded"><FaQuestionCircle className="text-sky-300 text-xs" /> Off</span>
                      </div>
                    </td>
                    {/* Action */}
                    <td className="px-3 py-2 align-middle">
                      <InterstateButton
                        variant="primary"
                        size="sm"
                        className="!px-4 !py-1 text-xs"
                        onClick={e => {
                          e.stopPropagation();
                          router.push(`/trade/${token.tokenAddress}`);
                        }}
                      >
                        Buy 0.05 SOL
                      </InterstateButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
        <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      </div>
    </>
  );
}
