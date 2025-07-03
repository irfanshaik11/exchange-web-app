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
import useTokenWebSocket from "../../hooks/useTokenWebSocket";

export default function TradePage() {
  const router = useRouter();
  const { id } = router.query;
  const [token, setToken] = useState<Token | null>(null);
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

  useTokenWebSocket();

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
        <button 
          onClick={() => router.reload()}
          className="ml-4 px-4 py-2 bg-neutral-800 text-white rounded hover:bg-neutral-700"
        >
          Retry
        </button>
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
        <title>{token ? `${token.name} - Interstate UI` : "Loading..."}</title>
        <meta name="description" content="Interstate UI" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-neutral-900">
        <Header />

        {loading ? (
          <div className="mt-20 text-center text-2xl text-neutral-400">
            Loading...
          </div>
        ) : !token ? (
          <div className="mt-20 text-center text-2xl text-red-400">
            Token not found
            <button 
              onClick={() => router.reload()}
              className="ml-4 px-4 py-2 bg-neutral-800 text-white rounded hover:bg-neutral-700"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {/* Trade Header */}
            <TradeHeader token={token} />

            {/* Main Content */}
            <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
              {/* Chart */}
              <div className="lg:col-span-2">
                <PriceChartWidget
                  token={token}
                />
              </div>

              {/* Trade Action Panel */}
              <div>
                <TradeActionPanel
                  token={token}
                />
              </div>
            </div>

            {/* Trade Tabs */}
            <div className="mt-8">
              <TradeTabs
                selectedTab={selectedTab}
                setSelectedTab={setSelectedTab}
              />
              {selectedTab === "Trades" ? (
                <Trades token={token} />
              ) : (
                user?.id ? <Positions userId={user.id} /> : null
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
