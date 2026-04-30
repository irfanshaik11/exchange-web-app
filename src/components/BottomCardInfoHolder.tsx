import type React from "react";
import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

/* ---- Semantic Risk Color Palette ---- */
const RISK_COLORS = {
  safe: { bg: "#0f2419", text: "#31e3ac", border: "#1a3d2a" },      // Green
  caution: { bg: "#2a2314", text: "#f59e0b", border: "#3d351f" },   // Yellow/Orange
  risky: { bg: "#2a1419", text: "#ef4444", border: "#3d1f24" },     // Red
  neutral: { bg: "transparent", text: "#9CA3AF", border: "#27282e" }, // Default gray
};

/* ---- Risk Threshold Configuration ---- */
// Each metric type has safe and risky thresholds
// Values below safe threshold = green, above risky = red, between = yellow
const RISK_THRESHOLDS: Record<string, { safe: number; risky: number }> = {
  "Dev Holding": { safe: 5, risky: 10 },
  "Sniper Holding": { safe: 3, risky: 8 },
  "Insider Holding": { safe: 10, risky: 20 },
  "Top 10 Holders %": { safe: 40, risky: 60 },
  "Bundler Holdings": { safe: 5, risky: 15 },
};

/**
 * Get risk level based on percentage value and metric type
 */
const getRiskLevel = (percent: number, metricName?: string): "safe" | "caution" | "risky" | "neutral" => {
  if (!metricName || !(metricName in RISK_THRESHOLDS)) return "neutral";

  const thresholds = RISK_THRESHOLDS[metricName];
  if (percent <= thresholds.safe) return "safe";
  if (percent >= thresholds.risky) return "risky";
  return "caution";
};

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

  // Backend always sends percent values in 0-100 format (e.g., 33.59 = 33.59%)
  // No conversion needed regardless of data source (HTTP or WebSocket)
  return num.toFixed(2);
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
  // Enable semantic risk-based colors (uses tooltip name to determine thresholds)
  useRiskColors?: boolean;
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
  useRiskColors = true, // Enable risk colors by default
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

  // Determine risk level and colors
  const riskLevel = useMemo(() => {
    if (!useRiskColors) return "neutral";
    const numValue = typeof displayValue === "string" ? parseFloat(displayValue) : displayValue;
    return getRiskLevel(numValue, tooltip);
  }, [displayValue, tooltip, useRiskColors]);

  const riskColors = RISK_COLORS[riskLevel];

  // Determine the color to use - prioritize explicit iconColor, then risk colors, then legacy green/red
  const color = iconColor || riskColors.text || (green ? "#31e3ac" : "#f26681");
  const bgColor = "#101114";
  const borderColor = useRiskColors && !iconColor ? riskColors.border : "#27282e";

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
      className="relative flex-shrink-0"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className="number-font flex flex-shrink-0 cursor-help items-center justify-center gap-1 rounded border px-2 py-1"
        style={{
          color: color,
          fontSize: "11px",
          fontWeight: "500",
          borderColor: borderColor,
          backgroundColor: bgColor,
          whiteSpace: "nowrap",
          minWidth: "62px",
          height: "24px",
        }}
      >
        <span className="flex h-[13px] w-[13px] items-center justify-center">
          <PassedIcon size={13} />
        </span>
        <span className="number-font">{displayValue}%</span>
      </span>
      {renderTooltip()}
    </div>
  );
};

export default BottomCardHolderInfo;
