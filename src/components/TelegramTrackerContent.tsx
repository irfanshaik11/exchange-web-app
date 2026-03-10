"use client";

import React, { useState, useEffect } from "react";
import { useUser } from "./UserContext";
import TelegramChannelRow from "./TelegramChannelRow";
import { TelegramMessageBody } from "./TelegramMessageBody";
import {
  getTrackedTelegramChannels,
  addTrackedTelegramChannel,
  removeTrackedTelegramChannel,
  getApprovedTelegramChannels,
  getTelegramChannelInfo,
  getTelegramChannelFeed,
  type TelegramChannelDb,
  type TelegramChannelMessage,
} from "~/utils/telegramTracking";
import { showEnhancedToast } from "~/utils/enhancedToast";
import { FiLock, FiMessageCircle, FiPlus } from "react-icons/fi";

const TELEGRAM_TABS = ["Channels", "Messages", "Add Channels"];
const DEFAULT_TELEGRAM_CHANNELS = [
  "edenscalls",
  "gm_degencalls",
  "zen_call",
  "seekrtrending",
  "rugpullsurvivorscall",
  "drakeetl",
  "memesdontlies",
  "timefliescalls",
  "savannahcalls",
  "gogetagambles",
  "cryptotalkwithfrog",
  "kolsignal",
  "mini_degencalls",
  "dumpscallsinsane",
  "printingshitcoin",
  "managingwaste",
  "zorincalls",
  "redbullcallz",
  "robcall",
  "cncryptocurrencyinsights",
];

const FEED_LIMIT = 10;

