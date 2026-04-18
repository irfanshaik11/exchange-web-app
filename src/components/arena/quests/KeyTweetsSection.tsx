/**
 * KeyTweetsSection
 *
 * Admin-curated tweets the active user can engage with for credits.
 * Renders inside the SocialQuestsSection or as its own card.
 * Each tweet can be claimed once per user (enforced server-side via UNIQUE).
 */

import { FiExternalLink, FiCheck } from 'react-icons/fi';
import { useKeyTweets, useClaimKeyTweet } from '~/hooks/useArena';

export default function KeyTweetsSection() {
  const { data, isError } = useKeyTweets();
  const claim = useClaimKeyTweet();

  // Render nothing until real data arrives — prevents a permanent gray
  // skeleton if the backend endpoint is missing/failing.
  if (isError || !data) return null;

  const tweets = data.tweets;
  if (tweets.length === 0) return null;

  return (
    <div className="rounded-lg border border-[#20232b] bg-[#0d1015] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Key Tweets</h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            Engage with curated Interstate tweets to earn credits.
          </p>
        </div>
        <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-yellow-300">
          {tweets.filter((t) => !t.claimed).length} available
        </span>
      </div>

      <div className="space-y-2">
        {tweets.map((tweet) => (
          <div
            key={tweet.id}
            className={`flex items-center gap-3 rounded-md border p-2.5 transition-colors ${
              tweet.claimed
                ? 'border-[#20232b] bg-[#0a0b10] opacity-60'
                : 'border-[#20232b] bg-[#0a0b10] hover:border-yellow-500/30'
            }`}
          >
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-xs text-neutral-300">
                <span className="font-medium">Engage with tweet #{tweet.tweetId}</span>
                <a
                  href={tweet.tweetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-neutral-500 hover:text-yellow-300"
                  title="Open tweet in new tab"
                >
                  <FiExternalLink size={11} />
                </a>
              </div>
              <div className="mt-0.5 text-[10px] text-neutral-500">
                Like · comment · repost · then claim
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs font-semibold text-yellow-300 tabular-nums">
                +{tweet.creditsPerClaim}
              </div>
              {tweet.claimed ? (
                <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-emerald-400">
                  <FiCheck size={10} /> Claimed
                </div>
              ) : (
                <button
                  onClick={() => claim.mutate(tweet.id)}
                  disabled={claim.isPending}
                  className="mt-1 rounded bg-yellow-500 px-2 py-0.5 text-[10px] font-semibold text-black transition-colors hover:bg-yellow-400 disabled:opacity-50"
                >
                  {claim.isPending ? '…' : 'Claim'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
