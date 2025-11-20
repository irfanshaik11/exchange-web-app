"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes, FaUndo } from 'react-icons/fa';
import { useTheme, themePresets, type ThemePreset } from './ThemeContext';

interface ThemeCustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ThemeCustomizationModal: React.FC<ThemeCustomizationModalProps> = ({ isOpen, onClose }) => {
  const { theme, primaryColor, customFont, themeConfig, setTheme, setPrimaryColor, setCustomFont, resetToDefault } = useTheme();
  
  const [localPrimaryColor, setLocalPrimaryColor] = useState(primaryColor);
  const [localCustomFont, setLocalCustomFont] = useState(customFont);
  const [localTheme, setLocalTheme] = useState(theme);

  // Sync local state with context when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalPrimaryColor(primaryColor);
      setLocalCustomFont(customFont);
      setLocalTheme(theme);
    }
  }, [isOpen, primaryColor, customFont, theme]);

  const handleThemeSelect = (themeKey: ThemePreset) => {
    setLocalTheme(themeKey);
    if (themeKey !== 'custom') {
      setLocalPrimaryColor(themePresets[themeKey].primaryColor);
    }
  };

  const handleColorChange = (color: string) => {
    setLocalPrimaryColor(color);
  };

  const handleResetColor = () => {
    const defaultColor = themePresets[localTheme].primaryColor;
    setLocalPrimaryColor(defaultColor);
  };

  const handleDone = () => {
    // Apply all changes when Done is clicked
    setTheme(localTheme);
    setPrimaryColor(localPrimaryColor);
    setCustomFont(localCustomFont);
    onClose();
  };

  const handleResetToDefault = () => {
    // Reset to default "dark" theme with original colors
    setLocalTheme('dark');
    setLocalPrimaryColor('#526FFF');
    setLocalCustomFont('');
    // Apply immediately using context method
    resetToDefault();
  };

  const handleExport = () => {
    const currentConfig = themePresets[localTheme];
    const exportConfig = {
      primaryColor: localPrimaryColor,
      isBrighterTheme: currentConfig.isBrighterTheme || false,
      colorOverrides: currentConfig.colorOverrides || {},
      backgroundType: currentConfig.backgroundType || 'solid',
      chartBackgroundColor: currentConfig.chartBackgroundColor || currentConfig.contentBg,
      fontUrl: localCustomFont,
      ...(currentConfig.backgroundType === 'gradient' && currentConfig.gradientStartColor && currentConfig.gradientEndColor ? {
        gradientStartColor: currentConfig.gradientStartColor,
        gradientEndColor: currentConfig.gradientEndColor,
      } : {}),
    };
    const blob = new Blob([JSON.stringify(exportConfig, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'theme-config.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const config = JSON.parse(event.target?.result as string);
            // Try to match imported config to a preset by comparing primaryColor
            if (config.primaryColor) {
              const matchingPreset = (Object.keys(themePresets) as ThemePreset[]).find(
                (key) => themePresets[key].primaryColor === config.primaryColor || 
                         (themePresets[key].colorOverrides && 
                          Object.keys(themePresets[key].colorOverrides || {}).length > 0 &&
                          JSON.stringify(themePresets[key].colorOverrides) === JSON.stringify(config.colorOverrides))
              );
              if (matchingPreset) {
                setLocalTheme(matchingPreset);
              } else {
                // If no match, use custom theme
                setLocalTheme('custom');
              }
              setLocalPrimaryColor(config.primaryColor);
            }
            if (config.fontUrl) {
              setLocalCustomFont(config.fontUrl);
            } else if (config.customFont) {
              setLocalCustomFont(config.customFont);
            }
          } catch (error) {
            console.error('Failed to import theme:', error);
            alert('Failed to import theme. Please check the file format.');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  if (!isOpen || typeof window === 'undefined') return null;

  const AX = {
    bg: "#101114",
    surface: "#1E1F26",
    surface2: "#17191E",
    border: "#2A2B33",
    text: "#c7c9d1",
    muted: "#c7c9d1",
    mint: "#70E0B0",
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div
        className="rounded-lg border shadow-2xl"
        style={{
          backgroundColor: AX.surface2,
          borderColor: AX.border,
          width: '520px',
          maxWidth: '90vw',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: AX.border }}>
          <h3 className="text-lg font-semibold" style={{ color: AX.text }}>
            Customize Theme
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors"
            style={{ color: AX.muted }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = AX.text;
              e.currentTarget.style.backgroundColor = AX.surface;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = AX.muted;
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <FaTimes size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-6">
          {/* Theme Presets */}
          <div>
            <div className="text-sm font-medium mb-3" style={{ color: AX.text }}>
              Theme Presets
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(Object.keys(themePresets) as ThemePreset[]).map((themeKey) => {
                const theme = themePresets[themeKey];
                const isSelected = localTheme === themeKey;
                return (
                  <button
                    key={themeKey}
                    onClick={() => handleThemeSelect(themeKey)}
                    className="relative flex flex-col items-center p-3 rounded-lg border transition-all"
                    style={{
                      backgroundColor: isSelected ? AX.surface : 'transparent',
                      borderColor: isSelected ? localPrimaryColor : AX.border,
                      borderWidth: isSelected ? '2px' : '1px',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = localPrimaryColor;
                        e.currentTarget.style.backgroundColor = AX.surface;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = AX.border;
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    {/* Preview Window */}
                    <div className="w-full mb-2 rounded overflow-hidden" style={{ aspectRatio: '16/10' }}>
                      <div
                        className="h-2"
                        style={{
                          background: theme.preview.header,
                        }}
                      />
                      <div className="flex h-full">
                        <div
                          className="w-1/3"
                          style={{
                            background: theme.preview.sidebar,
                          }}
                        />
                        <div
                          className="flex-1"
                          style={{
                            background: theme.preview.content,
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-xs font-medium" style={{ color: AX.text }}>
                      {theme.name}
                    </div>
                    {isSelected && (
                      <div
                        className="absolute top-1 right-1 w-2 h-2 rounded-full"
                        style={{ backgroundColor: localPrimaryColor }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Primary Color */}
          <div>
            <div className="text-sm font-medium mb-2" style={{ color: AX.text }}>
              Primary Color
            </div>
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded border flex-shrink-0"
                style={{
                  backgroundColor: localPrimaryColor,
                  borderColor: AX.border,
                }}
              />
              <input
                type="text"
                value={localPrimaryColor}
                onChange={(e) => handleColorChange(e.target.value)}
                className="flex-1 px-3 py-2 rounded border"
                style={{
                  backgroundColor: AX.surface,
                  borderColor: AX.border,
                  color: AX.text,
                }}
                placeholder="#526FFF"
              />
              <button
                onClick={handleResetColor}
                className="p-2 rounded transition-colors"
                style={{ color: AX.muted }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = AX.text;
                  e.currentTarget.style.backgroundColor = AX.surface;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = AX.muted;
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <FaUndo size={14} />
              </button>
            </div>
          </div>

          {/* Custom Font */}
          <div>
            <div className="text-sm font-medium mb-2" style={{ color: AX.text }}>
              Custom Font
            </div>
            <input
              type="text"
              value={localCustomFont}
              onChange={(e) => setLocalCustomFont(e.target.value)}
              className="w-full px-3 py-2 rounded border"
              style={{
                backgroundColor: AX.surface,
                borderColor: AX.border,
                color: AX.text,
              }}
              placeholder="Enter Google Fonts URL or custom font URL"
            />
            <div className="text-xs mt-1.5" style={{ color: AX.muted }}>
              Try Google Fonts: <a href="https://fonts.google.com/" target="_blank" rel="noopener noreferrer" style={{ color: localPrimaryColor }}>https://fonts.google.com/</a>
            </div>
            <button
              className="text-xs mt-1"
              style={{ color: localPrimaryColor }}
              onClick={() => {
                // Show examples - could open a modal or show inline examples
                alert('Font examples:\n- https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap\n- https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap');
              }}
            >
              Show examples
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between" style={{ borderColor: AX.border }}>
          <div className="flex gap-2">
            <button
              onClick={handleResetToDefault}
              className="px-4 py-2 rounded-lg font-medium transition-all text-xs"
              style={{
                backgroundColor: AX.surface,
                color: AX.text,
                border: `1px solid ${AX.border}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = AX.surface;
                e.currentTarget.style.opacity = '0.9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = AX.surface;
                e.currentTarget.style.opacity = '1';
              }}
            >
              Reset to Default
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-2 rounded-lg font-medium transition-all"
              style={{
                backgroundColor: AX.surface,
                color: AX.text,
                border: `1px solid ${AX.border}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = AX.surface;
                e.currentTarget.style.opacity = '0.9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = AX.surface;
                e.currentTarget.style.opacity = '1';
              }}
            >
              Export
            </button>
            <button
              onClick={handleImport}
              className="px-4 py-2 rounded-lg font-medium transition-all"
              style={{
                backgroundColor: AX.surface,
                color: AX.text,
                border: `1px solid ${AX.border}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = AX.surface;
                e.currentTarget.style.opacity = '0.9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = AX.surface;
                e.currentTarget.style.opacity = '1';
              }}
            >
              Import
            </button>
          </div>
          <button
            onClick={handleDone}
            className="px-6 py-2 rounded-lg font-medium transition-all"
            style={{
              backgroundColor: AX.mint,
              color: '#0e2823',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.9';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ThemeCustomizationModal;

