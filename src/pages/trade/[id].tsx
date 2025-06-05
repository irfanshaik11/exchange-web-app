import { useRouter } from "next/router";
import { memecoins } from "../../data/memecoins";
import type { MemeCoin } from "../../data/memecoins";
import Head from "next/head";
import Link from "next/link";
import { FaGlobe, FaUser, FaSearch, FaCheckCircle, FaQuestionCircle, FaPowerOff, FaTimes } from "react-icons/fa";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useWallet } from "../../components/useWallet";
import { env } from "../../env";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import toast, { Toaster } from 'react-hot-toast';

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
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>("buy");
  const [tradeAmount, setTradeAmount] = useState<string>("");
  const amountOptions = ["0.1", "1", "10"];
  const [tradeHistory, setTradeHistory] = useState<any[]>([]);

  // Helper to get backend URL
  const backendUrl = env.NEXT_PUBLIC_BACKEND_URL;

  useEffect(() => {
    function handleResize() {
      setChartHeight(window.innerHeight - 220);
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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

  if (!coin) {
    return <div className="text-center mt-20 text-2xl text-red-400">Memecoin not found</div>;
  }

  // Header from index.tsx
  const navLinks = [
    { name: "Discover", href: "/" },
    { name: "Pulse", href: "#" },
    { name: "Trackers", href: "#" },
    { name: "Perpetuals", href: "#" },
    { name: "Yield", href: "#" },
    { name: "Portfolio", href: "#" },
    { name: "Rewards", href: "#" },
  ];

  // Buy handler
  async function handleBuy() {
    console.log(tradeAmount, isConnected)
    if (!isConnected || !address || !tradeAmount) return;
    setTxLoading(true);
    setTxStatus(null);
    const tempAddress = "FMGU4vKjT3MW4GBTP8ru8JWs1R552FUU8PTqo65ppump";
    try {
      const res = await fetch(`${backendUrl}/api/trade/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenAddress: tempAddress, amount: parseFloat(tradeAmount), mevProtection: 0 }),
      });
      const data = await res.json();
      if (res.ok) {
        setTxStatus("Buy transaction sent!");
        toast.success(`Buy order successful! Bought ${data.amount} ${coin.name}`);
        setTradeHistory(prev => [
          ...prev,
          {
            coin: coin,
            amount: data.amount,
            hash: data.hash,
            time: new Date().toLocaleTimeString(),
          }
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
    if (!isConnected || !address || !sellPercentage) return;
    setTxLoading(true);
    setTxStatus(null);
    try {
      const res = await fetch(`${backendUrl}/api/trade/sell_percentage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenAddress: address, percentageToSell: parseFloat(sellPercentage) }),
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
        body: JSON.stringify({ tokenAddress: address, tokenAmount: parseFloat(tradeAmount) }),
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
      <div className="h-screen w-screen bg-neutral-950 text-neutral-100 overflow-hidden">
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
                      link.name === "Discover"
                        ? "text-emerald-400 border-b-2 border-emerald-400"
                        : "text-neutral-200 hover:text-emerald-400"
                    }`}
                  >
                    {link.name}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-4 min-w-0">
              {/* Wallet Connect UI - RainbowKit */}
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
                                className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full text-xs font-semibold"
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
                                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-full text-xs font-semibold"
                              >
                                Wrong network
                              </button>
                            );
                          }
                          return (
                            <button
                              onClick={openAccountModal}
                              type="button"
                              className="flex items-center gap-2 px-3 py-1 bg-neutral-800 text-emerald-400 rounded-full text-xs font-semibold border border-emerald-400"
                            >
                              <FaPowerOff />
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
              <div className="relative group w-full max-w-xs">
                <span className="absolute inset-y-0 left-3 flex items-center text-neutral-400 group-focus-within:text-emerald-400 transition-colors">
                  <FaSearch size={16} />
                </span>
                <input
                  type="text"
                  placeholder="Search by token or CA..."
                  className="w-full bg-neutral-800/80 border border-neutral-700 rounded-full pl-9 pr-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent hover:bg-neutral-800 transition-all duration-200 shadow-lg"
                />
                <button
                  className="absolute inset-y-0 right-3 flex items-center opacity-0 group-focus-within:opacity-100 transition-opacity"
                  onClick={() => console.log('Search clicked')}
                  >
                    <FaTimes className="text-neutral-400 hover:text-red-400" size={14} />
                  </button>
              </div>
            </div>
          </div>
        </header>
        {/* Main Layout */}
        <div className="flex flex-row h-[calc(100vh-72px)] w-full gap-0">
          {/* Left: Chart and Info */}
          <div className="flex-1 min-w-0 flex flex-col h-full px-8 pt-8 pb-4">
            {/* Token Info Header */}
            <div className="flex items-center gap-4 mb-2">
              <img src={coin.icon} alt={coin.name} width={48} height={48} className="rounded" />
              <div>
                <div className="text-xl font-bold text-white flex items-center gap-2">{coin.name}</div>
                <div className="text-neutral-400 text-xs">{coin.label}</div>
                <div className="flex gap-2 mt-1 text-neutral-400 text-xs">
                  <FaUser />
                  <FaGlobe />
                  <FaSearch />
                </div>
              </div>
              <div className="ml-8 flex gap-8">
                <div>
                  <div className="text-neutral-400 text-xs">Price</div>
                  <div className="text-lg font-semibold">{memePrice ? `$${memePrice}` : "-"}</div>
                </div>
                <div>
                  <div className="text-neutral-400 text-xs">Liquidity</div>
                  <div className="text-lg font-semibold">{coin.liquidity}</div>
                </div>
                <div>
                  <div className="text-neutral-400 text-xs">Supply</div>
                  <div className="text-lg font-semibold">1B</div>
                </div>
              </div>
            </div>
            {/* Chart */}
            <div className="bg-neutral-900 rounded-lg p-4 mb-4 flex-1 flex flex-col min-h-0 min-w-0">
              <iframe
                src="https://s.tradingview.com/widgetembed/?frameElementId=tradingview_btc_chart&symbol=BINANCE:BTCUSDT&interval=15&hidesidetoolbar=1&symboledit=1&saveimage=1&toolbarbg=18181b&studies=[]&theme=dark&style=1&timezone=Etc/UTC&withdateranges=1&hidevolume=0&hidelegend=0&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&locale=en"
                id="tradingview_btc_chart"
                style={{ width: '100%', height: chartHeight, border: 0 }}
                allowFullScreen
                title="BTC Chart"
              />
            </div>
            {/* Tabs (Positions, Trades, etc.) */}
            <div className="bg-neutral-900 rounded-lg p-2 flex gap-4 text-xs mt-2">
              <button className="px-3 py-1 rounded bg-neutral-800 text-white font-semibold">Positions</button>
              <button className="px-3 py-1 rounded text-neutral-400">Trades</button>
              <button className="px-3 py-1 rounded text-neutral-400">Orders</button>
              <button className="px-3 py-1 rounded text-neutral-400">Holders</button>
              <button className="px-3 py-1 rounded text-neutral-400">Top Traders</button>
              <button className="px-3 py-1 rounded text-neutral-400">Dev Tokens</button>
            </div>
            <div className="bg-neutral-900 rounded-lg p-4 mt-2 text-neutral-400 text-center text-xs">[Positions Table Placeholder]</div>
          </div>
          {/* Right: Buy/Sell and Token Info */}
          <div className="w-[380px] flex-shrink-0 h-full bg-neutral-950 border-l border-neutral-800 flex flex-col p-4">
            {/* Stats Box */}
            <div className="bg-neutral-900 rounded-lg p-4 mb-4 text-xs">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[11px] text-neutral-400">5m Vol</span>
                <span className="text-[11px] text-neutral-400">Buys</span>
                <span className="text-[11px] text-neutral-400">Sells</span>
                <span className="text-[11px] text-neutral-400">Net Vol.</span>
              </div>
              <div className="flex justify-between items-center mb-3">
                <span className="text-base text-white font-semibold">$51.2K</span>
                <span className="text-emerald-400">767 / $26K</span>
                <span className="text-red-400">732 / $25.2K</span>
                <span className="text-emerald-400">+$768.2</span>
              </div>
            </div>
            {/* Trade Box */}
            <div
              className={`rounded-lg p-6 flex flex-col gap-2 mb-4 shadow-lg bg-neutral-900`}
            >
              {/* Toggle */}
              <div className="flex mb-4 rounded-[4px] overflow-hidden border border-neutral-800 w-full">
                <button
                  className={`px-6 py-2 w-full font-bold text-sm transition-all ${
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
                  className={`px-6 py-2 w-full font-bold text-sm transition-all ${
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
              <div className="bg-neutral-900 rounded-lg px-4 py-3 mb-2 border border-neutral-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-neutral-400 text-xs font-semibold flex items-center gap-1">AMOUNT</span>
                  <span className="text-white text-xs font-bold">{tradeAmount || "-"}</span>
                </div>
                <div className="flex gap-2 mt-2 items-center">
                  {amountOptions.map((opt) => (
                    <button
                      key={opt}
                      className={`px-4 text-xs py-1 rounded text-white font-semibold border border-neutral-700 transition-all ${
                        tradeAmount === opt ? (tradeMode === "buy" ? "bg-emerald-600" : "bg-red-500") : ""
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
                    className="w-20 px-2 py-1 rounded bg-neutral-800 text-white font-semibold border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 ml-2 text-xs"
                    placeholder="100"
                    value={amountOptions.includes(tradeAmount) ? "" : tradeAmount}
                    onChange={e => setTradeAmount(e.target.value)}
                  />
                  <svg width='20' height='20' fill='none' className='ml-2'><rect width='20' height='20' rx='4' fill='#23272A'/><path d='M5 10h10M10 5v10' stroke='#A3E635' strokeWidth='2' strokeLinecap='round'/></svg>
                </div>
              </div>
              {/* Action Button */}
              <button
                className={`w-full font-bold py-3 rounded text-xs disabled:opacity-50 mt-2 transition ${
                  tradeMode === "buy"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-red-600 hover:bg-red-700 text-white"
                }`}
                onClick={tradeMode === "buy" ? () => handleBuy() : () => handleSellExactAmount()}
                disabled={!isConnected || txLoading || !tradeAmount || parseFloat(tradeAmount) <= 0}
              >
                {txLoading
                  ? "Processing..."
                  : `${tradeMode === "buy" ? "BUY" : "SELL"}  ${tradeAmount || ""} ${coin.name}`}
              </button>
              {txStatus && <div className="text-center text-xs mt-2 text-emerald-400">{txStatus}</div>}
            </div>
            <div className="bg-neutral-900 rounded-lg p-4">
              <div className="text-xs text-neutral-400 mb-2">Token Info</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-neutral-800 rounded p-2 flex flex-col items-center">
                  <span className="text-emerald-400 font-bold">9.39%</span>
                  <span className="text-neutral-400">Top 10 H.</span>
                </div>
                <div className="bg-neutral-800 rounded p-2 flex flex-col items-center">
                  <span className="text-neutral-400 font-bold">0%</span>
                  <span className="text-neutral-400">Dev H.</span>
                </div>
                <div className="bg-neutral-800 rounded p-2 flex flex-col items-center">
                  <span className="text-red-400 font-bold">20.37%</span>
                  <span className="text-neutral-400">Snipers H.</span>
                </div>
                <div className="bg-neutral-800 rounded p-2 flex flex-col items-center">
                  <span className="text-red-400 font-bold">20.02%</span>
                  <span className="text-neutral-400">Insiders</span>
                </div>
                <div className="bg-neutral-800 rounded p-2 flex flex-col items-center">
                  <span className="text-red-400 font-bold">29.55%</span>
                  <span className="text-neutral-400">Bundlers</span>
                </div>
                <div className="bg-neutral-800 rounded p-2 flex flex-col items-center">
                  <span className="text-red-400 font-bold">LP Burned</span>
                  <span className="text-neutral-400">LP Burned</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Trade History Table */}
        <div className="bg-neutral-900 rounded-lg p-4 mt-4 max-w-4xl mx-auto">
          <div className="text-lg font-bold mb-2 text-white">Trade History</div>
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="text-neutral-400">
                <th className="py-1 px-2">Time</th>
                <th className="py-1 px-2">Coin</th>
                <th className="py-1 px-2">Amount</th>
                <th className="py-1 px-2">Hash</th>
              </tr>
            </thead>
            <tbody>
              {tradeHistory.map((trade, idx) => (
                <tr key={idx} className="border-t border-neutral-800">
                  <td className="py-1 px-2">{trade.time}</td>
                  <td className="py-1 px-2 flex items-center gap-2">
                    <img src={trade.coin.icon} alt={trade.coin.name} className="w-5 h-5 rounded" />
                    {trade.coin.name}
                  </td>
                  <td className="py-1 px-2">{trade.amount}</td>
                  <td className="py-1 px-2 truncate max-w-[120px]">{trade.hash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
} 