import React from "react";

interface ColorFillBarProps {
  value?: number;
  color?: string; // Optional custom color (e.g., Monad red)
}

export default function ColorFillBar({ value = 50, color }: ColorFillBarProps) {
  // value: 0–100
  const clamped = Math.min(100, Math.max(0, value));

  // Use custom color if provided, otherwise use color interpolation from green → red
  const getColor = (v) => {
    if (color) return color; // Use custom color (e.g., Monad red)
    
    // Default color interpolation from green → red
    const r = Math.floor((v / 100) * 255);
    const g = Math.floor(((100 - v) / 100) * 255);
    return `rgb(${r}, ${g}, 0)`;
  };

  return (
    <div className="relative w-18 h-1 bg-neutral-800 rounded-full overflow-hidden">
      {/* Fill bar */}
      <div
        className="h-full transition-all duration-300"
        style={{ width: `${clamped}%`, background: getColor(clamped) }}
      />

      {/* 33% separator */}
      <div
        className="absolute top-0 h-full w-0.5 bg-neutral-900"
        style={{ left: `33%` }}
      />

      {/* 66% separator */}
      <div
        className="absolute top-0 h-full w-0.5 bg-neutral-900"
        style={{ left: `66%` }}
      />
    </div>
  );
}
