/**
 * CreditsHeaderChip
 *
 * Always-visible Arena credits chip that lives in the app header next to the
 * SOL balance button. Shows:
 *   - Rank badge (tiny PNG from /ranks/{rank}-{level}.png)
 *   - Active-season credits (primary value)
 *   - Active season label (Preseason / S1 / S2 / S3)
 *
 * Hover popover is PORTALED to document.body with position:fixed so it
 * escapes any ancestor stacking context (backdrop-blur, transform on the
 * header, etc.) that would otherwise trap it behind sibling elements.
 *
 * Polls every 30s (handled by useCreditsSummary hook) and refetches on any
 * quest-claim toast via the shared React Query cache.
 *
 * Airdrop secrecy: NEVER mention airdrop criteria or eligibility in this UI.
 */

import { useRouter } from 'next/router';
import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useCreditsSummary } from '~/hooks/useArena';

const POPOVER_WIDTH = 288;

/**
 * Format credits for compact display. Always floors — never overstates balance.
 * <1k: raw (13, 999).  1k–99.99k: one decimal (13.6k, 98.4k).
 * 100k–999k: integer k (125k).  >=1M: two decimals M (1.53M).
 */
function formatCredits(n: number): string {
  if (n < 1000) return n.toLocaleString();
  if (n < 100_000) return `${Math.floor(n / 100) / 10}k`;
  if (n < 1_000_000) return `${Math.floor(n / 1000)}k`;
  return `${Math.floor(n / 10_000) / 100}M`;
}

