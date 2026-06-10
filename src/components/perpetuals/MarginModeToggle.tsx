// src/components/perpetuals/MarginModeToggle.tsx
// Cross / Isolated margin mode toggle.

import React from "react";

interface MarginModeToggleProps {
  isCross: boolean;
  onChange: (isCross: boolean) => void;
}

export default function MarginModeToggle({ isCross, onChange }: MarginModeToggleProps) {
  return (
    <div className="flex rounded-full overflow-hidden border border-[#1f2127]">
      <button
        className={`flex-1 text-[11px] font-semibold py-1.5 px-3 transition-colors ${
          isCross
            ? "bg-[#141619] text-[#f4f4f5]"
            : "bg-transparent text-[#a1a1aa]"
        }`}
        onClick={() => onChange(true)}
      >
        Cross
      </button>
      <button
        className={`flex-1 text-[11px] font-semibold py-1.5 px-3 transition-colors ${
          !isCross
            ? "bg-[#141619] text-[#f4f4f5]"
            : "bg-transparent text-[#a1a1aa]"
        }`}
        onClick={() => onChange(false)}
      >
        Isolated
      </button>
    </div>
  );
}
