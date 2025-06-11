import React, { useState } from "react";
import { formatSmartNumber, type Token } from "~/utils/db";
import { useQuickBuy } from "~/components/QuickBuyContext";
import { FaRunning, FaGasPump, FaCoins, FaBan } from "react-icons/fa";
import InterstateTooltip from "../InterstateTooltip";
import { QuickBuyPresetBar } from "./TradeHeader";

interface TradeActionPanelProps {
  token: Token;
}

const presetLabels = ["PRESET 1", "PRESET 2", "PRESET 3"];
const mevModes = [
  { label: "Off", value: "off" },
  { label: "Reduced", value: "reduced" },
  { label: "Secure", value: "on" },
];

function QuickBuySettingsSection() {
  const { presets, setPresets, activePreset, setActivePreset } = useQuickBuy();
  const [side, setSide] = useState<"buy" | "sell">("buy");

  // Local state for editing (for instant UI feedback)
  const [localBuy, setLocalBuy] = useState({
    ...presets[activePreset].quickBuySettings,
  });
  const [localSell, setLocalSell] = useState({
    ...presets[activePreset].quickSellSettings,
  });

  React.useEffect(() => {
    setLocalBuy({ ...presets[activePreset].quickBuySettings });
    setLocalSell({ ...presets[activePreset].quickSellSettings });
  }, [activePreset, presets]);

  // Save changes to context and presets immediately
  const updateSettings = (s) => {
    if (side === "buy") setLocalBuy(s);
    else setLocalSell(s);
    const newPresets = presets.map((p, i) =>
      i === activePreset
        ? {
            ...p,
            quickBuySettings: side === "buy" ? { ...s } : { ...localBuy },
            quickSellSettings: side === "sell" ? { ...s } : { ...localSell },
          }
        : p,
    );
    setPresets(newPresets);
  };

  const settings = side === "buy" ? localBuy : localSell;

  return (
    <div className="flex flex-col gap-2 rounded-lg px-3 py-3">
      <div className="mb-2 flex gap-2">
        {presetLabels.map((label, i) => (
          <button
            key={label}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${activePreset === i ? "bg-blue-700 text-white" : "bg-neutral-800 text-blue-300 hover:bg-neutral-700"}`}
            onClick={() => setActivePreset(i)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mb-2 flex gap-2">
        <button
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${side === "buy" ? "bg-emerald-700 text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"}`}
          onClick={() => setSide("buy")}
        >
          Buy settings
        </button>
        <button
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${side === "sell" ? "bg-emerald-700 text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"}`}
          onClick={() => setSide("sell")}
        >
          Sell settings
        </button>
      </div>
      <div className="mb-2 grid grid-cols-3 gap-2">
        <div className="flex flex-col items-center rounded bg-neutral-800 p-2">
          <input
            type="number"
            className="w-full bg-transparent text-center text-sm font-bold text-white outline-none"
            value={settings.maxSlippage}
            onChange={(e) =>
              updateSettings({
                ...settings,
                maxSlippage: Number(e.target.value),
              })
            }
          />
          <span className="mt-1 flex items-center gap-1 text-[10px] text-neutral-400">
            <FaRunning /> SLIPPAGE
          </span>
        </div>
        <div className="flex flex-col items-center rounded bg-neutral-800 p-2">
          <input
            type="number"
            className="w-full bg-transparent text-center text-sm font-bold text-white outline-none"
            value={settings.priority}
            onChange={(e) =>
              updateSettings({ ...settings, priority: Number(e.target.value) })
            }
          />
          <span className="mt-1 flex items-center gap-1 text-[10px] text-neutral-400">
            <FaGasPump /> PRIORITY
          </span>
        </div>
        <div className="flex flex-col items-center rounded bg-neutral-800 p-2">
          <input
            type="number"
            className="w-full bg-transparent text-center text-sm font-bold text-white outline-none"
            value={settings.bribe}
            onChange={(e) =>
              updateSettings({ ...settings, bribe: Number(e.target.value) })
            }
          />
          <span className="mt-1 flex items-center gap-1 text-[10px] text-neutral-400">
            <FaCoins /> BRIBE
          </span>
        </div>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={settings.autoFee}
            onChange={(e) =>
              updateSettings({ ...settings, autoFee: e.target.checked })
            }
            className="accent-emerald-500"
          />
          <span className="text-xs text-neutral-300">Auto Fee</span>
        </label>
        <input
          type="number"
          className="ml-2 flex-1 rounded bg-neutral-800 px-2 py-1 text-xs text-white outline-none"
          placeholder="MAX FEE"
          value={settings.maxFee}
          onChange={(e) =>
            updateSettings({ ...settings, maxFee: Number(e.target.value) })
          }
          disabled={settings.autoFee}
        />
      </div>
      <div className="mb-2 flex items-center gap-2">
        <span className="mr-2 text-xs text-neutral-300">MEV Mode</span>
        {mevModes.map((mode) => (
          <button
            key={mode.value}
            className={`rounded border px-2 py-1 text-xs font-semibold ${settings.mevMode === mode.value ? "border-blue-400 bg-blue-800 text-blue-200" : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700"}`}
            onClick={() =>
              updateSettings({ ...settings, mevMode: mode.value as any })
            }
          >
            {mode.label}
          </button>
        ))}
      </div>
      <div>
        <input
          type="text"
          className="w-full rounded bg-neutral-800 px-3 py-2 text-xs text-neutral-300 outline-none"
          placeholder="RPC https://a...e.com"
          value={settings.rpc || ""}
          onChange={(e) => updateSettings({ ...settings, rpc: e.target.value })}
        />
      </div>
    </div>
  );
}

