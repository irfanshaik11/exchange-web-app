import { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Copy, Gift, Users, Wallet } from "lucide-react";
import Header from "~/components/Header";
import InterstateButton from "~/components/InterstateButton";
import Footer from "~/components/Footer";
import { useUser } from "~/components/UserContext";
import {
  fetchReferralCodeForUser,
  fetchReferrals,
  useReferralWebSocket,
  type ReferredUser,
  type ReferralsResponse,
} from "~/utils/referrals";
import { toast } from "react-hot-toast";

export default function RewardsPage() {
  const router = useRouter();
  const { user } = useUser();
  
  // Get current chain from query parameter, default to 'sol'
  const currentChain = (router.query.chain as string) || 'sol';
  const currencySymbol = currentChain === 'monad' ? 'MON' : 'SOL';
  const [copied, setCopied] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [loadingReferral, setLoadingReferral] = useState(false);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<ReferredUser[]>([]);
  const [totalVolume, setTotalVolume] = useState(0);
  const [totalReferrals, setTotalReferrals] = useState(0);
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  // Always use production URL for referral links so social previews work
  // (localhost links won't show OG previews in Slack/Discord/etc)
  const REFERRAL_BASE_URL = "https://app.interstate.so";
  const referralLink = referralCode
    ? `${REFERRAL_BASE_URL}?referrer=${referralCode}`
    : "";

  // Real-time referral updates via WebSocket
  const handleNewReferral = useCallback((message: any) => {
    if (message.data?.newUserName) {
      toast.success(`🎉 ${message.data.newUserName} just joined using your referral code!`, {
        duration: 5000,
      });
    }
  }, []);

  const handleStatsUpdate = useCallback((stats: ReferralsResponse) => {
    setReferrals(stats.referrals);
    setTotalVolume(stats.totalVolume);
    setTotalReferrals(stats.totalReferrals);
  }, []);

  // Connect to WebSocket for real-time updates
  useReferralWebSocket(
    user?.id ? Number(user.id) : null,
    handleNewReferral,
    handleStatsUpdate
  );

  useEffect(() => {
    let cancelled = false;

    if (!user?.bearerToken) {
      setReferralCode(null);
      setReferralError(null);
      setLoadingReferral(false);
      setReferrals([]);
      setTotalVolume(0);
      setTotalReferrals(0);
      return () => {
        cancelled = true;
      };
    }

    const loadReferralData = async () => {
      try {
        setLoadingReferral(true);
        setLoadingReferrals(true);
        setReferralError(null);

        // Fetch referral code and referrals list in parallel
        const [codeRecord, referralsData] = await Promise.all([
          fetchReferralCodeForUser(user.bearerToken).catch(() => null),
          fetchReferrals(user.bearerToken).catch(() => ({
            referrals: [],
            totalVolume: 0,
            totalReferrals: 0,
          })),
        ]);

        if (cancelled) return;

        if (codeRecord) {
          setReferralCode(codeRecord.referralCode);
        } else {
          setReferralCode(null);
        }

        setReferrals(referralsData.referrals);
        setTotalVolume(referralsData.totalVolume);
        setTotalReferrals(referralsData.totalReferrals);
        setCopied(false);
      } catch (error: any) {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load referral data";
        setReferralError(message);
        setReferralCode(null);
      } finally {
        if (!cancelled) {
          setLoadingReferral(false);
          setLoadingReferrals(false);
        }
      }
    };

    loadReferralData();

    return () => {
      cancelled = true;
    };
  }, [user?.bearerToken]);

  const handleCopy = useCallback(async () => {
    try {
      if (!referralLink) {
        console.warn("No referral link available to copy.");
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

  return (
    <>
      <Head>
        <title>Referrals | Interstate Memeboard</title>
      </Head>
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-100">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 pt-16 pb-24 sm:px-8 lg:px-10">
          <section className="space-y-12">
            {/* Hide header, stats cards, and referral table when chain is Monad */}

            <>
              <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div className="space-y-3">
                  <p className="text-xs tracking-[0.35em] text-neutral-500 uppercase">
                    Referrals
                  </p>
                  <h1 className="text-4xl font-semibold text-[#f0f5f5] sm:text-5xl">
                    Share Interstate. Earn more.
                  </h1>
                  <p className="max-w-xl text-sm text-neutral-400 sm:text-base">
                    Invite traders to Interstate Memeboard and collect rewards
                    every time your network makes a move.
                  </p>
                </div>
                <InterstateButton
                  size="lg"
                  className="w-full max-w-xs md:w-auto"
                  variant="primary"
                >
                  Claim {currencySymbol}
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
                    <p className="mt-6 text-5xl font-semibold text-[#f0f5f5]">
                      {loadingReferrals ? "..." : totalReferrals}
                    </p>
                    <div className="mt-5 grid gap-2 text-sm text-neutral-400">
                      <div className="flex items-center justify-between rounded-2xl border border-neutral-800/80 bg-neutral-900/70 px-4 py-2">
                        <span className="flex items-center gap-2 text-neutral-300">
                          <Wallet className="h-4 w-4 text-fuchsia-400" />
                          Total Volume
                        </span>
                        <span className="font-medium text-[#f0f5f5]">
                          ${loadingReferrals ? "..." : totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
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
                          0 <span className="text-xl text-neutral-500">{currencySymbol}</span>
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
                            <span className="text-base text-neutral-500">{currencySymbol}</span>
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
                      Claim {currencySymbol}
                    </InterstateButton>
                  </div>
                </div>

              {/* Always show "Share & earn with your link" section */}
              <div className="flex flex-col justify-between rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-950/90 via-neutral-900/80 to-neutral-950/90 px-8 py-10 shadow-2xl shadow-purple-900/20">
                <div className="space-y-6">
                  <h2 className="text-2xl font-semibold text-[#f0f5f5]">
                    Share &amp; earn with your link
                  </h2>
                  <p className="mt-3 max-w-xl text-sm text-neutral-400">
                    Drop your link in group chats, on X, or with your alpha
                    group. Every trader that joins keeps fueling your rewards.
                  </p>
                  <div className="rounded-3xl border border-neutral-800 bg-neutral-950/60 px-6 py-5 text-sm shadow-inner shadow-black/40">
                    <p className="text-xs tracking-[0.3em] text-neutral-500 uppercase">
                      Referral code
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-[#f0f5f5]">
                      {loadingReferral
                        ? "Loading..."
                        : (referralCode ?? "------")}
                    </p>
                    <p className="mt-2 text-xs text-neutral-500">
                      Share your code to link every trader you invite
                      directly to your rewards.
                    </p>
                    {referralError && (
                      <p className="mt-3 text-xs text-red-400">
                        {referralError}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                  <div className="flex flex-1 items-center justify-between gap-4 rounded-full border border-neutral-800 bg-neutral-950/60 px-5 py-3 font-mono text-sm text-neutral-200 shadow-inner shadow-black/40">
                    <span className="truncate">
                      {referralLink ||
                        "Sign in to get your referral link"}
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

              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <button className="rounded-full border border-neutral-800 bg-neutral-900/70 px-5 py-2 text-xs font-semibold tracking-[0.25em] text-neutral-200 uppercase transition hover:border-neutral-700 hover:text-[#f0f5f5]">
                    My Referrals
                  </button>
                  <button className="rounded-full border border-neutral-900/60 bg-neutral-950/40 px-5 py-2 text-xs font-semibold tracking-[0.25em] text-neutral-600 uppercase transition hover:border-neutral-800 hover:text-neutral-300">
                    Leaderboard (soon)
                  </button>
                </div>

                <div className="overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950/60 shadow-xl shadow-black/20">
                  <div className="border-b border-neutral-800 bg-neutral-900/70 px-6 py-4 text-xs tracking-[0.3em] text-neutral-500 uppercase">
                    My Referred Users
                  </div>
                  <table className="w-full text-left text-sm text-neutral-300">
                    <thead className="bg-neutral-950/60 text-neutral-500">
                      <tr>
                        <th className="px-6 py-4 font-medium">User</th>
                        <th className="px-6 py-4 font-medium">Joined</th>
                        <th className="px-6 py-4 font-medium">
                          Trading Volume
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingReferrals ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-6 py-8 text-center text-neutral-500"
                          >
                            Loading referrals...
                          </td>
                        </tr>
                      ) : referrals.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-6 py-8 text-center text-neutral-500"
                          >
                            No referrals yet. Share your referral link to start
                            earning!
                          </td>
                        </tr>
                      ) : (
                        referrals.map((referral) => (
                          <tr
                            key={referral.id}
                            className="border-t border-neutral-900/80 text-neutral-200"
                          >
                            <td className="px-6 py-5 align-top">
                              <div className="text-base font-semibold text-[#f0f5f5]">
                                {referral.name}
                              </div>
                              <p className="mt-1 text-xs text-neutral-500">
                                {referral.email}
                              </p>
                            </td>
                            <td className="px-6 py-5 align-top text-neutral-400">
                              {new Date(referral.joinedAt).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-5 align-top">
                              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300">
                                $
                                {referral.totalVolume.toLocaleString(
                                  undefined,
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  },
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          </section>
        </main>

        {/* Footer */}
        <Footer />
      </div>
    </>
  );
}
