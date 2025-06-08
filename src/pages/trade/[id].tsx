import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import type { DexToken } from "~/utils/moralis";
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
import { useWallet } from "../../components/useWallet";
import { env } from "../../env";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import toast, { Toaster } from "react-hot-toast";
import LoginModal from "../../components/LoginModal";
import { useUser } from "../../components/UserContext";
import PriceChartWidget from "../../components/PriceChartWidget";
import Header from "../../components/Header";

function formatUSD(value: number | string | undefined) {
  if (value === undefined || value === null || isNaN(Number(value))) return '-';
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function formatNumber(value: number | string | undefined) {
  if (value === undefined || value === null || isNaN(Number(value))) return '-';
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function TradePage() {
  const router = useRouter();
  const { id } = router.query;
  const [token, setToken] = useState<DexToken | null>(null);
  const [loading, setLoading] = useState(true);
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
  const backendUrl = env.NEXT_PUBLIC_BACKEND_URL;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/token/${id}`)
      .then(res => res.json())
      .then((data: { result: DexToken | null }) => {
        setToken(data.result || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    function handleResize() {
      setChartHeight(window.innerHeight - 220);
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
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

  if (loading) {
    return (
      <div className="mt-20 text-center text-2xl text-neutral-400">
        Loading...
      </div>
    );
  }

  if (!token) {
    return (
      <div className="mt-20 text-center text-2xl text-red-400">
        Token not found
      </div>
    );
  }

  // Buy handler (update as needed for your backend)
  async function handleBuy() {
    if (!user || !tradeAmount) return;
    setTxLoading(true);
    setTxStatus(null);
    try {
      const res = await fetch(`${backendUrl}/api/trade/buy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.bearerToken}`,
        },
        body: JSON.stringify({
          tokenAddress: token.tokenAddress,
          amount: parseFloat(tradeAmount),
          mevProtection: 0,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTxStatus("Buy transaction sent!");
        toast.success(
          `Buy order successful! Bought ${data.amount} ${token.symbol}`,
        );
        setTradeHistory((prev) => [
          ...prev,
          {
            pair: token,
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

  // Sell by percentage handler (with auth, like buy)
  async function handleSellPercentage() {
    if (!sellPercentage || !user) return;
    setTxLoading(true);
    setTxStatus(null);
    try {
      const res = await fetch(`${backendUrl}/api/trade/sell_percentage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.bearerToken}`,
        },
        body: JSON.stringify({
          tokenAddress: token.tokenAddress,
          percentageToSell: parseFloat(sellPercentage),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTxStatus(data.message || "Sell (percentage) transaction sent!");
        toast.success(data.message || "Sell order successful!");
        setTradeHistory((prev) => [
          ...prev,
          {
            pair: token,
            amount: `${sellPercentage}%`,
            hash: data.hash,
            time: new Date().toLocaleTimeString(),
          },
        ]);
      } else setTxStatus(data?.message || data?.error || "Sell failed");
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
        <title>{token?.name} | Trade</title>
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
                src={token.logo}
                alt={token.name}
                width={48}
                height={48}
                className="rounded"
              />
              <div>
                <div className="flex items-center gap-2 text-xl font-bold text-white">
                  {token.name}
                </div>
                <div className="text-xs text-neutral-400">{token.symbol}</div>
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
                    ${token.priceUsd}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-neutral-400">Liquidity</div>
                  <div className="text-lg font-semibold">{formatUSD(token.liquidity)}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-400">FDV</div>
                  <div className="text-lg font-semibold">{formatUSD(token.fullyDilutedValuation)}</div>
                </div>
              </div>
            </div>
            {/* Chart */}
            <PriceChartWidget tokenAddress={token.tokenAddress} />
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
              {/* Amount Row (Buy or Sell) */}
              {tradeMode === "buy" ? (
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
                      value={amountOptions.includes(tradeAmount) ? "" : tradeAmount}
                      onChange={(e) => setTradeAmount(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="mb-2 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1 text-xs font-semibold text-neutral-400">
                      PERCENTAGE
                    </span>
                    <span className="text-xs font-bold text-white">
                      {sellPercentage || "-"}%
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {["25", "50", "100"].map((opt) => (
                      <button
                        key={opt}
                        className={`rounded border border-neutral-700 px-2 py-1 text-xs font-semibold text-white transition-all ${
                          sellPercentage === opt ? "bg-red-500" : ""
                        }`}
                        onClick={() => setSellPercentage(opt)}
                        type="button"
                      >
                        {opt}%
                      </button>
                    ))}
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      className="ml-2 w-20 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs font-semibold text-white focus:ring-2 focus:ring-red-500 focus:outline-none"
                      placeholder="Custom %"
                      value={(["25", "50", "100"].includes(sellPercentage) ? "" : sellPercentage) || ""}
                      onChange={(e) => {
                        let val = e.target.value;
                        if (parseFloat(val) > 100) val = "100";
                        setSellPercentage(val);
                      }}
                    />
                  </div>
                </div>
              )}
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
                    : () => handleSellPercentage()
                }
                disabled={
                  txLoading ||
                  (tradeMode === "buy"
                    ? !tradeAmount || parseFloat(tradeAmount) <= 0
                    : !sellPercentage || parseFloat(sellPercentage) <= 0)
                }
              >
                {txLoading
                  ? "Processing..."
                  : tradeMode === "buy"
                  ? `BUY  ${tradeAmount || ""} ${token?.symbol}`
                  : `SELL  ${sellPercentage || ""}% ${token?.symbol}`}
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
                      src={token.logo}
                      alt={token.name}
                      className="h-5 w-5 rounded"
                    />
                    {token.name}
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