const TradeActionPanel: React.FC<TradeActionPanelProps> = ({ token }) => {
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [tab, setTab] = useState<"market" | "limit" | "adv">("market");
  const { presets, activePreset } = useQuickBuy();
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
  const buyPct = Number(totalValue)
    ? (Number(buyVol) / Number(totalValue)) * 100
    : 50;
  const sellPct = Number(totalValue)
    ? (Number(sellVol) / Number(totalValue)) * 100
    : 50;

  return (
    <div className="flex h-full flex-shrink-0 flex-col bg-neutral-950">
      {/* Stats Bar - Redesigned */}
      <div className="border-b border-emerald-950 p-4">
        <div className="flex items-end justify-between text-xs">
          <div className="flex flex-col items-start">
            <span className="text-xs text-gray-500">5m Vol</span>
            <span className="text-xs text-white">
              {formatSmartNumber(vol5m)}
            </span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-xs text-gray-500">Buys</span>
            <span className="text-xs text-white">
              {buysCount} <span className="text-xs text-gray-500">/</span>{" "}
              <span className="text-xs text-white">
                {formatSmartNumber(buysValue)}
              </span>
            </span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-xs text-gray-500">Sells</span>
            <span className="text-xs text-white">
              {sellsCount} <span className="text-xs text-gray-500">/</span>{" "}
              <span className="text-xs text-white">
                {formatSmartNumber(sellsValue)}
              </span>
            </span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-xs text-gray-500">Net Vol.</span>
            <span className={`text-xs text-white`}>
              {netVol < 0 ? "-" : ""}$
              {Math.abs(netVol).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>
        {/* Progress Bar */}
        <div className="mt-2 flex h-[3px] gap-1 overflow-hidden rounded">
          <div
            className="bg-emerald-400"
            style={{ width: `${buyPct}%`, transition: "width 0.3s" }}
          />
          <div
            className="bg-red-500"
            style={{ width: `${sellPct}%`, transition: "width 0.3s" }}
          />
        </div>
      </div>
      {/* Trade Box */}
      <div className="flex flex-col border-b border-emerald-950 pb-4 shadow-lg">
        {/* Toggle */}
        <div className="flex border-b border-emerald-950 p-2">
          <button
            className={`px-6 py-2 text-sm font-bold transition-all ${mode === "buy" ? "bg-emerald-500 text-white" : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800"}`}
            onClick={() => setMode("buy")}
            type="button"
          >
            Buy
          </button>
          <button
            className={`px-6 py-2 text-sm font-bold transition-all ${mode === "sell" ? "bg-red-500 text-white" : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800"}`}
            onClick={() => setMode("sell")}
            type="button"
          >
            Sell
          </button>
        </div>
        {/* Tabs: Market, Limit, Adv. */}
        <div className="flex items-center gap-4 border-b border-emerald-950 px-4 pt-2 text-sm font-semibold">
          <button
            className={
              tab === "market"
                ? "border-b-2 border-emerald-400 pb-1 text-emerald-400"
                : "pb-1 text-neutral-400"
            }
            onClick={() => setTab("market")}
          >
            Market
          </button>
          <button
            className={
              tab === "limit"
                ? "border-b-2 border-emerald-400 pb-1 text-emerald-400"
                : "pb-1 text-neutral-400"
            }
            onClick={() => setTab("limit")}
          >
            Limit
          </button>
          <button
            className={
              tab === "adv"
                ? "border-b-2 border-emerald-400 pb-1 text-emerald-400"
                : "pb-1 text-neutral-400"
            }
            onClick={() => setTab("adv")}
          >
            Adv.
          </button>
        </div>
        {/* Amount Row */}
        <div className="mx-4 my-3 mb-2 bg-neutral-800 p-2 px-0 pb-0">
          <div className="mb-2 flex items-center justify-between px-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-neutral-400">
              AMOUNT
            </span>
            <span className="text-xs font-bold text-white">
              {amount || "-"}
            </span>
          </div>
          <div className="mt-2 flex items-center">
            {[0.01, 0.1, 1, 10].map((opt) => (
              <button
                key={opt}
                className={`w-full cursor-pointer border border-neutral-800 bg-neutral-950 px-4 py-1 text-xs font-semibold text-white transition-all hover:bg-neutral-800 ${amount === String(opt) ? (mode === "buy" ? "bg-emerald-600" : "bg-red-500") : ""}`}
                onClick={() => setAmount(String(opt))}
                type="button"
              >
                {opt}
              </button>
            ))}
            <input
              type="number"
              min="0"
              step="any"
              className="w-32 border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs font-semibold text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder="0.0"
              value={["0.01", "0.1", "1", "10"].includes(amount) ? "" : amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>
        {/* QuickBuy Settings Summary */}
        <div className="mx-4 my-1 flex items-center gap-4 text-xs text-neutral-200">
          <InterstateTooltip label="Max Slippage">
            <span className="flex items-center gap-1">
              <FaRunning /> {settings.maxSlippage * 100}%
            </span>
          </InterstateTooltip>
          <InterstateTooltip
            label={`Priority Fee: ${settings.priority}. ${settings.priority < 0.01 ? "We recommend a priority fee of atleast 0.01" : ""}`}
          >
            <span className="flex items-center gap-1 text-yellow-400">
              <FaGasPump /> {settings.priority}{" "}
              {settings.priority < 0.01 ? (
                <span className="text-yellow-400">&#9888;</span>
              ) : (
                ""
              )}
            </span>
          </InterstateTooltip>
          <InterstateTooltip label="Bribe">
            <span className="flex items-center gap-1 text-yellow-400">
              <FaCoins /> {settings.bribe}{" "}
              <span className="text-yellow-400">&#9888;</span>
            </span>
          </InterstateTooltip>
          <InterstateTooltip label="MEV Protection">
            <span
              className={`flex items-center gap-1 ${settings.mevMode === "off" ? "text-neutral-400" : settings.mevMode === "reduced" ? "text-yellow-400" : "text-emerald-400"}`}
            >
              <FaBan />{" "}
              {settings.mevMode === "off"
                ? "Off"
                : settings.mevMode === "reduced"
                  ? "Reduced"
                  : "Secure"}
            </span>
          </InterstateTooltip>
        </div>
        {/* Advanced Trading Strategy DO THIS AGAIN ADVANCED  */}
        {/* <div className="mx-4 mt-1 flex items-center gap-2">
          <input
            type="checkbox"
            id="adv-strategy"
            className="accent-emerald-500"
          />
          <label htmlFor="adv-strategy" className="text-xs text-neutral-400">
            Advanced Trading Strategy
          </label>
        </div> */}
        {/* Action Button */}
        <button
          className={`mx-4 mt-2 py-3 text-xs font-bold transition disabled:opacity-50 ${mode === "buy" ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-red-500 text-white hover:bg-pink-700"}`}
          disabled={!amount}
        >
          {mode === "buy" ? `Buy ${token.name}` : `Sell ${token.name}`}
        </button>
      </div>
      <div className="flex flex-row border-b border-emerald-950">
        <div className="flex w-full flex-col items-center gap-2 border-r border-emerald-950 p-2 text-xs text-neutral-500">
          <span>Bought</span>
          <span className="text-sm text-emerald-300">$0</span>
        </div>
        <div className="flex w-full flex-col items-center gap-2 border-r border-emerald-950 p-2 text-xs text-neutral-500">
          <span>Sold</span>
          <span className="text-sm text-red-400">$0</span>
        </div>
        <div className="flex w-full flex-col items-center gap-2 border-r border-emerald-950 p-2 text-xs text-neutral-500">
          <span>Holding</span>
          <span className="text-sm text-neutral-50">$0</span>
        </div>
        <div className="flex w-full flex-col items-center gap-2 border-r border-emerald-950 p-2 text-xs text-neutral-500">
          <span>PnL</span>
          <span className="text-sm text-emerald-300">$0(+0%)</span>
        </div>
      </div>
      {/* QuickBuy Preset Bar  FIX THE WIDTH THING */}
      <div className="border-b border-emerald-950 w-[350px]">
        <QuickBuySettingsSection />
      </div>
      {/* Token Info Box (mocked) */}
      <div className="border-b border-emerald-950 p-4">
        <div className="mb-2 text-xs text-neutral-400">Token Info</div>
        {/* TODO: Replace the following mocked values with real data from the Token type if available */}
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
  );
};

export default TradeActionPanel;
