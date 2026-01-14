import type React from "react";
import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Calculate percentage value from token data
 * Handles both websocket (decimal 0-1) and HTTP (percentage string) formats
 */
const calculatePercentValue = (
  token: any,
  wsField?: string,
  httpField?: string
): string => {
  if (!token || (!wsField && !httpField)) return "0.00";

  // Get values from both sources
  const wsVal = wsField ? token[wsField] : undefined;
  const httpVal = httpField ? token[httpField] : undefined;

  // Prefer websocket value if available
  const val = wsVal !== undefined ? wsVal : httpVal;

  if (val === undefined || val === null) return "0.00";

  // Parse the value
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "0.00";

  // Websocket values are decimals (0.35 = 35%), HTTP values are already percentages (74.5)
  // If websocket field was used and value is <= 1, it's a decimal that needs conversion
  const isWsFormat = wsVal !== undefined && num <= 1;
  const percent = isWsFormat ? num * 100 : num;

  return percent.toFixed(2);
};

interface BottomCardInfoHolderProps {
  PassedIcon: any;
  value?: string | number;
  green?: boolean;
  tooltip?: string;
  count?: number;
  iconColor?: string;
  // New props for automatic percentage calculation
  token?: any;
  wsField?: string;  // Websocket field name (e.g., 'dev_percent')
  httpField?: string; // HTTP field name (e.g., 'dev_held_percentage')
}

const BottomCardHolderInfo: React.FC<BottomCardInfoHolderProps> = ({
  PassedIcon,
  value,
  green = true,
  tooltip,
  count,
  iconColor,
  token,
  wsField,
  httpField,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  // Calculate the display value
  const displayValue = useMemo(() => {
    // If token and field names are provided, calculate from token data
    if (token && (wsField || httpField)) {
      return calculatePercentValue(token, wsField, httpField);
    }
    // Otherwise use the direct value prop
    return value ?? "0.00";
  }, [token, wsField, httpField, value]);

  // Determine the color to use
  const color = iconColor || (green ? "#31e3ac" : "#f26681");

  // Update tooltip position when shown
  useEffect(() => {
    if (showTooltip && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setTooltipPosition({
        top: rect.bottom + 8, // 8px below the trigger
        left: rect.left + rect.width / 2, // Center horizontally
      });
    }
  }, [showTooltip]);

  // Render tooltip using portal to avoid overflow clipping
  const renderTooltip = () => {
    if (!showTooltip || (!tooltip && count === undefined)) return null;

    return createPortal(
      <div
        className="fixed rounded-lg px-4 py-3 text-xs font-medium whitespace-nowrap pointer-events-none"
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
          transform: "translateX(-50%)",
          backgroundColor: "#16171C",
          color: "#f0f5f5",
          border: "1px solid #24252C",
          minWidth: "180px",
          zIndex: 99999,
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
        }}
      >
        {tooltip && (
          <div className="mb-1">
            <div
              className="text-sm font-semibold"
              style={{ color: color }}
            >
              {tooltip}: {displayValue}%
            </div>
          </div>
        )}
        {count !== undefined && (
          <div className="text-xs" style={{ color: "#9CA3AF" }}>
            Count: {count}
          </div>
        )}
        {/* Tooltip arrow */}
        <div
          className="absolute h-0 w-0"
          style={{
            top: "-6px",
            left: "50%",
            transform: "translateX(-50%)",
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderBottom: "6px solid #16171C",
          }}
        />
      </div>,
      document.body
    );
  };

  return (
    <div
      ref={triggerRef}
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
        <span className="number-font">{displayValue}%</span>
      </span>
      {renderTooltip()}
    </div>
  );
};

export default BottomCardHolderInfo;
