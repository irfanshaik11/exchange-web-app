import React from 'react';

/**
 * Subtle animated gradient mesh background.
 * Three low-opacity blobs drift slowly — creates atmospheric depth without distraction.
 * Pure CSS, zero JS animation cost. Respects prefers-reduced-motion.
 */
export default function AuroraBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
      style={{ zIndex: 0 }}
    >
      {/* Blob 1 — green accent, top-left drift */}
      <div
        className="aurora-blob"
        style={{
          width: '50vw',
          height: '50vw',
          maxWidth: '600px',
          maxHeight: '600px',
          top: '-10%',
          left: '-5%',
          background: 'radial-gradient(circle, rgba(74, 222, 128, 0.04) 0%, transparent 70%)',
          animationDuration: '25s',
          animationDelay: '0s',
        }}
      />

      {/* Blob 2 — purple, center-right drift */}
      <div
        className="aurora-blob"
        style={{
          width: '45vw',
          height: '45vw',
          maxWidth: '550px',
          maxHeight: '550px',
          top: '20%',
          right: '-10%',
          background: 'radial-gradient(circle, rgba(129, 140, 248, 0.035) 0%, transparent 70%)',
          animationDuration: '30s',
          animationDelay: '-8s',
        }}
      />

      {/* Blob 3 — cyan, bottom drift */}
      <div
        className="aurora-blob"
        style={{
          width: '40vw',
          height: '40vw',
          maxWidth: '500px',
          maxHeight: '500px',
          bottom: '5%',
          left: '20%',
          background: 'radial-gradient(circle, rgba(34, 211, 238, 0.03) 0%, transparent 70%)',
          animationDuration: '22s',
          animationDelay: '-14s',
        }}
      />

      <style jsx>{`
        .aurora-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          animation: aurora-drift linear infinite;
          will-change: transform;
        }

        @keyframes aurora-drift {
          0%, 100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          25% {
            transform: translate3d(8vw, -4vh, 0) scale(1.05);
          }
          50% {
            transform: translate3d(-4vw, 6vh, 0) scale(0.97);
          }
          75% {
            transform: translate3d(6vw, 3vh, 0) scale(1.02);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .aurora-blob {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