export default function TelegramTrackerContent() {
  const { user } = useUser();
  const [telegramTab, setTelegramTab] = useState<0 | 1 | 2>(1);
  const [telegramChannels, setTelegramChannels] = useState<TelegramChannelDb[]>([]);
  const [approvedTelegramChannels, setApprovedTelegramChannels] = useState<string[]>([]);
  const [loadingTelegramChannels, setLoadingTelegramChannels] = useState(false);
  const [telegramChannelTitles, setTelegramChannelTitles] = useState<Record<string, string>>({});
  const [telegramFeed, setTelegramFeed] = useState<TelegramChannelMessage[]>([]);
  const [loadingTelegramFeed, setLoadingTelegramFeed] = useState(false);
  const [telegramFeedHint, setTelegramFeedHint] = useState<string | null>(null);
  const [addingTelegramChannel, setAddingTelegramChannel] = useState<string | null>(null);
  const [restoringTelegramDefaults, setRestoringTelegramDefaults] = useState(false);
  const [approvedChannelsSearch, setApprovedChannelsSearch] = useState("");

  const loadTelegramChannels = async () => {
    if (!user?.bearerToken) return;
    setLoadingTelegramChannels(true);
    try {
      let list = await getTrackedTelegramChannels(user.bearerToken);
      setTelegramChannels(list);
      if (list.length === 0) {
        for (const username of DEFAULT_TELEGRAM_CHANNELS) {
          try {
            await addTrackedTelegramChannel(username, user.bearerToken);
          } catch {
            // Skip if channel not approved or add fails
          }
        }
        list = await getTrackedTelegramChannels(user.bearerToken);
        setTelegramChannels(list);
      }
      const titles: Record<string, string> = {};
      await Promise.all(
        list.map(async (ch) => {
          const info = await getTelegramChannelInfo(ch.username);
          if (info?.title) titles[ch.username] = info.title;
        }),
      );
      setTelegramChannelTitles((prev) => ({ ...prev, ...titles }));
    } catch (error) {
      console.error("Failed to load Telegram channels:", error);
      setTelegramChannels([]);
    } finally {
      setLoadingTelegramChannels(false);
    }
  };

  useEffect(() => {
    if (user?.bearerToken) loadTelegramChannels();
    else setTelegramChannels([]);
  }, [user?.id]);

  useEffect(() => {
    getApprovedTelegramChannels().then(setApprovedTelegramChannels);
  }, []);

  useEffect(() => {
    if (telegramTab === 1 && user?.bearerToken && telegramChannels.length > 0) {
      loadTelegramFeed();
    }
  }, [telegramTab, user?.bearerToken, telegramChannels.length]);

  const loadTelegramFeed = async () => {
    if (!user?.bearerToken) return;
    setLoadingTelegramFeed(true);
    setTelegramFeedHint(null);
    try {
      const { messages, hint } = await getTelegramChannelFeed(user.bearerToken, FEED_LIMIT);
      setTelegramFeed(messages);
      setTelegramFeedHint(hint ?? null);
    } catch (error) {
      console.error("Failed to load Telegram feed:", error);
      setTelegramFeed([]);
      setTelegramFeedHint(null);
    } finally {
      setLoadingTelegramFeed(false);
    }
  };

  const handleAddTelegramChannel = async (username: string) => {
    try {
      await addTrackedTelegramChannel(username, user?.bearerToken || "");
      await loadTelegramChannels();
      showEnhancedToast("success", `@${username} added to tracked channels`, { duration: 3000 });
    } catch (error: unknown) {
      showEnhancedToast(
        "error",
        error instanceof Error ? error.message : "Failed to add Telegram channel",
        { duration: 4000 },
      );
      throw error;
    }
  };

  const handleRemoveTelegramChannel = async (username: string) => {
    try {
      await removeTrackedTelegramChannel(username, user?.bearerToken || "");
      await loadTelegramChannels();
      setTelegramChannelTitles((prev) => {
        const next = { ...prev };
        delete next[username];
        return next;
      });
      showEnhancedToast("success", `@${username} removed from tracked channels`, { duration: 3000 });
    } catch (error: unknown) {
      showEnhancedToast(
        "error",
        error instanceof Error ? error.message : "Failed to remove Telegram channel",
        { duration: 4000 },
      );
    }
  };

  const handleRestoreTelegramDefaults = async () => {
    if (!user?.bearerToken) return;
    setRestoringTelegramDefaults(true);
    try {
      const existing = new Set(telegramChannels.map((ch) => ch.username.toLowerCase()));
      const toAdd = DEFAULT_TELEGRAM_CHANNELS.filter(
        (username) => !existing.has(username.toLowerCase()),
      );
      for (const username of toAdd) {
        try {
          await addTrackedTelegramChannel(username, user.bearerToken);
        } catch {
          // Skip if not approved or add fails
        }
      }
      await loadTelegramChannels();
      if (toAdd.length > 0) {
        showEnhancedToast(
          "success",
          `Added ${toAdd.length} default channel${toAdd.length === 1 ? "" : "s"}.`,
          { duration: 3000 },
        );
      } else {
        showEnhancedToast("success", "All default channels already present.", { duration: 3000 });
      }
    } catch (error: unknown) {
      showEnhancedToast(
        "error",
        error instanceof Error ? error.message : "Failed to restore defaults",
        { duration: 4000 },
      );
    } finally {
      setRestoringTelegramDefaults(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
        <FiLock className="mb-3 h-10 w-10 text-neutral-700" />
        <span className="text-sm font-medium text-neutral-300">Log in to track channels</span>
        <span className="mt-1 text-xs text-neutral-500">Add Telegram channels to your watchlist</span>
        <button
          type="button"
          className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-white/[0.07]"
          onClick={() => {
            const event = new CustomEvent("open-login-modal");
            window.dispatchEvent(event);
          }}
        >
          Log in
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#050608] px-2 sm:px-2">
      <h2 className="border-b border-white/[0.04] pt-3 pb-2 text-sm font-semibold text-white sm:pt-4 sm:pb-3 sm:text-base">
        Telegram Tracker
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.04] pt-2 pb-2 sm:gap-3 sm:pt-3 sm:pb-3">
        <div className="flex gap-1.5 sm:gap-2">
          {TELEGRAM_TABS.map((label, i) => (
            <button
              key={label}
              className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-[10px] whitespace-nowrap transition-all sm:px-3 sm:py-2 sm:text-xs ${
                telegramTab === i
                  ? "border border-white/[0.08] bg-white/[0.07] font-semibold text-white"
                  : "border border-transparent font-medium text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200"
              }`}
              onClick={() => setTelegramTab(i as 0 | 1 | 2)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleRestoreTelegramDefaults}
          disabled={restoringTelegramDefaults}
          className="cursor-pointer rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-medium text-neutral-300 transition-all hover:bg-white/[0.07] hover:text-white disabled:opacity-50 sm:px-3 sm:py-2 sm:text-xs"
        >
          {restoringTelegramDefaults ? "Adding…" : "Restore to default"}
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {telegramTab === 0 ? (
          loadingTelegramChannels ? (
            <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
              <div className="mb-2 flex gap-1.5">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-500" />
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-500 [animation-delay:150ms]" />
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-500 [animation-delay:300ms]" />
              </div>
              <span className="text-xs text-neutral-500">Loading channels...</span>
            </div>
          ) : telegramChannels.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
              <FiMessageCircle className="mb-3 h-10 w-10 text-neutral-700" />
              <span className="text-sm font-medium text-neutral-300">No channels tracked</span>
              <span className="mt-1 text-xs text-neutral-500">Add Telegram channels to catch alpha</span>
            </div>
          ) : (
            <div className="scrollbar-hide flex-1 overflow-auto">
              <table className="w-full min-w-[280px] text-[10px] sm:min-w-[320px] sm:text-xs">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    <th className="px-2 py-2 text-left font-medium text-neutral-500">Channel</th>
                    <th className="px-2 py-2 text-left font-medium text-neutral-500">Added</th>
                    <th className="px-2 py-2 text-right font-medium text-neutral-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {telegramChannels.map((ch) => (
                    <TelegramChannelRow
                      key={ch.id}
                      channel={ch}
                      title={telegramChannelTitles[ch.username]}
                      onRemove={handleRemoveTelegramChannel}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : telegramTab === 1 ? (
          loadingTelegramFeed ? (
            <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
              <div className="mb-2 flex gap-1.5">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-500" />
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-500 [animation-delay:150ms]" />
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-500 [animation-delay:300ms]" />
              </div>
              <span className="text-xs text-neutral-500">Loading messages...</span>
            </div>
          ) : telegramFeed.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
              <FiMessageCircle className="mb-3 h-10 w-10 text-neutral-700" />
              <span className="text-sm font-medium text-neutral-300">No messages yet</span>
              <span className="mt-1 text-xs text-neutral-500">
                {telegramFeedHint || "Add channels and ensure Telegram client is configured on the server."}
              </span>
              <button
                type="button"
                className="mt-4 rounded-lg border border-white/[0.1] bg-white/[0.05] px-4 py-2 text-xs font-medium text-neutral-200 hover:bg-white/[0.08]"
                onClick={() => loadTelegramFeed()}
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="scrollbar-hide flex-1 space-y-2 overflow-auto p-2">
              {telegramFeed.map((msg) => (
                <a
                  key={`${msg.channelUsername}-${msg.id}`}
                  href={`https://t.me/${msg.channelUsername}/${msg.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition-colors hover:border-white/[0.1] hover:bg-white/[0.05]"
                >
                  <div className="mb-2 flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
                    <span className="text-xs font-semibold text-[#0088cc] sm:text-sm">
                      @{msg.channelUsername}
                    </span>
                    <span className="shrink-0 text-[10px] text-neutral-500">
                      {msg.date
                        ? new Date(msg.date * 1000).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </span>
                  </div>
                  <div className="text-xs leading-relaxed text-neutral-200 sm:text-sm">
                    <TelegramMessageBody text={msg.text} entities={msg.entities} />
                  </div>
                </a>
              ))}
            </div>
          )
        ) : (
          <>
            <div className="my-2 flex items-center gap-2 border-b border-white/[0.04] pb-2">
              <input
                type="text"
                placeholder="@ Search channel"
                value={approvedChannelsSearch}
                onChange={(e) => setApprovedChannelsSearch(e.target.value)}
                className="max-w-[180px] flex-1 rounded border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[10px] text-neutral-200 placeholder:text-neutral-600 focus:border-[#7FFFC9]/50 focus:outline-none sm:text-xs"
              />
            </div>
            <div className="scrollbar-hide flex-1 overflow-y-auto">
              {approvedTelegramChannels.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <span className="text-xs text-neutral-500">No approved channels to show</span>
                </div>
              ) : (
                (approvedChannelsSearch.trim()
                  ? approvedTelegramChannels.filter((ch) =>
                      ch.toLowerCase().includes(approvedChannelsSearch.trim().toLowerCase()),
                    )
                  : approvedTelegramChannels
                ).map((channel, idx) => {
                  const username = channel.replace(/^@/, "").toLowerCase();
                  const isTracked = telegramChannels.some((c) => c.username.toLowerCase() === username);
                  const isAdding = addingTelegramChannel === username;
                  return (
                    <div
                      key={channel}
                      className="flex items-center justify-between gap-2 border-b border-white/[0.04] py-1.5 text-[10px] sm:text-xs"
                    >
                      <div className="flex min-w-0 items-center">
                        <span className="w-8 shrink-0 text-neutral-500">{idx + 1}</span>
                        <a
                          href={`https://t.me/${username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 truncate text-neutral-200 hover:underline"
                        >
                          @{username}
                        </a>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          if (isTracked || isAdding) return;
                          setAddingTelegramChannel(username);
                          try {
                            await handleAddTelegramChannel(username);
                          } finally {
                            setAddingTelegramChannel(null);
                          }
                        }}
                        disabled={isTracked || isAdding}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-white/[0.08] bg-white/[0.04] text-neutral-400 transition-colors hover:border-[#7FFFC9]/50 hover:bg-[#7FFFC9]/10 hover:text-[#7FFFC9] disabled:opacity-50 disabled:hover:border-white/[0.08] disabled:hover:bg-white/[0.04] disabled:hover:text-neutral-400"
                        title={isTracked ? "Already tracked" : "Add to tracked channels"}
                        aria-label={`Add @${username}`}
                      >
                        {isAdding ? (
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                          <FiPlus className="h-3.5 w-3.5 text-white" />
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
