import { memo, useEffect, useRef } from "react";
import { normalizeTimestampMs } from "~/utils/db";

// ── Shared rAF clock with direct DOM writes ────────────────────────
// Single requestAnimationFrame loop updates ALL age labels.
// Direct el.textContent writes bypass React reconciliation entirely,
// so ages tick smoothly even when PulseTable is re-rendering from WS floods.
const updaters = new Set<() => void>();
let rafId: number | null = null;
let lastTick = 0;

function clockLoop() {
  const now = Date.now();
  if (now - lastTick >= 1000) {
    lastTick = now;
    updaters.forEach((f) => f());
  }
  if (updaters.size > 0) {
    rafId = requestAnimationFrame(clockLoop);
  } else {
    rafId = null;
  }
}

function startClock() {
  if (rafId === null && updaters.size > 0) {
    lastTick = Date.now();
    rafId = requestAnimationFrame(clockLoop);
  }
}

function stopClock() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function registerUpdater(fn: () => void) {
  updaters.add(fn);
  startClock();
  return () => {
    updaters.delete(fn);
    if (updaters.size === 0) stopClock();
  };
}

// ── Component ──────────────────────────────────────────────────────

interface TokenAgeProps {
  createdAt: any;
}

function formatAge(ts: number): string {
  const d = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (d < 60) return d + "s";
  if (d < 3600) return Math.floor(d / 60) + "m";
  if (d < 86400) return Math.floor(d / 3600) + "h";
  return Math.floor(d / 86400) + "d";
}

/**
 * Live-updating token age — zero React interference after mount.
 *
 * Renders an empty <span> so React never touches the textContent.
 * The rAF clock sets text directly via spanRef on every tick.
 * Wrapped in React.memo to skip parent-driven re-renders entirely.
 */
export const TokenAge = memo(function TokenAge({ createdAt }: TokenAgeProps) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const tsRef = useRef<number | null>(null);

  // Lock in first valid timestamp during render (for useEffect below)
  if (tsRef.current === null && createdAt != null) {
    tsRef.current = normalizeTimestampMs(createdAt);
  }

  useEffect(() => {
    // Catch late-arriving createdAt
    if (tsRef.current === null && createdAt != null) {
      tsRef.current = normalizeTimestampMs(createdAt);
    }
    const ts = tsRef.current;
    if (ts === null) return;

    const update = () => {
      const el = spanRef.current;
      if (!el) return;
      const label = formatAge(ts);
      if (el.textContent !== label) el.textContent = label;
    };

    // Set initial text immediately (the span starts empty)
    update();
    return registerUpdater(update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // IMPORTANT: No children! React will never write to textContent.
  // The rAF clock owns all text updates via spanRef.
  return <span ref={spanRef} />;
});
