import React, { useEffect, useState } from 'react';
import { formatSmartNumber } from '~/utils/db';
import type { TradeRow } from '~/utils/functions';
import { useRouter } from 'next/router';
import FastImage from '../FastImage';
import { FaExternalLinkAlt } from 'react-icons/fa';
import Image from 'next/image';

interface ActivityProps {
  trades: TradeRow[];
  loading: boolean;
  onTokenNamesChange?: (tokenNames: Record<string, string>) => void; // Optional: callback to pass token names to parent
}

interface TokenMetadata {
  imageUrl?: string;
  protocol?: string;
  name?: string;
  symbol?: string;
  createdAt?: number; // Token creation timestamp
}

function shortAddr(addr: string) {
  if (!addr) return '';
  return addr.slice(0, 4) + '...' + addr.slice(-4);
}

function formatAge(timestamp: number | string): string {
  try {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
    const now = Date.now();
    const diff = now - date.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    const months = Math.floor(diff / 2592000000);
    const years = Math.floor(diff / 31536000000);
    
    if (years > 0) return `${years}y`;
    if (months > 0) return `${months}mo`;
    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return 'Just now';
  } catch (error) {
    return 'Unknown';
  }
}

const Activity: React.FC<ActivityProps> = ({ trades, loading, onTokenNamesChange }) => {
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, TokenMetadata>>({});
  const router = useRouter();

  useEffect(() => {
    if (!trades || trades.length === 0) return;
    
    // Fetch token data for each unique token in trades - use same pattern as Positions
    const uniqueTokens = Array.from(new Set(trades.map(t => t.tokenAddress)));
    
    uniqueTokens.forEach(async (tokenAddress, idx) => {
      try {
        // Find the trade to get originalPairAddress (backend stores this for token-service lookups)
        const trade = trades.find(t => t.tokenAddress === tokenAddress);
        const pairAddress = trade?.originalPairAddress || trade?.pairAddress || tokenAddress;
        
        console.log(`Fetching token data for pair: ${pairAddress} (tokenAddress: ${tokenAddress})`);
        
        // Use originalPairAddress to get token data (same as Positions component)
        const response = await fetch(`/api/token-service/trade-view?pair_address=${pairAddress}`);
        
        if (!response.ok) {
          console.error(`Failed to fetch token data for ${pairAddress}:`, response.status);
          return;
        }
        
        const data = await response.json();
        const tokenData = data?.token;
        
        console.log(`Token data received for ${pairAddress}:`, tokenData);
        
        if (tokenData) {
          setTokenMetadata(prev => {
            const updated = {
              ...prev,
              [tokenAddress]: {
                imageUrl: tokenData.uri || tokenData.image || tokenData.logo || '',
                protocol: tokenData.launchpad_protocol || tokenData.protocol || '',
                name: tokenData.name || '',
                symbol: tokenData.symbol || '',
                createdAt: tokenData.created_timestamp || tokenData.createdAt,
              }
            };
            
            // Pass token names to parent if callback is provided
            if (onTokenNamesChange) {
              const tokenNames: Record<string, string> = {};
              Object.keys(updated).forEach(key => {
                if (updated[key]?.name) {
                  tokenNames[key] = updated[key].name!;
                }
              });
              onTokenNamesChange(tokenNames);
            }
            
            return updated;
          });
        }
      } catch (error) {
        console.error(`Error fetching token data for ${tokenAddress}:`, error);
      }
    });
  }, [trades, onTokenNamesChange]);

  return (
    <div className="w-full">
      {loading ? (
        <div className="py-8 text-center text-[#9CA3AF]">Loading...</div>
      ) : trades.length === 0 ? (
        <div className="py-8 text-center text-[#9CA3AF]">No activity found.</div>
      ) : (
        <div className="relative">
          {/* Header Row - Fixed */}
          <div className="grid gap-4 px-6 py-2 border-b border-[#2A2B33] text-xs text-[#9CA3AF] bg-[#1E1F26]" style={{ gridTemplateColumns: '0.8fr 2fr 1.2fr 1.2fr 0.8fr 1fr' }}>
            <div>Type</div>
            <div>Token</div>
            <div>Amount</div>
            <div>Market Cap</div>
            <div>Age</div>
            <div>Explorer</div>
          </div>
          
          {/* Scrollable Data Rows */}
          <div 
            className="overflow-y-scroll scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800"
            style={{ 
              maxHeight: '500px',
              scrollBehavior: 'smooth',
              WebkitOverflowScrolling: 'touch'
            } as React.CSSProperties}
          >
            <div className="space-y-0 pb-12">
            {
              trades.map((trade, idx) => {
              const handleRowClick = () => {
                // Navigate to token trade page using originalPairAddress (same as Positions)
                const navigateAddress = trade.originalPairAddress || trade.pairAddress || trade.tokenAddress;
                if (navigateAddress) {
                  router.push(`/trade/${navigateAddress}`);
                }
              };
              
              const metadata = tokenMetadata[trade.tokenAddress];
              
              // Protocol color mapping - matches PulseTable
              const getProtocolColor = (protocol?: string) => {
                const p = protocol?.toLowerCase() || '';
                if (p.includes('pump')) return '#22c55e'; // Green for Pump.fun
                if (p.includes('raydium')) return '#5c51f7'; // Purple for Raydium
                if (p.includes('meteora')) return '#ff4662'; // Pink-red for Meteora
                if (p.includes('moonit')) return '#74831f'; // Green-brown for Moonit
                if (p.includes('boop')) return '#134577'; // Dark blue for Boop
                if (p.includes('launch')) return '#ef4444'; // Red for LaunchLab
                return '#22c55e'; // Default to green
              };

              const protocolColor = getProtocolColor(metadata?.protocol);
              
              // Protocol icon mapping - returns image URL
              const getProtocolIcon = (protocol?: string): string => {
                const p = protocol?.toLowerCase() || '';
                
                if (p.includes('pump')) {
                  return 'https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png';
                }
                
                if (p.includes('meteora')) {
                  return 'https://s1.coincarp.com/logo/1/meteora.png?style=72&v=1759911013';
                }
                
                if (p.includes('raydium')) {
                  return 'https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png';
                }
                
                if (p.includes('boop')) {
                  return 'https://dropsearn.fra1.cdn.digitaloceanspaces.com/media/projects/logos/boopfun_logo_1746246162.webp';
                }
                
                if (p.includes('moonit')) {
                  return 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR6_LEZppFrAkKMqApIwCM_R5n0-b4XC8Aluw&s';
                }
                
                // Default to pump.fun icon for unknown protocols
                return 'https://logos-world.net/wp-content/uploads/2024/10/Pump-Fun-Logo.png';
              };

              const tokenIcon = getProtocolIcon(metadata?.protocol);
              const isMeteora = metadata?.protocol?.toLowerCase().includes('meteora');
              
              // Calculate age based on trade time
              const age = formatAge(trade.tradeTime || trade.createdAt);
              
              // Format market cap
              const marketCapValue = typeof trade.marketCap === 'string' 
                ? parseFloat(trade.marketCap) 
                : trade.marketCap;
              const formattedMarketCap = marketCapValue ? `$${formatSmartNumber(marketCapValue)}` : 'N/A';
              
              // Format amount (USD value)
              const amountValue = typeof trade.usdValue === 'string' 
                ? parseFloat(trade.usdValue) 
                : trade.usdValue;
              const formattedAmount = amountValue ? `$${formatSmartNumber(amountValue)}` : 'N/A';
              
              return (
                <div 
                  key={trade.id || idx} 
                  className="grid gap-4 px-6 py-3 border-b border-[#2A2B33] hover:bg-[#17191E] transition-colors cursor-pointer"
                  style={{ gridTemplateColumns: '0.8fr 2fr 1.2fr 1.2fr 0.8fr 1fr' }}
                  onClick={handleRowClick}
                >
                  <div className="flex items-center">
                    <span 
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        trade.type === 'Buy' 
                          ? 'bg-emerald-500/20 text-emerald-400' 
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {trade.type}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <div className="flex items-center gap-3">
                      <div 
                        className="relative h-12 w-12 flex items-center justify-center flex-shrink-0"
                      >
                        <div 
                          className="relative rounded-lg transition-all duration-300 ease-out"
                          style={{
                            border: `1px solid ${protocolColor}`,
                            padding: '2px'
                          }}
                        >
                          <div 
                            className="relative rounded-lg"
                            style={{
                              border: `1px solid rgba(192, 192, 192, 0.5)`,
                              padding: '2px'
                            }}
                          >
                            <div className="relative rounded-lg overflow-hidden w-10 h-10">
                              <FastImage
                                src={metadata?.imageUrl || ''}
                                alt={metadata?.name || metadata?.symbol || "Token"}
                                symbol={metadata?.symbol}
                                name={metadata?.name}
                                width={40}
                                height={40}
                                className="w-full h-full object-cover"
                                showBubble={false}
                              />
                            </div>
                          </div>
                        </div>
                        <div 
                          className="absolute bottom-0 right-0 bg-white rounded-full flex items-center justify-center transform translate-x-1/4 translate-y-1/4 z-10"
                          style={{ 
                            width: 20, 
                            height: 20,
                            border: `2px solid ${protocolColor}`,
                            boxShadow: `0 0 4px ${protocolColor}60`
                          }}
                        >
                          <Image
                            src={tokenIcon}
                            alt={`${metadata?.protocol || 'Protocol'} logo`}
                            width={16}
                            height={16}
                            className={`${isMeteora ? 'w-full h-full object-cover' : 'w-3/4 h-3/4 object-contain'} rounded-full`}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="font-medium text-sm text-neutral-100 truncate">
                          {metadata?.name || 'Loading...'}
                        </div>
                        <div className="text-xs text-neutral-400 font-mono truncate" title={trade.tokenAddress}>
                          {shortAddr(trade.tokenAddress)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col justify-center">
                    <div className="font-medium text-white text-sm">{formattedAmount}</div>
                    <div className="text-xs text-neutral-400">
                      {formatSmartNumber(
                        typeof trade.tokenAmount === 'string' 
                          ? parseFloat(trade.tokenAmount) 
                          : trade.tokenAmount
                      )} tokens
                    </div>
                  </div>
                  <div className="flex items-center text-neutral-300 text-sm">
                    {formattedMarketCap}
                  </div>
                  <div className="flex items-center text-neutral-300 text-sm">
                    {age}
                  </div>
                  <div className="flex items-center">
                    <a
                      href={`https://solscan.io/tx/${trade.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()} // Prevent row click
                      className="flex items-center gap-1 text-[#70E0B0] hover:text-[#58B890] transition-colors text-xs"
                    >
                      <span>View</span>
                      <FaExternalLinkAlt className="text-xs" />
                    </a>
                  </div>
                </div>
              );
            })
          }
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Activity;

