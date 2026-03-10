import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import { FaChevronDown } from 'react-icons/fa';

const isDev = process.env.NODE_ENV !== 'production';

interface Blockchain {
  id: string;
  name: string;
  logo: string;
  color: string;
}

const blockchains: Blockchain[] = [
  { 
    id: 'sol', 
    name: 'Solana', 
    logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    color: '#14F195' 
  },
  { 
    id: 'monad', 
    name: 'Monad', 
    logo: 'https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1',
    color: '#9B59B6' 
  },
  // { 
  //   id: 'eth', 
  //   name: 'Ethereum', 
  //   logo: 'https://s2.coinmarketcap.com/static/img/coins/200x200/1027.png',
  //   color: '#627EEA' 
  // },
  // { 
  //   id: 'bnb', 
  //   name: 'BNB Chain', 
  //   logo: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
  //   color: '#F3BA2F' 
  // },
  // { 
  //   id: 'base', 
  //   name: 'Base', 
  //   logo: 'https://avatars.githubusercontent.com/u/108554348?s=280&v=4',
  //   color: '#0052FF' 
  // },
];

const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "rgba(255,255,255,0.06)",
  text: "#f0f5f5",
  muted: "#9CA3AF",
  mint: "#18c48c",
};

// Helper component for blockchain logo with fallback
function BlockchainLogo({ logo, color, alt }: { logo: string; color: string; alt: string }) {
  const [imageError, setImageError] = useState(false);

  // Reset error state when logo changes
  useEffect(() => {
    setImageError(false);
  }, [logo]);

  if (imageError) {
    return (
      <div
        className="w-4 h-4 rounded flex-shrink-0"
        style={{ backgroundColor: color }}
      />
    );
  }

  return (
    <img
      src={logo}
      alt={alt}
      className="w-4 h-4 rounded object-cover flex-shrink-0"
      onError={() => setImageError(true)}
      onLoad={() => setImageError(false)}
      loading="eager"
    />
  );
}

export default function BlockchainSwitcher() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Determine chain based on route and query parameter
  // /trade/monad/[contractAddress] = always monad
  // /trade/[id] = always sol (Solana trade page)
  // Other pages = use query param, then localStorage, then default to sol
  const getChainFromRoute = (): string => {
    const path = router.pathname;
    if (path.startsWith('/trade/monad/')) {
      return 'monad';
    }
    if (path === '/trade/[id]') {
      return 'sol';
    }
    // For non-trade pages, check URL first, then localStorage
    if (router.query.chain) {
      return router.query.chain as string;
    }
    if (typeof window !== 'undefined') {
      const savedChain = localStorage.getItem('selected-chain');
      if (savedChain && (savedChain === 'sol' || savedChain === 'monad')) {
        return savedChain;
      }
    }
    return 'sol';
  };

  const currentChain = getChainFromRoute();
  const selectedBlockchain = blockchains.find(b => b.id === currentChain) || blockchains[0];

  // Save chain to localStorage when on trade pages (so navigation back preserves it)
  useEffect(() => {
    if (typeof window !== 'undefined' && currentChain) {
      localStorage.setItem('selected-chain', currentChain);
    }
  }, [currentChain]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Check if we're on a trade page (chain switching not allowed - tokens are chain-specific)
  const isOnTradePage = router.pathname.startsWith('/trade/');

  const handleChainSelect = (chainId: string) => {
    setIsOpen(false);

    // Don't allow chain switching on trade pages
    if (isOnTradePage) return;

    // Update the current page's chain query parameter
    const currentPath = router.pathname;
    isDev && console.log('[BlockchainSwitcher] Selecting chain:', chainId);

    router.push({
      pathname: currentPath,
      query: { ...router.query, chain: chainId },
    }, undefined, { shallow: true });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => !isOnTradePage && setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 h-8 rounded-md px-2.5 transition-all duration-200 ease-out border ${isOnTradePage ? 'cursor-default opacity-75' : 'cursor-pointer'}`}
        style={{
          color: AX.text,
          borderColor: AX.border,
          backgroundColor: "rgba(13, 16, 21, 0.8)",
        }}
        onMouseEnter={(e) => {
          if (!isOnTradePage) {
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.06)";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "rgba(13, 16, 21, 0.8)";
        }}
      >
        <BlockchainLogo
          logo={selectedBlockchain.logo}
          color={selectedBlockchain.color}
          alt={selectedBlockchain.name}
        />
        <span className="text-xs font-medium">{selectedBlockchain.name}</span>
        {!isOnTradePage && (
          <FaChevronDown
            size={8}
            className={`transition-transform ml-auto duration-200 ${isOpen ? 'rotate-180' : ''}`}
            style={{ color: AX.muted }}
          />
        )}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 z-50 min-w-[160px] max-w-[200px] rounded-lg border shadow-lg overflow-hidden"
          style={{
            backgroundColor: AX.surface,
            borderColor: AX.border,
          }}
        >
          {blockchains.map((blockchain) => {
            const isSelected = blockchain.id === currentChain;
            return (
              <button
                key={blockchain.id}
                onClick={() => handleChainSelect(blockchain.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors cursor-pointer"
                style={{
                  backgroundColor: isSelected
                    ? 'rgba(255, 255, 255, 0.08)'
                    : 'transparent',
                  color: isSelected ? AX.text : AX.muted,
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <BlockchainLogo
                  logo={blockchain.logo}
                  color={blockchain.color}
                  alt={blockchain.name}
                />
                <span className="text-xs font-medium">{blockchain.name}</span>
                {isSelected && (
                  <span className="ml-auto text-xs" style={{ color: AX.text }}>
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
