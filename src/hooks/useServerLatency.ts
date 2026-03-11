import { useState, useEffect, useRef, useCallback } from 'react';

const POLL_INTERVAL = 10_000;
const FETCH_TIMEOUT = 5_000;
const SAMPLE_COUNT = 5;
// Need 6 consecutive confirmed-down responses (60s) before showing Disconnected
const MAX_CONSECUTIVE_FAILURES = 6;
const INITIAL_MEASURE_DELAY = 1_500;

// Module-level — survives soft navigations, resets on hard refresh
let lastLatencyMs: number | null = null;
let lastLatencyColor = '#31e3ac';
let lastSamples: number[] = [];
let confirmedDownCount = 0; // only incremented by actual HTTP error responses

function getHealthUrl(): string {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || '';
  if (!base) return '';
  return base.replace(/\/+$/, '') + '/health';
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function getLatencyColor(ms: number): string {
  if (ms < 100) return '#31e3ac';
  if (ms <= 300) return '#f59e0b';
  return '#ef4444';
}

export function useServerLatency() {
  const [latencyMs, setLatencyMs] = useState<number | null>(lastLatencyMs);
  const [isConnected, setIsConnected] = useState(true);
  const [latencyColor, setLatencyColor] = useState(lastLatencyColor);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const measure = useCallback(async () => {
    const url = getHealthUrl();
    if (!url) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const start = performance.now();
      const res = await fetch(url, {
        signal: controller.signal,
        cache: 'no-store',
        mode: 'cors',
      });
      const rtt = Math.round(performance.now() - start);
      clearTimeout(timeout);

      if (!res.ok) {
        // Server responded but returned an error — backend is genuinely unhealthy
        confirmedDownCount++;
        if (confirmedDownCount >= MAX_CONSECUTIVE_FAILURES) {
          setIsConnected(false);
          setLatencyColor('#ef4444');
        }
        return;
      }

      // Success — reset failure counter
      confirmedDownCount = 0;

      lastSamples.push(rtt);
      if (lastSamples.length > SAMPLE_COUNT) lastSamples.shift();

      const med = median(lastSamples);
      lastLatencyMs = med;
      lastLatencyColor = getLatencyColor(med);

      setLatencyMs(med);
      setIsConnected(true);
      setLatencyColor(lastLatencyColor);
    } catch {
      // Network error, timeout, CORS, AbortController — NOT a confirmed server failure.
      // The server might be fine; it's a client-side connectivity blip.
      // Don't touch isConnected — keep whatever state we had.
      clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // Delay first ping so main thread isn't competing with page-load rendering
    const initialTimer = setTimeout(() => {
      if (mounted) measure();
    }, INITIAL_MEASURE_DELAY);

    const startPolling = () => {
      clearPolling();
      intervalRef.current = setInterval(() => {
        if (mounted) measure();
      }, POLL_INTERVAL);
    };
    startPolling();

    const handleVisibility = () => {
      if (document.hidden) {
        clearPolling();
      } else {
        if (mounted) measure();
        startPolling();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mounted = false;
      clearTimeout(initialTimer);
      clearPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [measure, clearPolling]);

  return { latencyMs, isConnected, latencyColor };
}
