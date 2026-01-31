/**
 * ProgressBar Component
 *
 * A reusable progress bar with optional labels and colors.
 * Used for quest progress, rank progression, etc.
 */

import React from 'react';

interface ProgressBarProps {
  progress: number; // 0-100
  showPercentage?: boolean;
  showValues?: boolean;
  current?: number;
  target?: number;
  color?: 'gold' | 'emerald' | 'blue' | 'purple' | 'red';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  animated?: boolean;
}

const colorStyles = {
  gold: 'bg-gradient-to-r from-amber-500 to-yellow-400',
  emerald: 'bg-gradient-to-r from-emerald-500 to-green-400',
  blue: 'bg-gradient-to-r from-blue-500 to-cyan-400',
  purple: 'bg-gradient-to-r from-purple-500 to-pink-400',
  red: 'bg-gradient-to-r from-red-500 to-orange-400',
};

const sizeStyles = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

export default function ProgressBar({
  progress,
  showPercentage = false,
  showValues = false,
  current,
  target,
  color = 'emerald',
  size = 'md',
  className = '',
  animated = false,
}: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className={`w-full ${className}`}>
      {(showPercentage || showValues) && (
        <div className="flex justify-between text-xs text-neutral-400 mb-1">
          {showValues && current !== undefined && target !== undefined ? (
            <>
              <span>{current.toLocaleString()}</span>
              <span>{target.toLocaleString()}</span>
            </>
          ) : showPercentage ? (
            <>
              <span>Progress</span>
              <span>{Math.round(clampedProgress)}%</span>
            </>
          ) : null}
        </div>
      )}
      <div className={`w-full bg-neutral-800 rounded-full overflow-hidden ${sizeStyles[size]}`}>
        <div
          className={`h-full ${colorStyles[color]} rounded-full transition-all duration-500 ${
            animated && clampedProgress < 100 ? 'animate-pulse' : ''
          }`}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Segmented Progress Bar (for rank levels I-IV)
 */
interface SegmentedProgressBarProps {
  currentSegment: number; // 1-4
  progressInSegment: number; // 0-100 within current segment
  totalSegments?: number;
  color?: 'gold' | 'emerald' | 'blue' | 'purple' | 'red';
  className?: string;
}

export function SegmentedProgressBar({
  currentSegment,
  progressInSegment,
  totalSegments = 4,
  color = 'gold',
  className = '',
}: SegmentedProgressBarProps) {
  return (
    <div className={`flex gap-1 ${className}`}>
      {Array.from({ length: totalSegments }).map((_, index) => {
        const segmentNum = index + 1;
        const isFilled = segmentNum < currentSegment;
        const isCurrent = segmentNum === currentSegment;
        const fillWidth = isFilled ? 100 : isCurrent ? progressInSegment : 0;

        return (
          <div
            key={index}
            className="flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden"
          >
            <div
              className={`h-full ${colorStyles[color]} rounded-full transition-all duration-500`}
              style={{ width: `${fillWidth}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}
