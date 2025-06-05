import { useRouter } from "next/router";
import { memecoins } from "../../data/memecoins";
import type { MemeCoin } from "../../data/memecoins";
import Head from "next/head";
import Link from "next/link";
import {
  FaGlobe,
  FaUser,
  FaSearch,
  FaCheckCircle,
  FaQuestionCircle,
  FaPowerOff,
  FaTimes,
} from "react-icons/fa";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useWallet } from "../../components/useWallet";
import { env } from "../../env";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import toast, { Toaster } from "react-hot-toast";
import LoginModal from "../../components/LoginModal";
import { useUser } from "../../components/UserContext";
import PriceChartWidget from "../../components/PriceChartWidget";
import Header from "../../components/Header";

export default function TradePage() {
  const router = useRouter();
  const { id } = router.query;
  const coin = memecoins[typeof id === "string" ? parseInt(id) : -1];
  const [chartHeight, setChartHeight] = useState(600);
  const { address, isConnected } = useWallet();
  const [sellPercentage, setSellPercentage] = useState("");
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [usdcAmount, setUsdcAmount] = useState("");
  const [memeAmount, setMemeAmount] = useState("");
  const [memePrice, setMemePrice] = useState<number | null>(null); // price in USDC per memecoin
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");
  const [tradeAmount, setTradeAmount] = useState<string>("");
  const amountOptions = ["0.1", "1", "10"];
  const [tradeHistory, setTradeHistory] = useState<any[]>([]);
  const [loginOpen, setLoginOpen] = useState(false);
  const { user, loading: userLoading } = useUser();

  // Helper to get backend URL
  const backendUrl = env.NEXT_PUBLIC_BACKEND_URL;

  useEffect(() => {
    console.log(user);
    function handleResize() {
      setChartHeight(window.innerHeight - 220);
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // On mount, randomize a price for the memecoin (e.g., 0.5 - 4.0 USDC)
  useEffect(() => {
    setMemePrice(Number((Math.random() * 3.5 + 0.5).toFixed(4)));
  }, []);

  // When USDC changes, update memeAmount
  function handleUsdcChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setUsdcAmount(val);
    const num = parseFloat(val);
    if (!isNaN(num) && memePrice) {
      setMemeAmount((num / memePrice).toFixed(4));
    } else {
      setMemeAmount("");
    }
  }

  // When memeAmount changes, update USDC
  function handleMemeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setMemeAmount(val);
    const num = parseFloat(val);
    if (!isNaN(num) && memePrice) {
      setUsdcAmount((num * memePrice).toFixed(4));
    } else {
      setUsdcAmount("");
    }
  }

  useEffect(() => {
    const handler = () => setLoginOpen(true);
    window.addEventListener("open-login-modal", handler);
    return () => window.removeEventListener("open-login-modal", handler);
  }, []);

  if (!coin) {
    return (
      <div className="mt-20 text-center text-2xl text-red-400">
        Memecoin not found
      </div>
    );
  }

  // Buy handler
  async function handleBuy() {
    if (!user || !tradeAmount) return;
    setTxLoading(true);
    setTxStatus(null);
    const tempAddress = "FMGU4vKjT3MW4GBTP8ru8JWs1R552FUU8PTqo65ppump";
    try {
      const res = await fetch(`${backendUrl}/api/trade/buy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.bearerToken}`,
        },
        body: JSON.stringify({
          tokenAddress: tempAddress,
          amount: parseFloat(tradeAmount),
          mevProtection: 0,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTxStatus("Buy transaction sent!");
        toast.success(
          `Buy order successful! Bought ${data.amount} ${coin.name}`,
        );
        setTradeHistory((prev) => [
          ...prev,
          {
            coin: coin,
            amount: data.amount,
            hash: data.hash,
            time: new Date().toLocaleTimeString(),
          },
        ]);
      } else setTxStatus(data?.error || "Buy failed");
    } catch (e) {
      setTxStatus("Buy failed");
    } finally {
      setTxLoading(false);
    }
  }

  // Sell by percentage handler
  async function handleSellPercentage() {
    if (!sellPercentage || !user) return;
    setTxLoading(true);
    setTxStatus(null);
    try {
      const res = await fetch(`${backendUrl}/api/trade/sell_percentage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenAddress: address,
          percentageToSell: parseFloat(sellPercentage),
        }),
      });
      const data = await res.json();
      if (res.ok) setTxStatus("Sell (percentage) transaction sent!");
      else setTxStatus(data?.error || "Sell failed");
    } catch (e) {
      setTxStatus("Sell failed");
    } finally {
      setTxLoading(false);
    }
  }

  // Sell by exact amount handler
  async function handleSellExactAmount() {
    if (!isConnected || !address || !tradeAmount) return;
    setTxLoading(true);
    setTxStatus(null);
    try {
      const res = await fetch(`${backendUrl}/api/trade/sell_exactAmount`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenAddress: address,
          tokenAmount: parseFloat(tradeAmount),
        }),
      });
      const data = await res.json();
      if (res.ok) setTxStatus("Sell (exact amount) transaction sent!");
      else setTxStatus(data?.error || "Sell failed");
    } catch (e) {
      setTxStatus("Sell failed");
    } finally {
      setTxLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>{coin.name} | Trade</title>
      </Head>
      <Toaster position="top-right" />
      <div className="h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-100">
        {/* Header */}
        <Header showSearch={false} />
        {/* Main Layout */}
        <div className="flex h-[calc(100vh-72px)] w-full flex-row gap-0">
          {/* Left: Chart and Info */}
          <div className="flex h-full min-w-0 flex-1 flex-col px-8 pt-8 pb-4">
            {/* Token Info Header */}
            <div className="mb-2 flex items-center gap-4">
              <img
                src={coin.icon}
                alt={coin.name}
                width={48}
                height={48}
                className="rounded"
              />
              <div>
                <div className="flex items-center gap-2 text-xl font-bold text-white">
                  {coin.name}
                </div>
                <div className="text-xs text-neutral-400">{coin.label}</div>
                <div className="mt-1 flex gap-2 text-xs text-neutral-400">
                  <FaUser />
                  <FaGlobe />
                  <FaSearch />
                </div>
              </div>
              <div className="ml-8 flex gap-8">
                <div>
                  <div className="text-xs text-neutral-400">Price</div>
                  <div className="text-lg font-semibold">
                    {memePrice ? `$${memePrice}` : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-neutral-400">Liquidity</div>
                  <div className="text-lg font-semibold">{coin.liquidity}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-400">Supply</div>
                  <div className="text-lg font-semibold">1B</div>
                </div>
              </div>
            </div>
            {/* Chart */}
            <PriceChartWidget tokenAddress={coin.tokenAddress} />
            {/* Tabs (Positions, Trades, etc.) */}
            <div className="mt-2 flex gap-4 rounded-lg bg-neutral-900 p-2 text-xs">
              <button className="rounded bg-neutral-800 px-3 py-1 font-semibold text-white">
                Positions
              </button>
              <button className="rounded px-3 py-1 text-neutral-400">
                Trades
              </button>
              <button className="rounded px-3 py-1 text-neutral-400">
                Orders
              </button>
              <button className="rounded px-3 py-1 text-neutral-400">
                Holders
              </button>
              <button className="rounded px-3 py-1 text-neutral-400">
                Top Traders
              </button>
              <button className="rounded px-3 py-1 text-neutral-400">
                Dev Tokens
              </button>
            </div>
            <div className="mt-2 rounded-lg bg-neutral-900 p-4 text-center text-xs text-neutral-400">
              [Positions Table Placeholder]
            </div>
          </div>
          {/* Right: Buy/Sell and Token Info */}
          <div className="flex h-full w-[380px] flex-shrink-0 flex-col border-l border-neutral-800 bg-neutral-950 p-4">
            {/* Stats Box */}
            <div className="mb-4 rounded-lg bg-neutral-900 p-4 text-xs">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] text-neutral-400">5m Vol</span>
                <span className="text-[11px] text-neutral-400">Buys</span>
                <span className="text-[11px] text-neutral-400">Sells</span>
                <span className="text-[11px] text-neutral-400">Net Vol.</span>
              </div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-base font-semibold text-white">
                  $51.2K
                </span>
                <span className="text-emerald-400">767 / $26K</span>
                <span className="text-red-400">732 / $25.2K</span>
                <span className="text-emerald-400">+$768.2</span>
              </div>
            </div>
            {/* Trade Box */}
            <div
              className={`mb-4 flex flex-col gap-2 rounded-lg bg-neutral-900 p-6 shadow-lg`}
            >
              {/* Toggle */}
              <div className="mb-4 flex w-full overflow-hidden rounded-[4px] border border-neutral-800">
                <button
                  className={`w-full px-6 py-2 text-sm font-bold transition-all ${
                    tradeMode === "buy"
                      ? "bg-emerald-500 text-white"
                      : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800"
                  }`}
                  onClick={() => setTradeMode("buy")}
                  type="button"
                >
                  BUY
                </button>
                <button
                  className={`w-full px-6 py-2 text-sm font-bold transition-all ${
                    tradeMode === "sell"
                      ? "bg-red-500 text-white"
                      : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800"
                  }`}
                  onClick={() => setTradeMode("sell")}
                  type="button"
                >
                  SELL
                </button>
              </div>
              {/* Tabs: Market, Limit, Adv. */}
              {/* <div className="flex items-center gap-4 mb-3 text-sm font-semibold">
                <button className="border-b-2 border-emerald-400 text-emerald-400 pb-1">Market</button>
                <button className="text-neutral-400 pb-1">Limit</button>
                <button className="text-neutral-400 pb-1">Adv.</button>
                <div className="flex items-center ml-auto gap-2 text-neutral-400">
                  <span className="bg-neutral-800 rounded px-2 py-0.5 text-xs flex items-center gap-1"><svg width='16' height='16' fill='none'><rect width='16' height='16' rx='4' fill='#23272A'/><path d='M4 8h8M8 4v8' stroke='#A3E635' strokeWidth='2' strokeLinecap='round'/></svg>1</span>
                  <span className="bg-neutral-800 rounded px-2 py-0.5 text-xs flex items-center gap-1"><svg width='16' height='16' fill='none'><rect width='16' height='16' rx='4' fill='#23272A'/><path d='M8 4v8' stroke='#A3E635' strokeWidth='2' strokeLinecap='round'/></svg>0</span>
                </div>
              </div> */}
              {/* Amount Row */}
              <div className="mb-2 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs font-semibold text-neutral-400">
                    AMOUNT
                  </span>
                  <span className="text-xs font-bold text-white">
                    {tradeAmount || "-"}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {amountOptions.map((opt) => (
                    <button
                      key={opt}
                      className={`rounded border border-neutral-700 px-4 py-1 text-xs font-semibold text-white transition-all ${
                        tradeAmount === opt
                          ? tradeMode === "buy"
                            ? "bg-emerald-600"
                            : "bg-red-500"
                          : ""
                      }`}
                      onClick={() => setTradeAmount(opt)}
                      type="button"
                    >
                      {opt}
                    </button>
                  ))}
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="ml-2 w-20 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs font-semibold text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    placeholder="100"
                    value={
                      amountOptions.includes(tradeAmount) ? "" : tradeAmount
                    }
                    onChange={(e) => setTradeAmount(e.target.value)}
                  />
                  <svg width="20" height="20" fill="none" className="ml-2">
                    <rect width="20" height="20" rx="4" fill="#23272A" />
                    <path
                      d="M5 10h10M10 5v10"
                      stroke="#A3E635"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>
              {/* Action Button */}
              <button
                className={`mt-2 w-full rounded py-3 text-xs font-bold transition disabled:opacity-50 ${
                  tradeMode === "buy"
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-red-600 text-white hover:bg-red-700"
                }`}
                onClick={
                  tradeMode === "buy"
                    ? () => handleBuy()
                    : () => handleSellExactAmount()
                }
                disabled={
                  txLoading ||
                  !tradeAmount ||
                  parseFloat(tradeAmount) <= 0
                }
              >
                {txLoading
                  ? "Processing..."
                  : `${tradeMode === "buy" ? "BUY" : "SELL"}  ${tradeAmount || ""} ${coin.name}`}
              </button>
              {txStatus && (
                <div className="mt-2 text-center text-xs text-emerald-400">
                  {txStatus}
                </div>
              )}
            </div>
            <div className="rounded-lg bg-neutral-900 p-4">
              <div className="mb-2 text-xs text-neutral-400">Token Info</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex flex-col items-center rounded bg-neutral-800 p-2">
                  <span className="font-bold text-emerald-400">9.39%</span>
                  <span className="text-neutral-400">Top 10 H.</span>
                </div>
                <div className="flex flex-col items-center rounded bg-neutral-800 p-2">
                  <span className="font-bold text-neutral-400">0%</span>
                  <span className="text-neutral-400">Dev H.</span>
                </div>
                <div className="flex flex-col items-center rounded bg-neutral-800 p-2">
                  <span className="font-bold text-red-400">20.37%</span>
                  <span className="text-neutral-400">Snipers H.</span>
                </div>
                <div className="flex flex-col items-center rounded bg-neutral-800 p-2">
                  <span className="font-bold text-red-400">20.02%</span>
                  <span className="text-neutral-400">Insiders</span>
                </div>
                <div className="flex flex-col items-center rounded bg-neutral-800 p-2">
                  <span className="font-bold text-red-400">29.55%</span>
                  <span className="text-neutral-400">Bundlers</span>
                </div>
                <div className="flex flex-col items-center rounded bg-neutral-800 p-2">
                  <span className="font-bold text-red-400">LP Burned</span>
                  <span className="text-neutral-400">LP Burned</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Trade History Table */}
        <div className="mx-auto mt-4 max-w-4xl rounded-lg bg-neutral-900 p-4">
          <div className="mb-2 text-lg font-bold text-white">Trade History</div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-neutral-400">
                <th className="px-2 py-1">Time</th>
                <th className="px-2 py-1">Coin</th>
                <th className="px-2 py-1">Amount</th>
                <th className="px-2 py-1">Hash</th>
              </tr>
            </thead>
            <tbody>
              {tradeHistory.map((trade, idx) => (
                <tr key={idx} className="border-t border-neutral-800">
                  <td className="px-2 py-1">{trade.time}</td>
                  <td className="flex items-center gap-2 px-2 py-1">
                    <img
                      src={trade.coin.icon}
                      alt={trade.coin.name}
                      className="h-5 w-5 rounded"
                    />
                    {trade.coin.name}
                  </td>
                  <td className="px-2 py-1">{trade.amount}</td>
                  <td className="max-w-[120px] truncate px-2 py-1">
                    {trade.hash}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      </div>
    </>
  );
}
