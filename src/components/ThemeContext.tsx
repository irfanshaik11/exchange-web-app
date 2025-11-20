"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type ThemePreset = 'dark' | 'light' | 'dusk' | 'astro' | 'neo' | 'crimson' | 'stealth-blue' | 'orange' | 'custom';

export interface ColorOverrides {
  increase?: string;
  increaseHover?: string;
  decrease?: string;
  decreaseHover?: string;
  background?: string;
  primaryStroke?: string;
  secondaryStroke?: string;
  backgroundTertiary?: string;
  backgroundSecondary?: string;
  borderSubtle?: string;
  textTertiary?: string;
  textSecondary?: string;
  textPrimary?: string;
  chartUp?: string;
  chartDown?: string;
  primaryYellow?: string;
  primaryRed?: string;
  primaryGreen?: string;
  primaryLightBlue?: string;
  primaryOrange?: string;
  primaryOrangeHover?: string;
  translationTextColor?: string;
}

export interface ThemeConfig {
  name: string;
  primaryColor: string;
  headerColor: string;
  sidebarColor: string;
  contentBg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  muted: string;
  mint: string;
  isBrighterTheme?: boolean;
  colorOverrides?: ColorOverrides;
  backgroundType?: 'solid' | 'gradient';
  gradientStartColor?: string;
  gradientEndColor?: string;
  chartBackgroundColor?: string;
  preview: {
    header: string;
    sidebar: string;
    content: string;
  };
}

