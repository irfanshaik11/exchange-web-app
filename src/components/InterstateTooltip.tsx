import React from 'react';

type InterstateTooltipProps = {
  label: string | React.ReactNode;
  children: React.ReactNode;
  widthClass?: string; // e.g. 'max-w-xs', 'max-w-md'
  xOffset?: string; // e.g., '-translate-x-1/2', 'ml-0', '-ml-8'
  width?: number; // New: direct width in pixels
  height?: number; // New: direct height in pixels
  isDiv?: boolean
  className?: string
};

const InterstateTooltip: React.FC<InterstateTooltipProps> = ({ label, children, widthClass = 'max-w-md', xOffset = '-translate-x-1/2', width, height, className }) => {
  const [show, setShow] = React.useState(false);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });
  const triggerRef = React.useRef<HTMLSpanElement>(null);

  const tooltipStyle = {
    ...(width && { width: `${width}px` }),
    ...(height && { height: `${height}px` }),
    top: `${position.top}px`,
    left: `${position.left}px`,
  };

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
      });
    }
  };

  const handleMouseEnter = () => {
    updatePosition();
    setShow(true);
  };

  return (
    <span
      ref={triggerRef}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShow(false)}
      onFocus={handleMouseEnter}
      onBlur={() => setShow(false)}
      tabIndex={0}
    >
      {children}
      {show && (
        <span
          className={`fixed z-[999999] rounded-lg bg-neutral-900/90 border border-emerald-700 shadow-2xl shadow-emerald-500/20 px-3 py-2 text-xs whitespace-pre-line text-white ${widthClass} ${className}`}
          style={tooltipStyle}
        >
          {typeof label === 'string' ? label : label}
        </span>
      )}
    </span>
  );
};

export default InterstateTooltip; 