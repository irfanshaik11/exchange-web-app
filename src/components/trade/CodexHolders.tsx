import React, { useState } from 'react';
import type { Token } from '~/utils/db';

interface CodexHoldersProps {
  token: Token | null;
}

const CodexHolders: React.FC<CodexHoldersProps> = ({ token }) => {
  // Only show skeleton if we have absolutely no token data (not even optimistic)
  if (!token || (!token.name && !token.symbol)) {
    return (
      <div className="flex-1 min-h-0 p-4">
        <div className="animate-pulse">
          <div className="h-6 w-32 bg-neutral-700 rounded mb-4" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-neutral-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const [isLoading, setIsLoading] = useState(true);

  // Common chain IDs for InsightX Bubblemaps
  const chainIds: Record<string, string> = {
    'ethereum': '1',
    'solana': 'sol',
    'bsc': '56',
    'polygon': '137',
    'arbitrum': '42161',
    'optimism': '10',
    'base': '8453',
  };

  const getChainId = (chain: string): string => {
    return chainIds[chain.toLowerCase()] || chain;
  };

  const buildBubblemapsUrl = (address: string, chain: string): string => {
    const resolvedChainId = getChainId(chain);
    return `https://app.insightx.network/bubblemaps/${resolvedChainId}/${address}`;
  };

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  const handleIframeError = () => {
    setIsLoading(false);
  };

  const bubblemapsUrl = buildBubblemapsUrl(token.mint, 'sol');

  return (
    <>
      <style jsx>{`
        .holders-container {
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .holders-iframe-container {
          flex: 1;
          min-height: 600px;
          height: calc(100vh - 300px);
          max-height: 800px;
        }
        .holders-iframe {
          width: 100%;
          height: 100%;
          border: none;
          display: block;
        }
      `}</style>
      <div className="w-full h-full flex flex-col overflow-hidden holders-container">

      <div className="flex-1 relative bg-neutral-900 rounded-lg overflow-hidden holders-iframe-container">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-900 z-10">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400 mx-auto mb-2"></div>
              <p className="text-neutral-400">Loading holder insights...</p>
            </div>
          </div>
        )}
        
        <iframe
          src={bubblemapsUrl}
          allow="clipboard-write"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          className="holders-iframe"
          title="Token Holders Bubblemap"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      </div>

      <div className="mt-4 text-center flex-shrink-0">
        <p className="text-xs text-neutral-500">
          Data provided by{' '}
          <a 
            href="https://insightx.network" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            InsightX Bubblemaps
          </a>
        </p>
      </div>
      </div>
    </>
  );
};

export default CodexHolders;
