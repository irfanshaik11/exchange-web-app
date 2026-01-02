import type React from "react";
import { useState } from "react";

const BottomCardHolderInfo: React.FC<{ 
  PassedIcon: any; 
  value: string | number; 
  green?: boolean;
  tooltip?: string;
  count?: number;
  iconColor?: string; // Custom color for the icon
}> = ({
  PassedIcon,
  value,
  green = true,
  tooltip,
  count,
  iconColor
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  // Determine the color to use
  const color = iconColor || (green ? "#31e3ac" : "#f26681");

  return (
    <div 
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className="number-font flex cursor-help items-center gap-1 rounded border px-2 py-1 text-xs transition-all duration-200"
        style={{
          color: color,
          fontSize: "13px",
          fontWeight: "500",
          borderColor: "#27282e",
          backgroundColor: "transparent",
        }}
      >
        <PassedIcon size={16} />
        <span className="number-font">{value}%</span>
      </span>
      {showTooltip && (tooltip || count !== undefined) && (
        <div
          className="absolute top-full left-1/2 mt-2 -translate-x-1/2 transform rounded-lg px-4 py-3 text-xs font-medium whitespace-nowrap"
          style={{
            backgroundColor: "#16171C",
            color: "#f0f5f5",
            border: "1px solid #24252C",
            minWidth: "240px",
            zIndex: 4000,
          }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div className="mb-2">
            <div
              className="mb-1 text-sm font-semibold"
              style={{ color: color }}
            >
              {tooltip}:{" "}
              {value}%
            </div>
          </div>
          {count !== undefined && (
            <div className="text-xs" style={{ color: "#9CA3AF" }}>
              Count: {count}
            </div>
          )}
          {/* Tooltip arrow */}
          <div
            className="absolute bottom-full left-1/2 h-0 w-0 -translate-x-1/2 transform border-r-4 border-b-4 border-l-4 border-transparent"
            style={{ borderBottomColor: "#16171C" }}
          />
        </div>
      )}
    </div>
  );
};

export default BottomCardHolderInfo;
