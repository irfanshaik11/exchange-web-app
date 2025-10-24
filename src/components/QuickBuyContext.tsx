import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

export type MevMode = 'off' | 'reduced' | 'on';

export interface QuickBuySettings {
  maxSlippage: number;
  priority: number;
  bribe: number;
  mevMode: MevMode;
  autoFee: boolean;
  maxFee: number;
  rpc?: string;
}

export interface QuickBuyContextType {
  quickBuySettings: QuickBuySettings;
  setQuickBuySettings: (settings: QuickBuySettings) => void;
  quickSellSettings: QuickBuySettings;
  setQuickSellSettings: (settings: QuickBuySettings) => void;
  presets: QuickBuyPreset[];
  setPresets: (presets: QuickBuyPreset[]) => void;
  activePreset: number;
  setActivePreset: (idx: number) => void;
}

export interface QuickBuyPreset {
  name: string; // e.g. 'P1', 'P2', 'P3'
  quickBuySettings: QuickBuySettings;
  quickSellSettings: QuickBuySettings;
}

const defaultSettings: QuickBuySettings = {
  maxSlippage: 0.2,
  priority: 0.001,
  bribe: 0.00,
  mevMode: 'off',
  autoFee: false,
  maxFee: 0,
  rpc: undefined,
};

const defaultPresets: QuickBuyPreset[] = [
  { name: 'P1', quickBuySettings: { ...defaultSettings }, quickSellSettings: { ...defaultSettings } },
  { name: 'P2', quickBuySettings: { ...defaultSettings }, quickSellSettings: { ...defaultSettings } },
  { name: 'P3', quickBuySettings: { ...defaultSettings }, quickSellSettings: { ...defaultSettings } },
];

const QuickBuyContext = createContext<QuickBuyContextType | undefined>(undefined);

// Helper function to validate and clamp settings
function validateSettings(settings: QuickBuySettings): QuickBuySettings {
  const validated = { ...settings };

  // Validate slippage: min 0.001 (0.1%), max 1.0 (100%), round to 4 decimals
  if (validated.maxSlippage < 0.001) validated.maxSlippage = 0.001;
  if (validated.maxSlippage > 1.0) validated.maxSlippage = 1.0;
  validated.maxSlippage = Math.round(validated.maxSlippage * 10000) / 10000;

  // Validate priority: min 0.0001 SOL, max 10.0 SOL, round to 6 decimals
  if (validated.priority < 0.0001) validated.priority = 0.0001;
  if (validated.priority > 10.0) validated.priority = 10.0;
  validated.priority = Math.round(validated.priority * 1000000) / 1000000;

  // Validate bribe: min 0 SOL (optional), max 10.0 SOL, round to 6 decimals
  if (validated.bribe < 0) validated.bribe = 0;
  if (validated.bribe > 10.0) validated.bribe = 10.0;
  validated.bribe = Math.round(validated.bribe * 1000000) / 1000000;

  return validated;
}

export function QuickBuyProvider({ children }: { children: ReactNode }) {
  // TEMPORARY: Force reset localStorage to use new defaults BEFORE loading
  if (typeof window !== 'undefined') {
    localStorage.removeItem('quickBuySettings');
    console.log('🧹 Cleared localStorage quickBuySettings');
    console.log('🔧 Default settings:', defaultSettings);
  }

  // Load from localStorage if available
  const getInitialState = () => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('quickBuySettings');
      console.log('📦 Saved settings from localStorage:', saved);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Validate loaded presets
          const validatedPresets = (parsed.presets || [...defaultPresets]).map((preset: QuickBuyPreset) => ({
            ...preset,
            quickBuySettings: validateSettings(preset.quickBuySettings),
            quickSellSettings: validateSettings(preset.quickSellSettings),
          }));
          return {
            presets: validatedPresets,
            activePreset: typeof parsed.activePreset === 'number' ? parsed.activePreset : 0,
          };
        } catch {
          // ignore parse errors
        }
      }
    }
    return { presets: [...defaultPresets], activePreset: 0 };
  };
  const initial = getInitialState();
  const [quickBuySettings, setQuickBuySettings] = useState<QuickBuySettings>({ ...defaultSettings });
  const [quickSellSettings, setQuickSellSettings] = useState<QuickBuySettings>({ ...defaultSettings });
  const [presets, setPresets] = useState<QuickBuyPreset[]>(initial.presets);
  const [activePreset, setActivePreset] = useState(initial.activePreset);

  // Save to localStorage on change
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('quickBuySettings', JSON.stringify({ presets, activePreset }));
    }
  }, [presets, activePreset]);

  // Wrapped setters with validation
  const setQuickBuySettingsValidated = React.useCallback((settings: QuickBuySettings) => {
    setQuickBuySettings(validateSettings(settings));
  }, []);

  const setQuickSellSettingsValidated = React.useCallback((settings: QuickBuySettings) => {
    setQuickSellSettings(validateSettings(settings));
  }, []);

  const setPresetsValidated = React.useCallback((newPresets: QuickBuyPreset[]) => {
    const validatedPresets = newPresets.map(preset => ({
      ...preset,
      quickBuySettings: validateSettings(preset.quickBuySettings),
      quickSellSettings: validateSettings(preset.quickSellSettings),
    }));
    setPresets(validatedPresets);
  }, []);

  return (
    <QuickBuyContext.Provider value={{
      quickBuySettings,
      setQuickBuySettings: setQuickBuySettingsValidated,
      quickSellSettings,
      setQuickSellSettings: setQuickSellSettingsValidated,
      presets,
      setPresets: setPresetsValidated,
      activePreset,
      setActivePreset
    }}>
      {children}
    </QuickBuyContext.Provider>
  );
}

export function useQuickBuy() {
  const ctx = useContext(QuickBuyContext);
  if (!ctx) throw new Error('useQuickBuy must be used within a QuickBuyProvider');
  return ctx;
} 