function daysUntil(isoDate: string): number {
  const ms = new Date(isoDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

const RANK_TO_LEVEL = ['', 'I', 'II', 'III', 'IV'];

export default function CreditsHeaderChip() {
  const router = useRouter();
  const { data, isError } = useCreditsSummary();
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const recalc = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024;
    // Right-align popover to the trigger (chip is on the right side of the header).
    let left = r.right - POPOVER_WIDTH;
    if (left < 8) left = 8;
    if (left + POPOVER_WIDTH > viewportW - 8) left = viewportW - POPOVER_WIDTH - 8;
    setPos({ top: r.bottom + 8, left });
  }, []);

  useEffect(() => {
    if (!hovered) return;
    recalc();
    window.addEventListener('scroll', recalc, true);
    window.addEventListener('resize', recalc);
    return () => {
      window.removeEventListener('scroll', recalc, true);
      window.removeEventListener('resize', recalc);
    };
  }, [hovered, recalc]);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const rankImage = useMemo(() => {
    if (!data) return '/ranks/degen-1.png';
    const r = data.rank.toLowerCase();
    const l = Math.min(4, Math.max(1, data.rankLevel));
    return `/ranks/${r}-${l}.png`;
  }, [data]);

  const handleClick = () => {
    router.push('/airdrop-genesis');
  };

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHovered(true);
  };

  const handleMouseLeave = () => {
    // Small delay so cursor can drift onto the popover itself
    hoverTimeoutRef.current = setTimeout(() => setHovered(false), 120);
  };

  // Render nothing until real data arrives. Prevents a permanent gray
  // skeleton if the backend route is missing/failing, and avoids layout
  // flicker on fast networks (chip just appears when ready).
  if (isError || !data) return null;

  const seasonLabel = data.activeSeason
    ? data.activeSeason.code === 'preseason'
      ? 'Preseason'
      : data.activeSeason.code.toUpperCase()
    : '—';

  const daysLeft = data.activeSeason ? daysUntil(data.activeSeason.endsAt) : 0;

  const popover =
    hovered && pos && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="rounded-lg border border-[#20232b] bg-[#0a0b10] p-3.5 shadow-2xl"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: POPOVER_WIDTH,
              zIndex: 2147483647, // top of integer range — escapes every stacking context
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* Rank + multiplier */}
            <div className="mb-3 flex items-center gap-2.5">
              <div
                className="h-10 w-10 flex-shrink-0 bg-contain bg-center bg-no-repeat"
                style={{ backgroundImage: `url(${rankImage})` }}
              />
              <div>
                <div className="text-sm font-semibold text-white">
                  {data.rank.charAt(0) + data.rank.slice(1).toLowerCase()}{' '}
                  <span className="text-yellow-300">
                    {RANK_TO_LEVEL[data.rankLevel]}
                  </span>
                </div>
                <div className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">
                  {data.creditsMultiplier}× credits boost · {Math.round(data.progressToNextRank)}% to next rank
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#14171d]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-yellow-400 to-yellow-600 transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, data.progressToNextRank))}%` }}
                />
              </div>
            </div>

            {/* Season + lifetime breakdown */}
            <div className="mb-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-md border border-[#20232b] bg-[#0d1015] p-2">
                <div className="text-[9px] font-medium text-neutral-500 uppercase tracking-wider">
                  {seasonLabel} Credits
                </div>
                <div className="mt-0.5 text-sm font-semibold text-yellow-300 tabular-nums">
                  {data.seasonCredits.toLocaleString()}
                </div>
              </div>
              <div className="rounded-md border border-[#20232b] bg-[#0d1015] p-2">
                <div className="text-[9px] font-medium text-neutral-500 uppercase tracking-wider">
                  Lifetime
                </div>
                <div className="mt-0.5 text-sm font-semibold text-neutral-200 tabular-nums">
                  {data.lifetimeCredits.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Season countdown */}
            {data.activeSeason && (
              <div className="mb-3 flex items-center justify-between rounded-md border border-[#20232b] bg-[#0d1015] px-2 py-1.5 text-xs">
                <span className="text-neutral-400">
                  {data.activeSeason.name} ends in
                </span>
                <span className="font-semibold text-white tabular-nums">
                  {daysLeft} day{daysLeft === 1 ? '' : 's'}
                </span>
              </div>
            )}

            {/* 4-season context */}
            <div className="mb-3 text-[10px] leading-relaxed text-neutral-500">
              Interstate Arena runs across 4 seasons. Credits and rank accumulate
              over your lifetime; each season tracks your fresh season-scored climb.
            </div>

            {/* CTA */}
            <button
              onClick={handleClick}
              className="w-full rounded-md bg-yellow-500 py-1.5 text-xs font-semibold text-black transition-all hover:bg-yellow-400"
            >
              Open Arena →
            </button>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div
        ref={triggerRef}
        className="relative"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <button
          onClick={handleClick}
          className="group/credits flex h-10 min-h-[44px] cursor-pointer flex-row items-center justify-center gap-1.5 rounded-md border border-[#20232b] bg-gradient-to-br from-[#0d1015] to-[#0a0b10] px-2 transition-all duration-200 ease-out hover:border-yellow-500/40 hover:shadow-[0_0_20px_-8px_rgba(253,224,71,0.35)] sm:h-8 sm:min-h-0 sm:gap-1.5 sm:px-2.5"
          title={`${data.rankDisplay} · ${data.lifetimeCredits.toLocaleString()} lifetime credits`}
        >
          {/* Rank badge */}
          <div
            className="h-5 w-5 flex-shrink-0 bg-contain bg-center bg-no-repeat select-none transition-transform group-hover/credits:scale-110"
            style={{ backgroundImage: `url(${rankImage})` }}
            role="img"
            aria-label={data.rankDisplay}
          />

          {/* Credits value */}
          <div className="flex items-baseline gap-1 text-left">
            <span className="text-xs font-semibold text-yellow-300 tabular-nums sm:text-sm">
              {formatCredits(data.seasonCredits)}
            </span>
            <span className="hidden text-[9px] font-medium text-neutral-500 uppercase tracking-wider sm:inline">
              {seasonLabel}
            </span>
          </div>
        </button>
      </div>
      {popover}
    </>
  );
}
