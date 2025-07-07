import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import type { Token } from "~/utils/db";
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
import { useUser } from "../../components/UserContext";
import PriceChartWidget from "../../components/PriceChartWidget";
import Header from "../../components/Header";
import TradeHeader from "../../components/trade/TradeHeader";
import TradeActionPanel from "../../components/trade/TradeActionPanel";
import TradeTabs from "../../components/trade/TradeTabs";
import { formatSmartNumber } from "~/utils/db";
import Trades from "../../components/trade/Trades";
import Positions from "~/components/trade/Positions";
import useSingleTokenWebSocket from "../../hooks/useSingleTokenWebSocket";

export default function TradePage() {
  const router = useRouter();
  const { id } = router.query;
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
  const { user, loading: userLoading } = useUser();
  const backendUrl = env.NEXT_PUBLIC_BACKEND_URL;
  const [selectedTab, setSelectedTab] = useState("Trades");
  const [search, setSearch] = useState("");

  // WebSocket per-token service
  const { data: token, isConnected: wsConnected, error: wsError } = useSingleTokenWebSocket(
    typeof id === "string" ? id : undefined
  );

  useEffect(() => {
    if (token || wsError) setLoading(false);
  }, [token, wsError]);

  useEffect(() => {
    if (token) {
      console.log('WebSocket token data:', token);
    }
  }, [token]);

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
        {wsError && (
          <div className="mt-4 text-sm text-neutral-400">
            WebSocket Error: {wsError}
          </div>
        )}
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
          tokenAddress: token.token_address,
          amount: parseFloat(tradeAmount),
          mevProtection: 0,
          solPrice: token.sol_price,
          marketCap: token.total_fully_diluted_valuation,
          tokenPrice: token.usd_price,
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
          tokenAddress: token.token_address,
          percentageToSell: parseFloat(sellPercentage),
          solPrice: token.sol_price,
          marketCap: token.total_fully_diluted_valuation,
          tokenPrice: token.usd_price,
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
          solPrice: token?.sol_price,
          marketCap: token?.total_fully_diluted_valuation,
          tokenPrice: token?.usd_price,
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
      <div className="min-h-screen w-full flex flex-col bg-neutral-950 text-neutral-100">
        {/* Header always at the top, full width */}
        <Header search={search} setSearch={setSearch} />
        {/* Main content: flex row, fills the rest of the page */}
        <div className="flex flex-1 flex-row w-full">
          {/* Left: Chart and Info */}
          <div className="flex-1 min-w-0 flex flex-col pb-4 border-r border-emerald-950">
            <TradeHeader token={token} />
            <div className="min-h-[500px] flex-1">
              <PriceChartWidget token={token} />
            </div>
            <hr className="border-emerald-950" />
            <TradeTabs
              selectedTab={selectedTab}
              setSelectedTab={setSelectedTab}
            />
            {selectedTab === "Trades" && <Trades token={token} />}
            {selectedTab === "Positions" && <Positions userId={user?.id} />}
          </div>
          {/* Right: Buy/Sell and Token Info */}
          <div className="w-full max-w-md flex-shrink-0">
            <TradeActionPanel token={token} />
          </div>
        </div>
      </div>
    </>
  );
}
