"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes } from 'react-icons/fa';
import TelegramTrackerContent from './TelegramTrackerContent';
import { useDockedPanel, DOCKED_PANEL_WIDTH } from '../contexts/DockedPanelContext';

const DOCK_THRESHOLD = 60;
const DOCKED_WIDTH = 400;
/** Top offset so docked panel sits below navbar + header (matches app chrome) */
const DOCK_TOP_OFFSET_PX = 80;
/** Bottom offset so docked panel stops above the fixed footer */
const DOCK_FOOTER_OFFSET_PX = 56;
type DockSide = 'none' | 'left' | 'right';

interface TelegramTrackerPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

const POPUP_ID = 'telegram';

const TelegramTrackerPopup: React.FC<TelegramTrackerPopupProps> = ({ isOpen, onClose }) => {
  const dockCtx = useDockedPanel();

  // Load position and size from localStorage
  const getInitialPosition = (): { x: number; y: number } => {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    try {
      const saved = localStorage.getItem('telegram-popup-position');
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
      const saved = localStorage.getItem('telegram-popup-size');
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
      const saved = localStorage.getItem('telegram-popup-dock');
      if (saved === 'left' || saved === 'right') return saved;
    } catch {
      // Ignore
    }
    return 'none';
  };

  const [position, setPosition] = useState(getInitialPosition);
  const [size, setSize] = useState(getInitialSize);
  const [dockSide, setDockSide] = useState<DockSide>(getInitialDock);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const positionRef = useRef(position);
  const sizeRef = useRef(size);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  // Initialize position in center of screen only if no saved position exists
  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      const saved = localStorage.getItem('telegram-popup-position');
      if (!saved) {
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
      localStorage.setItem('telegram-popup-position', JSON.stringify(position));
    }
  }, [position, isOpen]);

  useEffect(() => {
    if (typeof window !== 'undefined' && isOpen) {
      localStorage.setItem('telegram-popup-size', JSON.stringify(size));
    }
  }, [size, isOpen]);

  useEffect(() => {
    if (typeof window !== 'undefined' && isOpen) {
      localStorage.setItem('telegram-popup-dock', dockSide);
    }
  }, [dockSide, isOpen]);

  // Notify layout so main content collapses when this popup is docked
  useEffect(() => {
    if (!dockCtx) return;
    const w = isOpen && dockSide !== 'none' ? DOCKED_PANEL_WIDTH : 0;
    dockCtx.setDockContrib(POPUP_ID, dockSide === 'left' ? w : 0, dockSide === 'right' ? w : 0);
  }, [isOpen, dockSide, dockCtx]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (isResizingRef.current) {
      if (!modalRef.current) return;
      const deltaX = e.clientX - resizeStartRef.current.x;
      const deltaY = e.clientY - resizeStartRef.current.y;
      const newWidth = Math.max(400, Math.min(1200, resizeStartRef.current.width + deltaX));
      const newHeight = Math.max(300, Math.min(window.innerHeight - 40, resizeStartRef.current.height + deltaY));
      modalRef.current.style.width = `${newWidth}px`;
      modalRef.current.style.height = `${newHeight}px`;
      sizeRef.current = { width: newWidth, height: newHeight };
    } else if (isDraggingRef.current && e.pointerId === activePointerIdRef.current) {
      if (!modalRef.current) return;
      const nextX = e.clientX - dragStartRef.current.x;
      const nextY = e.clientY - dragStartRef.current.y;
      const maxX = window.innerWidth - sizeRef.current.width;
      const maxY = window.innerHeight - 60;
      const constrainedX = Math.max(0, Math.min(nextX, maxX));
      const constrainedY = Math.max(0, Math.min(nextY, maxY));
      modalRef.current.style.left = `${constrainedX}px`;
      modalRef.current.style.top = `${constrainedY}px`;
      positionRef.current = { x: constrainedX, y: constrainedY };
    }
  }, []);

  const handlePointerUp = useCallback((e?: PointerEvent) => {
    if (!isDraggingRef.current && !isResizingRef.current) return;
    if (isResizingRef.current) {
      setSize(sizeRef.current);
      isResizingRef.current = false;
      setIsResizing(false);
      if (resizeHandleRef.current && e && resizeHandleRef.current.hasPointerCapture(e.pointerId)) {
        resizeHandleRef.current.releasePointerCapture(e.pointerId);
      }
    } else if (isDraggingRef.current) {
      if (e && activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
      const x = positionRef.current.x;
      const w = sizeRef.current.width;
      const winW = typeof window !== 'undefined' ? window.innerWidth : 0;
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

  useEffect(() => {
    if (isDragging || isResizing) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = isResizing ? 'nwse-resize' : 'grabbing';
    } else {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, isResizing]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input')) return;
    if (dockSide !== 'none') {
      const winW = window.innerWidth;
      const offset = dockCtx ? dockCtx.getDockedOffset(POPUP_ID, dockSide) : 0;
      const newX = dockSide === 'left' ? offset : winW - offset - DOCKED_WIDTH;
      const newY = DOCK_TOP_OFFSET_PX;
      setPosition({ x: newX, y: newY });
      setDockSide('none');
      positionRef.current = { x: newX, y: newY };
    }
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
          // Ignore
        }
      }
      return;
    }
    if (headerRef.current?.contains(target)) {
      e.preventDefault();
      e.stopPropagation();
      isDraggingRef.current = true;
      activePointerIdRef.current = e.pointerId;
      setIsDragging(true);
      const pos = positionRef.current;
      dragStartRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
      if (headerRef.current) {
        try {
          headerRef.current.setPointerCapture(e.pointerId);
        } catch {
          // Ignore
        }
      }
    }
  }, [dockSide, dockCtx]);

  if (!isOpen || typeof window === 'undefined') return null;

  const isDocked = dockSide !== 'none';
  const dockOffset = dockCtx && isDocked ? dockCtx.getDockedOffset(POPUP_ID, dockSide as 'left' | 'right') : 0;
  const modalStyle: React.CSSProperties = isDocked
    ? {
        ...(dockSide === 'left' ? { left: dockOffset } : { right: dockOffset }),
        top: DOCK_TOP_OFFSET_PX,
        width: `${DOCKED_WIDTH}px`,
        height: `calc(100vh - ${DOCK_TOP_OFFSET_PX}px - ${DOCK_FOOTER_OFFSET_PX}px)`,
        maxWidth: 'none',
        maxHeight: 'none',
        minWidth: '320px',
        minHeight: '300px',
        backgroundColor: '#050608',
        opacity: (isDragging || isResizing) ? 0.85 : 1,
        cursor: isDragging ? 'grabbing' : 'default',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        transition: (isDragging || isResizing) ? 'none' : 'opacity 0.15s',
        borderLeft: dockSide === 'left' ? '1px solid #2A2B33' : 'none',
        borderRight: dockSide === 'right' ? '1px solid #2A2B33' : 'none',
        borderTop: 'none',
        borderBottom: 'none',
        borderRadius: dockSide === 'left' ? '0 8px 8px 0' : '8px 0 0 8px',
        boxShadow: '2px 0 24px rgba(0,0,0,0.4)',
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
        opacity: (isDragging || isResizing) ? 0.85 : 1,
        cursor: isDragging ? 'grabbing' : 'default',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        transition: (isDragging || isResizing) ? 'none' : 'opacity 0.15s',
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
          className="flex items-center justify-between px-4 py-3 border-b border-[#2A2B33] select-none flex-shrink-0"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          onPointerDown={handlePointerDown}
        >
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 grid grid-cols-3 gap-0.5">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="w-0.5 h-0.5 bg-[#9CA3AF] rounded" />
              ))}
            </div>
            <span className="text-sm font-semibold text-white ml-2">Telegram Tracker</span>
          </div>
          <button onClick={onClose} className="p-1 text-[#9CA3AF] hover:text-white">
            <FaTimes className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          <TelegramTrackerContent />
        </div>
        {!isDocked && (
          <div
            ref={resizeHandleRef}
            className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-20"
            style={{ background: 'transparent' }}
            onPointerDown={handlePointerDown}
          >
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

export default TelegramTrackerPopup;
