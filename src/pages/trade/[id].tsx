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
import TradeHeader from '../../components/trade/TradeHeader';
import TradeActionPanel from '../../components/trade/TradeActionPanel';
import TradeTabs from '../../components/trade/TradeTabs';
import TradeTable from '../../components/trade/TradeTable';

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
          <div className="flex h-full min-w-0 flex-1 flex-col pb-4">
            {/* Token Info Header */}
            <TradeHeader token={token} mockData={{
              supply: '1B',
              globalFees: '50.46',
              age: '21h',
              crownCount: 1,
              holders: '---', // placeholder if needed
              website: '---' // placeholder if needed
            }} />
            {/* Chart */}
            <PriceChartWidget tokenAddress={token.tokenAddress} />
            {/* Tabs (Positions, Trades, etc.) */}
            <TradeTabs />
            <div className="mt-2 rounded-lg bg-neutral-900 p-4 text-center text-xs text-neutral-400">
              [Positions Table Placeholder]
            </div>
          </div>
          {/* Right: Buy/Sell and Token Info */}
          <TradeActionPanel token={token} />
        </div>
        {/* Trade History Table */}
        <TradeTable token={token} />
        <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      </div>
    </>
  );
}

