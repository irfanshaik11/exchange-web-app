import React, { useRef } from "react";
import { createPortal } from "react-dom";

/** Maps AMM/protocol id to display name for tooltips */
function formatAmmDisplayName(ammType: string): string {
  const raw = ammType?.toLowerCase() || "";
  if (raw.includes("pump"))
    return raw.includes("pump_amm") ||
      raw.includes("pumpamm") ||
      raw.includes("pumpswap")
      ? "Pump AMM"
      : "Pump";
  if (raw.includes("nad.fun") || raw === "nadfun") return "nad.fun";
  if (raw.includes("flap.sh") || raw === "flapsh") return "flap.sh";
  if (raw.includes("kuru")) return "Kuru";
  if (raw.includes("clanker")) return "Clanker";
  if (raw.includes("meteora")) return "Meteora AMM";
  if (raw.includes("raydium")) return "Raydium";
  if (raw.includes("boop")) return "Boop";
  if (
    raw.includes("moonit") ||
    raw.includes("moonshot") ||
    raw.includes("moonshoot")
  )
    return "Moonit";
  if (raw.includes("bonk") || raw.includes("launchlab"))
    return raw.includes("launchlab") ? "LaunchLab" : "Bonk";
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
  isActive = true,
}: ImageBubbleProps) {
  const bubbleSrc = src;
  const tooltipLabel = ammType ? formatAmmDisplayName(ammType) : undefined;
  const ammTipRef = useRef<HTMLDivElement>(null);

  if (!isActive) return null;

  return (
    <>
      <div
        className={`absolute bottom-0 right-0 z-[99999] flex transform items-center justify-center rounded-full border border-green-400 bg-white shadow-lg translate-x-1/2 translate-y-1/2 ${className}`}
        style={{ width: size, height: size }}
        onMouseEnter={(e) => { const tip = ammTipRef.current; if (tip) { const r = e.currentTarget.getBoundingClientRect(); tip.style.left = `${r.left + r.width / 2}px`; tip.style.top = `${r.top - 6}px`; tip.style.transform = "translate(-50%, -100%)"; tip.style.opacity = "1"; } }}
        onMouseLeave={() => { const tip = ammTipRef.current; if (tip) tip.style.opacity = "0"; }}
      >
        <img
          src={bubbleSrc}
          alt={alt}
          className="h-3/4 w-3/4 object-contain pointer-events-none"
        />
      </div>
      {typeof document !== "undefined" &&
        tooltipLabel &&
        createPortal(
          <div
            ref={ammTipRef}
            className="pointer-events-none fixed z-[9999] rounded px-2 py-1 text-[10px] font-medium whitespace-nowrap"
            style={{ backgroundColor: "rgba(31, 41, 55, 0.95)", color: "#e5e7eb", border: "1px solid rgba(107, 114, 128, 0.3)", opacity: 0, transition: "opacity 150ms" }}
          >
            {tooltipLabel}
          </div>,
          document.body
        )}
    </>
  );
}
