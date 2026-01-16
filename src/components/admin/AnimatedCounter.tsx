/**
 * AnimatedCounter - YouTube-style animated number counter
 *
 * Features:
 * - Smooth rolling animation when values change
 * - Pulse glow effect on increment
 * - Celebration particles on milestones
 * - Formats large numbers (1.2K, 1.5M, etc.)
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';

interface AnimatedCounterProps {
  value: number;
  duration?: number; // Animation duration in ms
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  highlightColor?: string;
  showCelebration?: boolean;
  formatLargeNumbers?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

// Easing function for smooth animation
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

// Format large numbers like YouTube (1.2K, 1.5M, etc.)
function formatNumber(num: number, decimals: number = 0, formatLarge: boolean = true): string {
  if (!formatLarge || num < 1000) {
    return num.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return num.toFixed(decimals);
}

// Celebration particles component
const CelebrationParticles: React.FC<{ active: boolean; color: string }> = ({ active, color }) => {
  if (!active) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {[...Array(12)].map((_, i) => (
        <div
          key={i}
          className="absolute w-2 h-2 rounded-full animate-particle"
          style={{
            backgroundColor: color,
            left: '50%',
            top: '50%',
            transform: `rotate(${i * 30}deg) translateY(-20px)`,
            animationDelay: `${i * 50}ms`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
};

const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  duration = 1000,
  prefix = '',
  suffix = '',
  decimals = 0,
  className = '',
  highlightColor = '#22c55e',
  showCelebration = true,
  formatLargeNumbers = true,
  size = 'lg',
}) => {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  const previousValueRef = useRef(value);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Size classes
  const sizeClasses = {
    sm: 'text-xl md:text-2xl',
    md: 'text-2xl md:text-3xl',
    lg: 'text-3xl md:text-4xl lg:text-5xl',
    xl: 'text-4xl md:text-5xl lg:text-6xl',
  };

  const animate = useCallback((timestamp: number) => {
    if (!startTimeRef.current) {
      startTimeRef.current = timestamp;
    }

    const elapsed = timestamp - startTimeRef.current;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutExpo(progress);

    const startValue = previousValueRef.current;
    const currentValue = startValue + (value - startValue) * easedProgress;

    setDisplayValue(currentValue);

    if (progress < 1) {
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      setDisplayValue(value);
      setIsAnimating(false);
      previousValueRef.current = value;
    }
  }, [value, duration]);

  useEffect(() => {
    // Cancel any existing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Only animate if value actually changed
    if (value !== previousValueRef.current) {
      const increased = value > previousValueRef.current;

      setIsAnimating(true);
      startTimeRef.current = null;
      animationFrameRef.current = requestAnimationFrame(animate);

      // Show celebration particles on significant increases
      if (increased && showCelebration) {
        const increase = value - previousValueRef.current;
        const percentIncrease = (increase / previousValueRef.current) * 100;

        // Celebrate on milestones or significant jumps
        if (percentIncrease > 5 || value % 100 === 0 || value % 1000 === 0) {
          setShowParticles(true);
          setTimeout(() => setShowParticles(false), 1000);
        }
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [value, animate, showCelebration]);

  return (
    <div className="relative inline-block">
      <CelebrationParticles active={showParticles} color={highlightColor} />

      <span
        className={`
          font-bold tabular-nums transition-all duration-300
          ${sizeClasses[size]}
          ${className}
          ${isAnimating ? 'scale-105' : 'scale-100'}
        `}
        style={{
          textShadow: isAnimating ? `0 0 20px ${highlightColor}40, 0 0 40px ${highlightColor}20` : 'none',
        }}
      >
        {prefix}
        {formatNumber(displayValue, decimals, formatLargeNumbers)}
        {suffix}
      </span>

      {/* Pulse ring effect on animation */}
      {isAnimating && (
        <span
          className="absolute inset-0 rounded-lg animate-ping opacity-20"
          style={{ backgroundColor: highlightColor }}
        />
      )}
    </div>
  );
};

export default AnimatedCounter;

// Also export a hook for manual counter control
export function useAnimatedValue(initialValue: number, animationDuration: number = 1000) {
  const [displayValue, setDisplayValue] = useState(initialValue);
  const [targetValue, setTargetValue] = useState(initialValue);
  const animationRef = useRef<number | null>(null);
  const startValueRef = useRef(initialValue);
  const startTimeRef = useRef<number | null>(null);

  const animateTo = useCallback((newValue: number) => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    startValueRef.current = displayValue;
    startTimeRef.current = null;
    setTargetValue(newValue);

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / animationDuration, 1);
      const easedProgress = easeOutExpo(progress);

      const currentValue = startValueRef.current + (newValue - startValueRef.current) * easedProgress;
      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [displayValue, animationDuration]);

  return { displayValue, targetValue, animateTo };
}
