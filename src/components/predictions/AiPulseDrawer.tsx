import React, { useRef, useState, useEffect } from 'react';
import { T } from './theme';
import { HomepageInsightPanel } from '~/components/insights/HomepageInsightPanel';

interface AiPulseDrawerProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export default function AiPulseDrawer({ open, onOpen, onClose }: AiPulseDrawerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pillLeft, setPillLeft] = useState<number | null>(null);
  const [pillTop, setPillTop] = useState(140);

  // Dynamic left offset from container position
  useEffect(() => {
    if (open) return;
    const updateLeft = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) setPillLeft(rect.left + 4);
    };
    updateLeft();
    window.addEventListener('resize', updateLeft);
    return () => window.removeEventListener('resize', updateLeft);
  }, [open]);

  // Dynamic top — pill slides up as user scrolls past header
  useEffect(() => {
    if (open) return;
    let raf = 0;
    const getScrollTop = () =>
      window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setPillTop(Math.max(16, 140 - getScrollTop()));
      });
    };
    onScroll();
    // Listen on all possible scroll targets
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('scroll', onScroll, { capture: true } as any);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="hidden xl:flex flex-col flex-shrink-0 items-center relative"
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <defs>
                <linearGradient id="ai-home-tab" x1="3" y1="2" x2="22" y2="21">
                  <stop stopColor="#4ADE80" />
                  <stop offset="0.5" stopColor="#22D3EE" />
                  <stop offset="1" stopColor="#818CF8" />
                </linearGradient>
              </defs>
              <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="url(#ai-home-tab)" />
              <path d="M19 15L19.75 17.25L22 18L19.75 18.75L19 21L18.25 18.75L16 18L18.25 17.25L19 15Z" fill="url(#ai-home-tab)" opacity="0.7" />
            </svg>
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
              AI Pulse
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" style={{ opacity: 0.7 }}>
              <path d="M9 18l6-6-6-6" stroke="#4ADE80" />
            </svg>
          </div>
        </button>
      ) : (
        <div className="w-[360px] flex flex-col">
          <div className="iridescent-border flex flex-col" style={{ borderRadius: '0 16px 16px 0', borderLeft: 'none' }}>
            <div className="iridescent-inner flex flex-col overflow-hidden" style={{ borderRadius: '0 14.5px 14.5px 0' }}>
              <div
                className="flex items-center justify-between px-4 py-3 flex-shrink-0"
                style={{ borderBottom: '1px solid rgba(74,222,128,0.1)' }}
              >
                <div className="flex items-center gap-2.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <defs>
                      <linearGradient id="ai-home-hdr" x1="3" y1="2" x2="22" y2="21">
                        <stop stopColor="#4ADE80" />
                        <stop offset="0.5" stopColor="#22D3EE" />
                        <stop offset="1" stopColor="#818CF8" />
                      </linearGradient>
                    </defs>
                    <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="url(#ai-home-hdr)" />
                  </svg>
                  <span className="text-[12px] font-bold tracking-[0.12em] uppercase text-[#4ADE80]">
                    AI Market Pulse
                  </span>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg"
                  style={{ color: T.muted }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                <HomepageInsightPanel docked chromeless />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
