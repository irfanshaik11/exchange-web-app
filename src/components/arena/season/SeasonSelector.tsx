/**
 * SeasonSelector
 *
 * Tab row under SeasonRoadmap that lets the user switch between their
 * historical seasons. Past seasons show frozen stats (read-only). The active
 * season shows live stats. Future seasons are locked with a tooltip explaining
 * when they start.
 *
 * Use: controlled component — parent owns selected seasonId state.
 */

import { useSeasons } from '~/hooks/useArena';

export default function SeasonSelector({
  selectedSeasonId,
  onSelect,
}: {
  selectedSeasonId: number | null;
  onSelect: (seasonId: number) => void;
}) {
  const { data } = useSeasons();
  const seasons = data?.seasons ?? [];
  const nowMs = Date.now();

  if (seasons.length === 0) return null;

  return (
    <div className="mb-4 flex gap-1 overflow-x-auto">
      {seasons.map((s) => {
        const isActive = s.isActive;
        const isPast = !isActive && new Date(s.endsAt).getTime() < nowMs;
        const isFuture = !isActive && !isPast;
        const isSelected = selectedSeasonId === s.id;

        return (
          <button
            key={s.id}
            onClick={() => !isFuture && onSelect(s.id)}
            disabled={isFuture}
            title={
              isFuture
                ? `${s.name} begins ${new Date(s.startsAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`
                : undefined
            }
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${
              isSelected
                ? 'border-yellow-500/60 bg-yellow-500/10 text-yellow-300'
                : isFuture
                ? 'cursor-not-allowed border-[#20232b] bg-[#0d1015] text-neutral-600'
                : 'border-[#20232b] bg-[#0d1015] text-neutral-400 hover:border-[#2a2d36] hover:text-neutral-200'
            }`}
          >
            <span>{s.name}</span>
            {isActive && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-yellow-400" />
              </span>
            )}
            {isFuture && <span className="text-neutral-600">🔒</span>}
            {isPast && <span className="text-neutral-600">·</span>}
          </button>
        );
      })}
    </div>
  );
}
