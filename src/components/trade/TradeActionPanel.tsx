import React, { useState } from "react";
import { formatSmartNumber, type Token } from "~/utils/db";
import { useQuickBuy } from "~/components/QuickBuyContext";
import { FaRunning, FaGasPump, FaCoins, FaBan } from "react-icons/fa";
import InterstateTooltip from "../InterstateTooltip";
import QuickBuy from "../QuickBuy";
import { createLimitOrder, tradeBuy, SOL_MINT_ADDRESS } from "~/utils/api";
import toast from "react-hot-toast";
import { useUser } from "~/components/UserContext";

//---helpers---

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const baseBtn =
  "inline-flex items-center justify-center font-semibold transition-all " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ring-offset-neutral-950 " +
  "disabled:opacity-50 disabled:cursor-not-allowed select-none";

const chipBtn =
  "px-3 h-8 text-[11px] rounded-full border border-neutral-700 bg-neutral-900 hover:bg-neutral-800";

const segBtn =
  "h-10 px-5 text-sm rounded-full transition-all focus-visible:ring-2 focus-visible:ring-emerald-500";

const tabBtn =
  "pb-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded";

interface TradeActionPanelProps {
  token: Token;
}

const presetLabels = ["PRESET 1", "PRESET 2", "PRESET 3"];
const mevModes = [
  { label: "Off", value: "off" },
  { label: "Reduced", value: "reduced" },
  { label: "Secure", value: "on" },
];

