import React from 'react';
import type { TwitterAccount } from '~/utils/twitterTracking';

type TwitterAccountRowProps = {
  account: TwitterAccount;
  onRemove: (username: string) => void;
  onViewProfile: (username: string) => void;
};

const TwitterAccountRow: React.FC<TwitterAccountRowProps> = ({
  account,
  onRemove,
  onViewProfile
}) => {
  // A row is "enriched" once the backend has filled in profile pic + followers
  // from TwitterAPI.io. Until then we show skeleton loaders in those slots
  // instead of a generic letter-avatar / "0 followers" — clearer feedback
  // that data is on its way, prevents the user from thinking the account
  // has 0 followers.
  const hasProfilePic = Boolean(account.profileImageUrl);
  const hasFollowers = typeof account.followers === 'number';
  const isEnriching = !hasProfilePic && !hasFollowers;

  const formatNumber = (num?: number) => {
    if (!num) return '0';
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const openProfile = () => window.open(`https://twitter.com/${account.username}`, '_blank');

  return (
    <tr className="border-b border-white/[0.03] transition-colors duration-300 hover:bg-white/[0.03]">
      {/* Identity cell — takes remaining width; followers + date fold under the
          handle so the row stays narrow enough for the action buttons to always
          show (no horizontal clipping in the docked/narrow social panel). */}
      <td className="px-2 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {hasProfilePic ? (
            <img
              src={account.profileImageUrl}
              alt={account.name}
              className="h-8 w-8 flex-shrink-0 cursor-pointer rounded-full ring-1 ring-white/10"
              onClick={openProfile}
            />
          ) : isEnriching ? (
            <div className="h-8 w-8 flex-shrink-0 animate-pulse rounded-full bg-neutral-800" />
          ) : (
            <div
              className="flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-neutral-700 to-neutral-800 text-xs font-bold text-neutral-300"
              onClick={openProfile}
            >
              {account.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex min-w-0 flex-col leading-tight">
            <span
              className="cursor-pointer truncate text-sm font-semibold text-white"
              onClick={openProfile}
            >
              {account.name}
            </span>
            <span
              className="cursor-pointer truncate text-xs text-neutral-400"
              onClick={openProfile}
            >
              @{account.username}
            </span>
            <span className="truncate text-[10px] text-neutral-500">
              {hasFollowers ? (
                `${formatNumber(account.followers)} followers`
              ) : isEnriching ? (
                <span className="inline-block h-2.5 w-14 animate-pulse rounded bg-neutral-800 align-middle" />
              ) : (
                "0 followers"
              )}
              {" · "}
              {formatDate(account.createdAt)}
            </span>
          </div>
        </div>
      </td>
      {/* Actions cell — shrink-0 so View/Remove are never clipped */}
      <td className="px-2 py-2.5 align-middle whitespace-nowrap">
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => onViewProfile(account.username)}
            className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-neutral-300 hover:border-white/[0.1] hover:bg-white/[0.07] hover:text-neutral-100"
          >
            View
          </button>
          <button
            onClick={() => onRemove(account.username)}
            className="rounded-lg border border-red-500/30 bg-red-500/5 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-red-400 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
          >
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
};

export default TwitterAccountRow;
