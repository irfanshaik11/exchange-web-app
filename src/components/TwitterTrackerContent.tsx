"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { FiHeart, FiMessageCircle, FiRepeat } from "react-icons/fi";
import { useUser } from "./UserContext";
import AddTwitterHandleModal from "./AddTwitterHandleModal";
import TwitterAccountRow from "./TwitterAccountRow";
import {
  addTrackedTwitterAccount,
  removeTrackedTwitterAccount,
  getTrackedTwitterAccounts,
  getTwitterFeed,
  getUserTweets,
  createTwitterTrackerWebSocket,
  type TwitterAccount,
  type Tweet,
  type TwitterTrackerWebSocket,
} from "~/utils/twitterTracking";

const TWITTER_TABS = ["Tracked Accounts", "X Feed"];

export default function TwitterTrackerContent() {
  const { user } = useUser();
  const [twitterTab, setTwitterTab] = useState(0);
  const [twitterAccounts, setTwitterAccounts] = useState<TwitterAccount[]>([]);
  const [twitterFeed, setTwitterFeed] = useState<Tweet[]>([]);
  const [loadingTwitterFeed, setLoadingTwitterFeed] = useState(false);
  const [showAddTwitterModal, setShowAddTwitterModal] = useState(false);
  const [selectedTwitterUser, setSelectedTwitterUser] = useState<string | null>(
    null,
  );
  // Retry trigger for the per-user fetch effect. Re-clicking View re-runs.
  const [viewRequestCount, setViewRequestCount] = useState(0);
  // See trackers.tsx — same per-user fetch tracker. Without this the
  // merged-feed loader (loadTwitterFeed, ~50ms cached-only) clears the
  // spinner while the per-user cold-start is still polling upstream for
  // ~10-18s, flashing "No tweets yet" until the cold-start lands.
  const perUserFetchInFlight = useRef(0);

  // Tombstones — usernames the user just removed. Stored as state so the
  // render-time filter below re-runs when they change. Applied at render
  // time, so a removed row CANNOT appear on screen regardless of what
  // `twitterAccounts` contains. Auto-retires once the server confirms the
  // row is gone.
  const [removedTwitterUsernames, setRemovedTwitterUsernames] = useState<
    Set<string>
  >(new Set());

  // Load Twitter accounts. `fresh` bypasses the browser HTTP cache.
  const loadTwitterAccounts = async (opts: { fresh?: boolean } = {}) => {
    try {
      const accounts = await getTrackedTwitterAccounts(
        user?.bearerToken || "",
        opts,
      );
      const incomingSet = new Set(
        accounts.map((a) => a.username.toLowerCase()),
      );
      setRemovedTwitterUsernames((prev) => {
        if (prev.size === 0) return prev;
        let changed = false;
        const next = new Set(prev);
        for (const t of prev) {
          if (!incomingSet.has(t)) {
            next.delete(t);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      setTwitterAccounts(accounts);
    } catch (error) {
      console.error("Failed to load tracked Twitter accounts:", error);
      setTwitterAccounts([]);
    }
  };

  const visibleTwitterAccounts = useMemo(() => {
    if (removedTwitterUsernames.size === 0) return twitterAccounts;
    return twitterAccounts.filter(
      (a) => !removedTwitterUsernames.has(a.username.toLowerCase()),
    );
  }, [twitterAccounts, removedTwitterUsernames]);

  // Load the merged feed across all tracked accounts and MERGE the result
  // into `twitterFeed` (dedup by tweet id, keep only currently-tracked
  // authors). This effect re-fires whenever `twitterAccounts` changes — most
  // commonly via the auto-retry that polls every 10s for un-enriched rows —
  // so a naive `setTwitterFeed(combined)` would constantly wipe out tweets
  // added by the per-user fetch or the WS stream. Merge semantics make every
  // write strictly additive (drop on author-untracked, never on author-not-
  // in-this-batch).
  const loadTwitterFeed = async () => {
    if (twitterAccounts.length === 0) {
      setTwitterFeed([]);
      if (perUserFetchInFlight.current === 0) setLoadingTwitterFeed(false);
      return;
    }

    // Don't toggle the spinner if a per-user cold-start is still polling
    // upstream — this fast cached-only fetch would otherwise clear the
    // spinner well before the cold-start has a chance to land tweets.
    if (perUserFetchInFlight.current === 0) setLoadingTwitterFeed(true);
    try {
      const combinedFeed = await getTwitterFeed(
        twitterAccounts.map((acc) => acc.username),
        user?.bearerToken ?? "",
        20,
      );
      const trackedSet = new Set(
        twitterAccounts.map((a) => a.username.toLowerCase()),
      );
      setTwitterFeed((prev) => {
        const seen = new Set<string>();
        const merged: Tweet[] = [];
        // Combined batch first so freshest data wins on conflict, then
        // existing tweets (from WS / per-user fetch) that aren't already in.
        for (const t of combinedFeed) {
          if (!trackedSet.has((t.authorUsername || "").toLowerCase())) continue;
          if (seen.has(t.id)) continue;
          seen.add(t.id);
          merged.push(t);
        }
        for (const t of prev) {
          if (!trackedSet.has((t.authorUsername || "").toLowerCase())) continue;
          if (seen.has(t.id)) continue;
          seen.add(t.id);
          merged.push(t);
        }
        merged.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        return merged.slice(0, 100);
      });
    } catch (error) {
      console.error("Failed to load Twitter feed:", error);
      // Do NOT wipe twitterFeed on transient fetch errors — keep whatever WS
      // and per-user fetches have already given us.
    } finally {
      // Same guard as on entry — leave spinner up if cold-start still pending.
      if (perUserFetchInFlight.current === 0) setLoadingTwitterFeed(false);
    }
  };

  useEffect(() => {
    loadTwitterAccounts();
  }, [user?.id]);

  // Auto-retry while any tracked row is still un-enriched. TwitterAPI.io
  // occasionally 429s; the backend then returns the bare DB row for that
  // handle and kicks off a background re-prime. We poll every 4s for at
  // most ~28s so the user doesn't have to manually refresh.
  //
  // The attempt counter has to live in a ref because every loadTwitterAccounts
  // call sets a fresh `twitterAccounts` array reference, which would otherwise
  // re-run this effect and reset a local counter on every tick — making the
  // "cap" fictional. The signature ref restarts the counter only when the
  // *set* of incomplete handles actually changes (e.g., user added a new one),
  // so a stuck handle is dropped after the cap instead of polling forever.
  const retryAttemptsRef = useRef(0);
  const lastIncompleteSignatureRef = useRef<string>("");

  useEffect(() => {
    if (!user || twitterAccounts.length === 0) return;

    const incompleteSignature = twitterAccounts
      .filter(
        (a) =>
          !Boolean(a.profileImageUrl) || typeof a.followers !== "number",
      )
      .map((a) => a.username.toLowerCase())
      .sort()
      .join(",");

    if (!incompleteSignature) {
      // All enriched — clean slate for whatever comes next.
      retryAttemptsRef.current = 0;
      lastIncompleteSignatureRef.current = "";
      return;
    }

    if (incompleteSignature !== lastIncompleteSignatureRef.current) {
      // Different set than the last cycle (account added/removed/just-enriched)
      // — restart the budget.
      retryAttemptsRef.current = 0;
      lastIncompleteSignatureRef.current = incompleteSignature;
    }

    // 6 × 10s = 60s budget. Newly-added handles take ~6.5s each through
    // the 5.5s global pacer; with multiple in flight the last one
    // completes ~30s out. 60s window catches them all.
    if (retryAttemptsRef.current >= 6) return;

    const id = setInterval(() => {
      retryAttemptsRef.current++;
      loadTwitterAccounts({ fresh: true });
      if (retryAttemptsRef.current >= 6) clearInterval(id);
    }, 10_000);
    return () => clearInterval(id);
  }, [user, twitterAccounts]);

  useEffect(() => {
    if (twitterTab !== 1) return;
    if (twitterAccounts.length === 0) {
      setTwitterFeed([]);
      return;
    }
    loadTwitterFeed();
    // `selectedTwitterUser` deliberately omitted — the filter is applied at
    // render time via `visibleFeed`, so changing the selection should not
    // trigger a refetch (and risk wiping the feed if the per-user cache is empty).
  }, [twitterTab, twitterAccounts]);

  // When a specific user is selected, fetch their tweets explicitly and MERGE
  // them into twitterFeed (never replace). The backend endpoint does a
  // cold-start live fetch on cache miss, so this is what actually triggers
  // upstream traffic for a handle the poller hasn't reached yet. We merge
  // instead of overwriting so a per-user empty response can't wipe the
  // existing feed — important because View can be clicked before the cache
  // has any data at all.
  useEffect(() => {
    if (!selectedTwitterUser) return;
    if (twitterTab !== 1) return;
    let cancelled = false;
    let attempts = 0;
    // 2 retries × 4s. See trackers.tsx for the rationale — used to be 5 × 8s
    // which left the user staring at a spinner for ~40s when the upstream
    // can't serve us. The circuit breaker on the backend now exits in ~1s
    // when sources are unavailable, so a long retry budget is just dead time.
    const MAX_ATTEMPTS = 2;
    const RETRY_MS = 4_000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    perUserFetchInFlight.current += 1;
    setLoadingTwitterFeed(true);
    let counted = true;
    const decrement = () => {
      if (!counted) return;
      counted = false;
      perUserFetchInFlight.current = Math.max(0, perUserFetchInFlight.current - 1);
    };
    const finish = () => {
      decrement();
      setLoadingTwitterFeed(false);
    };

    const tryOnce = async () => {
      if (cancelled) return;
      attempts++;
      try {
        const tweets = await getUserTweets(selectedTwitterUser, 20);
        if (cancelled) return;
        if (tweets.length > 0) {
          setTwitterFeed((prev) => {
            const seen = new Set(prev.map((t) => t.id));
            const fresh = tweets.filter((t) => !seen.has(t.id));
            if (fresh.length === 0) return prev;
            const merged = [...fresh, ...prev];
            merged.sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            );
            return merged.slice(0, 100);
          });
          finish();
          return;
        }
        if (attempts < MAX_ATTEMPTS) {
          retryTimer = setTimeout(tryOnce, RETRY_MS);
        } else {
          finish();
        }
      } catch (err) {
        console.error("Failed to fetch tweets for selected user:", err);
        if (!cancelled && attempts < MAX_ATTEMPTS) {
          retryTimer = setTimeout(tryOnce, RETRY_MS);
        } else if (!cancelled) {
          finish();
        }
      }
    };
    tryOnce();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      decrement();
    };
  }, [selectedTwitterUser, twitterTab, viewRequestCount]);

  // Real-time tweet subscription. One WS connection, re-subscribed whenever
  // the tracked-accounts set changes.
  //
  // The WS handler MUST stay pure (no reference to component state) — the
  // creator block only runs on the first effect pass because `wsRef.current`
  // is non-null after that, so any closure created here would capture stale
  // state forever. The "showing tweets from @x" filter therefore runs at
  // render time via the `visibleFeed` memo below.
  const wsRef = useRef<TwitterTrackerWebSocket | null>(null);
  const subscribedHandlesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    if (!wsRef.current) {
      wsRef.current = createTwitterTrackerWebSocket((tweet) => {
        setTwitterFeed((prev) => {
          if (prev.some((p) => p.id === tweet.id)) return prev;
          return [tweet, ...prev].slice(0, 50);
        });
      });
    }

    const currentHandles = new Set(
      twitterAccounts.map((a) => a.username.toLowerCase()),
    );
    const prevHandles = subscribedHandlesRef.current;

    const toAdd = [...currentHandles].filter((h) => !prevHandles.has(h));
    const toRemove = [...prevHandles].filter((h) => !currentHandles.has(h));
    if (toAdd.length > 0) wsRef.current.subscribe(toAdd);
    if (toRemove.length > 0) wsRef.current.unsubscribe(toRemove);
    subscribedHandlesRef.current = currentHandles;
  }, [user, twitterAccounts]);

  // Render-time filter: applies the currently-selected handle + tombstoned
  // (just-removed) authors to the live feed without coupling it to the WS
  // handler closure.
  const visibleFeed = useMemo(() => {
    const tombstoned = removedTwitterUsernames;
    const userTarget = selectedTwitterUser
      ? selectedTwitterUser.toLowerCase()
      : null;
    return twitterFeed.filter((t) => {
      const author = (t.authorUsername || "").toLowerCase();
      if (tombstoned.has(author)) return false;
      if (userTarget && author !== userTarget) return false;
      return true;
    });
  }, [twitterFeed, selectedTwitterUser, removedTwitterUsernames]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
      subscribedHandlesRef.current = new Set();
    };
  }, []);

  const handleAddTwitterAccount = async (username: string) => {
    try {
      await addTrackedTwitterAccount(username, user?.bearerToken || "");
      const target = username.toLowerCase();
      setRemovedTwitterUsernames((prev) => {
        if (!prev.has(target)) return prev;
        const next = new Set(prev);
        next.delete(target);
        return next;
      });
      await loadTwitterAccounts({ fresh: true });
    } catch (error: any) {
      console.error("Failed to add Twitter account:", error);
      throw error;
    }
  };

  const handleRemoveTwitterAccount = async (username: string) => {
    try {
      await removeTrackedTwitterAccount(username, user?.bearerToken || "");
      const target = username.toLowerCase();
      // Tombstone via STATE. Render-time filter (visibleTwitterAccounts memo)
      // applies this so a removed row cannot appear on screen even if
      // `twitterAccounts` itself still contains it.
      setRemovedTwitterUsernames((prev) => {
        if (prev.has(target)) return prev;
        const next = new Set(prev);
        next.add(target);
        return next;
      });
      setTwitterAccounts((prev) =>
        prev.filter((a) => a.username.toLowerCase() !== target),
      );
      setTwitterFeed((prev) =>
        prev.filter((t) => (t.authorUsername || "").toLowerCase() !== target),
      );
      if (selectedTwitterUser && selectedTwitterUser.toLowerCase() === target) {
        setSelectedTwitterUser(null);
      }
      await loadTwitterAccounts({ fresh: true });
    } catch (error) {
      console.error("Failed to remove Twitter account:", error);
    }
  };

  const handleViewTwitterProfile = (username: string) => {
    setSelectedTwitterUser(username.toLowerCase());
    setTwitterTab(1);
    setViewRequestCount((c) => c + 1);
  };

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <p className="mb-4 text-sm text-neutral-400">
            You are not logged in to Interstate
          </p>
          <button
            className="inline-flex items-center justify-center rounded-full border border-neutral-600 px-6 py-1.5 text-xs font-medium text-neutral-100 transition-colors duration-200 hover:border-neutral-400 hover:bg-neutral-800/60"
            onClick={() => {
              const event = new CustomEvent("open-login-modal");
              window.dispatchEvent(event);
            }}
          >
            Log in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#050608] px-2 sm:px-2">
      {/* Twitter Tabs Header */}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-1.5 border-b border-neutral-800/60 pt-2 pb-1.5 sm:gap-2 sm:pt-4 sm:pb-2">
        <div className="flex gap-1 sm:gap-2">
          {TWITTER_TABS.map((tab, i) => (
            <button
              key={tab}
              className={`cursor-pointer rounded-lg px-2 py-0.5 text-[10px] whitespace-nowrap transition-all duration-300 sm:px-3 sm:py-1 sm:text-xs ${
                twitterTab === i
                  ? "bg-[#70E0B0] font-medium text-neutral-900"
                  : "font-medium text-neutral-400 hover:bg-[#141414] hover:text-white"
              }`}
              onClick={() => setTwitterTab(i)}
            >
              {tab}
            </button>
          ))}
        </div>
        {twitterTab === 0 && (
          <button
            className="cursor-pointer rounded-lg px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-neutral-900 transition-all duration-300 sm:px-3 sm:py-1 sm:text-xs"
            style={{
              backgroundColor: "#70E0B0",
              border: "none",
            }}
            onClick={() => setShowAddTwitterModal(true)}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#58B890";
              e.currentTarget.style.boxShadow =
                "0 0 8px rgba(112, 224, 176, 0.3), 0 0 16px rgba(112, 224, 176, 0.15)";
              e.currentTarget.style.transform = "scale(1.02)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#70E0B0";
              e.currentTarget.style.boxShadow = "none";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            Add Handle
          </button>
        )}
      </div>

      {/* Twitter Content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {twitterTab === 0 ? (
          // Tracked Accounts Tab
          <>
            {visibleTwitterAccounts.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-8 text-center">
                <span className="mb-4 text-neutral-400">
                  No Twitter accounts tracked yet
                </span>
              </div>
            ) : (
              <div className="scrollbar-hide overflow-x-auto">
                <table className="w-full min-w-[400px] text-[10px] sm:min-w-[520px] sm:text-xs">
                  <thead className="sticky top-0 z-10 bg-[#050608]">
                    <tr className="border-b border-neutral-800/60">
                      <th className="px-1 py-1.5 text-left text-[10px] text-neutral-400 sm:px-2 sm:py-2 sm:text-sm">
                        Account
                      </th>
                      <th className="px-1 py-1.5 text-left text-[10px] text-neutral-400 sm:px-2 sm:py-2 sm:text-sm">
                        Followers
                      </th>
                      <th className="px-1 py-1.5 text-left text-[10px] text-neutral-400 sm:px-2 sm:py-2 sm:text-sm">
                        Added
                      </th>
                      <th className="px-1 py-1.5 text-right text-[10px] text-neutral-400 sm:px-2 sm:py-2 sm:text-sm">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTwitterAccounts.map((account) => (
                      <TwitterAccountRow
                        key={account.id}
                        account={account}
                        onRemove={handleRemoveTwitterAccount}
                        onViewProfile={handleViewTwitterProfile}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          // X Feed Tab
          <>
            {visibleTwitterAccounts.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-8 text-center">
                <span className="mb-4 text-neutral-400">
                  Add Twitter accounts to see their feed
                </span>
              </div>
            ) : loadingTwitterFeed ? (
              <div className="flex h-full flex-col items-center justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-400 border-t-transparent" />
                <span className="mt-4 text-neutral-400">Loading feed...</span>
              </div>
            ) : visibleFeed.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-8 text-center">
                <span className="text-neutral-400">No tweets found</span>
              </div>
            ) : (
              <div className="space-y-3 p-2">
                {selectedTwitterUser && (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-800/50 bg-neutral-900/60 px-4 py-2.5">
                    <span className="text-xs font-medium text-neutral-200">
                      Showing tweets from @{selectedTwitterUser}
                    </span>
                    <button
                      onClick={() => setSelectedTwitterUser(null)}
                      className="text-xs font-medium text-neutral-400 transition-colors duration-300 hover:text-neutral-200"
                    >
                      Show All
                    </button>
                  </div>
                )}
                {visibleFeed.map((tweet) => (
                  <div
                    key={tweet.id}
                    className="rounded-lg border border-neutral-800/50 bg-neutral-900/40 p-4 shadow-lg transition-all duration-300 hover:border-neutral-700/60 hover:bg-neutral-900/60 hover:shadow-xl"
                  >
                    {/* Tweet Header */}
                    <div className="mb-2 flex items-start gap-2">
                      {tweet.authorProfileImage ? (
                        <img
                          src={tweet.authorProfileImage}
                          alt={tweet.authorName}
                          className="h-8 w-8 rounded-full"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800 text-xs font-bold text-neutral-200">
                          {tweet.authorName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-white">
                            {tweet.authorName}
                          </span>
                          <span className="truncate text-xs text-neutral-400">
                            @{tweet.authorUsername}
                          </span>
                        </div>
                        <span className="text-xs text-neutral-500">
                          {new Date(tweet.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Tweet Text */}
                    <p className="mb-2 text-sm break-words whitespace-pre-wrap text-neutral-200">
                      {tweet.text}
                    </p>

                    {/* Tweet Images */}
                    {tweet.images && tweet.images.length > 0 && (
                      <div
                        className="mb-2 grid gap-2"
                        style={{
                          gridTemplateColumns:
                            tweet.images.length === 1
                              ? "1fr"
                              : tweet.images.length === 2
                                ? "1fr 1fr"
                                : tweet.images.length === 3
                                  ? "1fr 1fr"
                                  : "repeat(2, 1fr)",
                        }}
                      >
                        {tweet.images.map((imageUrl, idx) => (
                          <img
                            key={idx}
                            src={imageUrl}
                            alt={`Tweet image ${idx + 1}`}
                            className="h-auto max-h-96 w-full cursor-pointer rounded-lg border border-neutral-700/50 object-cover transition-opacity hover:opacity-90"
                            onClick={() => window.open(imageUrl, "_blank")}
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                        ))}
                      </div>
                    )}

                    {/* Tweet Stats */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-400">
                      <span className="inline-flex items-center gap-1">
                        <FiMessageCircle className="h-3.5 w-3.5" />
                        {tweet.replyCount || 0}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <FiRepeat className="h-3.5 w-3.5" />
                        {tweet.retweetCount || 0}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <FiHeart className="h-3.5 w-3.5" />
                        {tweet.likeCount || 0}
                      </span>
                      {tweet.url && (
                        <a
                          href={tweet.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto font-medium text-neutral-400 transition-colors duration-300 hover:text-neutral-200"
                        >
                          View on X →
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <AddTwitterHandleModal
        isOpen={showAddTwitterModal}
        onClose={() => setShowAddTwitterModal(false)}
        onAddTwitterHandle={handleAddTwitterAccount}
      />
    </div>
  );
}