const TradeActionPanel: React.FC<TradeActionPanelProps> = ({ token }) => {
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [tab, setTab] = useState<"market" | "limit" | "adv">("market");
  const [targetMC, setTargetMC] = useState("");
  const [direction, setDirection] = useState<"Above" | "Below">("Above");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const { presets, activePreset } = useQuickBuy();
  const { user, solBalance } = useUser();
  const settings =
    mode === "buy"
      ? presets[activePreset].quickBuySettings
      : presets[activePreset].quickSellSettings;

  // Calculate stats from token fields
  const buyVol = token.total_buy_volume_5m || 0;
  const sellVol = token.total_sell_volume_5m || 0;
  const vol5m = buyVol + sellVol;
  const buysCount = token.total_buys_5m || 0;
  const buysValue = buyVol;
  const sellsCount = token.total_sells_5m || 0;
  const sellsValue = sellVol;
  const netVol = Number(buyVol) - Number(sellVol);
  const totalValue = Number(buyVol) + Number(sellVol);
  const buyPct = Number(totalValue) ? (Number(buyVol) / Number(totalValue)) * 100 : 50;
  const sellPct = Number(totalValue) ? (Number(sellVol) / Number(totalValue)) * 100 : 50;
// safe getters that try multiple common key names
const num = (v: any) => (typeof v === "number" ? v : 0);

function getCountsAndVol(
  t: any,
  side: "buy" | "sell",
  window: "5m" | "1h" | "6h" | "24h"
) {
  const sideCap = side === "buy" ? "buy" : "sell";
  // try common field name variants (adjust if your API uses different keys)
  const count =
    window === "5m"
      ? num(t[`total_${sideCap}s_5m`])
      : window === "1h"
      ? num(t[`total_${sideCap}s_1h`]) || num(t[`total_${sideCap}s_60m`])
      : window === "6h"
      ? num(t[`total_${sideCap}s_6h`]) || num(t[`total_${sideCap}s_360m`])
      : num(t[`total_${sideCap}s_24h`]);

  const vol =
    window === "5m"
      ? num(t[`total_${sideCap}_volume_5m`])
      : window === "1h"
      ? num(t[`total_${sideCap}_volume_1h`]) || num(t[`total_${sideCap}_volume_60m`])
      : window === "6h"
      ? num(t[`total_${sideCap}_volume_6h`]) || num(t[`total_${sideCap}_volume_360m`])
      : num(t[`total_${sideCap}_volume_24h`]);

  return { count, vol };
}

const GlassTip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="
      pointer-events-none absolute left-1/2 -translate-x-1/2
      -top-1.5 translate-y-[-100%] opacity-0
      group-hover:opacity-100 group-hover:translate-y-[-102%]
      transition-all duration-150 ease-out z-50
    "
  >
    <div
      className="
        relative rounded-lg px-3 py-1.5 text-[11px] leading-4 text-neutral-100
        bg-neutral-900/35 backdrop-blur-lg
        border border-white/8 ring-1 ring-white/10
        shadow-[0_6px_20px_rgba(0,0,0,0.35)]
        max-w-[min(90vw,560px)]
      "
    >
      {children}
      {/* arrow (matches card) */}
      <div
        className="
          absolute left-1/2 -bottom-1.5 h-2 w-2 -translate-x-1/2 rotate-45
          bg-neutral-900/35 backdrop-blur-lg
          border-l border-t border-white/8 ring-1 ring-white/10
        "
      />
    </div>
  </div>
);


  return (
    <div className="flex h-full flex-shrink-0 flex-col bg-neutral-950">
      {/* Stats */}
      <div className="border-b border-emerald-950 px-4 py-3 overflow-visible">
      <div className="grid grid-cols-4 gap-3 text-xs">
        {/* 5m Vol */}
        <div>
          <div className="text-neutral-400">5m Vol</div>
          <div className="text-white">{formatSmartNumber(vol5m)}</div>
        </div>

        {/* Buys */}
        <div className="relative group cursor-help">
          <div className="text-neutral-400">Buys</div>
          <div className="text-white">
            {buysCount} <span className="text-neutral-500">/</span> {formatSmartNumber(buysValue)}
          </div>
          <GlassTip>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <span className="font-semibold text-white/95 whitespace-nowrap">Buys</span>

            <span className="text-white/40 select-none">•</span>
            <span className="tabular-nums whitespace-nowrap">
              5m: {buysCount} / ${formatSmartNumber(buysValue)}
            </span>

            <span className="text-white/40 select-none">•</span>
            <span className="tabular-nums whitespace-nowrap">
              1h: {getCountsAndVol(token as any, "buy", "1h").count} / $
              {formatSmartNumber(getCountsAndVol(token as any, "buy", "1h").vol)}
            </span>

            <span className="text-white/40 select-none">•</span>
            <span className="tabular-nums whitespace-nowrap">
              6h: {getCountsAndVol(token as any, "buy", "6h").count} / $
              {formatSmartNumber(getCountsAndVol(token as any, "buy", "6h").vol)}
            </span>

            <span className="text-white/40 select-none">•</span>
            <span className="tabular-nums whitespace-nowrap">
              24h: {getCountsAndVol(token as any, "buy", "24h").count} / $
              {formatSmartNumber(getCountsAndVol(token as any, "buy", "24h").vol)}
            </span>
          </div>
        </GlassTip>

        </div>

        {/* Sells */}
        <div className="relative group cursor-help">
          <div className="text-neutral-400">Sells</div>
          <div className="text-white">
            {sellsCount} <span className="text-neutral-500">/</span> {formatSmartNumber(sellsValue)}
          </div>
          <GlassTip>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <span className="font-semibold text-white/95 whitespace-nowrap">Sells</span>

            <span className="text-white/40 select-none">•</span>
            <span className="tabular-nums whitespace-nowrap">
              5m: {sellsCount} / ${formatSmartNumber(sellsValue)}
            </span>

            <span className="text-white/40 select-none">•</span>
            <span className="tabular-nums whitespace-nowrap">
              1h: {getCountsAndVol(token as any, "sell", "1h").count} / $
              {formatSmartNumber(getCountsAndVol(token as any, "sell", "1h").vol)}
            </span>

            <span className="text-white/40 select-none">•</span>
            <span className="tabular-nums whitespace-nowrap">
              6h: {getCountsAndVol(token as any, "sell", "6h").count} / $
              {formatSmartNumber(getCountsAndVol(token as any, "sell", "6h").vol)}
            </span>

            <span className="text-white/40 select-none">•</span>
            <span className="tabular-nums whitespace-nowrap">
              24h: {getCountsAndVol(token as any, "sell", "24h").count} / $
              {formatSmartNumber(getCountsAndVol(token as any, "sell", "24h").vol)}
            </span>
          </div>
        </GlassTip>


        </div>

        {/* Net Vol. */}
        <div>
          <div className="text-neutral-400">Net Vol.</div>
          <div className="text-white">
            {netVol < 0 ? "-" : ""}$
            {Math.abs(netVol).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800">
        <div
          className="h-full bg-emerald-400"
          style={{ width: `${buyPct}%`, transition: "width 180ms" }}
        />
      </div>
    </div>


      {/* Trade box */}
     <div className="flex w-full flex-col border-b border-emerald-950 pb-4">
  {/* Segmented Buy/Sell */}
      <div className="px-4 pt-4 flex justify-center"> 
        <div className="inline-flex items-center gap-1 rounded-full border border-neutral-800 bg-neutral-900 p-1.5 shadow-sm">
          <button
            type="button"
            className={cx(
              baseBtn,
              "h-10 px-5 min-w-[100px] rounded-full text-sm",
              mode === "buy"
                ? "bg-emerald-500 text-black shadow-sm shadow-emerald-900/30"
                : "text-neutral-300 hover:text-neutral-50"
            )}
            onClick={() => setMode("buy")}
          >
            Buy
          </button>

          <button
            type="button"
            className={cx(
              baseBtn,
              "h-10 px-5 min-w-[100px] rounded-full text-sm",
              mode === "sell"
                ? "bg-red-500 text-black shadow-sm shadow-red-900/30"
                : "text-neutral-300 hover:text-neutral-50"
            )}
            onClick={() => setMode("sell")}
          >
            Sell
          </button>
        </div>
      </div>

        {/* Tabs */}
        <div className="mt-4 flex items-center gap-5 border-b border-neutral-800 px-4 text-sm">
          <button
            className={cx(
              tabBtn,
              tab === "market" ? "text-emerald-400 border-b-2 border-emerald-400" : "text-neutral-400"
            )}
            onClick={() => setTab("market")}
          >
            Market
          </button>
          <button
            className={cx(
              tabBtn,
              tab === "limit" ? "text-emerald-400 border-b-2 border-emerald-400" : "text-neutral-400"
            )}
            onClick={() => setTab("limit")}
          >
            Limit
          </button>
          <button
            className={cx(
              tabBtn,
              tab === "adv" ? "text-emerald-400 border-b-2 border-emerald-400" : "text-neutral-400"
            )}
            onClick={() => setTab("adv")}
          >
            Adv.
          </button>
        </div>

        {/* Amount card */}
        <div className="px-4">
          <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-900/60">
            <div className="flex items-center justify-between px-3 pt-2">
              <span className="text-xs font-semibold text-neutral-400">AMOUNT</span>
              <span className="text-xs font-bold text-white">{amount || "-"}</span>
            </div>

            <div className="p-3 pt-2 flex flex-wrap items-center gap-2">
              {[0.01, 0.1, 1, 10].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={cx(
                    baseBtn,
                    "shrink-0 px-3 h-8 text-[11px] rounded-full border border-neutral-700 bg-neutral-900 hover:bg-neutral-800",
                    amount === String(opt) &&
                      (mode === "buy"
                        ? "bg-emerald-600 text-black border-transparent"
                        : "bg-red-500 text-black border-transparent")
                  )}
                  onClick={() => setAmount(String(opt))}
                >
                  {opt}
                </button>
              ))}

              {/* input: grows, can wrap to next line, won't overflow */}
              <div className="min-w-0 flex-1 sm:flex-none sm:min-w-[140px]">
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="w-full h-9 rounded-xl border border-neutral-700 bg-neutral-950 px-3 text-xs font-semibold text-white placeholder:text-neutral-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  placeholder="0.0"
                  value={["0.01", "0.1", "1", "10"].includes(amount) ? "" : amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>


        {/* Limit fields */}
        {tab === "limit" && (
          <div className="px-4">
            <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-400">TARGET MARKET CAP</span>
                <span className="text-xs font-bold text-white">{targetMC || "-"}</span>
              </div>
              <input
                type="number"
                min="0"
                step="any"
                className="h-9 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 text-xs font-semibold text-white placeholder:text-neutral-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                placeholder="0.0"
                value={targetMC}
                onChange={(e) => setTargetMC(e.target.value)}
              />
            </div>

            <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-400">DIRECTION</span>
                <span className="text-xs font-bold text-white">{direction}</span>
              </div>
              <div className="flex gap-2">
                {(["Above", "Below"] as const).map((d) => {
                  const active = direction === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      className={cx(
                        baseBtn,
                        "w-full h-9 rounded-xl border border-neutral-700 bg-neutral-950 hover:bg-neutral-800 text-xs",
                        active &&
                          (mode === "buy"
                            ? "bg-emerald-600 text-black border-transparent"
                            : "bg-red-500 text-black border-transparent")
                      )}
                      onClick={() => setDirection(d)}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Settings summary */}
        <div className="mx-4 mt-3 flex flex-wrap items-center gap-4 rounded-xl px-1 text-xs text-neutral-200">
          <InterstateTooltip label="Max Slippage">
            <span className="flex items-center gap-1">
              <FaRunning /> {settings.maxSlippage * 100}%
            </span>
          </InterstateTooltip>

          <InterstateTooltip
            label={`Priority Fee: ${settings.priority}. ${
              settings.priority < 0.01 ? "We recommend a priority fee of atleast 0.01" : ""
            }`}
          >
            <span className="flex items-center gap-1 text-yellow-400">
              <FaGasPump /> {settings.priority} {settings.priority < 0.01 ? <span>&#9888;</span> : ""}
            </span>
          </InterstateTooltip>

          <InterstateTooltip label="Bribe">
            <span className="flex items-center gap-1 text-yellow-400">
              <FaCoins /> {settings.bribe} <span>&#9888;</span>
            </span>
          </InterstateTooltip>

          <InterstateTooltip label="MEV Protection">
            <span
              className={cx(
                "flex items-center gap-1",
                settings.mevMode === "off"
                  ? "text-neutral-400"
                  : settings.mevMode === "reduced"
                  ? "text-yellow-400"
                  : "text-emerald-400"
              )}
            >
              <FaBan />
              {settings.mevMode === "off" ? "Off" : settings.mevMode === "reduced" ? "Reduced" : "Secure"}
            </span>
          </InterstateTooltip>
        </div>

        {/* Feedback */}
        {message && (
          <div
            className={cx(
              "mx-4 mt-3 rounded-xl p-2 text-center text-xs font-bold",
              message.type === "success" ? "bg-emerald-600 text-black" : "bg-red-500 text-black"
            )}
          >
            {message.text}
          </div>
        )}

        {/* Primary action */}
        <div className="px-4">
          <button
            type="button"
            className={cx(
              baseBtn,
              "w-full mt-3 h-12 rounded-full text-sm shadow-sm",
              mode === "buy"
                ? "bg-emerald-500 text-black hover:bg-emerald-400 active:translate-y-[1px] shadow-emerald-900/40"
                : "bg-red-500 text-black hover:bg-red-400 active:translate-y-[1px] shadow-red-900/30"
            )}
            disabled={!amount || isLoading || (tab === "limit" && !targetMC)}
            onClick={async () => {
              if (!user?.bearerToken) {
                setMessage({
                  type: "error",
                  text: "Authentication required to create orders.",
                });
                return;
              }

              setIsLoading(true);
              setMessage(null);

              if (tab === "limit") {
                if (!amount || !targetMC) {
                  setMessage({
                    type: "error",
                    text: "Amount and Target Market Cap are required for limit orders.",
                  });
                  setIsLoading(false);
                  return;
                }
                try {
                  await createLimitOrder(
                    {
                      tokenAddress: token.pair_address,
                      amount: Number(amount),
                      type: mode === "buy" ? "Buy" : "Sell",
                      direction,
                      targetMC: Number(targetMC),
                    },
                    user.bearerToken
                  );
                  setMessage({
                    type: "success",
                    text: `Limit order for ${token.symbol} created successfully!`,
                  });
                  setAmount("");
                  setTargetMC("");
                } catch (error: any) {
                  setMessage({
                    type: "error",
                    text: `Failed to create limit order: ${error.message}`,
                  });
                } finally {
                  setIsLoading(false);
                }
                return;
              }

              // Market flow
              if (mode === "buy") {
                const requested = Number(amount || 0);
                const safetyBuffer = 0.003; // ~0.003 SOL
                const required = requested + safetyBuffer;
                if (!requested || requested <= 0) {
                  setIsLoading(false);
                  setMessage({ type: "error", text: "Enter a valid amount." });
                  toast.error("Enter a valid amount");
                  return;
                }
                if (solBalance < required) {
                  setIsLoading(false);
                  const need = Math.max(required - solBalance, 0);
                  const msg = `Less balance: need ~${required.toFixed(3)} SOL (missing ${need.toFixed(3)} SOL).`;
                  setMessage({ type: "error", text: msg });
                  toast.error("Less balance. Please fund your wallet.");
                  return;
                }
              }

              let poolType: "PumpAmm" | "Raydium CPMM" | "" = "";
              switch ((token as any).amm_id) {
                case "pump_amm":
                  poolType = "PumpAmm";
                  break;
                case "raydium_cpmm":
                  poolType = "Raydium CPMM";
                  break;
                default:
                  poolType = "PumpAmm";
              }

              try {
                const tradeParams = {
                  amount: Number(amount),
                  poolAddress: token.pair_address,
                  baseMint: token.mint,
                  quoteMint: SOL_MINT_ADDRESS,
                  mevProtection: (settings.mevMode == "off" ? 0 : 1) as 0 | 1,
                  poolType,
                };
                const tr = await tradeBuy(tradeParams, user.bearerToken);
                const txHash = tr?.hash || tr?.txid;
                const tokenAmount = tr?.amount || tr?.tokenAmount;
                if (tr && txHash) {
                  setMessage({
                    type: "success",
                    text: `✅ Trade successful! ${mode === "buy" ? "Bought" : "Sold"} ${
                      tokenAmount || "tokens"
                    } ${token.symbol}. Tx: ${String(txHash).slice(0, 8)}...`,
                  });
                } else {
                  setMessage({ type: "error", text: "❌ Trade failed. Please try again." });
                }
              } catch (error: any) {
                let errorMessage = error.message || "Unknown error";
                if (
                  error.message?.includes("Insufficient SOL balance") ||
                  error.message?.includes("INSUFFICIENT_BALANCE")
                ) {
                  errorMessage = `💰 Insufficient SOL balance. Add SOL and try again.`;
                } else if (error.message?.includes("insufficient funds")) {
                  errorMessage = `💰 Insufficient funds. Please add SOL.`;
                } else if (
                  error.message?.includes("Invalid account discriminator") ||
                  error.message?.includes("INVALID_POOL_ADDRESS")
                ) {
                  errorMessage = `❌ Invalid pool address.`;
                } else if (error.message?.includes("TokenAccountNotFoundError")) {
                  errorMessage = `❌ Token account not found.`;
                }
                setMessage({ type: "error", text: errorMessage });
              } finally {
                setIsLoading(false);
              }
            }}
          >
            {isLoading ? "Processing..." : mode === "buy" ? `Buy ${token.symbol}` : `Sell ${token.symbol}`}
          </button>
        </div>
      </div>

      {/* Mini PnL cards */}
      <div className="grid grid-cols-4 border-b border-emerald-950">
        <div className="flex w-full flex-col items-center gap-1 border-r border-emerald-950 p-2 text-xs text-neutral-500">
          <span>Bought</span>
          <span className="text-sm text-emerald-300">$0</span>
        </div>
        <div className="flex w-full flex-col items-center gap-1 border-r border-emerald-950 p-2 text-xs text-neutral-500">
          <span>Sold</span>
          <span className="text-sm text-red-400">$0</span>
        </div>
        <div className="flex w-full flex-col items-center gap-1 border-r border-emerald-950 p-2 text-xs text-neutral-500">
          <span>Holding</span>
          <span className="text-sm text-neutral-50">$0</span>
        </div>
        <div className="flex w-full flex-col items-center gap-1 p-2 text-xs text-neutral-500">
          <span>PnL</span>
          <span className="text-sm text-emerald-300">$0(+0%)</span>
        </div>
      </div>

      {/* Presets / QuickBuy */}
      <div className="w-full border-b border-emerald-950">
        <QuickBuy hideActionButton className="rounded-none border-none bg-transparent" />
      </div>

      {/* Token Info */}
      <div className="border-b border-emerald-950 p-4">
        <div className="mb-2 text-xs text-neutral-400">Token Info</div>
        <div className="grid grid-cols-2 place-items-center gap-2 text-xs">
          <div className="flex h-20 w-20 flex-col items-center justify-center overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
            <span className="font-bold text-emerald-400">
              {token.total_holders
                ? ((token.total_holders / token.total_supply) * 100).toFixed(2)
                : "0"}
              %
            </span>
            <span className="text-neutral-400">Top 10 H.</span>
          </div>
          <div className="flex h-20 w-20 flex-col items-center justify-center overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
            <span className="font-bold text-neutral-300">
              {token.is_verified_contract ? "Yes" : "No"}
            </span>
            <span className="text-neutral-400">Dev H.</span>
          </div>
          <div className="flex h-20 w-20 flex-col items-center justify-center overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
            <span className="font-bold text-red-400">
              {token.total_snipers
                ? ((token.total_snipers / token.total_supply) * 100).toFixed(2)
                : "0"}
              %
            </span>
            <span className="text-neutral-400">Snipers H.</span>
          </div>
          <div className="flex h-20 w-20 flex-col items-center justify-center overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
            <span className="font-bold text-red-400">
              {token.possible_spam ? "Yes" : "No"}
            </span>
            <span className="text-neutral-400">Insiders</span>
          </div>
          <div className="flex h-20 w-20 flex-col items-center justify-center overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
            <span className="font-bold text-red-400">
              {token.total_liquidity_usd ? formatSmartNumber(token.total_liquidity_usd) : "0"}
            </span>
            <span className="text-neutral-400">Liquidity</span>
          </div>
          <div className="flex h-20 w-20 flex-col items-center justify-center overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
            <span className="font-bold text-red-400">
              {token.bonding_pct ? `${Math.round(Number(token.bonding_pct))}%` : "0%"}
            </span>
            <span className="text-neutral-400">Progress</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradeActionPanel;
