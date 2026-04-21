/**
 * ArenaInfoTooltip
 *
 * Small "i" icon that, on hover, explains the Interstate Arena credit system.
 * Designed to sit next to the Arena/Credits display ("moonsheet") so users
 * can discover how the system works without leaving the page.
 *
 * Portals the popover to document.body with position:fixed so it escapes any
 * ancestor stacking context (backdrop-blur, transform, etc.) that would
 * otherwise trap it behind siblings.
 *
 * Copy is intentionally benefit-forward — describes what credits do (rank,
 * cashback, rewards) without EVER mentioning airdrop criteria. See
 * feedback_airdrop_secrecy.md memory.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FiInfo } from 'react-icons/fi';
import { useCreditsSummary, useSeasons } from '~/hooks/useArena';

const POPOVER_WIDTH = 320;

export default function ArenaInfoTooltip({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: summary } = useCreditsSummary();
  const { data: seasonsData } = useSeasons();

  const recalc = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024;
    // Center-align horizontally to the trigger; clamp to viewport.
    let left = r.left + r.width / 2 - POPOVER_WIDTH / 2;
    if (left < 8) left = 8;
    if (left + POPOVER_WIDTH > viewportW - 8) left = viewportW - POPOVER_WIDTH - 8;
    setPos({ top: r.bottom + 8, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    recalc();
    window.addEventListener('scroll', recalc, true);
    window.addEventListener('resize', recalc);
    return () => {
      window.removeEventListener('scroll', recalc, true);
      window.removeEventListener('resize', recalc);
    };
  }, [open, recalc]);

  useEffect(() => () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  }, []);

  const show = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setOpen(true);
  };
  const hide = () => {
    hoverTimeoutRef.current = setTimeout(() => setOpen(false), 120);
  };

  const multiplier = summary?.creditsMultiplier ?? 1;
  const seasons = seasonsData?.seasons ?? [];

  const popover =
    open && pos && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="rounded-lg border border-[#20232b] bg-[#0a0b10] p-4 shadow-2xl"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: POPOVER_WIDTH,
              zIndex: 2147483647, // top of integer range — escapes every stacking context
            }}
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            <div className="mb-3">
              <div className="text-sm font-semibold text-white">How credits work</div>
              <div className="mt-1 text-xs text-neutral-400">
                Trade, complete quests, and grow your network to earn credits and
                level up your rank.
              </div>
            </div>

            {/* Current rank boost */}
            <div className="mb-3 flex items-center justify-between rounded-md border border-[#20232b] bg-[#0d1015] px-3 py-2">
              <span className="text-xs text-neutral-400">Your rank boost</span>
              <span className="text-sm font-semibold text-yellow-300">
                {multiplier}× credits
              </span>
            </div>

            {/* Seasons */}
            {seasons.length > 0 && (
              <div className="mb-3">
                <div className="mb-1.5 text-[10px] font-medium text-neutral-500 uppercase tracking-wider">
                  4 Seasons total
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {seasons.map((s) => {
                    const isActive = s.isActive;
                    return (
                      <div
                        key={s.id}
                        className={`rounded border px-1 py-1 text-center text-[10px] ${
                          isActive
                            ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-300'
                            : 'border-[#20232b] bg-[#0d1015] text-neutral-500'
                        }`}
                      >
                        <div className="font-semibold">
                          {s.code === 'preseason' ? 'Pre' : s.code.toUpperCase()}
                        </div>
                        <div className="text-[8px]">
                          {new Date(s.startsAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1.5 text-[10px] leading-snug text-neutral-500">
                  Lifetime total accumulates across all seasons. Each new season starts fresh
                  for the season leaderboard.
                </div>
              </div>
            )}

            <div className="text-[10px] leading-snug text-neutral-500">
              Higher ranks unlock better cashback (10% → 35%), bigger quest rewards,
              and stronger referral passthrough.
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <span
      ref={triggerRef}
      className={`relative inline-flex ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onClick={() => setOpen((v) => !v)}
    >
      <button
        type="button"
        className="flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-[#2a2d36] bg-[#0d1015] text-neutral-500 transition-colors hover:border-yellow-500/40 hover:text-yellow-300"
        aria-label="How credits work"
      >
        <FiInfo size={11} />
      </button>
      {popover}
    </span>
  );
}
