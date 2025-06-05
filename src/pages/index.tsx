import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState, useEffect } from "react";
import { FaGlobe, FaUser, FaSearch, FaCheckCircle, FaQuestionCircle, FaPowerOff, FaTimes, FaCopy } from "react-icons/fa";
import Image from "next/image";
import { memecoins } from "../data/memecoins";
import type { MemeCoin } from "../data/memecoins";
import LoginModal from "../components/LoginModal";
import { useUser } from "../components/UserContext";
import Cookies from 'js-cookie';
import QRCode from 'qrcode';

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
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const isDiscover = router.pathname === "/";
  const timeframes = ["1m", "5m", "30m", "1h"];
  const [selectedTimeframe, setSelectedTimeframe] = useState("5m");
  const [displayed, setDisplayed] = useState(() => memecoins.slice(0, 10));
  const [loginOpen, setLoginOpen] = useState(false);
  const { user, loading: userLoading, refreshUser } = useUser();

  // Generate QR code when user changes
  useEffect(() => {
    if (user?.publicKey) {
      QRCode.toDataURL(user.publicKey, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      })
      .then(url => {
        setQrCodeDataUrl(url);
      })
      .catch(err => {
        console.error('Error generating QR code:', err);
      });
    }
  }, [user?.publicKey]);

  // Copy address to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Address copied to clipboard!');
  };

  const handleTimeframeClick = (tf: string) => {
    setSelectedTimeframe(tf);
    setDisplayed(shuffleArray(memecoins).slice(0, 10));
  };

  const handleDepositClick = () => {
    const token = Cookies.get('token');
    console.log('Deposit clicked - User:', user);
    console.log('User loading:', userLoading);
    console.log('Token exists:', !!token);
    console.log('Token value:', token);
    
    // If we have a token but no user, try refreshing
    if (token && !user && !userLoading) {
      console.log('Token exists but no user, refreshing...');
      refreshUser();
    }
    
    setIsDepositModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsDepositModalOpen(false);
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
              <button 
                onClick={handleDepositClick}
                className="ml-2 px-5 py-1.5 rounded-full font-semibold bg-emerald-600 hover:bg-emerald-700 text-white text-base transition shadow focus:outline-none cursor-pointer"
              >
                Deposit
              </button>
              <button
                className="ml-2 px-5 py-1.5 rounded-full font-semibold bg-emerald-600 hover:bg-emerald-700 text-white text-base transition shadow focus:outline-none"
                onClick={() => setLoginOpen(true)}
              >
                Login
              </button>
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
        <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      </div>

      {/* Deposit Modal */}
      {isDepositModalOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={handleCloseModal}
        >
          <div 
            className="bg-neutral-900 rounded-lg p-6 w-full max-w-md mx-4 relative border border-neutral-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={handleCloseModal}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors"
            >
              <FaTimes size={20} />
            </button>
            
            {/* Modal Content */}
            <div className="pr-8">
              <h2 className="text-2xl font-bold text-white mb-6">Deposit</h2>
              
              <div className="space-y-4">
                {userLoading ? (
                  // Loading state
                  <div className="space-y-4">
                    <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4 text-center">
                      <div className="text-neutral-300 text-sm">
                        Loading user data...
                      </div>
                    </div>
                  </div>
                ) : !user ? (
                  // User not logged in
                  <div className="space-y-4">
                    <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 text-center">
                      <div className="text-red-400 text-sm">
                        Please login first to view your deposit address
                      </div>
                      <div className="text-xs text-neutral-400 mt-2">
                        Debug: User = {JSON.stringify(user)}, Loading = {userLoading.toString()}
                      </div>
                      <div className="text-xs text-neutral-400 mt-1">
                        Token exists: {!!Cookies.get('token') ? 'Yes' : 'No'}
                      </div>
                      {Cookies.get('token') && (
                        <button 
                          onClick={() => {
                            console.log('Manual refresh triggered');
                            refreshUser();
                          }}
                          className="mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded"
                        >
                          Refresh User Data
                        </button>
                      )}
                    </div>
                  </div>
                ) : user.publicKey ? (
                  // User logged in with pubkey
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-300 mb-3">
                        Your Solana Deposit Address
                      </label>
                      
                      <div className="space-y-3">
                        {/* QR Code and Address Display */}
                        <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
                          <div className="flex gap-4">
                            {/* Left: QR Code */}
                            <div className="flex-shrink-0">
                              {qrCodeDataUrl ? (
                                <img 
                                  src={qrCodeDataUrl} 
                                  alt="Deposit Address QR Code" 
                                  className="w-32 h-32 rounded border border-neutral-600"
                                />
                              ) : (
                                <div className="w-32 h-32 bg-neutral-700 rounded flex items-center justify-center">
                                  <span className="text-neutral-400 text-xs">Generating QR...</span>
                                </div>
                              )}
                            </div>
                            
                            {/* Right: Address Details */}
                            <div className="flex-1 flex flex-col justify-center">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-neutral-300">Deposit Address:</span>
                              </div>
                              <div className="flex items-start gap-2">
                                <code className="text-sm text-emerald-400 bg-neutral-900 px-2 py-1 rounded flex-1 break-all leading-relaxed">
                                  {user.publicKey}
                                </code>
                                <button
                                  onClick={() => copyToClipboard(user.publicKey)}
                                  className="text-neutral-400 hover:text-white transition-colors p-1 flex-shrink-0 mt-1"
                                  title="Copy address"
                                >
                                  <FaCopy size={14} />
                                </button>
                              </div>
                              <div className="text-xs text-neutral-500 mt-2">
                                Scan QR code with your wallet or copy the address above
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-3">
                          <div className="flex items-center gap-2 text-emerald-400 text-sm">
                            <FaCheckCircle />
                            <span>Deposit address loaded successfully</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4">
                      <button 
                        onClick={() => copyToClipboard(user.publicKey)}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-4 rounded-lg font-semibold transition cursor-pointer"
                      >
                        Copy Deposit Address
                      </button>
                    </div>
                  </div>
                ) : (
                  // User logged in but no pubkey
                  <div className="space-y-4">
                    <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4 text-center">
                      <div className="text-yellow-400 text-sm mb-3">
                        No deposit address found for your account
                      </div>
                      <div className="text-neutral-400 text-xs">
                        Please contact support to set up your deposit address
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
