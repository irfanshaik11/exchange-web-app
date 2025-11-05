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
    <tr className="border-b border-neutral-800/50 transition-colors duration-300 hover:bg-neutral-800/30">
      <td className="px-2 py-3">
        <div className="flex items-center gap-2">
          {account.profileImageUrl ? (
            <img 
              src={account.profileImageUrl} 
              alt={account.name}
              className="w-8 h-8 rounded-full cursor-pointer"
							onClick={() => window.open(`https://twitter.com/${account.username}`, '_blank')}
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold cursor-pointer" onClick={() => window.open(`https://twitter.com/${account.username}`, '_blank')}>
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
      <td className="px-2 py-3">
        <div className="flex gap-2 items-center justify-end">
          <button
            onClick={() => onViewProfile(account.username)}
            className="px-3 py-1 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors duration-300 border border-blue-500/30 hover:border-blue-500/50 rounded"
          >
            View
          </button>
          <button
            onClick={() => onRemove(account.username)}
            className="px-3 py-1 text-xs font-semibold text-red-400 hover:text-red-300 transition-colors duration-300 border border-red-500/30 hover:border-red-500/50 rounded"
          >
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
};

export default TwitterAccountRow;

