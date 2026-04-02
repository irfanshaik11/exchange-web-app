import React, { useRef, useState, useEffect, type ReactNode } from 'react';
import { T } from './theme';
import useIsDesktop from '~/hooks/useIsDesktop';

interface AiDrawerBaseProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  title: string;
  pillLabel: string;
  fabBottom?: number;
  animationPrefix?: string;
  /** Pass a value that changes on layout toggle so pill repositions */
  layoutKey?: string;
  children: ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Shared sparkle icon                                                */
/* ------------------------------------------------------------------ */
export const SparkleIcon = ({ size = 18, gradientId = 'ai-sparkle' }: { size?: number; gradientId?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id={gradientId} x1="3" y1="2" x2="22" y2="21">
        <stop stopColor="#4ADE80" />
        <stop offset="0.5" stopColor="#22D3EE" />
        <stop offset="1" stopColor="#818CF8" />
      </linearGradient>
    </defs>
    <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill={`url(#${gradientId})`} />
    <path d="M19 15L19.75 17.25L22 18L19.75 18.75L19 21L18.25 18.75L16 18L18.25 17.25L19 15Z" fill={`url(#${gradientId})`} opacity="0.7" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Drawer header                                                      */
/* ------------------------------------------------------------------ */
const DrawerHeader = ({ title, onClose }: { title: string; onClose: () => void }) => (
  <div
    className="flex items-center justify-between px-4 py-3 flex-shrink-0"
    style={{ borderBottom: '1px solid rgba(74,222,128,0.1)' }}
  >
    <div className="flex items-center gap-2.5">
      <SparkleIcon size={16} gradientId="ai-drawer-hdr" />
      <span className="text-[12px] font-bold tracking-[0.12em] uppercase text-[#4ADE80]">
        {title}
      </span>
    </div>
    <button
      onClick={onClose}
      className="p-1.5 rounded-lg"
      style={{ color: T.muted }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export default function AiDrawerBase({
  open,
  onOpen,
  onClose,
  title,
  pillLabel,
  fabBottom = 24,
  animationPrefix = 'aidrawer',
  layoutKey,
  children,
}: AiDrawerBaseProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pillLeft, setPillLeft] = useState<number | null>(null);
  const [pillTop, setPillTop] = useState(140);
  const isDesktop = useIsDesktop();

  // ---- Desktop: dynamic left offset from container position ----
  useEffect(() => {
    if (!isDesktop || open) return;
    const el = containerRef.current;
    const updateLeft = () => {
      const rect = el?.getBoundingClientRect();
      if (rect) setPillLeft(rect.left + 4);
    };
    updateLeft();
    window.addEventListener('resize', updateLeft);
    // Use ResizeObserver to detect layout shifts (e.g. sidebar toggle)
    let ro: ResizeObserver | undefined;
    if (el) {
      ro = new ResizeObserver(updateLeft);
      ro.observe(el);
    }
    return () => {
      window.removeEventListener('resize', updateLeft);
      ro?.disconnect();
    };
  }, [open, isDesktop, layoutKey]);

  // ---- Desktop: pill slides up as user scrolls past header ----
  useEffect(() => {
    if (!isDesktop || open) return;
    let raf = 0;
    const getScrollTop = () =>
      window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setPillTop(Math.max(16, 140 - getScrollTop()));
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('scroll', onScroll, { capture: true } as any);
    };
  }, [open, isDesktop]);

  // ---- Mobile: lock body scroll when sheet is open ----
  useEffect(() => {
    if (isDesktop !== false || !open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, isDesktop]);

  // ---- Escape key to close mobile sheet ----
  useEffect(() => {
    if (isDesktop !== false || !open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, isDesktop, onClose]);

  // Don't render until mounted (avoids hydration mismatch)
  if (isDesktop === null) return null;

  /* ================================================================ */
  /*  MOBILE LAYOUT — FAB + bottom sheet                              */
  /* ================================================================ */
  if (!isDesktop) {
    return (
      <>
        {/* FAB — bottom-right, always visible when drawer is closed */}
        {!open && (
          <button
            onClick={onOpen}
            className="iridescent-pill"
            style={{
              position: 'fixed',
              bottom: fabBottom,
              right: 16,
              zIndex: 50,
              width: 48,
              height: 48,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              backgroundColor: 'rgba(12, 14, 18, 0.95)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
            }}
          >
            <SparkleIcon size={20} gradientId={`${animationPrefix}-fab`} />
          </button>
        )}

        {/* Bottom sheet overlay */}
        {open && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
            {/* Backdrop */}
            <div
              onClick={onClose}
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.5)',
                animation: `${animationPrefix}-fade-in 200ms ease-out forwards`,
              }}
            />

            {/* Sheet */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                maxHeight: '90vh',
                backgroundColor: T.bg,
                borderRadius: '16px 16px 0 0',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                animation: `${animationPrefix}-slide-up 350ms cubic-bezier(0.16, 1, 0.3, 1) forwards`,
                border: '1px solid rgba(74,222,128,0.12)',
                borderBottom: 'none',
              }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)' }} />
              </div>

              <DrawerHeader title={title} onClose={onClose} />

              <div className="flex-1 overflow-y-auto scrollbar-hide">
                {children}
              </div>
            </div>
          </div>
        )}

        <style jsx global>{`
          @keyframes ${animationPrefix}-fade-in {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
          @keyframes ${animationPrefix}-slide-up {
            from { transform: translateY(100%); }
            to   { transform: translateY(0); }
          }
        `}</style>
      </>
    );
  }

  /* ================================================================ */
  /*  DESKTOP LAYOUT — original inline drawer                         */
  /* ================================================================ */
  return (
    <div
      ref={containerRef}
      className="flex flex-col flex-shrink-0 items-center relative"
      style={{
        width: open ? 360 : 48,
        transition: 'width 300ms cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'hidden',
      }}
    >
      {!open ? (
        <button
          onClick={onOpen}
          className="iridescent-pill"
          style={{
            position: 'fixed',
            top: pillTop,
            left: pillLeft ?? 4,
            cursor: 'pointer',
            zIndex: 10,
          }}
        >
          <div className="pill-inner flex flex-col items-center gap-3 px-2 py-4" style={{ minWidth: 38 }}>
            <SparkleIcon size={18} gradientId={`${animationPrefix}-tab`} />
            <span
              className="text-[9px] font-bold tracking-[0.15em] uppercase"
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                background: 'linear-gradient(180deg, #4ADE80, #22D3EE, #818CF8)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {pillLabel}
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" style={{ opacity: 0.7 }}>
              <path d="M9 18l6-6-6-6" stroke="#4ADE80" />
            </svg>
          </div>
        </button>
      ) : (
        <div className="w-[360px] flex flex-col pt-3">
          <div className="iridescent-border flex flex-col" style={{ borderRadius: '16px' }}>
            <div className="iridescent-inner flex flex-col overflow-hidden" style={{ borderRadius: '14.5px' }}>
              <DrawerHeader title={title} onClose={onClose} />
              <div className="overflow-y-auto scrollbar-hide">
                {children}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
