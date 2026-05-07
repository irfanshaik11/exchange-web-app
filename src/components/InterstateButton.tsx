import React from 'react';

export type InterstateButtonVariant = 'primary' | 'secondary' | 'danger' | 'icon' | 'ghost';
export type InterstateButtonSize = 'sm' | 'md' | 'lg';

export interface InterstateButtonProps {
  variant?: InterstateButtonVariant;
  size?: InterstateButtonSize;
  icon?: React.ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
  title?: string;
}

// JTX-style button styling with deep blacks and emerald accents
const base = 'rounded-lg font-medium transition-all duration-200 focus:outline-none flex items-center justify-center cursor-pointer';

const variants = {
  primary: [
    'bg-emerald-500 text-black',
    'hover:bg-emerald-400',
    'shadow-[0_0_20px_rgba(16,185,129,0.25)]',
    'hover:shadow-[0_0_30px_rgba(16,185,129,0.35)]',
  ].join(' '),
  secondary: [
    'bg-white/[0.04] text-zinc-300',
    'border border-white/[0.08]',
    'hover:bg-white/[0.08] hover:border-white/[0.12] hover:text-white',
  ].join(' '),
  danger: [
    'bg-red-500/90 text-white',
    'hover:bg-red-500',
    'shadow-[0_0_20px_rgba(239,68,68,0.2)]',
  ].join(' '),
  icon: [
    'bg-white/[0.03] text-zinc-400',
    'border border-white/[0.06]',
    'hover:bg-white/[0.06] hover:border-white/[0.1] hover:text-zinc-200',
  ].join(' '),
  ghost: [
    'bg-transparent text-zinc-400',
    'hover:bg-white/[0.04] hover:text-zinc-200',
  ].join(' '),
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs h-8',
  md: 'px-4 py-2 text-sm h-10',
  lg: 'px-6 py-2.5 text-base h-12',
};

const disabledStyles = 'opacity-40 cursor-not-allowed pointer-events-none';
const loadingStyles = 'opacity-70 cursor-wait';

export default function InterstateButton({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  fullWidth = false,
  children,
  className = '',
  disabled = false,
  onClick,
  type = 'button',
  title,
}: InterstateButtonProps) {
  return (
    <button
      type={type}
      className={[
        base,
        variants[variant],
        sizes[size],
        fullWidth ? 'w-full' : '',
        disabled ? disabledStyles : '',
        loading ? loadingStyles : '',
        className,
      ].join(' ')}
      disabled={disabled || loading}
      onClick={onClick}
      title={title}
    >
      {icon && <span className={children ? 'mr-2 flex-shrink-0' : ''}>{icon}</span>}
      {loading ? (
        <span className="flex items-center gap-2">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Loading...</span>
        </span>
      ) : children}
    </button>
  );
}
