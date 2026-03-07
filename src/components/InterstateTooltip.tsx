import React from 'react';
import ReactDOM from 'react-dom';

type InterstateTooltipProps = {
  label: string | React.ReactNode;
  children: React.ReactNode;
  widthClass?: string; // e.g. 'max-w-xs', 'max-w-md'
  xOffset?: string; // e.g., '-translate-x-1/2', 'ml-0', '-ml-8'
  width?: number; // New: direct width in pixels
  height?: number; // New: direct height in pixels
  isDiv?: boolean
  className?: string
	noPadding?: boolean
	placement?: 'top' | 'right' | 'bottom' | 'left';
};

const InterstateTooltip: React.FC<InterstateTooltipProps> = ({ label, children, widthClass = 'max-w-md', xOffset = '-translate-x-1/2', width, height, className, noPadding, placement='top' }) => {
  const [show, setShow] = React.useState(false);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });
	const triggerRef = React.useRef<HTMLSpanElement>(null);
	
	const isTop = placement === 'top';
  const transformClass = isTop ? '-translate-x-1/2 -translate-y-full' : '-translate-y-1/2';

  const tooltipStyle = {
    ...(width && { width: `${width}px` }),
    ...(height && { height: `${height}px` }),
    top: `${position.top}px`,
    left: `${position.left}px`,
  };

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      if (isTop) {
        setPosition({
          top: rect.top - 8,
          left: rect.left + rect.width / 2,
        });
      } else {
        setPosition({
          top: rect.top + rect.height / 2,
          left: rect.right + 8,
        });
      }
    }
  };

  const handleMouseEnter = () => {
    updatePosition();
    setShow(true);
  };

  const tooltip = show ? (
    <span
      className={`fixed z-[999999] rounded-lg bg-[#17191E] border border-[#2A2B33] shadow-lg shadow-black/30 ${noPadding ? 'p-1' : 'px-3 py-2'} text-xs whitespace-pre-line text-[#9CA3AF] ${transformClass} ${widthClass} ${className}`}
      style={tooltipStyle}
    >
      {typeof label === 'string' ? label : label}
    </span>
  ) : null;

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
      {typeof document !== 'undefined' && tooltip && ReactDOM.createPortal(tooltip, document.body)}
    </span>
  );
};

export default InterstateTooltip;
