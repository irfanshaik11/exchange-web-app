"use client";

import React, { createContext, useContext, useCallback, useState, useMemo, useEffect } from "react";

export const DOCKED_PANEL_WIDTH = 400;

/** Gap between docked panels so the resize handle is visible and not covered. */
export const DOCKED_PANEL_GAP = 10;

/** Breakpoint below which main content uses mobile layout (e.g. when docked panels shrink the area) */
export const CONTENT_NARROW_BREAKPOINT = 1024;

/** Base z-index for docked panels; leftmost/rightmost gets higher so its resize handle shows above the next panel. */
const DOCKED_PANEL_Z_BASE = 10000;

type PanelSlot = { id: string; width: number };

interface PanelState {
  left: PanelSlot[];
  right: PanelSlot[];
}

interface DockedPanelContextValue {
  dockedLeftWidth: number;
  dockedRightWidth: number;
  /** Effective width of the main content area (viewport minus docked panels). 0 when SSR. */
  contentWidth: number;
  /** True when content area is narrow and should use mobile layout */
  isContentNarrow: boolean;
  setDockContrib: (id: string, left: number, right: number) => void;
  getDockedOffset: (id: string, side: "left" | "right") => number;
  /** Z-index for this docked panel so the resize handle in the gap is not covered by the adjacent panel. */
  getDockedZIndex: (id: string, side: "left" | "right") => number;
}

const DockedPanelContext = createContext<DockedPanelContextValue | null>(null);

function totalWidth(panels: PanelSlot[]): number {
  if (panels.length === 0) return 0;
  const sum = panels.reduce((s, p) => s + p.width, 0);
  return sum + (panels.length - 1) * DOCKED_PANEL_GAP;
}

function offsetForId(panels: PanelSlot[], id: string): number {
  let offset = 0;
  for (const p of panels) {
    if (p.id === id) return offset;
    offset += p.width + DOCKED_PANEL_GAP;
  }
  return 0;
}

function indexOfId(panels: PanelSlot[], id: string): number {
  return panels.findIndex((p) => p.id === id);
}

function updateSide(prev: PanelSlot[], id: string, width: number): PanelSlot[] {
  if (width === 0) return prev.filter((p) => p.id !== id);
  const idx = prev.findIndex((p) => p.id === id);
  if (idx >= 0) {
    const next = [...prev];
    next[idx] = { id, width };
    return next;
  }
  return [...prev, { id, width }];
}

export function DockedPanelProvider({ children }: { children: React.ReactNode }) {
  const [panels, setPanels] = useState<PanelState>({ left: [], right: [] });
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 0
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const setDockContrib = useCallback((id: string, left: number, right: number) => {
    setPanels((prev) => ({
      left: updateSide(prev.left, id, left),
      right: updateSide(prev.right, id, right),
    }));
  }, []);

  const getDockedOffset = useCallback(
    (id: string, side: "left" | "right") => {
      const list = side === "left" ? panels.left : panels.right;
      return offsetForId(list, id);
    },
    [panels]
  );

  const getDockedZIndex = useCallback(
    (id: string, side: "left" | "right") => {
      const list = side === "left" ? panels.left : panels.right;
      const idx = indexOfId(list, id);
      if (idx < 0) return DOCKED_PANEL_Z_BASE;
      return DOCKED_PANEL_Z_BASE + (list.length - 1 - idx);
    },
    [panels]
  );

  const dockedLeftWidth = useMemo(() => totalWidth(panels.left), [panels.left]);
  const dockedRightWidth = useMemo(() => totalWidth(panels.right), [panels.right]);
  const contentWidth = useMemo(
    () => Math.max(0, windowWidth - dockedLeftWidth - dockedRightWidth),
    [windowWidth, dockedLeftWidth, dockedRightWidth]
  );
  const isContentNarrow = contentWidth > 0 && contentWidth < CONTENT_NARROW_BREAKPOINT;

  const value = useMemo(
    () => ({
      dockedLeftWidth,
      dockedRightWidth,
      contentWidth,
      isContentNarrow,
      setDockContrib,
      getDockedOffset,
      getDockedZIndex,
    }),
    [dockedLeftWidth, dockedRightWidth, contentWidth, isContentNarrow, setDockContrib, getDockedOffset, getDockedZIndex]
  );

  return (
    <DockedPanelContext.Provider value={value}>
      {children}
    </DockedPanelContext.Provider>
  );
}

export function useDockedPanel() {
  const ctx = useContext(DockedPanelContext);
  if (!ctx) return null;
  return ctx;
}

/**
 * Wrapper that applies left/right margin so main content collapses when panels are docked.
 * Adds class "content-narrow" when the content area is below CONTENT_NARROW_BREAKPOINT
 * so pages can show mobile layout (e.g. single column, tabbed tables).
 */
export function DockedPanelMarginWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = useDockedPanel();
  const marginLeft = ctx?.dockedLeftWidth ?? 0;
  const marginRight = ctx?.dockedRightWidth ?? 0;
  const narrow = ctx?.isContentNarrow ?? false;
  return (
    <div
      className={`h-full${narrow ? " content-narrow" : ""}`}
      style={{
        marginLeft: marginLeft ? `${marginLeft}px` : undefined,
        marginRight: marginRight ? `${marginRight}px` : undefined,
        transition: "margin 0.2s ease-out",
      }}
    >
      {children}
    </div>
  );
}
