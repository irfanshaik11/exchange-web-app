/**
 * SeasonRoadmap
 *
 * Primary mechanism by which users learn there are 4 seasons total.
 * Renders at the top of the Arena page as a horizontal strip with 4 segments
 * (Preseason → S1 → S2 → S3). The active season glows; future seasons are
 * muted with start dates; past seasons are marked "Complete".
 */

import { FiLock } from 'react-icons/fi';
import { useSeasons } from '~/hooks/useArena';
import type { Season } from '~/utils/arenaApi';

function fmtDateRange(s: string, e: string): string {
  const d1 = new Date(s);
  const d2 = new Date(e);
  const sameMonth = d1.getMonth() === d2.getMonth();
  const sameYear = d1.getFullYear() === d2.getFullYear();
  if (sameMonth && sameYear) {
    return `${d1.toLocaleDateString(undefined, { month: 'short' })} ${d1.getDate()}–${d2.getDate()}`;
  }
  return `${d1.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${d2.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function seasonState(s: Season, nowMs: number): 'past' | 'active' | 'future' {
  if (s.isActive) return 'active';
  if (new Date(s.endsAt).getTime() < nowMs) return 'past';
  return 'future';
}

export default function SeasonRoadmap() {
  const { data } = useSeasons();
  const seasons = data?.seasons ?? [];
  const nowMs = Date.now();

  if (seasons.length === 0) return null;

  return (
    <div className="mb-6 w-full">
      <div className="mb-2.5 flex items-center justify-between px-1">
        <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-neutral-300">
          Arena Roadmap · 4 Seasons
        </h3>
        <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
          Preseason → Season 3
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {seasons.map((s) => {
          const state = seasonState(s, nowMs);
          const isActive = state === 'active';
          const isPast = state === 'past';
          const isFuture = state === 'future';

          return (
            <div
              key={s.id}
              className={`group relative overflow-hidden rounded-xl border p-4 backdrop-blur-md transition-all ${
                isActive
                  ? 'border-yellow-500/80 bg-gradient-to-br from-yellow-500/15 via-black/80 to-black/90 shadow-[0_0_30px_-10px_rgba(253,224,71,0.6)]'
                  : isPast
                  ? 'border-[#2a2d36] bg-black/70 opacity-70'
                  : 'border-[#2a2d36] bg-black/75 hover:border-[#3a3d46]'
              }`}
            >
              {/* Active glow beacon */}
              {isActive && (
                <div className="absolute top-3 right-3">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-yellow-400" />
                  </span>
                </div>
              )}

              {/* Lock for future seasons */}
              {isFuture && (
                <div className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-md border border-[#2a2d36] bg-black/80 text-neutral-400">
                  <FiLock size={10} />
                </div>
              )}

              {/* Completed chevron */}
              {isPast && (
                <div className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  ✓
                </div>
              )}

              <div
                className={`text-base font-bold ${
                  isActive
                    ? 'text-yellow-300'
                    : isPast
                    ? 'text-neutral-400'
                    : 'text-white'
                }`}
              >
                {s.name}
              </div>
              <div
                className={`mt-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] ${
                  isActive
                    ? 'text-yellow-400/90'
                    : isPast
                    ? 'text-neutral-500'
                    : 'text-neutral-400'
                }`}
              >
                {isActive && (
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />
                )}
                {isActive ? 'Active Now' : isPast ? 'Complete' : 'Upcoming'}
              </div>
              <div
                className={`mt-2.5 text-xs font-medium tabular-nums ${
                  isActive ? 'text-neutral-200' : 'text-neutral-300'
                }`}
              >
                {fmtDateRange(s.startsAt, s.endsAt)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
