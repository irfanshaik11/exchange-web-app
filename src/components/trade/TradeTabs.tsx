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
      <div className="flex gap-4 items-center">
        {tabs.map(tab => (
          <button
            key={tab}
            className={`px-3 py-1 font-semibold ${selectedTab === tab ? 'border-b-4 border-[#70E0B0] text-white' : 'text-neutral-400'}`}
            onClick={() => setSelectedTab(tab)}
          >
            {tab}
            {/* {tab === 'Dev Tokens' && devTokensCount !== undefined && devTokensCount > 0 && (
              <> {devTokensCount}</>
            )} */}
            {/* {tab === 'Holders' && holdersCount !== undefined && holdersCount > 0 && (
              <> {holdersCount}</>
            )} */}
          </button>
        ))}
      </div>
      {onInstantTradeClick && (
        <button
          className="px-4 py-1.5 font-semibold flex items-center gap-2 transition-colors rounded-full bg-[#101114] text-[#70E0B0] ml-auto"
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