export const themePresets: Record<ThemePreset, ThemeConfig> = {
  dark: {
    name: 'Dark',
    primaryColor: '#526FFF',
    headerColor: 'linear-gradient(135deg, #526FFF 0%, #3B5BFF 100%)',
    sidebarColor: '#526FFF',
    contentBg: '#101114',
    surface: '#1E1F26',
    surface2: '#17191E',
    border: '#2A2B33',
    text: '#c7c9d1',
    muted: '#c7c9d1',
    mint: '#70E0B0',
    isBrighterTheme: false,
    backgroundType: 'solid',
    chartBackgroundColor: '#101114',
    preview: {
      header: 'linear-gradient(135deg, #526FFF 0%, #3B5BFF 100%)',
      sidebar: '#526FFF',
      content: '#101114',
    },
  },
  light: {
    name: 'Light',
    primaryColor: '#647DFA',
    headerColor: '#ffffff',
    sidebarColor: '#ffffff',
    contentBg: '#FFFFFF',
    surface: '#F7F7F7',
    surface2: '#FFFFFF',
    border: '#E1E1E1',
    text: '#1D1D1F',
    muted: '#696969',
    mint: '#00A78D',
    isBrighterTheme: false,
    backgroundType: 'solid',
    chartBackgroundColor: '#F7F7F7',
    colorOverrides: {
      increase: '#00A78D',
      increaseHover: '#0FBA9F',
      decrease: '#CF206D',
      decreaseHover: '#F2568F',
      background: '#FFFFFF',
      backgroundSecondary: '#F7F7F7',
      backgroundTertiary: '#FFFFFF',
      primaryStroke: '#E1E1E1',
      secondaryStroke: '#D2D2D7',
      borderSubtle: '#E1E1E1',
      textPrimary: '#1D1D1F',
      textSecondary: '#0F0F0F',
      textTertiary: '#696969',
      chartUp: '#00A78D',
      chartDown: '#CF206D',
      translationTextColor: '#1B365C',
    },
    preview: {
      header: '#ffffff',
      sidebar: '#ffffff',
      content: '#FFFFFF',
    },
  },
  dusk: {
    name: 'Dusk',
    primaryColor: '#526FFF',
    headerColor: '#526FFF',
    sidebarColor: '#526FFF',
    contentBg: '#1a1a2e',
    surface: '#16213e',
    surface2: '#0f1419',
    border: '#2A2B33',
    text: '#c7c9d1',
    muted: '#9CA3AF',
    mint: '#70E0B0',
    isBrighterTheme: false,
    backgroundType: 'solid',
    chartBackgroundColor: '#1a1a2e',
    preview: {
      header: '#526FFF',
      sidebar: '#526FFF',
      content: '#1a1a2e',
    },
  },
  astro: {
    name: 'Astro',
    primaryColor: '#6A60E8',
    headerColor: '#6A60E8',
    sidebarColor: '#6A60E8',
    contentBg: '#1A1C24',
    surface: '#1C1D25',
    surface2: '#191A24',
    border: '#303038',
    text: '#F3F3F4',
    muted: '#8D93B7',
    mint: '#4FEEE4',
    isBrighterTheme: false,
    backgroundType: 'gradient',
    gradientStartColor: '#181c27',
    gradientEndColor: '#131722',
    chartBackgroundColor: '#1A1C24',
    colorOverrides: {
      chartUp: '#0B9981',
      chartDown: '#F23546',
      primaryLightBlue: '#7CDDFF',
      primaryOrangeHover: '#E7B587',
      primaryOrange: '#E7B587',
      background: '#1A1C24',
      backgroundSecondary: '#1C1D25',
      primaryRed: '#F04B92',
      primaryGreen: '#4FEEE4',
      primaryYellow: '#E7B587',
      primaryStroke: '#303038',
      secondaryStroke: '#303038',
      borderSubtle: '#303038',
      backgroundTertiary: '#191A24',
      textTertiary: '#8D93B7',
      textPrimary: '#F3F3F4',
      textSecondary: '#8D93B7',
      increase: '#37D6CC',
      decrease: '#F04B92',
    },
    preview: {
      header: '#6A60E8',
      sidebar: '#6A60E8',
      content: '#1A1C24',
    },
  },
  neo: {
    name: 'Neo',
    primaryColor: '#58C88D',
    headerColor: '#58C88D',
    sidebarColor: '#58C88D',
    contentBg: '#0D0D0F',
    surface: '#101011',
    surface2: '#101011',
    border: '#1E2025',
    text: '#FFFFFF',
    muted: '#9CA2AF',
    mint: '#57C88D',
    isBrighterTheme: false,
    backgroundType: 'solid',
    chartBackgroundColor: '#101011',
    colorOverrides: {
      increase: '#57C88D',
      increaseHover: '#67CE98',
      decrease: '#E35661',
      decreaseHover: '#E56671',
      background: '#0D0D0F',
      secondaryStroke: '#2E313A',
      primaryStroke: '#1E2025',
      backgroundTertiary: '#101011',
      backgroundSecondary: '#101011',
      borderSubtle: '#1C2630',
      textTertiary: '#6A707F',
      textSecondary: '#9CA2AF',
      textPrimary: '#FFFFFF',
      chartUp: '#449D6E',
      chartDown: '#A13C45',
    },
    preview: {
      header: '#58C88D',
      sidebar: '#58C88D',
      content: '#0D0D0F',
    },
  },
  crimson: {
    name: 'Crimson',
    primaryColor: '#ff3c30',
    headerColor: '#ff3c30',
    sidebarColor: '#ff3c30',
    contentBg: '#000000',
    surface: '#000000',
    surface2: '#000000',
    border: '#121212',
    text: '#9e9e9e',
    muted: '#707070',
    mint: '#90A2FC',
    isBrighterTheme: false,
    backgroundType: 'solid',
    chartBackgroundColor: '#000000',
    colorOverrides: {
      background: '#000000',
      backgroundSecondary: '#000000',
      backgroundTertiary: '#000000',
      primaryStroke: '#121212',
      secondaryStroke: '#121212',
      borderSubtle: '#121212',
      textPrimary: '#9e9e9e',
      textSecondary: '#707070',
      textTertiary: '#383838',
      increase: '#90A2FC',
      increaseHover: '#adbbff',
      decrease: '#ff3c30',
      decreaseHover: '#ff5f57',
      chartUp: '#90a2fc',
      chartDown: '#ff3c30',
      primaryGreen: '#90A2FC',
      primaryYellow: '#ffc72e',
      primaryOrange: '#ff822e',
      primaryOrangeHover: '#ff9147',
      primaryRed: '#FF3C30',
      primaryLightBlue: '#61b3ff',
    },
    preview: {
      header: '#ff3c30',
      sidebar: '#ff3c30',
      content: '#000000',
    },
  },
  'stealth-blue': {
    name: 'Stealth Blue',
    primaryColor: '#00E0FF',
    headerColor: '#00E0FF',
    sidebarColor: '#00E0FF',
    contentBg: '#0D0D0F',
    surface: '#101011',
    surface2: '#101011',
    border: '#0D0D0F',
    text: '#FFFFFF',
    muted: '#9CA2AF',
    mint: '#00E0FF',
    isBrighterTheme: false,
    backgroundType: 'solid',
    chartBackgroundColor: '#101011',
    colorOverrides: {
      increase: '#FFFFFF',
      increaseHover: '#E0E0E0',
      decrease: '#00E0FF',
      decreaseHover: '#00B8CC',
      background: '#0D0D0F',
      primaryStroke: '#0D0D0F',
      backgroundTertiary: '#101011',
      backgroundSecondary: '#101011',
      textTertiary: '#6A707F',
      textSecondary: '#9CA2AF',
      textPrimary: '#FFFFFF',
      chartUp: '#FFFFFF',
      chartDown: '#00E0FF',
      primaryYellow: '#FFFF00',
      primaryRed: '#FF3040',
      primaryGreen: '#ffffff',
      primaryLightBlue: '#A5C5FA',
    },
    preview: {
      header: '#00E0FF',
      sidebar: '#00E0FF',
      content: '#0D0D0F',
    },
  },
  orange: {
    name: 'Orange',
    primaryColor: '#f77722',
    headerColor: '#f77722',
    sidebarColor: '#f77722',
    contentBg: '#18191B',
    surface: '#1D1D25',
    surface2: '#24242D',
    border: '#2C2E3A',
    text: '#FFFFFF',
    muted: '#9492B5',
    mint: '#32cde2',
    isBrighterTheme: false,
    backgroundType: 'solid',
    chartBackgroundColor: '#1D1D25',
    colorOverrides: {
      increase: '#32cde2',
      increaseHover: '#9ed0d6',
      decrease: '#eb8837',
      decreaseHover: '#eaa771',
      background: '#18191B',
      secondaryStroke: '#2F3241',
      primaryStroke: '#2C2E3A',
      backgroundTertiary: '#24242D',
      backgroundSecondary: '#1D1D25',
      borderSubtle: '#2C2E3A',
      textTertiary: '#605C70',
      textSecondary: '#9492B5',
      textPrimary: '#FFFFFF',
      chartUp: '#32cde2',
      chartDown: '#eb8837',
    },
    preview: {
      header: '#f77722',
      sidebar: '#f77722',
      content: '#18191B',
    },
  },
  custom: {
    name: 'Custom',
    primaryColor: '#526FFF',
    headerColor: '#526FFF',
    sidebarColor: '#526FFF',
    contentBg: '#101114',
    surface: '#1E1F26',
    surface2: '#17191E',
    border: '#2A2B33',
    text: '#c7c9d1',
    muted: '#c7c9d1',
    mint: '#70E0B0',
    preview: {
      header: '#526FFF',
      sidebar: '#526FFF',
      content: '#101114',
    },
  },
};

