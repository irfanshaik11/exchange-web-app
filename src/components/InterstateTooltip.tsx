import React from 'react';

const InterstateTooltip: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
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
        <span className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded bg-neutral-900 px-2 py-1 text-xs whitespace-nowrap text-white shadow-lg">
          {label}
        </span>
      )}
    </span>
  );
};

export default InterstateTooltip; 