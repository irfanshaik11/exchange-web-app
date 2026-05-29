/**
 * SeasonCountdownBanner
 *
 * Appears in the last 14 days of an active season — drives end-of-season
 * volume spikes (great for the investor data story) and builds anticipation
 * for the next season rollover.
 *
 * Hidden when more than 14 days remain OR when no active season is set.
 */

import { useMemo } from 'react';
import { useSeasons } from '~/hooks/useArena';

const SHOW_THRESHOLD_DAYS = 14;

export default function SeasonCountdownBanner() {
  const { data } = useSeasons();

  const meta = useMemo(() => {
    if (!data) return null;
    const active = data.seasons.find((s) => s.isActive);
    if (!active) return null;

    const endMs = new Date(active.endsAt).getTime();
    const nowMs = Date.now();
    const daysLeft = Math.ceil((endMs - nowMs) / 86_400_000);
    if (daysLeft > SHOW_THRESHOLD_DAYS || daysLeft < 0) return null;

    const next = data.seasons.find((s) => new Date(s.startsAt).getTime() >= endMs);
    return { active, next, daysLeft };
  }, [data]);

  if (!meta) return null;
  const { active, next, daysLeft } = meta;

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-yellow-500/40 bg-black/80 shadow-lg backdrop-blur-md">
      <div className="relative flex items-center justify-between gap-4 bg-gradient-to-r from-yellow-500/15 via-transparent to-transparent px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-yellow-500/25 ring-1 ring-yellow-500/40">
            <span className="text-sm font-bold text-yellow-300 tabular-nums">
              {daysLeft}
            </span>
          </div>
          <div>
            <div className="text-sm font-bold text-white">
              {active.name} ends in {daysLeft} day{daysLeft === 1 ? '' : 's'}
            </div>
            {next && (
              <div className="mt-0.5 text-xs text-neutral-300">
                {next.name} begins soon. Your {active.name} progress is preserved forever.
              </div>
            )}
          </div>
        </div>

        <span className="hidden flex-shrink-0 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-yellow-300 sm:inline">
          Grind Time
        </span>
      </div>
    </div>
  );
}
