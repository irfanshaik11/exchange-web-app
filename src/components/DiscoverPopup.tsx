"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes } from 'react-icons/fa';
import DiscoverPopoutContent from './DiscoverPopoutContent';

interface DiscoverPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

const DiscoverPopup: React.FC<DiscoverPopupProps> = ({ isOpen, onClose }) => {
  // Load position and size from localStorage
  const getInitialPosition = (): { x: number; y: number } => {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    try {
      const saved = localStorage.getItem('discover-popup-position');
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
    if (typeof window === 'undefined') return { width: 1000, height: 700 };
    try {
      const saved = localStorage.getItem('discover-popup-size');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { width: parsed.width || 1000, height: parsed.height || 700 };
      }
    } catch {
      // Ignore parse errors
    }
    return { width: 1000, height: 700 };
  };

  const [position, setPosition] = useState(getInitialPosition);
  const [size, setSize] = useState(getInitialSize);
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
      const saved = localStorage.getItem('discover-popup-position');
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
      localStorage.setItem('discover-popup-position', JSON.stringify(position));
    }
  }, [position, isOpen]);

  useEffect(() => {
    if (typeof window !== 'undefined' && isOpen) {
      localStorage.setItem('discover-popup-size', JSON.stringify(size));
    }
  }, [size, isOpen]);

  // Handle drag functionality - optimized for performance
  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (isResizingRef.current) {
      // Handle resize
      if (!modalRef.current) return;
      
      const deltaX = e.clientX - resizeStartRef.current.x;
      const deltaY = e.clientY - resizeStartRef.current.y;
      
      const newWidth = Math.max(600, Math.min(1400, resizeStartRef.current.width + deltaX));
      const newHeight = Math.max(400, Math.min(window.innerHeight - 40, resizeStartRef.current.height + deltaY));
      
      // Direct DOM update for smooth resizing
      modalRef.current.style.width = `${newWidth}px`;
      modalRef.current.style.height = `${newHeight}px`;
      
      sizeRef.current = { width: newWidth, height: newHeight };
    } else if (isDraggingRef.current && e.pointerId === activePointerIdRef.current) {
      // Handle drag - direct DOM update for performance
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

      // Commit position to state
      setPosition(positionRef.current);
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

  // Handle drag start
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    
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
      if (target.closest('button, input')) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      isDraggingRef.current = true;
      activePointerIdRef.current = e.pointerId;
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX - positionRef.current.x,
        y: e.clientY - positionRef.current.y,
      };

      if (headerRef.current) {
        try {
          headerRef.current.setPointerCapture(e.pointerId);
        } catch {
          // Ignore if pointer capture not supported
        }
      }
    }
  }, []);

  if (!isOpen || typeof window === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      <div
        ref={modalRef}
        className="fixed border border-[#2A2B33] rounded-lg shadow-2xl pointer-events-auto"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${size.width}px`,
          height: `${size.height}px`,
          maxWidth: '95vw',
          maxHeight: '95vh',
          minWidth: '600px',
          minHeight: '400px',
          backgroundColor: '#050608',
          opacity: (isDragging || isResizing) ? 0.85 : 1,
          cursor: isDragging ? 'grabbing' : 'default',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          transition: (isDragging || isResizing) ? 'none' : 'opacity 0.15s',
        }}
      >
        {/* Header - Draggable with ::: handle */}
        <div
          ref={headerRef}
          className="flex items-center justify-between px-4 py-3 border-b border-[#2A2B33] select-none flex-shrink-0"
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
            <span className="text-sm font-semibold text-white ml-2">Discover</span>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1 text-[#9CA3AF] hover:text-white"
          >
            <FaTimes className="w-4 h-4" />
          </button>
        </div>

        {/* Content - Discover Page */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <DiscoverPopoutContent />
        </div>

        {/* Resize Handle - Bottom Right Corner */}
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
      </div>
    </div>,
    document.body
  );
};

export default DiscoverPopup;

