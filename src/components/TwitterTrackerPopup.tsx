"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes } from 'react-icons/fa';
import TwitterTrackerContent from './TwitterTrackerContent';
import { useDockedPanel } from '../contexts/DockedPanelContext';
import { DockedPanelResizeHandle } from './DockedPanelResizeHandle';

const DOCK_THRESHOLD = 60;
const DOCKED_WIDTH_DEFAULT = 400;
const MIN_DOCKED_WIDTH = 320;
const MAX_DOCKED_WIDTH = 900;
/** Top offset so docked panel sits below navbar + header (matches app chrome) */
const DOCK_TOP_OFFSET_PX = 80;
const DOCK_BOTTOM_PX = 28;
type DockSide = 'none' | 'left' | 'right';

interface TwitterTrackerPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

const POPUP_ID = 'twitter';

const TwitterTrackerPopup: React.FC<TwitterTrackerPopupProps> = ({ isOpen, onClose }) => {
  const dockCtx = useDockedPanel();

  // Load position and size from localStorage
  const getInitialPosition = (): { x: number; y: number } => {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    try {
      const saved = localStorage.getItem('twitter-popup-position');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { x: parsed.x || 0, y: parsed.y || 0 };
      }
    } catch {
      // Ignore parse errors
    }
    return { x: 0, y: 0 };
  };

  const getInitialSize = (): { width: number; height: number } => {
    if (typeof window === 'undefined') return { width: 600, height: 600 };
    try {
      const saved = localStorage.getItem('twitter-popup-size');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { width: parsed.width || 600, height: parsed.height || 600 };
      }
    } catch {
      // Ignore parse errors
    }
    return { width: 600, height: 600 };
  };

  const getInitialDock = (): DockSide => {
    if (typeof window === 'undefined') return 'none';
    try {
      const saved = localStorage.getItem('twitter-popup-dock');
      if (saved === 'left' || saved === 'right') return saved;
    } catch {
      // Ignore
    }
    return 'none';
  };

  const getInitialDockedWidth = (): number => {
    if (typeof window === 'undefined') return DOCKED_WIDTH_DEFAULT;
    try {
      const saved = localStorage.getItem('twitter-popup-docked-width');
      if (saved != null) {
        const n = parseInt(saved, 10);
        if (!Number.isNaN(n) && n >= MIN_DOCKED_WIDTH && n <= MAX_DOCKED_WIDTH) return n;
      }
    } catch {
      // Ignore
    }
    return DOCKED_WIDTH_DEFAULT;
  };

  const [position, setPosition] = useState(getInitialPosition);
  const [size, setSize] = useState(getInitialSize);
  const [dockSide, setDockSide] = useState<DockSide>(getInitialDock);
  const [dockedWidth, setDockedWidth] = useState(getInitialDockedWidth);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isResizingDocked, setIsResizingDocked] = useState(false);
  const [showResizeIndicator, setShowResizeIndicator] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const dockedResizeHandleRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const dockedResizeStartRef = useRef({ x: 0, width: 0, side: 'left' as DockSide });
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const isResizingDockedRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const positionRef = useRef(position);
  const sizeRef = useRef(size);
  const dockedWidthRef = useRef(dockedWidth);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => {
    dockedWidthRef.current = dockedWidth;
  }, [dockedWidth]);

  // Initialize position in center of screen
  // Initialize position in center of screen only if no saved position exists
  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      const saved = localStorage.getItem('twitter-popup-position');
      if (!saved) {
        // Only center if no saved position
        const centerX = window.innerWidth / 2 - size.width / 2;
        const centerY = window.innerHeight / 2 - size.height / 2;
        setPosition({
          x: Math.max(20, Math.min(centerX, window.innerWidth - size.width - 20)),
          y: Math.max(20, Math.min(centerY, window.innerHeight - size.height - 20)),
        });
      }
    }
  }, [isOpen]);

  // Save position and size to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined' && isOpen) {
      localStorage.setItem('twitter-popup-position', JSON.stringify(position));
    }
  }, [position, isOpen]);

  useEffect(() => {
    if (typeof window !== 'undefined' && isOpen) {
      localStorage.setItem('twitter-popup-size', JSON.stringify(size));
    }
  }, [size, isOpen]);

  useEffect(() => {
    if (typeof window !== 'undefined' && isOpen) {
      localStorage.setItem('twitter-popup-dock', dockSide);
    }
  }, [dockSide, isOpen]);

  useEffect(() => {
    if (typeof window !== 'undefined' && isOpen && dockSide !== 'none') {
      localStorage.setItem('twitter-popup-docked-width', String(dockedWidth));
    }
  }, [dockedWidth, isOpen, dockSide]);

  const setDockContribRef = useRef(dockCtx?.setDockContrib);
  setDockContribRef.current = dockCtx?.setDockContrib;
  useEffect(() => {
    const setDockContrib = setDockContribRef.current;
    if (!setDockContrib) return;
    const w = isOpen && dockSide !== 'none' ? dockedWidth : 0;
    setDockContrib(POPUP_ID, dockSide === 'left' ? w : 0, dockSide === 'right' ? w : 0);
  }, [isOpen, dockSide, dockedWidth]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (isResizingDockedRef.current) {
      const deltaX = e.clientX - dockedResizeStartRef.current.x;
      const startWidth = dockedResizeStartRef.current.width;
      const side = dockedResizeStartRef.current.side;
      const newWidth = side === 'left' ? startWidth + deltaX : startWidth - deltaX;
      const clamped = Math.max(MIN_DOCKED_WIDTH, Math.min(MAX_DOCKED_WIDTH, newWidth));
      // Direct DOM update for smooth resizing — commit to state on pointer-up
      dockedWidthRef.current = clamped;
      if (modalRef.current) modalRef.current.style.width = `${clamped}px`;
      return;
    }
    if (isResizingRef.current) {
      // Handle resize
      if (!modalRef.current) return;

      const deltaX = e.clientX - resizeStartRef.current.x;
      const deltaY = e.clientY - resizeStartRef.current.y;

      const newWidth = Math.max(400, Math.min(1200, resizeStartRef.current.width + deltaX));
      const newHeight = Math.max(300, Math.min(window.innerHeight - 40, resizeStartRef.current.height + deltaY));
      
      // Direct DOM update for smooth resizing
      modalRef.current.style.width = `${newWidth}px`;
      modalRef.current.style.height = `${newHeight}px`;
      
      sizeRef.current = { width: newWidth, height: newHeight };
    } else if (isDraggingRef.current && e.pointerId === activePointerIdRef.current) {
      // Handle drag - direct DOM update for performance (only when not docked)
      if (!modalRef.current) return;
      
      const nextX = e.clientX - dragStartRef.current.x;
      const nextY = e.clientY - dragStartRef.current.y;
      
      // Constrain to viewport
      const maxX = window.innerWidth - sizeRef.current.width;
      const maxY = window.innerHeight - 60;
      
      const constrainedX = Math.max(0, Math.min(nextX, maxX));
      const constrainedY = Math.max(0, Math.min(nextY, maxY));
      
      // Direct DOM update for smooth dragging
      modalRef.current.style.left = `${constrainedX}px`;
      modalRef.current.style.top = `${constrainedY}px`;
      
      positionRef.current = { x: constrainedX, y: constrainedY };
    }
  }, []);

  const handlePointerUp = useCallback((e?: PointerEvent) => {
    if (isResizingDockedRef.current) {
      isResizingDockedRef.current = false;
      setIsResizingDocked(false);
      // Commit final width to state (triggers localStorage persist + context update)
      setDockedWidth(dockedWidthRef.current);
      if (dockedResizeHandleRef.current && e && dockedResizeHandleRef.current.hasPointerCapture(e.pointerId)) {
        dockedResizeHandleRef.current.releasePointerCapture(e.pointerId);
      }
      return;
    }
    if (!isDraggingRef.current && !isResizingRef.current) return;

    if (isResizingRef.current) {
      // Commit resize to state
      setSize(sizeRef.current);
      isResizingRef.current = false;
      setIsResizing(false);
      
      if (resizeHandleRef.current && e && resizeHandleRef.current.hasPointerCapture(e.pointerId)) {
        resizeHandleRef.current.releasePointerCapture(e.pointerId);
      }
    } else if (isDraggingRef.current) {
      if (e && activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
        return;
      }

      const x = positionRef.current.x;
      const w = sizeRef.current.width;
      const winW = typeof window !== 'undefined' ? window.innerWidth : 0;
      // Dock to left if left edge touches/near left side; dock to right if right edge touches/near right side
      if (x <= DOCK_THRESHOLD) {
        setDockSide('left');
        setPosition({ x: 0, y: positionRef.current.y });
      } else if (x + w >= winW - DOCK_THRESHOLD) {
        setDockSide('right');
        setPosition({ x: winW - w, y: positionRef.current.y });
      } else {
        setDockSide('none');
        setPosition(positionRef.current);
      }

      isDraggingRef.current = false;
      setIsDragging(false);
      activePointerIdRef.current = null;

      if (headerRef.current && e && headerRef.current.hasPointerCapture(e.pointerId)) {
        headerRef.current.releasePointerCapture(e.pointerId);
      }
    }
  }, []);

  // Set up global mouse event listeners once
  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerUp, true);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerUp, true);
    };
  }, [handlePointerMove, handlePointerUp]);

  // Manage body styles while dragging/resizing
  useEffect(() => {
    if (isDragging || isResizing || isResizingDocked) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = isResizingDocked ? 'ew-resize' : isResizing ? 'nwse-resize' : 'grabbing';
    } else {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }

    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, isResizing, isResizingDocked]);

  // Handle drag start
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    // Don't treat button clicks (e.g. close) as drag/undock - let the button's onClick fire
    if (target.closest('button, input')) return;

    if (dockSide !== 'none' && dockedResizeHandleRef.current?.contains(target)) {
      e.preventDefault();
      e.stopPropagation();
      isResizingDockedRef.current = true;
      setIsResizingDocked(true);
      dockedResizeStartRef.current = { x: e.clientX, width: dockedWidthRef.current, side: dockSide };
      try {
        dockedResizeHandleRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      return;
    }

    if (dockSide !== 'none') {
      const winW = window.innerWidth;
      const offset = dockCtx ? dockCtx.getDockedOffset(POPUP_ID, dockSide) : 0;
      const w = dockedWidthRef.current;
      const newX = dockSide === 'left' ? offset : winW - offset - w;
      const newY = DOCK_TOP_OFFSET_PX;
      setPosition({ x: newX, y: newY });
      setDockSide('none');
      positionRef.current = { x: newX, y: newY };
    }

    // Check if clicking on resize handle
    if (resizeHandleRef.current?.contains(target)) {
      e.preventDefault();
      e.stopPropagation();

      isResizingRef.current = true;
      setIsResizing(true);
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: sizeRef.current.width,
        height: sizeRef.current.height,
      };

      if (resizeHandleRef.current) {
        try {
          resizeHandleRef.current.setPointerCapture(e.pointerId);
        } catch {
          // Ignore if pointer capture not supported
        }
      }
      return;
    }

    // Check if clicking on header for dragging
    if (headerRef.current?.contains(target)) {
      e.preventDefault();
      e.stopPropagation();

      isDraggingRef.current = true;
      activePointerIdRef.current = e.pointerId;
      setIsDragging(true);
      const pos = positionRef.current;
      dragStartRef.current = {
        x: e.clientX - pos.x,
        y: e.clientY - pos.y,
      };

      if (headerRef.current) {
        try {
          headerRef.current.setPointerCapture(e.pointerId);
        } catch {
          // Ignore if pointer capture not supported
        }
      }
    }
  }, [dockSide, dockCtx]);

  if (!isOpen || typeof window === 'undefined') return null;

  const isDocked = dockSide !== 'none';
  const dockOffset = dockCtx && isDocked ? dockCtx.getDockedOffset(POPUP_ID, dockSide as 'left' | 'right') : 0;
  const dockedZIndex = dockCtx && isDocked ? dockCtx.getDockedZIndex(POPUP_ID, dockSide as 'left' | 'right') : 10000;
  const modalStyle: React.CSSProperties = isDocked
    ? {
        ...(dockSide === 'left' ? { left: dockOffset } : { right: dockOffset }),
        top: DOCK_TOP_OFFSET_PX,
        bottom: `calc(${DOCK_BOTTOM_PX}px + env(safe-area-inset-bottom, 0px))`,
        width: `${dockedWidth}px`,
        maxWidth: 'none',
        maxHeight: 'none',
        minWidth: '320px',
        minHeight: '400px',
        backgroundColor: '#0a0b0d',
        opacity: (isDragging || isResizing || isResizingDocked) ? 0.85 : 1,
        cursor: isDragging ? 'grabbing' : 'default',
        zIndex: dockedZIndex,
        display: 'flex',
        flexDirection: 'column',
        transition: (isDragging || isResizing || isResizingDocked) ? 'none' : 'opacity 0.15s',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: dockSide === 'left' ? '0 12px 12px 0' : '12px 0 0 12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
      }
    : {
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        maxWidth: '90vw',
        maxHeight: '90vh',
        minWidth: '400px',
        minHeight: '300px',
        backgroundColor: '#050608',
        opacity: (isDragging || isResizing || isResizingDocked) ? 0.85 : 1,
        cursor: isDragging ? 'grabbing' : 'default',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        transition: (isDragging || isResizing || isResizingDocked) ? 'none' : 'opacity 0.15s',
        border: '1px solid #2A2B33',
        borderRadius: '8px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      };

  return createPortal(
    <div className="fixed inset-0 z-[99999] pointer-events-none">
      <div
        ref={modalRef}
        className="fixed shadow-2xl pointer-events-auto"
        style={modalStyle}
      >
        <div
          ref={headerRef}
          className={`flex items-center justify-between px-4 py-3 border-b select-none flex-shrink-0 ${isDocked ? 'border-white/[0.06]' : 'border-[#2A2B33]'}`}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          onPointerDown={handlePointerDown}
        >
          <div className="flex items-center gap-2">
            {/* Grid icon drag handle */}
            <div className="w-4 h-4 grid grid-cols-3 gap-0.5">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="w-0.5 h-0.5 bg-[#9CA3AF] rounded" />
              ))}
            </div>
            <span className="text-sm font-semibold text-white ml-2">Twitter Tracker</span>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1 text-[#9CA3AF] hover:text-white"
          >
            <FaTimes className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <TwitterTrackerContent />
        </div>

        {isDocked && (
          <DockedPanelResizeHandle
            handleRef={dockedResizeHandleRef}
            dockSide={dockSide as 'left' | 'right'}
            dockedWidth={dockedWidth}
            showWidthIndicator={showResizeIndicator}
            isResizingDocked={isResizingDocked}
            onPointerDown={handlePointerDown}
            onMouseEnter={() => setShowResizeIndicator(true)}
            onMouseLeave={() => setShowResizeIndicator(false)}
          />
        )}

        {!isDocked && (
        <div
          ref={resizeHandleRef}
          className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-20"
          style={{
            background: 'transparent',
          }}
          onPointerDown={handlePointerDown}
        >
          {/* Visual resize indicator - more visible */}
          <div className="absolute bottom-0 right-0 w-5 h-5 flex items-end justify-end">
            <div className="flex flex-col gap-0.5">
              <div className="flex gap-0.5">
                <div className="w-1 h-1 bg-[#9CA3AF] rounded-sm"></div>
                <div className="w-1 h-1 bg-[#9CA3AF] rounded-sm"></div>
              </div>
              <div className="flex gap-0.5">
                <div className="w-1 h-1 bg-[#9CA3AF] rounded-sm"></div>
                <div className="w-1 h-1 bg-[#9CA3AF] rounded-sm"></div>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default TwitterTrackerPopup;
