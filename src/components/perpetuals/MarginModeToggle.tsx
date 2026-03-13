// src/components/perpetuals/MarginModeToggle.tsx
// Cross / Isolated margin mode toggle.

import React from "react";

interface MarginModeToggleProps {
  isCross: boolean;
  onChange: (isCross: boolean) => void;
}

export default function MarginModeToggle({ isCross, onChange }: MarginModeToggleProps) {
  return (
    <div className="flex rounded-full overflow-hidden border border-[#2A2B33]">
      <button
        className={`flex-1 text-[11px] font-semibold py-1.5 px-3 transition-colors ${
          isCross
            ? "bg-[#1E1F26] text-[#f0f5f5]"
            : "bg-transparent text-[#9CA3AF]"
        }`}
        onClick={() => onChange(true)}
      >
        Cross
      </button>
      <button
        className={`flex-1 text-[11px] font-semibold py-1.5 px-3 transition-colors ${
          !isCross
            ? "bg-[#1E1F26] text-[#f0f5f5]"
            : "bg-transparent text-[#9CA3AF]"
        }`}
        onClick={() => onChange(false)}
      >
        Isolated
      </button>
    </div>
  );
}
