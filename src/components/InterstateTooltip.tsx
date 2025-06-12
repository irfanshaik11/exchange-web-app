import React from 'react';

type InterstateTooltipProps = {
  label: string | React.ReactNode;
  children: React.ReactNode;
  widthClass?: string; // e.g. 'max-w-xs', 'max-w-md'
};

const InterstateTooltip: React.FC<InterstateTooltipProps> = ({ label, children, widthClass = 'max-w-md' }) => {
  const [show, setShow] = React.useState(false);
  return (
    <span
      className="relative flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      tabIndex={0}
    >
      {children}
      {show && (
        <span className={`absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded bg-neutral-900 px-2 py-1 text-xs whitespace-pre-line text-white shadow-lg ${widthClass}`}>
          {typeof label === 'string' ? label : label}
        </span>
      )}
    </span>
  );
};

export default InterstateTooltip; 