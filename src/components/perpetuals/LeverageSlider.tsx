// src/components/perpetuals/LeverageSlider.tsx
// Range slider for leverage selection with preset buttons and risk indicator.

import React, { useCallback } from "react";

interface LeverageSliderProps {
  value: number;
  maxLeverage: number;
  onChange: (leverage: number) => void;
}

const PRESETS = [1, 2, 5, 10, 20, 50];

function getRiskColor(leverage: number, max: number): string {
  const ratio = leverage / max;
  if (ratio <= 0.2) return "#18c48c";  // Green (low risk)
  if (ratio <= 0.5) return "#E0D070";  // Yellow (medium)
  if (ratio <= 0.75) return "#E09050"; // Orange (high)
  return "#ef4444";                     // Red (very high)
}

export default function LeverageSlider({ value, maxLeverage, onChange }: LeverageSliderProps) {
  const handleSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(parseInt(e.target.value));
    },
    [onChange]
  );

  const availablePresets = PRESETS.filter((p) => p <= maxLeverage);
  const riskColor = getRiskColor(value, maxLeverage);

  return (
    <div className="space-y-2">
      {/* Label + value */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[#a1a1aa]">Leverage</span>
        <span
          className="text-[11px] font-semibold"
          style={{ color: riskColor }}
        >
          {value}x
        </span>
      </div>

      {/* Slider */}
      <div className="relative">
        <input
          type="range"
          min={1}
          max={maxLeverage}
          value={value}
          onChange={handleSlider}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${riskColor} 0%, ${riskColor} ${((value - 1) / (maxLeverage - 1)) * 100}%, #1f2127 ${((value - 1) / (maxLeverage - 1)) * 100}%, #1f2127 100%)`,
          }}
        />
      </div>

      {/* Preset buttons */}
      <div className="flex gap-1.5">
        {availablePresets.map((preset) => (
          <button
            key={preset}
            onClick={() => onChange(preset)}
            className={`flex-1 text-[11px] py-1 rounded transition-colors ${
              value === preset
                ? "bg-[#18c48c] text-black font-semibold"
                : "bg-[#141619] text-[#a1a1aa] hover:bg-[#1f2127]"
            }`}
          >
            {preset}x
          </button>
        ))}
      </div>
    </div>
  );
}
