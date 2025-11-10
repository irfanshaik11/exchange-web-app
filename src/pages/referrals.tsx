import { useCallback, useState } from "react";
import Head from "next/head";
import { Copy, Gift, Users, Wallet } from "lucide-react";
import Header from "~/components/Header";
import InterstateButton from "~/components/InterstateButton";
import Footer from '~/components/Footer';

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

export default function ReferralsPage() {
  const [copied, setCopied] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const referralLink = referralCode
    ? `https://app.narrative.trade?referrer=${referralCode}`
    : "";

  const handleGenerateCode = useCallback(() => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let index = 0; index < 6; index += 1) {
      const randomIndex = Math.floor(Math.random() * alphabet.length);
      code += alphabet[randomIndex];
    }
    setReferralCode(code);
    setCopied(false);
  }, []);

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
                <h1 className="text-4xl font-semibold text-white sm:text-5xl">
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
                    <Users className="h-5 w-5 text-white" />
                  </div>
                  <span className="text-xs tracking-[0.3em] text-neutral-600 uppercase">
                    Total Referrals
                  </span>
                </div>
                <p className="mt-6 text-5xl font-semibold text-white">0</p>
                <div className="mt-5 grid gap-2 text-sm text-neutral-400">
                  <div className="flex items-center justify-between rounded-2xl border border-neutral-800/80 bg-neutral-900/70 px-4 py-2">
                    <span className="flex items-center gap-2 text-neutral-300">
                      <Users className="h-4 w-4 text-fuchsia-400" />
                      Direct
                    </span>
                    <span className="font-medium text-white">0</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-neutral-800/80 bg-neutral-900/70 px-4 py-2">
                    <span className="flex items-center gap-2 text-neutral-300">
                      <Users className="h-4 w-4 text-violet-400" />
                      Indirect
                    </span>
                    <span className="font-medium text-white">0</span>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-neutral-800 bg-neutral-950/50 p-6 shadow-xl shadow-black/20">
                <div className="flex items-center justify-between">
                  <div className="rounded-2xl bg-gradient-to-br from-fuchsia-600/80 via-purple-600/60 to-pink-600/60 p-3">
                    <Wallet className="h-5 w-5 text-white" />
                  </div>
                  <span className="text-xs tracking-[0.3em] text-neutral-600 uppercase">
                    Total Earned
                  </span>
                </div>
                <div className="mt-6 space-y-4">
                  <div>
                    <p className="text-4xl font-semibold text-white">
                      0 <span className="text-xl text-neutral-500">SOL</span>
                    </p>
                    <p className="text-sm text-neutral-500">$0.00</p>
                  </div>
                  <div>
                    <p className="text-4xl font-semibold text-white">
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
                      <Gift className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-xs tracking-[0.3em] text-neutral-600 uppercase">
                      Available to Claim
                    </span>
                  </div>
                  <div className="mt-6 space-y-3">
                    <div>
                      <p className="text-3xl font-semibold text-white">
                        0{" "}
                        <span className="text-base text-neutral-500">SOL</span>
                      </p>
                      <p className="text-xs text-neutral-500">
                        Locked until rewards settle
                      </p>
                    </div>
                    <div>
                      <p className="text-3xl font-semibold text-white">
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
                <button className="rounded-full border border-neutral-800 bg-neutral-900/70 px-5 py-2 text-xs font-semibold tracking-[0.25em] text-neutral-200 uppercase transition hover:border-neutral-700 hover:text-white">
                  My Referrals
                </button>
                <button className="rounded-full border border-neutral-900/60 bg-neutral-950/40 px-5 py-2 text-xs font-semibold tracking-[0.25em] text-neutral-600 uppercase transition hover:border-neutral-800 hover:text-neutral-300">
                  Leaderboard (soon)
                </button>
              </div>

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
                          <div className="text-base font-semibold text-white">
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
            </div>

            <div className="flex flex-col justify-between rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-950/90 via-neutral-900/80 to-neutral-950/90 px-8 py-10 shadow-2xl shadow-purple-900/20">
              <div className="space-y-6">
                <h2 className="text-2xl font-semibold text-white">
                  Share &amp; earn with your link
                </h2>
                <p className="mt-3 max-w-xl text-sm text-neutral-400">
                  Drop your link in group chats, on X, or with your alpha group.
                  Every trader that joins keeps fueling your rewards.
                </p>
                {!referralCode && (
                  <InterstateButton
                    className="w-full sm:w-auto"
                    onClick={handleGenerateCode}
                    size="md"
                    variant="primary"
                  >
                    Generate referral code
                  </InterstateButton>
                )}
                <div className="rounded-3xl border border-neutral-800 bg-neutral-950/60 px-6 py-5 text-sm shadow-inner shadow-black/40">
                  <p className="text-xs tracking-[0.3em] text-neutral-500 uppercase">
                    Referral code
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-white">
                    {referralCode ?? "------"}
                  </p>
                  <p className="mt-2 text-xs text-neutral-500">
                    Generate your code to link every trader you invite directly
                    to your rewards.
                  </p>
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
