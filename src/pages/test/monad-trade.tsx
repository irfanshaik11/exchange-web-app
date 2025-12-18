"use client";

import React, { useState } from "react";
import { useUser } from "~/components/UserContext";
import { useWallet } from "~/components/useWallet";
import { tradeMonadBuy, tradeMonadSell } from "~/utils/api";
import { broadcastMonadQuickTrade } from "~/utils/monadTradeEvents";
import toast from "react-hot-toast";
import Head from "next/head";
import { env } from "~/env";

export default function MonadTradeTestPage() {
  const { user } = useUser();
  const { isConnected } = useWallet();
  
  // Buy parameters
  const [tokenAddress, setTokenAddress] = useState("0xbae8f85f0c3b50e0303b35e3659ae41f821c7777");
  const [amountMON, setAmountMON] = useState("0.01");
  const [launchpad, setLaunchpad] = useState<'nadfun' | 'flapsh-simple' | 'flapsh-devs'>("nadfun");
  const [slippage, setSlippage] = useState("15");
  const [isBuying, setIsBuying] = useState(false);
  
  // Sell parameters
  const [sellTokenAddress, setSellTokenAddress] = useState("");
  const [sellLaunchpad, setSellLaunchpad] = useState<'nadfun' | 'flapsh-simple' | 'flapsh-devs'>("nadfun");
  const [sellPercentage, setSellPercentage] = useState("");
  const [sellTokenAmount, setSellTokenAmount] = useState("");
  const [sellSlippage, setSellSlippage] = useState("15");
  const [isSelling, setIsSelling] = useState(false);
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline" | "error">("checking");

  // Test backend connectivity on mount
  React.useEffect(() => {
    const testBackend = async () => {
      const backendUrl = env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        setBackendStatus("error");
        return;
      }

      try {
        const response = await fetch(`${backendUrl}/`, {
          method: "GET",
          signal: AbortSignal.timeout(5000), // 5 second timeout
        });
        if (response.ok) {
          setBackendStatus("online");
        } else {
          setBackendStatus("offline");
        }
      } catch (error: any) {
        console.error("Backend connectivity test failed:", error);
        setBackendStatus("offline");
      }
    };

    testBackend();
  }, []);

  const handleBuy = async () => {
    if (!user?.bearerToken) {
      toast.error("Please log in to trade");
      return;
    }

    if (!tokenAddress || !tokenAddress.startsWith("0x") || tokenAddress.length !== 42) {
      toast.error("Invalid token address (must be 0x followed by 40 hex characters)");
      return;
    }

    const amount = parseFloat(amountMON);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Invalid amount (must be > 0)");
      return;
    }

    const slippageValue = parseFloat(slippage);
    if (isNaN(slippageValue) || slippageValue < 0 || slippageValue > 50) {
      toast.error("Invalid slippage (must be 0-50)");
      return;
    }

    setIsBuying(true);
    const loadingToast = toast.loading("Executing buy...");

    try {
      const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || "NOT SET";
      const fullUrl = `${backendUrl}/api/trade/monad/buy`;
      
      console.log("=".repeat(80));
      console.log("📤 [FRONTEND] Monad Buy Request Starting");
      console.log("=".repeat(80));
      console.log("📤 Request Params:", {
        tokenAddress,
        amountMON: amount,
        launchpad,
        slippage: slippageValue,
      });
      console.log("🔗 Backend URL:", backendUrl);
      console.log("🎯 Full API URL:", fullUrl);
      console.log("🔑 Auth Token:", user.bearerToken ? `${user.bearerToken.substring(0, 20)}...` : "MISSING");
      console.log("👤 User ID:", user?.id);

      const result = await tradeMonadBuy(
        {
          tokenAddress,
          amountMON: amount,
          launchpad,
          slippage: slippageValue,
        },
        user.bearerToken
      );

      toast.dismiss(loadingToast);

      console.log("=".repeat(80));
      console.log("📥 [FRONTEND] Monad Buy Response Received");
      console.log("=".repeat(80));
      console.log("✅ Response:", JSON.stringify(result, null, 2));

      if (result.success && result.txHash) {
        const explorerUrl = `https://monadvision.com/tx/${result.txHash}`;
        toast.success(
          (t) => (
            <div className="flex flex-col gap-1">
              <span>✅ Buy successful!</span>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline text-sm"
                onClick={() => toast.dismiss(t.id)}
              >
                View on MonadVision: {result.txHash.slice(0, 8)}...{result.txHash.slice(-6)}
              </a>
            </div>
          ),
          { duration: 10000 }
        );
        console.log("✅ Buy Result:", result);
        console.log("🔗 Explorer URL:", explorerUrl);
        broadcastMonadQuickTrade(tokenAddress, 'buy');
      } else {
        toast.error("Buy failed - check console for details");
        console.error("❌ Buy Result:", result);
      }
    } catch (error: any) {
      toast.dismiss(loadingToast);
      
      console.log("=".repeat(80));
      console.log("❌ [FRONTEND] Monad Buy Error Caught");
      console.log("=".repeat(80));
      console.error("❌ Error Type:", error?.constructor?.name || typeof error);
      console.error("❌ Error Message:", error?.message || String(error));
      console.error("❌ Error Stack:", error?.stack);
      console.error("❌ Full Error Object:", error);
      
      // Check if it's a network error
      if (error?.message?.includes('fetch') || error?.message?.includes('network') || error?.message?.includes('Failed to fetch')) {
        console.error("🌐 NETWORK ERROR DETECTED - Request likely not reaching backend");
        console.error("   Check if backend is running on:", env.NEXT_PUBLIC_BACKEND_URL);
        console.error("   Check browser Network tab for failed request");
      }
      
      // Check if it's a timeout
      if (error?.message?.includes('timeout') || error?.name === 'TimeoutError') {
        console.error("⏱️ TIMEOUT ERROR - Request took too long");
      }
      
      // Check if it's an API error
      if (error?.status || error?.code) {
        console.error("📡 API ERROR - Backend responded with error");
        console.error("   Status:", error.status);
        console.error("   Code:", error.code);
        console.error("   Details:", error.details);
      }
      
      const errorMessage = error?.message || error?.error || "Buy failed";
      toast.error(`❌ ${errorMessage}`);
      console.error("❌ Final Error Message:", errorMessage);
    } finally {
      setIsBuying(false);
    }
  };

  const handleSell = async () => {
    if (!user?.bearerToken) {
      toast.error("Please log in to trade");
      return;
    }

    if (!sellTokenAddress || !sellTokenAddress.startsWith("0x") || sellTokenAddress.length !== 42) {
      toast.error("Invalid token address (must be 0x followed by 40 hex characters)");
      return;
    }

    if (!sellPercentage && !sellTokenAmount) {
      toast.error("Must specify either percentage or token amount");
      return;
    }

    if (sellPercentage && sellTokenAmount) {
      toast.error("Specify either percentage OR token amount, not both");
      return;
    }

    const slippageValue = parseFloat(sellSlippage);
    if (isNaN(slippageValue) || slippageValue < 0 || slippageValue > 50) {
      toast.error("Invalid slippage (must be 0-50)");
      return;
    }

    if (sellPercentage) {
      const percentage = parseFloat(sellPercentage);
      if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
        toast.error("Invalid percentage (must be 1-100)");
        return;
      }
    }

    if (sellTokenAmount) {
      const amount = parseFloat(sellTokenAmount);
      if (isNaN(amount) || amount <= 0) {
        toast.error("Invalid token amount (must be > 0)");
        return;
      }
    }

    setIsSelling(true);
    const loadingToast = toast.loading("Executing sell...");

    try {
      const params: any = {
        tokenAddress: sellTokenAddress,
        launchpad: sellLaunchpad,
        slippage: slippageValue,
      };

      if (sellPercentage) {
        params.percentage = parseFloat(sellPercentage);
      } else {
        params.tokenAmount = sellTokenAmount;
      }

      const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || "NOT SET";
      const fullUrl = `${backendUrl}/api/trade/monad/sell`;
      
      console.log("📤 Monad Sell Request:", params);
      console.log("🔗 Backend URL:", backendUrl);
      console.log("🎯 Full API URL:", fullUrl);

      const result = await tradeMonadSell(params, user.bearerToken);

      toast.dismiss(loadingToast);

      if (result.success && result.txHash) {
        const explorerUrl = `https://monadvision.com/tx/${result.txHash}`;
        toast.success(
          (t) => (
            <div className="flex flex-col gap-1">
              <span>✅ Sell successful!</span>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline text-sm"
                onClick={() => toast.dismiss(t.id)}
              >
                View on MonadVision: {result.txHash.slice(0, 8)}...{result.txHash.slice(-6)}
              </a>
            </div>
          ),
          { duration: 10000 }
        );
        console.log("✅ Sell Result:", result);
        console.log("🔗 Explorer URL:", explorerUrl);
        broadcastMonadQuickTrade(sellTokenAddress || params.tokenAddress, 'sell');
      } else {
        toast.error("Sell failed - check console for details");
        console.error("❌ Sell Result:", result);
      }
    } catch (error: any) {
      toast.dismiss(loadingToast);
      const errorMessage = error?.message || error?.error || "Sell failed";
      toast.error(`❌ ${errorMessage}`);
      console.error("❌ Sell Error:", error);
    } finally {
      setIsSelling(false);
    }
  };

  return (
    <>
      <Head>
        <title>Monad Trade Test | Interstate</title>
      </Head>
      <div style={{ 
        minHeight: "100vh", 
        backgroundColor: "#0f1012", 
        color: "#f0f5f5",
        padding: "2rem",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
      }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <h1 style={{ 
            fontSize: "2rem", 
            fontWeight: "bold", 
            marginBottom: "2rem",
            color: "#9B59B6" // Monad purple
          }}>
            🧪 Monad Trade Test Page
          </h1>

          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "1fr 1fr", 
            gap: "2rem",
            marginBottom: "2rem"
          }}>
            {/* BUY SECTION */}
            <div style={{
              backgroundColor: "#1E1F26",
              border: "1px solid #2A2B33",
              borderRadius: "12px",
              padding: "1.5rem"
            }}>
              <h2 style={{ 
                fontSize: "1.5rem", 
                fontWeight: "600", 
                marginBottom: "1.5rem",
                color: "#70E0B0"
              }}>
                💚 Buy Token
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{ 
                    display: "block", 
                    marginBottom: "0.5rem", 
                    fontSize: "0.875rem",
                    color: "#9CA3AF"
                  }}>
                    Token Address (0x...)
                  </label>
                  <input
                    type="text"
                    value={tokenAddress}
                    onChange={(e) => setTokenAddress(e.target.value)}
                    placeholder="0x..."
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      backgroundColor: "#17191E",
                      border: "1px solid #2A2B33",
                      borderRadius: "8px",
                      color: "#E6E7EA",
                      fontSize: "0.875rem",
                      fontFamily: "monospace"
                    }}
                  />
                </div>

                <div>
                  <label style={{ 
                    display: "block", 
                    marginBottom: "0.5rem", 
                    fontSize: "0.875rem",
                    color: "#9CA3AF"
                  }}>
                    Amount (MON)
                  </label>
                  <input
                    type="number"
                    value={amountMON}
                    onChange={(e) => setAmountMON(e.target.value)}
                    placeholder="0.01"
                    step="0.001"
                    min="0"
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      backgroundColor: "#17191E",
                      border: "1px solid #2A2B33",
                      borderRadius: "8px",
                      color: "#E6E7EA",
                      fontSize: "0.875rem"
                    }}
                  />
                </div>

                <div>
                  <label style={{ 
                    display: "block", 
                    marginBottom: "0.5rem", 
                    fontSize: "0.875rem",
                    color: "#9CA3AF"
                  }}>
                    Launchpad
                  </label>
                  <select
                    value={launchpad}
                    onChange={(e) => setLaunchpad(e.target.value as any)}
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      backgroundColor: "#17191E",
                      border: "1px solid #2A2B33",
                      borderRadius: "8px",
                      color: "#E6E7EA",
                      fontSize: "0.875rem"
                    }}
                  >
                    <option value="nadfun">nad.fun</option>
                    <option value="flapsh-simple">Flap.SH Simple</option>
                    <option value="flapsh-devs">Flap.SH Devs</option>
                  </select>
                </div>

                <div>
                  <label style={{ 
                    display: "block", 
                    marginBottom: "0.5rem", 
                    fontSize: "0.875rem",
                    color: "#9CA3AF"
                  }}>
                    Slippage (%)
                  </label>
                  <input
                    type="number"
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value)}
                    placeholder="15"
                    step="0.1"
                    min="0"
                    max="50"
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      backgroundColor: "#17191E",
                      border: "1px solid #2A2B33",
                      borderRadius: "8px",
                      color: "#E6E7EA",
                      fontSize: "0.875rem"
                    }}
                  />
                </div>

                <button
                  onClick={handleBuy}
                  disabled={isBuying || !isConnected || !user}
                  style={{
                    width: "100%",
                    padding: "0.875rem",
                    backgroundColor: isBuying || !isConnected || !user ? "#2A2B33" : "#70E0B0",
                    color: isBuying || !isConnected || !user ? "#9CA3AF" : "#000",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "1rem",
                    fontWeight: "600",
                    cursor: isBuying || !isConnected || !user ? "not-allowed" : "pointer",
                    transition: "all 0.2s"
                  }}
                >
                  {isBuying ? "Processing..." : !isConnected ? "Connect Wallet" : !user ? "Login Required" : "Buy Token"}
                </button>
              </div>
            </div>

            {/* SELL SECTION */}
            <div style={{
              backgroundColor: "#1E1F26",
              border: "1px solid #2A2B33",
              borderRadius: "12px",
              padding: "1.5rem"
            }}>
              <h2 style={{ 
                fontSize: "1.5rem", 
                fontWeight: "600", 
                marginBottom: "1.5rem",
                color: "#FF4D7F"
              }}>
                💗 Sell Token
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{ 
                    display: "block", 
                    marginBottom: "0.5rem", 
                    fontSize: "0.875rem",
                    color: "#9CA3AF"
                  }}>
                    Token Address (0x...)
                  </label>
                  <input
                    type="text"
                    value={sellTokenAddress}
                    onChange={(e) => setSellTokenAddress(e.target.value)}
                    placeholder="0x..."
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      backgroundColor: "#17191E",
                      border: "1px solid #2A2B33",
                      borderRadius: "8px",
                      color: "#E6E7EA",
                      fontSize: "0.875rem",
                      fontFamily: "monospace"
                    }}
                  />
                </div>

                <div>
                  <label style={{ 
                    display: "block", 
                    marginBottom: "0.5rem", 
                    fontSize: "0.875rem",
                    color: "#9CA3AF"
                  }}>
                    Launchpad
                  </label>
                  <select
                    value={sellLaunchpad}
                    onChange={(e) => setSellLaunchpad(e.target.value as any)}
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      backgroundColor: "#17191E",
                      border: "1px solid #2A2B33",
                      borderRadius: "8px",
                      color: "#E6E7EA",
                      fontSize: "0.875rem"
                    }}
                  >
                    <option value="nadfun">nad.fun</option>
                    <option value="flapsh-simple">Flap.SH Simple</option>
                    <option value="flapsh-devs">Flap.SH Devs</option>
                  </select>
                </div>

                <div>
                  <label style={{ 
                    display: "block", 
                    marginBottom: "0.5rem", 
                    fontSize: "0.875rem",
                    color: "#9CA3AF"
                  }}>
                    Sell Percentage (%)
                  </label>
                  <input
                    type="number"
                    value={sellPercentage}
                    onChange={(e) => {
                      setSellPercentage(e.target.value);
                      setSellTokenAmount(""); // Clear token amount when percentage is set
                    }}
                    placeholder="50"
                    step="1"
                    min="1"
                    max="100"
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      backgroundColor: "#17191E",
                      border: "1px solid #2A2B33",
                      borderRadius: "8px",
                      color: "#E6E7EA",
                      fontSize: "0.875rem"
                    }}
                  />
                </div>

                <div style={{ textAlign: "center", color: "#9CA3AF", fontSize: "0.875rem" }}>
                  OR
                </div>

                <div>
                  <label style={{ 
                    display: "block", 
                    marginBottom: "0.5rem", 
                    fontSize: "0.875rem",
                    color: "#9CA3AF"
                  }}>
                    Token Amount (exact)
                  </label>
                  <input
                    type="number"
                    value={sellTokenAmount}
                    onChange={(e) => {
                      setSellTokenAmount(e.target.value);
                      setSellPercentage(""); // Clear percentage when token amount is set
                    }}
                    placeholder="1000"
                    step="0.000001"
                    min="0"
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      backgroundColor: "#17191E",
                      border: "1px solid #2A2B33",
                      borderRadius: "8px",
                      color: "#E6E7EA",
                      fontSize: "0.875rem"
                    }}
                  />
                </div>

                <div>
                  <label style={{ 
                    display: "block", 
                    marginBottom: "0.5rem", 
                    fontSize: "0.875rem",
                    color: "#9CA3AF"
                  }}>
                    Slippage (%)
                  </label>
                  <input
                    type="number"
                    value={sellSlippage}
                    onChange={(e) => setSellSlippage(e.target.value)}
                    placeholder="15"
                    step="0.1"
                    min="0"
                    max="50"
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      backgroundColor: "#17191E",
                      border: "1px solid #2A2B33",
                      borderRadius: "8px",
                      color: "#E6E7EA",
                      fontSize: "0.875rem"
                    }}
                  />
                </div>

                <button
                  onClick={handleSell}
                  disabled={isSelling || !isConnected || !user}
                  style={{
                    width: "100%",
                    padding: "0.875rem",
                    backgroundColor: isSelling || !isConnected || !user ? "#2A2B33" : "#FF4D7F",
                    color: isSelling || !isConnected || !user ? "#9CA3AF" : "#000",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "1rem",
                    fontWeight: "600",
                    cursor: isSelling || !isConnected || !user ? "not-allowed" : "pointer",
                    transition: "all 0.2s"
                  }}
                >
                  {isSelling ? "Processing..." : !isConnected ? "Connect Wallet" : !user ? "Login Required" : "Sell Token"}
                </button>
              </div>
            </div>
          </div>

          {/* STATUS SECTION */}
          <div style={{
            backgroundColor: "#1E1F26",
            border: "1px solid #2A2B33",
            borderRadius: "12px",
            padding: "1.5rem",
            marginTop: "2rem"
          }}>
            <h3 style={{ 
              fontSize: "1.25rem", 
              fontWeight: "600", 
              marginBottom: "1rem",
              color: "#E6E7EA"
            }}>
              📊 Status
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#9CA3AF" }}>Wallet Connected:</span>
                <span style={{ color: isConnected ? "#70E0B0" : "#FF4D7F" }}>
                  {isConnected ? "✅ Yes" : "❌ No"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#9CA3AF" }}>User Logged In:</span>
                <span style={{ color: user ? "#70E0B0" : "#FF4D7F" }}>
                  {user ? "✅ Yes" : "❌ No"}
                </span>
              </div>
              {user && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#9CA3AF" }}>User ID:</span>
                  <span style={{ color: "#E6E7EA" }}>{user.id}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#9CA3AF" }}>Backend URL:</span>
                <span style={{ 
                  color: env.NEXT_PUBLIC_BACKEND_URL ? "#70E0B0" : "#FF4D7F",
                  fontFamily: "monospace",
                  fontSize: "0.75rem"
                }}>
                  {env.NEXT_PUBLIC_BACKEND_URL || "❌ NOT SET"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#9CA3AF" }}>Backend Status:</span>
                <span style={{ 
                  color: backendStatus === "online" ? "#70E0B0" : backendStatus === "checking" ? "#9CA3AF" : "#FF4D7F"
                }}>
                  {backendStatus === "online" ? "✅ Online" : backendStatus === "checking" ? "⏳ Checking..." : "❌ Offline"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#9CA3AF" }}>Buy Endpoint:</span>
                <span style={{ 
                  color: "#9B59B6",
                  fontFamily: "monospace",
                  fontSize: "0.75rem"
                }}>
                  {env.NEXT_PUBLIC_BACKEND_URL ? `${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/monad/buy` : "N/A"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#9CA3AF" }}>Sell Endpoint:</span>
                <span style={{ 
                  color: "#9B59B6",
                  fontFamily: "monospace",
                  fontSize: "0.75rem"
                }}>
                  {env.NEXT_PUBLIC_BACKEND_URL ? `${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/monad/sell` : "N/A"}
                </span>
              </div>
            </div>
          </div>

          {/* INFO SECTION */}
          <div style={{
            backgroundColor: "#1E1F26",
            border: "1px solid #2A2B33",
            borderRadius: "12px",
            padding: "1.5rem",
            marginTop: "1rem"
          }}>
            <h3 style={{ 
              fontSize: "1.25rem", 
              fontWeight: "600", 
              marginBottom: "1rem",
              color: "#E6E7EA"
            }}>
              ℹ️ Instructions
            </h3>
            <ul style={{ 
              listStyle: "none", 
              padding: 0, 
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              fontSize: "0.875rem",
              color: "#9CA3AF"
            }}>
              <li>• Enter a valid Monad token address (0x followed by 40 hex characters)</li>
              <li>• For buys: Enter amount in MON (native currency)</li>
              <li>• For sells: Enter either percentage (1-100) OR exact token amount</li>
              <li>• Select the correct launchpad (nad.fun, Flap.SH Simple, or Flap.SH Devs)</li>
              <li>• Adjust slippage tolerance (0-50%)</li>
              <li>• Check browser console for detailed request/response logs</li>
              <li>• Transaction hashes will appear in success toasts</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
