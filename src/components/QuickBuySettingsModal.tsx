import React, { useState } from 'react';
import InterstatePopout from './InterstatePopout';
import { useQuickBuy } from './QuickBuyContext';
import type { QuickBuySettings, QuickBuyPreset } from './QuickBuyContext';

interface QuickBuySettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const presetLabels = ['PRESET 1', 'PRESET 2', 'PRESET 3'];
const mevModes = [
  { label: 'Off', value: 'off' },
  { label: 'Reduced', value: 'reduced' },
  { label: 'Secure', value: 'on' },
];

export default function QuickBuySettingsModal({ open, onClose }: QuickBuySettingsModalProps) {
  const {
    quickBuySettings,
    setQuickBuySettings,
    quickSellSettings,
    setQuickSellSettings,
    presets,
    setPresets,
    activePreset,
    setActivePreset,
  } = useQuickBuy();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');

  // Local state for editing
  const [localBuy, setLocalBuy] = useState<QuickBuySettings>({ ...presets[activePreset].quickBuySettings });
  const [localSell, setLocalSell] = useState<QuickBuySettings>({ ...presets[activePreset].quickSellSettings });

  // Sync local state when preset changes
  React.useEffect(() => {
    setLocalBuy({ ...presets[activePreset].quickBuySettings });
    setLocalSell({ ...presets[activePreset].quickSellSettings });
  }, [activePreset, presets]);

  // Save changes to context and presets
  const handleContinue = () => {
    // Update context
    setQuickBuySettings(localBuy);
    setQuickSellSettings(localSell);
    // Update presets
    const newPresets = presets.map((p, i) =>
      i === activePreset
        ? {
            ...p,
            quickBuySettings: { ...localBuy },
            quickSellSettings: { ...localSell },
          }
        : p
    );
    setPresets(newPresets);
    onClose();
  };

  const settings = side === 'buy' ? localBuy : localSell;
  const setSettings = (s: QuickBuySettings) => {
    if (side === 'buy') setLocalBuy(s);
    else setLocalSell(s);
  };

  return (
    <InterstatePopout open={open} onClose={onClose} align="center" className="bg-neutral-900 rounded-xl shadow-2xl w-full max-w-md p-6 relative text-neutral-100">
      <div className="text-lg font-bold mb-4 flex items-center justify-between">
        Trading Settings
        <button onClick={onClose} className="text-2xl text-neutral-400 hover:text-white">×</button>
      </div>
      {/* Presets */}
      <div className="flex gap-2 mb-4">
        {presetLabels.map((label, i) => (
          <button
            key={label}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${activePreset === i ? 'bg-blue-700 text-white' : 'bg-neutral-800 text-blue-300 hover:bg-neutral-700'}`}
            onClick={() => setActivePreset(i)}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Buy/Sell Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${side === 'buy' ? 'bg-emerald-700 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`}
          onClick={() => setSide('buy')}
        >
          Buy Settings
        </button>
        <button
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${side === 'sell' ? 'bg-emerald-700 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`}
          onClick={() => setSide('sell')}
        >
          Sell Settings
        </button>
      </div>
      {/* Settings Inputs */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="flex flex-col items-center bg-neutral-800 rounded p-2">
          <input
            type="number"
            className="w-full bg-transparent text-center text-white font-bold text-sm outline-none"
            value={settings.maxSlippage}
            onChange={e => setSettings({ ...settings, maxSlippage: Number(e.target.value) })}
          />
          <span className="text-[10px] text-neutral-400 mt-1">SLIPPAGE</span>
        </div>
        <div className="flex flex-col items-center bg-neutral-800 rounded p-2">
          <input
            type="number"
            className="w-full bg-transparent text-center text-white font-bold text-sm outline-none"
            value={settings.priority}
            onChange={e => setSettings({ ...settings, priority: Number(e.target.value) })}
          />
          <span className="text-[10px] text-neutral-400 mt-1">PRIORITY</span>
        </div>
        <div className="flex flex-col items-center bg-neutral-800 rounded p-2">
          <input
            type="number"
            className="w-full bg-transparent text-center text-white font-bold text-sm outline-none"
            value={settings.bribe}
            onChange={e => setSettings({ ...settings, bribe: Number(e.target.value) })}
          />
          <span className="text-[10px] text-neutral-400 mt-1">BRIBE</span>
        </div>
      </div>
      {/* Auto Fee and Max Fee */}
      <div className="flex items-center gap-2 mb-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.autoFee}
            onChange={e => setSettings({ ...settings, autoFee: e.target.checked })}
            className="accent-emerald-500"
          />
          <span className="text-xs text-neutral-300">Auto Fee</span>
        </label>
        <input
          type="number"
          className="flex-1 bg-neutral-800 rounded px-2 py-1 text-xs text-white ml-2 outline-none"
          placeholder="MAX FEE"
          value={settings.maxFee}
          onChange={e => setSettings({ ...settings, maxFee: Number(e.target.value) })}
          disabled={settings.autoFee}
        />
      </div>
      {/* MEV Mode */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-neutral-300 mr-2">MEV Mode</span>
        {mevModes.map(mode => (
          <button
            key={mode.value}
            className={`rounded px-2 py-1 text-xs font-semibold border ${settings.mevMode === mode.value ? 'bg-blue-800 border-blue-400 text-blue-200' : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'}`}
            onClick={() => setSettings({ ...settings, mevMode: mode.value as any })}
          >
            {mode.label}
          </button>
        ))}
      </div>
      {/* RPC Input */}
      <div className="mb-6">
        <input
          type="text"
          className="w-full bg-neutral-800 rounded px-3 py-2 text-xs text-neutral-300 outline-none"
          placeholder="RPC https://a...e.com"
          value={settings.rpc || ''}
          onChange={e => setSettings({ ...settings, rpc: e.target.value })}
        />
      </div>
      <button
        className="w-full rounded-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 text-base transition"
        onClick={handleContinue}
      >
        Continue
      </button>
    </InterstatePopout>
  );
} 