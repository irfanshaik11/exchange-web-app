import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { normalizeTimestampMs } from "~/utils/db";

// Same artwork used for the OHLC chart's Mayhem Bot trade markers.
// Filename has a literal space, so it MUST be URL-encoded — passing
// "/mayhem bot.png" raw would 404 on production CDN paths.
const MAYHEM_TIMER_ICON = "/mayhem%20bot.png";

const MAYHEM_TOOLTIP_TEXT =
  "Mayhem Mode Active. Tokens in Mayhem mode may be unsellable near the launch price.";

// Shared rAF clock — same architecture as TokenAge.tsx so multiple
// rows ticking in parallel still cost ~one ticker total. Direct
// el.textContent writes bypass React reconciliation under WS flood.
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

const DURATION_MS = 24 * 60 * 60 * 1000;
const MAYHEM_RED = "#c83c51";

interface TokenCountdown24hProps {
  startedAt: any;
}

function formatRemaining(startTs: number): string | null {
  const remaining = DURATION_MS - (Date.now() - startTs);
  if (remaining <= 0) return null;
  const h = Math.floor(remaining / 3_600_000);
  const m = Math.floor((remaining % 3_600_000) / 60_000);
  const s = Math.floor((remaining % 60_000) / 1_000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * 24-hour countdown badge for Mayhem Mode tokens.
 *
 * Mounts when `is_mayhem_mode === true` is on the row; self-unmounts
 * once the 24h window elapses (returns null) so a stale flag from
 * the backend can't keep showing a negative timer.
 */
export const TokenCountdown24h = memo(function TokenCountdown24h({
  startedAt,
}: TokenCountdown24hProps) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const tsRef = useRef<number | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [expired, setExpired] = useState(false);

  if (tsRef.current === null && startedAt != null) {
    tsRef.current = normalizeTimestampMs(startedAt);
  }

  useEffect(() => {
    if (tsRef.current === null && startedAt != null) {
      tsRef.current = normalizeTimestampMs(startedAt);
    }
    const ts = tsRef.current;
    if (ts === null) return;

    // Already expired on mount
    if (DURATION_MS - (Date.now() - ts) <= 0) {
      setExpired(true);
      return;
    }

    const update = () => {
      const el = spanRef.current;
      if (!el) return;
      const label = formatRemaining(ts);
      if (label === null) {
        setExpired(true);
        return;
      }
      if (el.textContent !== label) el.textContent = label;
    };

    update();
    return registerUpdater(update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (expired || tsRef.current === null) return null;

  return (
    <>
      <div
        className="flex items-center gap-1"
        style={{
          // Matte red pill — semi-transparent brand red layered over the row's
          // dark background produces a low-saturation, muted maroon tone
          // without needing a hardcoded color that would shift if the row
          // background ever changes.
          backgroundColor: "rgba(200, 60, 81, 0.18)",
          // Slightly rounded rectangle (not full circle) — pill silhouette but
          // still reads as a rectangular badge.
          borderRadius: 4,
          padding: "2px 6px",
          // Small extra breathing room to the left of the pill so it doesn't
          // crowd the age component sitting before it. The parent's `gap-1`
          // already provides 4px between flex children; this nudges another
          // 4px so the strip reads as [age] · [timer] with clearer rhythm.
          marginLeft: 4,
          fontSize: 11,
          lineHeight: 1,
          fontWeight: 700,
          letterSpacing: 0.2,
          color: MAYHEM_RED,
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
        }}
        // Tooltip lifecycle mirrors the AMM-bubble tooltip pattern in
        // PulseTable: position via getBoundingClientRect on enter, fade
        // back out on leave. The tooltip itself is portaled to body so
        // it can escape the row's overflow and z-index stacking.
        onMouseEnter={(e) => {
          const tip = tipRef.current;
          if (tip) {
            const r = e.currentTarget.getBoundingClientRect();
            tip.style.left = `${r.left + r.width / 2}px`;
            tip.style.top = `${r.top - 6}px`;
            tip.style.transform = "translate(-50%, -100%)";
            tip.style.opacity = "1";
          }
        }}
        onMouseLeave={() => {
          const tip = tipRef.current;
          if (tip) tip.style.opacity = "0";
        }}
      >
        {/* Mayhem Bot artwork — same asset used inside the OHLC chart trade
            markers, so the visual identity is consistent: anywhere a row or
            trade is flagged Mayhem, the user sees the same little icon. */}
        <img
          src={MAYHEM_TIMER_ICON}
          alt=""
          aria-hidden
          className="pointer-events-none rounded-sm object-contain"
          style={{ width: 12, height: 12 }}
        />
        <span ref={spanRef} />
      </div>
      {typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tipRef}
            className="pointer-events-none fixed z-[9999] rounded px-2 py-1 text-[10px] font-medium"
            style={{
              backgroundColor: "rgba(31, 41, 55, 0.95)",
              color: "#e5e7eb",
              border: "1px solid rgba(107, 114, 128, 0.3)",
              opacity: 0,
              transition: "opacity 150ms",
              // Constrain width so the longer message wraps onto 2–3 lines
              // instead of flying off-screen as one long row.
              maxWidth: 240,
              lineHeight: 1.35,
            }}
          >
            {MAYHEM_TOOLTIP_TEXT}
          </div>,
          document.body,
        )}
    </>
  );
});
