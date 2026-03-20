import React from 'react';

export function InsightSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-10 rounded-lg bg-white/5 animate-pulse" />
      ))}
    </div>
  );
}
