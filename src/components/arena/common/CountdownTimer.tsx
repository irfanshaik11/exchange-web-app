/**
 * CountdownTimer Component
 *
 * Displays a countdown timer that updates every second.
 * Used for leaderboard reset times.
 */

import React, { useState, useEffect } from 'react';

interface CountdownTimerProps {
  targetTime: Date | string;
  onComplete?: () => void;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
  className?: string;
}

interface TimeLeft {
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
}

function calculateTimeLeft(targetTime: Date): TimeLeft {
  const difference = targetTime.getTime() - new Date().getTime();

  if (difference <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 };
  }

  const totalSeconds = Math.floor(difference / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { hours, minutes, seconds, totalSeconds };
}

const sizeStyles = {
  sm: { container: 'gap-1', digit: 'text-sm w-6', label: 'text-[10px]' },
  md: { container: 'gap-2', digit: 'text-lg w-8 font-bold', label: 'text-xs' },
  lg: { container: 'gap-3', digit: 'text-2xl w-12 font-bold', label: 'text-sm' },
};

export default function CountdownTimer({
  targetTime,
  onComplete,
  label,
  size = 'md',
  showLabels = true,
  className = '',
}: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() =>
    calculateTimeLeft(new Date(targetTime))
  );

  useEffect(() => {
    const target = new Date(targetTime);

    const timer = setInterval(() => {
      const newTimeLeft = calculateTimeLeft(target);
      setTimeLeft(newTimeLeft);

      if (newTimeLeft.totalSeconds <= 0) {
        clearInterval(timer);
        onComplete?.();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetTime, onComplete]);

  const styles = sizeStyles[size];
  const pad = (n: number) => n.toString().padStart(2, '0');

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {label && (
        <span className="text-neutral-400 text-xs uppercase tracking-wide mb-1">
          {label}
        </span>
      )}
      <div className={`flex items-center ${styles.container}`}>
        <TimeUnit value={pad(timeLeft.hours)} label="Hours" showLabel={showLabels} styles={styles} />
        <span className={`${styles.digit} text-neutral-500`}>:</span>
        <TimeUnit value={pad(timeLeft.minutes)} label="Min" showLabel={showLabels} styles={styles} />
        <span className={`${styles.digit} text-neutral-500`}>:</span>
        <TimeUnit value={pad(timeLeft.seconds)} label="Sec" showLabel={showLabels} styles={styles} />
      </div>
    </div>
  );
}

function TimeUnit({
  value,
  label,
  showLabel,
  styles,
}: {
  value: string;
  label: string;
  showLabel: boolean;
  styles: typeof sizeStyles['md'];
}) {
  return (
    <div className="flex flex-col items-center">
      <span
        className={`${styles.digit} bg-neutral-800/50 rounded px-1 py-0.5 text-center text-white font-mono`}
      >
        {value}
      </span>
      {showLabel && (
        <span className={`${styles.label} text-neutral-500 mt-0.5`}>{label}</span>
      )}
    </div>
  );
}

/**
 * Inline countdown (simpler format: "07h 52m 47s")
 */
export function InlineCountdown({
  targetTime,
  className = '',
}: {
  targetTime: Date | string;
  className?: string;
}) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() =>
    calculateTimeLeft(new Date(targetTime))
  );

  useEffect(() => {
    const target = new Date(targetTime);
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft(target));
    }, 1000);
    return () => clearInterval(timer);
  }, [targetTime]);

  const pad = (n: number) => n.toString().padStart(2, '0');

  return (
    <span className={`font-mono ${className}`}>
      {pad(timeLeft.hours)}h {pad(timeLeft.minutes)}m {pad(timeLeft.seconds)}s
    </span>
  );
}
