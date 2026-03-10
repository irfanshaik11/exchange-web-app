"use client";

import React, { createContext, useContext, useCallback, useState, useMemo, useEffect } from "react";

export const DOCKED_PANEL_WIDTH = 400;

/** Breakpoint below which main content uses mobile layout (e.g. when docked panels shrink the area) */
export const CONTENT_NARROW_BREAKPOINT = 1024;

type PanelSlot = { id: string; width: number };

interface DockedPanelContextValue {
  dockedLeftWidth: number;
  dockedRightWidth: number;
  /** Effective width of the main content area (viewport minus docked panels). 0 when SSR. */
  contentWidth: number;
  /** True when content area is narrow and should use mobile layout */
  isContentNarrow: boolean;
  setDockContrib: (id: string, left: number, right: number) => void;
  getDockedOffset: (id: string, side: "left" | "right") => number;
}

const DockedPanelContext = createContext<DockedPanelContextValue | null>(null);

function totalWidth(panels: PanelSlot[]): number {
  return panels.reduce((sum, p) => sum + p.width, 0);
}

function offsetForId(panels: PanelSlot[], id: string): number {
  let offset = 0;
  for (const p of panels) {
    if (p.id === id) return offset;
    offset += p.width;
  }
  return 0;
}

export function DockedPanelProvider({ children }: { children: React.ReactNode }) {
  const [leftPanels, setLeftPanels] = useState<PanelSlot[]>([]);
  const [rightPanels, setRightPanels] = useState<PanelSlot[]>([]);
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
    setLeftPanels((prev) => {
      if (left === 0) return prev.filter((p) => p.id !== id);
      const idx = prev.findIndex((p) => p.id === id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { id, width: left };
        return next;
      }
      return [...prev, { id, width: left }];
    });
    setRightPanels((prev) => {
      if (right === 0) return prev.filter((p) => p.id !== id);
      const idx = prev.findIndex((p) => p.id === id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { id, width: right };
        return next;
      }
      return [...prev, { id, width: right }];
    });
  }, []);

  const getDockedOffset = useCallback(
    (id: string, side: "left" | "right") => {
      const panels = side === "left" ? leftPanels : rightPanels;
      return offsetForId(panels, id);
    },
    [leftPanels, rightPanels]
  );

  const dockedLeftWidth = useMemo(() => totalWidth(leftPanels), [leftPanels]);
  const dockedRightWidth = useMemo(() => totalWidth(rightPanels), [rightPanels]);
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
    }),
    [dockedLeftWidth, dockedRightWidth, contentWidth, isContentNarrow, setDockContrib, getDockedOffset]
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
      className={narrow ? "content-narrow" : undefined}
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
