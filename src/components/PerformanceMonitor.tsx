import React, { useEffect, useState } from 'react';

interface PerformanceMetrics {
  pageLoadTime: number;
  cacheHitRate: number;
  memoryUsage: number;
  activeConnections: number;
}

export default function PerformanceMonitor() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    pageLoadTime: 0,
    cacheHitRate: 0,
    memoryUsage: 0,
    activeConnections: 0,
  });

  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Only show in development
    if (process.env.NODE_ENV !== 'development') return;

    const updateMetrics = () => {
      // Get page load time
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const pageLoadTime = navigation ? navigation.loadEventEnd - navigation.fetchStart : 0;

      // Get memory usage (if available)
      const memory = (performance as any).memory;
      const memoryUsage = memory ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : 0;

      // Count active WebSocket connections
      const activeConnections = document.querySelectorAll('script[src*="websocket"]').length;

      setMetrics({
        pageLoadTime: Math.round(pageLoadTime),
        cacheHitRate: 0, // This would need to be passed from cache hooks
        memoryUsage,
        activeConnections,
      });
    };

    updateMetrics();
    const interval = setInterval(updateMetrics, 5000);

    return () => clearInterval(interval);
  }, []);

  // Only render in development
  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white p-3 rounded-lg text-xs font-mono z-50">
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold">Performance</span>
        <button
          onClick={() => setIsVisible(!isVisible)}
          className="text-gray-400 hover:text-white"
        >
          {isVisible ? '−' : '+'}
        </button>
      </div>
      
      {isVisible && (
        <div className="space-y-1">
          <div>Load: {metrics.pageLoadTime}ms</div>
          <div>Memory: {metrics.memoryUsage}MB</div>
          <div>Connections: {metrics.activeConnections}</div>
          <div>Cache Hit: {metrics.cacheHitRate}%</div>
        </div>
      )}
    </div>
  );
}
