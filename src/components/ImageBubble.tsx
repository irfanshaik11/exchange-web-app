import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

/** Maps AMM/protocol id to display name for tooltips */
function formatAmmDisplayName(ammType: string): string {
  const raw = ammType?.toLowerCase() || "";
  if (raw.includes("pump")) return raw.includes("pump_amm") || raw.includes("pumpamm") || raw.includes("pumpswap") ? "Pump AMM" : "Pump";
  if (raw.includes("meteora")) return "Meteora AMM";
  if (raw.includes("raydium")) return "Raydium";
  if (raw.includes("boop")) return "Boop";
  if (raw.includes("moonit") || raw.includes("moonshot") || raw.includes("moonshoot")) return "Moonit";
  if (raw.includes("bonk") || raw.includes("launchlab")) return raw.includes("launchlab") ? "LaunchLab" : "Bonk";
  if (raw.includes("bags")) return "Bags";
  return ammType || "Protocol";
}

interface ImageBubbleProps {
  src?: string;
  alt?: string;
  size?: number;
  className?: string;
  /** AMM/protocol id (e.g. pump_amm, meteora) — when set, shows tooltip on hover */
  ammType?: string;
  isActive?: boolean;
}

export default function ImageBubble({
  src = "/pump.svg",
  alt = "Pump logo",
  size = 20,
  className = "",
  ammType,
  isActive = true
}: ImageBubbleProps) {
  const bubbleSrc = src;
  const tooltipLabel = ammType ? formatAmmDisplayName(ammType) : undefined;
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const bubbleRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (!tooltipLabel || !bubbleRef.current || typeof document === 'undefined') return;
    const rect = bubbleRef.current.getBoundingClientRect();
    setTooltipStyle({
      left: rect.left + rect.width / 2,
      top: rect.top - 6,
      transform: 'translate(-50%, -100%)',
    });
    setShowTooltip(true);
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
  };

  if (!isActive) return null;

  const bubble = (
    <div
      ref={bubbleRef}
      className={`absolute bottom-0 right-0 bg-white rounded-full border border-green-400 flex items-center justify-center transform translate-x-1/2 translate-y-1/2 z-[99999] shadow-lg ${className}`}
      style={{ width: size, height: size }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <img
        src={bubbleSrc}
        alt={alt}
        className="w-3/4 h-3/4 object-contain pointer-events-none"
      />
    </div>
  );

  const tooltipEl =
    typeof document !== 'undefined' &&
    tooltipLabel &&
    createPortal(
      <div
        className="pointer-events-none fixed z-[999999] rounded px-2 py-1.5 text-[11px] font-medium whitespace-nowrap transition-opacity duration-150"
        style={{
          ...tooltipStyle,
          backgroundColor: 'rgba(23, 25, 30, 0.97)',
          color: '#e5e7eb',
          border: '1px solid rgba(107, 114, 128, 0.4)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          opacity: showTooltip ? 1 : 0,
        }}
      >
        {tooltipLabel}
      </div>,
      document.body
    );

  return (
    <>
      {bubble}
      {tooltipEl}
    </>
  );
}
