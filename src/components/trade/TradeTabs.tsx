import React from 'react';
import { FaBolt } from 'react-icons/fa';

/* Axiom-style palette */
const AX = {
  bg: "#0c0d10",
  surface: "#101114",
  border: "#1f2127",
  text: "#f4f4f5",
  muted: "#71717a",
  mint: "#18c48c",
  mintGlow: "rgba(24, 196, 140, 0.25)",
};

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
  devTokensCount?: number;
  holdersCount?: number;
}

const TradeTabs: React.FC<TradeTabsProps> = ({ selectedTab, setSelectedTab, onInstantTradeClick, isInstantTradeOpen = false, devTokensCount, holdersCount }) => {
  return (
    <div 
      className="flex items-center justify-between px-3 py-2"
      style={{ backgroundColor: AX.surface, borderBottom: `1px solid ${AX.border}` }}
    >
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-[#1f2127] scrollbar-track-transparent min-w-0 flex-1">
        {tabs.map(tab => {
          const isSelected = selectedTab === tab;
          return (
            <button
              key={tab}
              className="px-3 py-1.5 text-xs font-semibold whitespace-nowrap flex-shrink-0 rounded-md transition-all duration-200"
              style={{
                backgroundColor: isSelected ? `${AX.mint}15` : 'transparent',
                color: isSelected ? AX.mint : AX.muted,
                border: isSelected ? `1px solid ${AX.mint}40` : '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.color = AX.text;
                  e.currentTarget.style.backgroundColor = `${AX.border}40`;
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.color = AX.muted;
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
              onClick={() => setSelectedTab(tab)}
            >
              {tab}
              {tab === 'Dev Tokens' && devTokensCount !== undefined && devTokensCount > 0 && (
                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: AX.border, color: AX.muted }}>
                  {devTokensCount >= 1e6 ? `${(devTokensCount / 1e6).toFixed(1)}M` :
                   devTokensCount >= 1e3 ? `${(devTokensCount / 1e3).toFixed(1)}K` :
                   devTokensCount.toString()}
                </span>
              )}
              {tab === 'Holders' && holdersCount !== undefined && holdersCount > 0 && (
                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: AX.border, color: AX.muted }}>
                  {holdersCount >= 1e6 ? `${(holdersCount / 1e6).toFixed(1)}M` :
                   holdersCount >= 1e3 ? `${(holdersCount / 1e3).toFixed(1)}K` :
                   holdersCount.toString()}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {onInstantTradeClick && (
        <button
          className="px-3 py-1.5 text-xs font-semibold flex items-center gap-2 transition-all duration-200 rounded-full ml-3 flex-shrink-0 whitespace-nowrap"
          style={{ 
            backgroundColor: `${AX.mint}15`, 
            color: AX.mint,
            border: `1px solid ${AX.mint}40`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = AX.mint;
            e.currentTarget.style.color = '#030304';
            e.currentTarget.style.boxShadow = `0 0 12px ${AX.mintGlow}`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = `${AX.mint}15`;
            e.currentTarget.style.color = AX.mint;
            e.currentTarget.style.boxShadow = 'none';
          }}
          onClick={onInstantTradeClick}
        >
          <FaBolt className="w-3 h-3" />
          <span>Instant Trade</span>
        </button>
      )}
    </div>
  );
};

export default TradeTabs; 
