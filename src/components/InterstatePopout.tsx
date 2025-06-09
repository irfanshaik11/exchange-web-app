import React, { useEffect, useRef, useState } from 'react';

interface InterstatePopoutProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  align?: 'center' | 'top-right';
  className?: string;
  overlayClassName?: string;
  disableClickOutside?: boolean;
}

export default function InterstatePopout({
  open,
  onClose,
  children,
  align = 'center',
  className = '',
  overlayClassName = '',
  disableClickOutside = false,
}: InterstatePopoutProps) {
  const [render, setRender] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setRender(true);
      requestAnimationFrame(() => setIsVisible(true)); // Wait a tick to allow transition
    } else {
      setIsVisible(false);
      const timeout = setTimeout(() => setRender(false), 200); // Matches CSS duration
      return () => clearTimeout(timeout);
    }
  }, [open]);

  useEffect(() => {
    if (!open || disableClickOutside) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (contentRef.current && !contentRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, disableClickOutside, onClose]);

  if (!render) return null;

  return (
    <div
      className={`interstate-overlay ${isVisible ? 'visible' : ''} ${overlayClassName} ${
        align === 'top-right' ? 'align-top-right' : 'align-center'
      }`}
    >
      <div
        ref={contentRef}
        className={`interstate-content ${isVisible ? 'visible' : ''} ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
