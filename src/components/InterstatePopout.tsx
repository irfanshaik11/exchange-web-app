import React, { useEffect, useRef, useState } from "react";

interface InterstatePopoutProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  align?: "center" | "top-right";
  className?: string;
  overlayClassName?: string;
  disableClickOutside?: boolean;
  zIndex?: number;
}

export default function InterstatePopout({
  open,
  onClose,
  children,
  align = "center",
  className = "",
  overlayClassName = "",
  disableClickOutside = false,
  zIndex = 50,
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
      if (
        contentRef.current &&
        !contentRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, disableClickOutside, onClose]);

  if (!render) return null;

  // Overlay classes for centering and background with blur + fade
  // Only allow pointer events when actually visible to prevent any blocking
  const overlayBase = `fixed inset-0 transition-opacity duration-200 ${
    isVisible
      ? "opacity-100 pointer-events-auto"
      : "opacity-0 pointer-events-none"
  }`;
  const overlayCenter =
    "flex items-center justify-center bg-black/40 backdrop-blur-sm";
  const overlayTopRight =
    "flex items-start justify-end bg-black/40 backdrop-blur-sm";

  // Double-check: if not visible, ensure pointer-events are disabled via inline style too
  return (
    <div
      className={`${overlayBase} ${align === "center" ? overlayCenter : overlayTopRight} ${isVisible ? "visible" : ""} ${isVisible ? "pointer-events-auto" : "pointer-events-none"} ${overlayClassName}`}
      style={{ zIndex }}
    >
      <div
        ref={contentRef}
        className={`${isVisible ? "scale-100 opacity-100" : "scale-95 opacity-0"} transition-all duration-200 ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
