"use client";

import React from "react";
import { DOCKED_PANEL_GAP } from "../contexts/DockedPanelContext";

/**
 * Exact same as trackers page (Wallet / Telegram divider):
 * - Container: w-1 (4px), min-h-[530px], h-full, hover:bg-[#7FFFC9]/5
 * - Pill: h-16 w-1 rounded-full bg-neutral-400, group-hover:bg-[#7FFFC9]
 */
export const DOCKED_RESIZE_PILL_CLASS =
  "absolute h-16 w-1 rounded-full bg-neutral-400 transition-colors pointer-events-none";

/** Matches trackers page resize handle container. z-30 in popups so it stays above scrollbars. */
export const DOCKED_RESIZE_CONTAINER_CLASS =
  "group relative z-30 flex h-full min-h-0 w-1 cursor-ew-resize items-center justify-center transition-colors";

/** Shared width indicator badge class (popups only; trackers has no badge). */
export const DOCKED_RESIZE_INDICATOR_BADGE_CLASS =
  "absolute rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-neutral-300 border border-white/10 pointer-events-none whitespace-nowrap";

type DockSide = "left" | "right";

export interface DockedPanelResizeHandleProps {
  handleRef: React.RefObject<HTMLDivElement | null>;
  dockSide: DockSide;
  dockedWidth: number;
  showWidthIndicator: boolean;
  isResizingDocked: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function DockedPanelResizeHandle({
  handleRef,
  dockSide,
  dockedWidth,
  showWidthIndicator,
  isResizingDocked,
  onPointerDown,
  onMouseEnter,
  onMouseLeave,
}: DockedPanelResizeHandleProps) {
  const gapPx = DOCKED_PANEL_GAP;
  return (
    <div
      ref={handleRef}
      className={`${DOCKED_RESIZE_CONTAINER_CLASS}`}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        ...(dockSide === "left"
          ? { right: -gapPx, width: gapPx }
          : { left: -gapPx, width: gapPx }),
      }}
      onPointerDown={onPointerDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title="Drag to resize panel"
    >
      {(showWidthIndicator || isResizingDocked) && (
        <div
          className={DOCKED_RESIZE_INDICATOR_BADGE_CLASS}
          style={{
            ...(dockSide === "left"
              ? { right: "100%", marginRight: 4 }
              : { left: "100%", marginLeft: 4 }),
            top: "50%",
            transform: "translateY(-50%)",
          }}
        >
          {dockedWidth}px
        </div>
      )}
      {/* Same pill as trackers: no extra centering (trackers uses default position) */}
      <div className={DOCKED_RESIZE_PILL_CLASS} />
    </div>
  );
}
