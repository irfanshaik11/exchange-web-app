import React from 'react';

/**
 * Premium skeleton loading card with directional shimmer effect.
 * Shimmer sweeps left-to-right (like Stripe/Linear) instead of basic pulse.
 */
export default function SkeletonShimmer() {
  return (
    <div
      className="rounded-2xl overflow-hidden border border-white/[0.06]"
      style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
    >
      {/* Image placeholder */}
      <div className="h-28 shimmer-bg" />

      <div className="p-5 space-y-4">
        {/* Status row */}
        <div className="flex items-center justify-between">
          <div className="h-5 w-14 rounded-md shimmer-bg" />
          <div className="h-5 w-5 rounded-md shimmer-bg" />
        </div>

        {/* Title lines */}
        <div className="space-y-2">
          <div className="h-4 w-full rounded shimmer-bg" />
          <div className="h-4 w-3/4 rounded shimmer-bg" />
        </div>

        {/* Probability bar */}
        <div className="h-1.5 w-full rounded-full shimmer-bg" />

        {/* Price row */}
        <div className="flex items-center justify-between">
          <div className="h-7 w-16 rounded shimmer-bg" />
          <div className="h-6 w-[60px] rounded shimmer-bg" />
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
          <div className="h-4 w-20 rounded shimmer-bg" />
          <div className="h-4 w-14 rounded shimmer-bg" />
        </div>
      </div>

      <style jsx>{`
        .shimmer-bg {
          background: linear-gradient(
            110deg,
            rgba(255, 255, 255, 0.02) 30%,
            rgba(255, 255, 255, 0.06) 50%,
            rgba(255, 255, 255, 0.02) 70%
          );
          background-size: 200% 100%;
          animation: shimmer 1.8s ease-in-out infinite;
        }

        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .shimmer-bg {
            animation: none;
            background: rgba(255, 255, 255, 0.03);
          }
        }
      `}</style>
    </div>
  );
}
