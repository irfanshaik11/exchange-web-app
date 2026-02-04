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

  return (
    <tr className="border-b border-white/[0.03] transition-colors duration-300 hover:bg-white/[0.03]">
      <td className="px-2 py-3">
        <div className="flex items-center gap-2">
          {account.profileImageUrl ? (
            <img 
              src={account.profileImageUrl} 
              alt={account.name}
              className="w-8 h-8 rounded-full ring-1 ring-white/10 cursor-pointer"
							onClick={() => window.open(`https://twitter.com/${account.username}`, '_blank')}
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neutral-700 to-neutral-800 flex items-center justify-center text-neutral-300 text-xs font-bold cursor-pointer" onClick={() => window.open(`https://twitter.com/${account.username}`, '_blank')}>
              {account.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-white text-sm truncate cursor-pointer" onClick={() => window.open(`https://twitter.com/${account.username}`, '_blank')}>
              {account.name}
            </span>
            <span className="text-neutral-400 text-xs truncate cursor-pointer" onClick={() => window.open(`https://twitter.com/${account.username}`, '_blank')}>
              @{account.username}
            </span>
          </div>
        </div>
      </td>
      <td className="px-2 py-3 text-xs text-neutral-400">
        {formatNumber(account.followers)} followers
      </td>
      <td className="px-2 py-3 text-xs text-neutral-400">
        {formatDate(account.createdAt)}
      </td>
      <td className="px-1 py-2 sm:px-2 sm:py-3">
        <div className="flex flex-col sm:flex-row gap-1 sm:gap-2 items-stretch sm:items-center justify-end">
          <button
            onClick={() => onViewProfile(account.username)}
            className="px-2 py-1 text-[10px] sm:px-3 sm:py-1.5 sm:text-xs font-medium text-neutral-300 hover:text-neutral-100 transition-all duration-300 border border-white/[0.06] hover:border-white/[0.1] rounded-lg bg-white/[0.03] hover:bg-white/[0.07] whitespace-nowrap"
          >
            View
          </button>
          <button
            onClick={() => onRemove(account.username)}
            className="px-2 py-1 text-[10px] sm:px-3 sm:py-1.5 sm:text-xs font-medium text-red-400 hover:text-red-300 transition-all duration-300 border border-red-500/30 hover:border-red-500/50 rounded-lg bg-red-500/5 hover:bg-red-500/10 whitespace-nowrap"
          >
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
};

export default TwitterAccountRow;

