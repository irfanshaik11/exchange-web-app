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
  maxSlippage: 0.2, // 20%
  priority: 0.001,
  bribe: 0, // No bribe by default (was 0.01)
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

// Helper function to validate settings (no clamping - allows free editing)
function validateSettings(settings: QuickBuySettings): QuickBuySettings {
  // Just return settings as-is, allowing any values
  // Only ensure numbers are valid (not NaN)
  const validated = { ...settings };
  
  if (isNaN(validated.maxSlippage) || validated.maxSlippage === null || validated.maxSlippage === undefined) {
    validated.maxSlippage = defaultSettings.maxSlippage;
  }
  if (isNaN(validated.priority) || validated.priority === null || validated.priority === undefined) {
    validated.priority = defaultSettings.priority;
  }
  if (isNaN(validated.bribe) || validated.bribe === null || validated.bribe === undefined) {
    validated.bribe = defaultSettings.bribe;
  }
  
  return validated;
}

export function QuickBuyProvider({ children }: { children: ReactNode }) {
  // Load from localStorage if available
  const getInitialState = () => {
    // TEMPORARY: Force reset localStorage to use new defaults BEFORE loading
    // Moved inside function to avoid running during render
    if (typeof window !== 'undefined') {
      // Only remove on first load, not every render
      // Updated reset key to force new reset with bribe = 0 default
      const shouldReset = sessionStorage.getItem('quickBuySettingsReset_v2') !== 'true';
      if (shouldReset) {
        localStorage.removeItem('quickBuySettings');
        sessionStorage.setItem('quickBuySettingsReset_v2', 'true');
        console.log('🧹 Cleared localStorage quickBuySettings (forced reset for bribe fix)');
        console.log('🔧 Default settings:', defaultSettings);
      }
    }
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