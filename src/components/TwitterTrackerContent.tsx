"use client";

import React, { useState, useEffect, useRef } from "react";
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

  // Load Twitter accounts
  const loadTwitterAccounts = async () => {
    try {
      const accounts = await getTrackedTwitterAccounts(user?.bearerToken || "");
      setTwitterAccounts(accounts);
    } catch (error) {
      console.error("Failed to load tracked Twitter accounts:", error);
      setTwitterAccounts([]);
    }
  };

  // Load Twitter feed
  const loadTwitterFeed = async () => {
    if (twitterAccounts.length === 0) {
      setTwitterFeed([]);
      setLoadingTwitterFeed(false);
      return;
    }

    setLoadingTwitterFeed(true);
    try {
      let feed: Tweet[] = [];

      if (selectedTwitterUser) {
        // Load tweets from specific user
        const userTweets = await getUserTweets(selectedTwitterUser, 20);
        feed = userTweets;
      } else {
        // Load combined feed from all accounts
        const combinedFeed = await getTwitterFeed(
          twitterAccounts.map((acc) => acc.username),
          20,
          user?.bearerToken,
        );
        feed = combinedFeed;
      }

      // Sort by date (newest first)
      feed.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setTwitterFeed(feed);
    } catch (error) {
      console.error("Failed to load Twitter feed:", error);
      setTwitterFeed([]);
    } finally {
      setLoadingTwitterFeed(false);
    }
  };

  useEffect(() => {
    loadTwitterAccounts();
  }, [user?.id]);

  useEffect(() => {
    if (twitterTab !== 1) return;
    if (twitterAccounts.length === 0) {
      setTwitterFeed([]);
      return;
    }
    loadTwitterFeed();
  }, [twitterTab, twitterAccounts, selectedTwitterUser]);

  // Real-time tweet subscription. One WS connection, re-subscribed whenever
  // the tracked-accounts set changes. Inserts new tweets at the head of the
  // feed; dedupes by id so a poll → WS race never produces visible dupes.
  const wsRef = useRef<TwitterTrackerWebSocket | null>(null);
  const subscribedHandlesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    if (!wsRef.current) {
      wsRef.current = createTwitterTrackerWebSocket((tweet) => {
        const tweetUser = (tweet.authorUsername || "").toLowerCase();
        if (
          selectedTwitterUser &&
          tweetUser !== selectedTwitterUser.toLowerCase()
        ) {
          return;
        }
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
  }, [user, twitterAccounts, selectedTwitterUser]);

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
      await loadTwitterAccounts();
    } catch (error: any) {
      console.error("Failed to add Twitter account:", error);
      throw error;
    }
  };

  const handleRemoveTwitterAccount = async (username: string) => {
    try {
      await removeTrackedTwitterAccount(username, user?.bearerToken || "");
      await loadTwitterAccounts();
      // Clear feed if removed user was selected
      if (selectedTwitterUser === username) {
        setSelectedTwitterUser(null);
      }
    } catch (error) {
      console.error("Failed to remove Twitter account:", error);
    }
  };

  const handleViewTwitterProfile = (username: string) => {
    setSelectedTwitterUser(username);
    setTwitterTab(1); // Switch to feed tab
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
            {twitterAccounts.length === 0 ? (
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
                    {twitterAccounts.map((account) => (
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
            {twitterAccounts.length === 0 ? (
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
            ) : twitterFeed.length === 0 ? (
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
                {twitterFeed.map((tweet) => (
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
                      <span>💬 {tweet.replyCount || 0}</span>
                      <span>🔁 {tweet.retweetCount || 0}</span>
                      <span>❤️ {tweet.likeCount || 0}</span>
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
