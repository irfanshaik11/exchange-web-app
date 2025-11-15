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
}

const TradeTabs: React.FC<TradeTabsProps> = ({ selectedTab, setSelectedTab, onInstantTradeClick }) => {
  return (
    <div className="flex gap-4 pt-2 text-xs border-b border-emerald-950 items-center">
      {tabs.map(tab => (
        <button
          key={tab}
          className={`px-3 py-1 font-semibold ${selectedTab === tab ? 'border-b-2 border-neutral-300 text-white' : 'text-neutral-400'}`}
          onClick={() => setSelectedTab(tab)}
        >
          {tab}
        </button>
      ))}
      {onInstantTradeClick && (
        <button
          className="px-3 py-1 font-semibold text-neutral-400 hover:text-white flex items-center gap-2 transition-colors"
          onClick={onInstantTradeClick}
        >
          <FaBolt className="w-3 h-3" />
          Instant Trade
        </button>
      )}
    </div>
  );
};

export default TradeTabs; 