interface ThemeContextType {
  theme: ThemePreset;
  primaryColor: string;
  customFont: string;
  themeConfig: ThemeConfig;
  setTheme: (theme: ThemePreset) => void;
  setPrimaryColor: (color: string) => void;
  setCustomFont: (font: string) => void;
  resetToDefault: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const getInitialTheme = (): ThemePreset => {
    if (typeof window === 'undefined') return 'dark';
    try {
      const saved = localStorage.getItem('theme-preset') as ThemePreset;
      if (saved && themePresets[saved]) {
        return saved;
      }
    } catch {
      // Ignore
    }
    return 'dark';
  };

  const getInitialPrimaryColor = (): string => {
    if (typeof window === 'undefined') return '#526FFF';
    try {
      const saved = localStorage.getItem('theme-primary-color');
      if (saved && /^#[0-9A-Fa-f]{6}$/.test(saved)) {
        return saved;
      }
    } catch {
      // Ignore
    }
    return '#526FFF';
  };

  const getInitialCustomFont = (): string => {
    if (typeof window === 'undefined') return '';
    try {
      return localStorage.getItem('theme-custom-font') || '';
    } catch {
      return '';
    }
  };

  const [theme, setThemeState] = useState<ThemePreset>(getInitialTheme);
  const [primaryColor, setPrimaryColorState] = useState(getInitialPrimaryColor);
  const [customFont, setCustomFontState] = useState(getInitialCustomFont);

  const themeConfig = React.useMemo(() => {
    const config = { ...themePresets[theme] };
    if (theme === 'custom' || primaryColor !== themePresets[theme].primaryColor) {
      config.primaryColor = primaryColor;
      config.mint = primaryColor;
    }
    return config;
  }, [theme, primaryColor]);

  // Apply theme to document
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    const body = document.body;
    const html = document.documentElement;

