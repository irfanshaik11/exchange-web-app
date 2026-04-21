/**
 * RecruiterMilestoneStrip
 *
 * Lifetime recruiter milestone ladder (Tier I → Tier VII). Shows progress
 * toward the next tier based on active referees. Tiers are claimed
 * automatically server-side when thresholds are met — this UI is for
 * visibility + motivation.
 *
 * Lives on the /referrals page.
 */

import { useRecruiterProgress } from '~/hooks/useArena';

export default function RecruiterMilestoneStrip() {
  const { data, isError } = useRecruiterProgress();

  // Render nothing until real data arrives — prevents a permanent gray
  // skeleton if the backend endpoint is missing/failing.
  if (isError || !data) return null;

  const { activeTraderCount, tiers } = data;
  const nextUnclaimed = tiers.find((t) => !t.claimed);

  return (
    <div className="rounded-lg border border-[#20232b] bg-[#0d1015] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Recruiter Milestones</h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            Active traders recruited:{' '}
            <span className="font-semibold text-yellow-300 tabular-nums">
              {activeTraderCount}
            </span>
            {nextUnclaimed && (
              <>
                {' '}
                · Next: <span className="text-neutral-300">{nextUnclaimed.title}</span> at{' '}
                <span className="text-neutral-300 tabular-nums">
                  {nextUnclaimed.activeTradersRequired}
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {tiers.map((tier) => {
          const progress = Math.min(100, (activeTraderCount / tier.activeTradersRequired) * 100);
          const isNext = tier === nextUnclaimed;
          return (
            <div
              key={tier.tier}
              className={`relative rounded-md border p-2 text-center transition-all ${
                tier.claimed
                  ? 'border-yellow-500/50 bg-yellow-500/10'
                  : isNext
                  ? 'border-yellow-500/30 bg-[#0a0b10]'
                  : 'border-[#20232b] bg-[#0a0b10] opacity-60'
              }`}
              title={`Requires ${tier.activeTradersRequired} active referred traders`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                {tier.title.replace('Recruiter ', '')}
              </div>
              <div className="mt-1 text-[10px] tabular-nums text-neutral-500">
                {tier.activeTradersRequired}+
              </div>
              <div className="mt-1 text-[10px] font-semibold text-yellow-300 tabular-nums">
                +{tier.baseCredits.toLocaleString()}
              </div>
              {!tier.claimed && progress > 0 && progress < 100 && (
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#14171d]">
                  <div
                    className="h-full rounded-full bg-yellow-500/60"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
              {tier.claimed && (
                <div className="absolute top-1 right-1 text-[9px] text-yellow-300">✓</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
