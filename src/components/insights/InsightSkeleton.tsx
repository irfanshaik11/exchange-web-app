import React from 'react';

export function InsightSkeleton() {
  return (
    <div className="space-y-2.5 p-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
            border: '1px solid rgba(255,255,255,0.04)',
          }}
        >
          <div className="flex items-center justify-between px-3 py-3">
            <div
              className="h-3 rounded-md animate-pulse"
              style={{
                width: `${60 + (i * 13) % 40}px`,
                background: 'linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
                animationDelay: `${i * 100}ms`,
              }}
            />
            <div className="flex items-center gap-2">
              <div
                className="h-4 w-14 rounded-md animate-pulse"
                style={{
                  background: 'linear-gradient(90deg, rgba(74,222,128,0.06) 0%, rgba(74,222,128,0.02) 100%)',
                  animationDelay: `${i * 100 + 50}ms`,
                }}
              />
              <div
                className="h-1.5 w-1.5 rounded-full animate-pulse"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  animationDelay: `${i * 100 + 80}ms`,
                }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