    // Apply CSS variables for base colors
    root.style.setProperty('--theme-primary', themeConfig.primaryColor);
    root.style.setProperty('--theme-mint', themeConfig.mint);
    root.style.setProperty('--theme-bg', themeConfig.contentBg);
    root.style.setProperty('--theme-surface', themeConfig.surface);
    root.style.setProperty('--theme-surface2', themeConfig.surface2);
    root.style.setProperty('--theme-border', themeConfig.border);
    root.style.setProperty('--theme-text', themeConfig.text);
    root.style.setProperty('--theme-muted', themeConfig.muted);

    // Apply color overrides as CSS variables
    if (themeConfig.colorOverrides) {
      const overrides = themeConfig.colorOverrides;
      Object.entries(overrides).forEach(([key, value]) => {
        if (value) {
          root.style.setProperty(`--theme-${key}`, value);
        }
      });
    }

    // Apply chart background color
    if (themeConfig.chartBackgroundColor) {
      root.style.setProperty('--theme-chart-bg', themeConfig.chartBackgroundColor);
    }

    // Determine background style
    let backgroundStyle = themeConfig.contentBg;
    if (themeConfig.backgroundType === 'gradient' && themeConfig.gradientStartColor && themeConfig.gradientEndColor) {
      backgroundStyle = `linear-gradient(180deg, ${themeConfig.gradientStartColor} 0%, ${themeConfig.gradientEndColor} 100%)`;
    }

    // Apply background to html and body with !important override
    html.style.setProperty('background', backgroundStyle, 'important');
    html.style.setProperty('background-color', themeConfig.contentBg, 'important');
    body.style.setProperty('background', backgroundStyle, 'important');
    body.style.setProperty('background-color', themeConfig.contentBg, 'important');
    body.style.setProperty('color', themeConfig.text, 'important');

    // Apply to #__next
    const nextElement = document.getElementById('__next');
    if (nextElement) {
      nextElement.style.setProperty('background', backgroundStyle, 'important');
      nextElement.style.setProperty('background-color', themeConfig.contentBg, 'important');
    }

    // Inject a style tag to override hardcoded styles in _app.tsx and globals.css
    let styleTag = document.getElementById('theme-override-styles');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'theme-override-styles';
      document.head.appendChild(styleTag);
    }
    
    const bgStyle = themeConfig.backgroundType === 'gradient' && themeConfig.gradientStartColor && themeConfig.gradientEndColor
      ? `linear-gradient(180deg, ${themeConfig.gradientStartColor} 0%, ${themeConfig.gradientEndColor} 100%)`
      : themeConfig.contentBg;
    
    styleTag.textContent = `
      html, body {
        background: ${bgStyle} !important;
        background-color: ${themeConfig.contentBg} !important;
        color: ${themeConfig.text} !important;
      }
      #__next {
        background: ${bgStyle} !important;
        background-color: ${themeConfig.contentBg} !important;
      }
    `;
  }, [themeConfig]);

  // Apply custom font
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Remove existing font link if any
    const existingLink = document.getElementById('custom-font-link');
    if (existingLink) {
      existingLink.remove();
    }

    // Only add font link if custom font is provided
    if (customFont) {
      const link = document.createElement('link');
      link.id = 'custom-font-link';
      link.rel = 'stylesheet';
      link.href = customFont;
      document.head.appendChild(link);
    }
  }, [customFont]);

  // Save to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme-preset', theme);
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme-primary-color', primaryColor);
    }
  }, [primaryColor]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme-custom-font', customFont);
    }
  }, [customFont]);

  const setTheme = (newTheme: ThemePreset) => {
    setThemeState(newTheme);
    if (newTheme !== 'custom') {
      setPrimaryColorState(themePresets[newTheme].primaryColor);
    }
  };

  const setPrimaryColor = (color: string) => {
    if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
      setPrimaryColorState(color);
    }
  };

  const setCustomFont = (font: string) => {
    setCustomFontState(font);
  };

  const resetToDefault = () => {
    setThemeState('dark');
    setPrimaryColorState('#526FFF');
    setCustomFontState('');
    // Clear localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('theme-preset');
      localStorage.removeItem('theme-primary-color');
      localStorage.removeItem('theme-custom-font');
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        primaryColor,
        customFont,
        themeConfig,
        setTheme,
        setPrimaryColor,
        setCustomFont,
        resetToDefault,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

