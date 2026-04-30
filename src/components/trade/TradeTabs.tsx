import React from 'react';
import { FaBolt } from 'react-icons/fa';

const tabs = [
  'Trades',
  'Orders',
  'Holders',
  'Top Traders',
  'Dev Tokens',
];

interface TradeTabsProps {
  selectedTab: string;
  setSelectedTab: (tab: string) => void;
  onInstantTradeClick?: () => void;
  isInstantTradeOpen?: boolean;
  devTokensCount?: number; // Total count of dev tokens
  holdersCount?: number; // Total count of holders
}

const TradeTabs: React.FC<TradeTabsProps> = ({ selectedTab, setSelectedTab, onInstantTradeClick, isInstantTradeOpen = false, devTokensCount, holdersCount }) => {
  return (
    <div className="flex gap-4 pt-2 text-xs items-center justify-between">
      <div className="flex gap-4 items-center overflow-x-auto scrollbar-thin scrollbar-thumb-[#2A2B33] scrollbar-track-transparent min-w-0 flex-1">
        {tabs.map(tab => (
          <button
            key={tab}
            className={`px-3 py-1 font-semibold whitespace-nowrap flex-shrink-0 ${selectedTab === tab ? 'border-b-4 border-[#70E0B0] text-white' : 'text-neutral-400'}`}
            onClick={() => setSelectedTab(tab)}
          >
            {tab}
            {tab === 'Dev Tokens' && devTokensCount !== undefined && devTokensCount > 0 && (
              <span className="ml-1 text-[10px] text-neutral-400">
                {devTokensCount >= 1e6 ? `${(devTokensCount / 1e6).toFixed(1)}M` :
                 devTokensCount >= 1e3 ? `${(devTokensCount / 1e3).toFixed(1)}K` :
                 devTokensCount.toString()}
              </span>
            )}
            {tab === 'Holders' && holdersCount !== undefined && holdersCount > 0 && (
              <span className="ml-1 text-[10px] text-neutral-400">
                {holdersCount >= 1e6 ? `${(holdersCount / 1e6).toFixed(1)}M` :
                 holdersCount >= 1e3 ? `${(holdersCount / 1e3).toFixed(1)}K` :
                 holdersCount.toString()}
              </span>
            )}
          </button>
        ))}
      </div>
      {onInstantTradeClick && (
        <button
          className="px-4 py-1.5 font-semibold flex items-center gap-2 transition-colors rounded-full bg-[#101114] text-[#70E0B0] ml-auto flex-shrink-0 whitespace-nowrap"
          onClick={onInstantTradeClick}
        >
          <FaBolt className={`w-3 h-3 ${isInstantTradeOpen ? 'text-[#70E0B0]' : 'text-[#70E0B0]'}`} />
          <span>Instant Trade</span>
        </button>
      )}
    </div>
  );
};

export default TradeTabs; 