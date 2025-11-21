import { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import { Copy, Gift, Users, Wallet, Trophy, Medal } from "lucide-react";
import Header from "~/components/Header";
import InterstateButton from "~/components/InterstateButton";
import Footer from '~/components/Footer';
import { useUser } from "~/components/UserContext";
import { ensureReferralCodeForUser, fetchReferralCodeForUser, getReferralLeaderboard, type LeaderboardEntry } from "~/utils/referrals";

const referralRows = [
  {
    level: "Direct",
    summary:
      "Friends you invite directly earn you boosted rewards on every trade.",
    solRewards: "0 SOL",
    xccRewards: "0 XCC",
  },
  {
    level: "Indirect",
    summary:
      "When your referrals invite others, you keep earning from their activity too.",
    solRewards: "0 SOL",
    xccRewards: "0 XCC",
  },
];

type ViewMode = "my-referrals" | "leaderboard";

export default function RewardsPage() {
  const { user, refreshUser } = useUser();
  const [copied, setCopied] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [loadingReferral, setLoadingReferral] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("my-referrals");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const referralLink = referralCode
    ? `https://app.narrative.trade?referrer=${referralCode}`
    : "";

  useEffect(() => {
    let cancelled = false;

    if (!user?.id) {
      setReferralCode(null);
      setReferralError(null);
      setLoadingReferral(false);
      return () => {
        cancelled = true;
      };
    }

    const loadReferral = async () => {
      try {
        setLoadingReferral(true);
        setReferralError(null);
        if (!user.bearerToken || !user.id) {
          setReferralCode(null);
          return;
        }
        const record = await fetchReferralCodeForUser(user.bearerToken, user.id);
        if (cancelled) return;
        if (record) {
          setReferralCode(record.referralCode);
        } else {
          setReferralCode(null);
        }
        setCopied(false);
      } catch (error: any) {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load referral code";
        setReferralError(message);
        setReferralCode(null);
      } finally {
        if (!cancelled) {
          setLoadingReferral(false);
        }
      }
    };

    loadReferral();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleGenerateCode = useCallback(async () => {
    if (!user?.id || !user?.bearerToken) {
      setReferralError("Sign in to generate a referral code.");
      return;
    }

    try {
      setIsGenerating(true);
      setReferralError(null);
      
      // Verify token exists before making the request
      if (!user.bearerToken || user.bearerToken.trim() === '') {
        setReferralError("Authentication token is missing. Please sign in again.");
        return;
      }

      // Try to refresh user token first to ensure it's valid
      try {
        await refreshUser();
      } catch (refreshError) {
        console.warn("Failed to refresh user token:", refreshError);
        // Continue anyway with existing token
      }

      const record = await ensureReferralCodeForUser(user.bearerToken);
      setReferralCode(record.referralCode);
      setCopied(false);
    } catch (error: any) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to generate referral code";
      
      // Check if it's an authentication error and suggest signing in again
      if (message.includes('token') || message.includes('Invalid') || message.includes('expired') || message.includes('403') || message.includes('401')) {
        setReferralError(`${message}. Please try signing out and signing in again.`);
        // Optionally refresh user to get a new token
        try {
          await refreshUser();
        } catch (refreshError) {
          console.error("Failed to refresh user after error:", refreshError);
        }
      } else {
        setReferralError(message);
      }
    } finally {
      setIsGenerating(false);
    }
  }, [user?.id, user?.bearerToken]);

  const handleCopy = useCallback(async () => {
    try {
      if (!referralLink) {
        console.warn("Generate a referral code before copying the link.");
        return;
      }
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        console.warn("Clipboard API is not available in this environment.");
        return;
      }
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error("Unable to copy referral link", error);
    }
  }, [referralLink]);

  useEffect(() => {
    if (viewMode === "leaderboard") {
      const loadLeaderboard = async () => {
        try {
          setLoadingLeaderboard(true);
          const response = await getReferralLeaderboard(50, 0);
          setLeaderboard(response.data);
        } catch (error) {
          console.error("Failed to load leaderboard:", error);
          setLeaderboard([]);
        } finally {
          setLoadingLeaderboard(false);
        }
      };
      loadLeaderboard();
    }
  }, [viewMode]);

  return (
    <>
      <Head>
        <title>Referrals | Interstate Memeboard</title>
      </Head>
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-100">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 pt-16 pb-24 sm:px-8 lg:px-10">
          <section className="space-y-12">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="space-y-3">
                <p className="text-xs tracking-[0.35em] text-neutral-500 uppercase">
                  Referrals
                </p>
                <h1 className="text-4xl font-semibold text-[#f0f5f5] sm:text-5xl">
                  Share Narrative. Earn more.
                </h1>
                <p className="max-w-xl text-sm text-neutral-400 sm:text-base">
                  Invite traders to Narrative Memeboard and collect rewards
                  every time your network makes a move.
                </p>
              </div>
              <InterstateButton
                size="lg"
                className="w-full max-w-xs md:w-auto"
                variant="primary"
              >
                Claim SOL
              </InterstateButton>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              <div className="rounded-3xl border border-neutral-800 bg-neutral-950/50 p-6 shadow-xl shadow-black/20">
                <div className="flex items-center justify-between">
                  <div className="rounded-2xl bg-gradient-to-br from-fuchsia-600/80 via-purple-600/60 to-indigo-700/60 p-3">
                    <Users className="h-5 w-5 text-[#f0f5f5]" />
                  </div>
                  <span className="text-xs tracking-[0.3em] text-neutral-600 uppercase">
                    Total Referrals
                  </span>
                </div>
                <p className="mt-6 text-5xl font-semibold text-[#f0f5f5]">0</p>
                <div className="mt-5 grid gap-2 text-sm text-neutral-400">
                  <div className="flex items-center justify-between rounded-2xl border border-neutral-800/80 bg-neutral-900/70 px-4 py-2">
                    <span className="flex items-center gap-2 text-neutral-300">
                      <Users className="h-4 w-4 text-fuchsia-400" />
                      Direct
                    </span>
                    <span className="font-medium text-[#f0f5f5]">0</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-neutral-800/80 bg-neutral-900/70 px-4 py-2">
                    <span className="flex items-center gap-2 text-neutral-300">
                      <Users className="h-4 w-4 text-violet-400" />
                      Indirect
                    </span>
                    <span className="font-medium text-[#f0f5f5]">0</span>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-neutral-800 bg-neutral-950/50 p-6 shadow-xl shadow-black/20">
                <div className="flex items-center justify-between">
                  <div className="rounded-2xl bg-gradient-to-br from-fuchsia-600/80 via-purple-600/60 to-pink-600/60 p-3">
                    <Wallet className="h-5 w-5 text-[#f0f5f5]" />
                  </div>
                  <span className="text-xs tracking-[0.3em] text-neutral-600 uppercase">
                    Total Earned
                  </span>
                </div>
                <div className="mt-6 space-y-4">
                  <div>
                    <p className="text-4xl font-semibold text-[#f0f5f5]">
                      0 <span className="text-xl text-neutral-500">SOL</span>
                    </p>
                    <p className="text-sm text-neutral-500">$0.00</p>
                  </div>
                  <div>
                    <p className="text-4xl font-semibold text-[#f0f5f5]">
                      0 <span className="text-xl text-neutral-500">XCC</span>
                    </p>
                    <p className="text-sm text-neutral-500">Protocol rewards</p>
                  </div>
                </div>
              </div>

              <div className="flex h-full flex-col justify-between rounded-3xl border border-neutral-800 bg-neutral-950/50 p-6 shadow-xl shadow-black/20">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="rounded-2xl bg-gradient-to-br from-fuchsia-600/80 via-purple-600/60 to-pink-600/60 p-3">
                      <Gift className="h-5 w-5 text-[#f0f5f5]" />
                    </div>
                    <span className="text-xs tracking-[0.3em] text-neutral-600 uppercase">
                      Available to Claim
                    </span>
                  </div>
                  <div className="mt-6 space-y-3">
                    <div>
                      <p className="text-3xl font-semibold text-[#f0f5f5]">
                        0{" "}
                        <span className="text-base text-neutral-500">SOL</span>
                      </p>
                      <p className="text-xs text-neutral-500">
                        Locked until rewards settle
                      </p>
                    </div>
                    <div>
                      <p className="text-3xl font-semibold text-[#f0f5f5]">
                        0{" "}
                        <span className="text-base text-neutral-500">XCC</span>
                      </p>
                      <p className="text-xs text-neutral-500">
                        Track network activity to unlock more
                      </p>
                    </div>
                  </div>
                </div>
                <InterstateButton
                  className="mt-8 w-full"
                  size="md"
                  variant="secondary"
                >
                  Claim SOL
                </InterstateButton>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setViewMode("my-referrals")}
                  className={`rounded-full border px-5 py-2 text-xs font-semibold tracking-[0.25em] uppercase transition ${
                    viewMode === "my-referrals"
                      ? "border-neutral-800 bg-neutral-900/70 text-neutral-200 hover:border-neutral-700 hover:text-[#f0f5f5]"
                      : "border-neutral-900/60 bg-neutral-950/40 text-neutral-600 hover:border-neutral-800 hover:text-neutral-300"
                  }`}
                >
                  My Referrals
                </button>
                <button
                  onClick={() => setViewMode("leaderboard")}
                  className={`rounded-full border px-5 py-2 text-xs font-semibold tracking-[0.25em] uppercase transition ${
                    viewMode === "leaderboard"
                      ? "border-neutral-800 bg-neutral-900/70 text-neutral-200 hover:border-neutral-700 hover:text-[#f0f5f5]"
                      : "border-neutral-900/60 bg-neutral-950/40 text-neutral-600 hover:border-neutral-800 hover:text-neutral-300"
                  }`}
                >
                  Leaderboard
                </button>
              </div>

              {viewMode === "my-referrals" ? (
                <div className="overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950/60 shadow-xl shadow-black/20">
                  <div className="border-b border-neutral-800 bg-neutral-900/70 px-6 py-4 text-xs tracking-[0.3em] text-neutral-500 uppercase">
                    Referral Rewards
                  </div>
                  <table className="w-full text-left text-sm text-neutral-300">
                    <thead className="bg-neutral-950/60 text-neutral-500">
                      <tr>
                        <th className="px-6 py-4 font-medium">Referral Level</th>
                        <th className="px-6 py-4 font-medium">SOL Rewards</th>
                        <th className="px-6 py-4 font-medium">XCC Rewards</th>
                      </tr>
                    </thead>
                    <tbody>
                      {referralRows.map((row) => (
                        <tr
                          key={row.level}
                          className="border-t border-neutral-900/80 text-neutral-200"
                        >
                          <td className="px-6 py-5 align-top">
                            <div className="text-base font-semibold text-[#f0f5f5]">
                              {row.level}
                            </div>
                            <p className="mt-2 max-w-md text-xs text-neutral-500">
                              {row.summary}
                            </p>
                          </td>
                          <td className="px-6 py-5 align-top">
                            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300">
                              {row.solRewards}
                            </div>
                          </td>
                          <td className="px-6 py-5 align-top">
                            <div className="rounded-2xl border border-fuchsia-500/40 bg-fuchsia-600/10 px-4 py-2 text-sm font-medium text-fuchsia-200">
                              {row.xccRewards}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950/60 shadow-xl shadow-black/20">
                  <div className="border-b border-neutral-800 bg-neutral-900/70 px-6 py-4 text-xs tracking-[0.3em] text-neutral-500 uppercase">
                    Top Traders (Referred Users)
                  </div>
                  {loadingLeaderboard ? (
                    <div className="px-6 py-12 text-center text-neutral-400">
                      Loading leaderboard...
                    </div>
                  ) : leaderboard.length === 0 ? (
                    <div className="px-6 py-12 text-center text-neutral-400">
                      No referrals yet. Be the first to invite friends!
                    </div>
              ) : (
                <div className="divide-y divide-neutral-800">
                  {leaderboard.map((entry, index) => {
                    const isCurrentUser = user?.id === entry.userId || user?.id === String(entry.userId);
                    const getRankIcon = () => {
                      if (index === 0) return <Trophy className="h-5 w-5 text-yellow-400" />;
                      if (index === 1) return <Medal className="h-5 w-5 text-gray-300" />;
                      if (index === 2) return <Medal className="h-5 w-5 text-amber-600" />;
                      return <span className="text-neutral-500 font-semibold">#{index + 1}</span>;
                    };

                    const formatVolume = (volume: number) => {
                      if (volume >= 1000000) return `$${(volume / 1000000).toFixed(2)}M`;
                      if (volume >= 1000) return `$${(volume / 1000).toFixed(2)}K`;
                      return `$${volume.toFixed(2)}`;
                    };

                    return (
                      <div
                        key={entry.id}
                        className={`px-6 py-4 flex items-center justify-between transition ${
                          isCurrentUser
                            ? "bg-neutral-900/50 border-l-2 border-fuchsia-500"
                            : "hover:bg-neutral-900/30"
                        }`}
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="w-8 flex items-center justify-center flex-shrink-0">
                            {getRankIcon()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-[#f0f5f5] truncate">
                                {entry.userName || entry.userEmail || `User ${entry.userId}`}
                              </span>
                              {isCurrentUser && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30 flex-shrink-0">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="flex items-center mt-1">
															<span className="text-xs text-neutral-500">
																{entry.totalTrades} {entry.totalTrades === 1 ? "trade" : "trades"}
															</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right ml-4 flex-shrink-0">
                          <div className="text-lg font-semibold text-[#f0f5f5]">
                            {formatVolume(entry.totalTradingVolume)}
                          </div>
                          <div className="text-xs text-neutral-500">Volume</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
                </div>
              )}
            </div>

            <div className="flex flex-col justify-between rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-950/90 via-neutral-900/80 to-neutral-950/90 px-8 py-10 shadow-2xl shadow-purple-900/20">
              <div className="space-y-6">
                <h2 className="text-2xl font-semibold text-[#f0f5f5]">
                  Share &amp; earn with your link
                </h2>
                <p className="mt-3 max-w-xl text-sm text-neutral-400">
                  Drop your link in group chats, on X, or with your alpha group.
                  Every trader that joins keeps fueling your rewards.
                </p>
                {!referralCode && (
                  <InterstateButton
                    className="w-full sm:w-auto"
                    disabled={loadingReferral || isGenerating || !user?.id}
                    onClick={() => {
                      void handleGenerateCode();
                    }}
                    size="md"
                    variant="primary"
                  >
                    {isGenerating ? "Generating..." : "Generate referral code"}
                  </InterstateButton>
                )}
                <div className="rounded-3xl border border-neutral-800 bg-neutral-950/60 px-6 py-5 text-sm shadow-inner shadow-black/40">
                  <p className="text-xs tracking-[0.3em] text-neutral-500 uppercase">
                    Referral code
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-[#f0f5f5]">
                    {loadingReferral
                      ? "Loading..."
                      : referralCode ?? "------"}
                  </p>
                  <p className="mt-2 text-xs text-neutral-500">
                    Generate your code to link every trader you invite directly
                    to your rewards.
                  </p>
                  {referralError && (
                    <p className="mt-3 text-xs text-red-400">{referralError}</p>
                  )}
                </div>
              </div>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <div className="flex flex-1 items-center justify-between gap-4 rounded-full border border-neutral-800 bg-neutral-950/60 px-5 py-3 font-mono text-sm text-neutral-200 shadow-inner shadow-black/40">
                  <span className="truncate">
                    {referralLink ||
                      "Generate a referral code to unlock your link"}
                  </span>
                </div>
                <InterstateButton
                  className="sm:w-auto"
                  disabled={!referralLink}
                  icon={<Copy className="h-4 w-4" />}
                  onClick={handleCopy}
                  variant="primary"
                >
                  {copied ? "Copied!" : "Copy link"}
                </InterstateButton>
              </div>
            </div>
          </section>
        </main>
				
				{/* Footer */}
				<Footer />
      </div>
    </>
  );
}
