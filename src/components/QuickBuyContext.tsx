import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';

const isDev = process.env.NODE_ENV !== 'production';

export type MevMode = 'off' | 'reduced' | 'on';

export interface QuickBuySettings {
  maxSlippage: number;
  priority: number;
  bribe: number;
  mevMode: MevMode;
  autoFee: boolean;
  maxFee: number;
  rpc?: string;
  gasPrice?: number; // Gas price in gwei for Monad (optional, defaults to network suggestion)
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
  priority: 0.00005, // Low default - dynamic fee calculator optimizes based on trade size/token age
  bribe: 0, // No bribe by default (was 0.01)
  mevMode: 'off',
  autoFee: false,
  maxFee: 0,
  rpc: undefined,
  gasPrice: undefined, // Default to network suggestion for Monad
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
  // gasPrice is optional, so only validate if it's set
  if (validated.gasPrice !== undefined && validated.gasPrice !== null && (isNaN(validated.gasPrice) || validated.gasPrice < 0)) {
    validated.gasPrice = undefined;
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
      const shouldReset = sessionStorage.getItem('quickBuySettingsReset_v3') !== 'true';
      if (shouldReset) {
        localStorage.removeItem('quickBuySettings');
        sessionStorage.setItem('quickBuySettingsReset_v3', 'true');
        isDev && console.log('Cleared localStorage quickBuySettings (forced reset for priority fee tweak)');
        isDev && console.log('Default settings:', defaultSettings);
      }
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('quickBuySettings');
      isDev && console.log('Saved settings from localStorage:', saved);
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
      try {
        localStorage.setItem('quickBuySettings', JSON.stringify({ presets, activePreset }));
      } catch (e) {
        // localStorage quota exceeded - clear old data and try again
        console.warn('localStorage quota exceeded, clearing old data...');
        try {
          localStorage.clear();
          localStorage.setItem('quickBuySettings', JSON.stringify({ presets, activePreset }));
        } catch {
          console.error('Failed to save quickBuySettings to localStorage');
        }
      }
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

  const value = useMemo(() => ({
    quickBuySettings,
    setQuickBuySettings: setQuickBuySettingsValidated,
    quickSellSettings,
    setQuickSellSettings: setQuickSellSettingsValidated,
    presets,
    setPresets: setPresetsValidated,
    activePreset,
    setActivePreset,
  }), [quickBuySettings, setQuickBuySettingsValidated, quickSellSettings, setQuickSellSettingsValidated, presets, setPresetsValidated, activePreset, setActivePreset]);

  return (
    <QuickBuyContext.Provider value={value}>
      {children}
    </QuickBuyContext.Provider>
  );
}

export function useQuickBuy() {
  const ctx = useContext(QuickBuyContext);
  if (!ctx) throw new Error('useQuickBuy must be used within a QuickBuyProvider');
  return ctx;
} 