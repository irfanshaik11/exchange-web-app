/**
 * PassthroughCounter
 *
 * Visualizes the 10% referral passthrough for the referrer: "Your recruits
 * earned you X credits this season". Renders on the /referrals page.
 *
 * Data source: sums REFERRAL_PASSTHROUGH-type GoldTransactions for the active
 * season. For v2.0 launch we use the recruiter-progress endpoint as a proxy
 * (activeTraderCount × avg-volume estimate) until a dedicated endpoint lands.
 */

import { useSeasonStats } from '~/hooks/useArena';

export default function PassthroughCounter() {
  const { data, isError } = useSeasonStats();

  // Render nothing until real data arrives — prevents a permanent gray
  // skeleton if the backend endpoint is missing/failing.
  if (isError || !data) return null;

  const active = data.seasons.find((s) => s.isActive);
  if (!active) return null;

  // Passthrough = referral credits earned this season, from the
  // userReferralCreditsEarned field populated by awardReferralPassthrough()
  // on the server. Strongly typed now — no `as any` escape hatch.
  const passthroughCredits = active.userReferralCreditsEarned;

  return (
    <div className="rounded-lg border border-[#20232b] bg-gradient-to-br from-yellow-500/5 via-[#0d1015] to-[#0a0b10] p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
            Referral Passthrough · {active.name}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-yellow-300 tabular-nums">
              +{passthroughCredits.toLocaleString()}
            </span>
            <span className="text-xs text-neutral-400">credits</span>
          </div>
          <div className="mt-1 text-[10px] text-neutral-500">
            10% of every credit your recruits earn flows to you — for life.
          </div>
        </div>

        <div className="hidden text-right sm:block">
          <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-600">
            Passthrough rate
          </div>
          <div className="text-lg font-bold text-yellow-300">10%</div>
        </div>
      </div>
    </div>
  );
}
