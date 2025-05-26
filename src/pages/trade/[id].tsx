import { useRouter } from "next/router";
import { memecoins } from "../../data/memecoins";
import type { MemeCoin } from "../../data/memecoins";
import Head from "next/head";
import Link from "next/link";
import { FaGlobe, FaUser, FaSearch, FaCheckCircle, FaQuestionCircle, FaPowerOff } from "react-icons/fa";
import { OHLCChart } from "../../components/OHLCChart";
import type { OHLC } from "../../components/OHLCChart";

export default function TradePage() {
  const router = useRouter();
  const { id } = router.query;
  const coin = memecoins[typeof id === "string" ? parseInt(id) : -1];
  const chartData = generateRandomOHLC(60);

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

  function generateRandomOHLC(count: number): OHLC[] {
    let price = 1 + Math.random() * 2;
    const data: OHLC[] = [];
    for (let i = 0; i < count; i++) {
      const open = price;
      const close = open + (Math.random() - 0.5) * 0.2;
      const high = Math.max(open, close) + Math.random() * 0.1;
      const low = Math.min(open, close) - Math.random() * 0.1;
      data.push({
        time: (Math.floor(Date.now() / 1000) - (count - i) * 60) as any,
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
      });
      price = close;
    }
    return data;
  }

  return (
    <>
      <Head>
        <title>{coin.name} | Trade</title>
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
              <div className="relative flex items-center">
                <span className="absolute left-3 text-neutral-400">
                  <FaSearch size={16} />
                </span>
                <input
                  type="text"
                  placeholder="Search by token or CA..."
                  className="bg-neutral-800 border border-neutral-700 rounded-full pl-9 pr-3 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition w-64"
                />
              </div>
            </div>
          </div>
        </header>
        {/* Main Layout */}
        <div className="max-w-7xl mx-auto px-4 py-8 flex gap-8">
          {/* Left: Chart and Info */}
          <div className="flex-1 min-w-0">
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
                  <div className="text-lg font-semibold">$0.{Math.floor(Math.random()*100)}</div>
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
            <div className="bg-neutral-900 rounded-lg p-4 mb-4" style={{ minHeight: 400 }}>
              <OHLCChart data={chartData} width={900} height={350} />
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
          <div className="w-[340px] flex-shrink-0">
            <div className="bg-neutral-900 rounded-lg p-4 mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-neutral-400">5m Vol</span>
                <span className="text-xs text-neutral-400">Buys</span>
                <span className="text-xs text-neutral-400">Sells</span>
                <span className="text-xs text-neutral-400">Net Vol.</span>
              </div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-white font-semibold">$51.2K</span>
                <span className="text-emerald-400">767 / $26K</span>
                <span className="text-red-400">732 / $25.2K</span>
                <span className="text-emerald-400">+$768.2</span>
              </div>
              <button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded mb-2">Buy</button>
              <button className="w-full bg-neutral-800 text-white font-bold py-2 rounded mb-4">Sell</button>
              <div className="bg-neutral-800 rounded p-2 mb-2">
                <div className="flex justify-between text-xs text-neutral-400 mb-1">
                  <span>Market</span>
                  <span>Limit</span>
                  <span>Adv.</span>
                </div>
                <input className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-white mb-2" placeholder="AMOUNT" />
                <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded">Buy {coin.name}</button>
              </div>
              <div className="flex justify-between text-xs text-neutral-400 mt-2">
                <span>Bought</span>
                <span>Sold</span>
                <span>Holding</span>
                <span>PnL</span>
              </div>
              <div className="flex justify-between text-xs text-white font-semibold mb-2">
                <span>$0</span>
                <span>$0</span>
                <span>$0</span>
                <span className="text-emerald-400">+$0 (+0%)</span>
              </div>
              <div className="flex gap-2 mt-2">
                <button className="flex-1 bg-neutral-800 text-white py-1 rounded">PRESET 1</button>
                <button className="flex-1 bg-neutral-800 text-white py-1 rounded">PRESET 2</button>
                <button className="flex-1 bg-neutral-800 text-white py-1 rounded">PRESET 3</button>
              </div>
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
      </div>
    </>
  );
} 