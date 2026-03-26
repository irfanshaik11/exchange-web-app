import { useEffect, useRef, useState } from 'react';

interface AnimatedValueProps {
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Skip RAF animation — just display the value directly (for large card grids) */
  instant?: boolean;
}

/**
 * Smooth animated number counter with spring-like interpolation.
 * Numbers morph between values instead of jumping — professional, like financial dashboards.
 */
export default function AnimatedValue({
  value,
  suffix = '',
  prefix = '',
  decimals = 0,
  duration = 400,
  className,
  style,
  instant = false,
}: AnimatedValueProps) {
  const [display, setDisplay] = useState(value);
  const prevValue = useRef(value);
  const rafId = useRef<number>(0);
  const startTime = useRef(0);

  useEffect(() => {
    if (prevValue.current === value) return;

    const from = prevValue.current;
    const to = value;
    prevValue.current = value;

    // Instant mode: skip RAF animation entirely (for large card grids)
    if (instant) {
      setDisplay(to);
      return;
    }

    // Check for reduced motion preference
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(to);
      return;
    }

    cancelAnimationFrame(rafId.current);
    startTime.current = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime.current;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic — fast start, smooth landing
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;

      setDisplay(current);

      if (progress < 1) {
        rafId.current = requestAnimationFrame(animate);
      } else {
        setDisplay(to);
      }
    };

    rafId.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId.current);
  }, [value, duration, instant]);

  return (
    <span
      className={className}
      style={{ fontVariantNumeric: 'tabular-nums', ...style }}
    >
      {prefix}{display.toFixed(decimals)}{suffix}
    </span>
  );
}
