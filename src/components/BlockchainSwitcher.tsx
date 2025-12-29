import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import { FaChevronDown } from 'react-icons/fa';

interface Blockchain {
  id: string;
  name: string;
  logo: string;
  color: string;
}

const blockchains: Blockchain[] = [
  { 
    id: 'monad', 
    name: 'Monad', 
    logo: 'https://i0.wp.com/www.gizmotimes.com/wp-content/uploads/2023/10/Monad-Logo.png?fit=1920%2C1080&ssl=1',
    color: '#9B59B6' 
  },
  { 
    id: 'sol', 
    name: 'Solana', 
    logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    color: '#14F195' 
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
  border: "#2A2B33",
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
        className="w-5 h-5 rounded-md flex-shrink-0"
        style={{ backgroundColor: color }}
      />
    );
  }

  return (
    <img
      src={logo}
      alt={alt}
      className="w-5 h-5 rounded-md object-cover flex-shrink-0"
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

  // Track intentional chain changes to prevent sync from overriding
  const intentionalChangeRef = useRef<string | null>(null);

  // Use local state for immediate UI feedback, synced with router
  const [localChain, setLocalChain] = useState<string>(() => {
    // Initialize from URL params if available
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('chain') || 'monad';
    }
    return 'monad';
  });

  // Sync local chain with router query - but only when URL explicitly has chain param
  useEffect(() => {
    if (!router.isReady) return;

    // Check if we just made an intentional change - don't override it
    if (intentionalChangeRef.current) {
      const urlParams = new URLSearchParams(router.asPath.split('?')[1] || '');
      const chainInUrl = urlParams.get('chain');
      // Only clear the intentional change once URL has updated
      if (chainInUrl === intentionalChangeRef.current) {
        console.log('[BlockchainSwitcher] URL updated to:', chainInUrl);
        intentionalChangeRef.current = null;
      }
      return; // Don't sync while waiting for URL to update
    }

    // Only sync if URL explicitly has a chain parameter
    const urlParams = new URLSearchParams(router.asPath.split('?')[1] || '');
    const chainFromUrl = urlParams.get('chain');

    if (chainFromUrl && chainFromUrl !== localChain) {
      console.log('[BlockchainSwitcher] Syncing chain from URL:', localChain, '->', chainFromUrl);
      setLocalChain(chainFromUrl);
    }
  }, [router.asPath, router.query.chain, router.isReady, localChain]);

  const currentChain = localChain;
  const selectedBlockchain = blockchains.find(b => b.id === currentChain) || blockchains[0];

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

  const handleChainSelect = (chainId: string) => {
    setIsOpen(false);

    // Mark this as an intentional change to prevent sync from overriding
    intentionalChangeRef.current = chainId;

    // Immediately update local state for instant UI feedback
    setLocalChain(chainId);

    // Update the current page's chain query parameter
    const currentPath = router.pathname;
    console.log('[BlockchainSwitcher] Selecting chain:', chainId);
    console.log('[BlockchainSwitcher] Current path:', currentPath);
    console.log('[BlockchainSwitcher] Current query:', router.query);
    console.log('[BlockchainSwitcher] New query will be:', { ...router.query, chain: chainId });

    router.push({
      pathname: currentPath,
      query: { ...router.query, chain: chainId },
    }, undefined, { shallow: true });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 h-10 rounded-3xl px-3 w-40 transition-all duration-300 ease-out border border-neutral-700/70 hover:bg-neutral-700/70"
        style={{
          color: AX.text,
        }}
      >
        <BlockchainLogo
          logo={selectedBlockchain.logo}
          color={selectedBlockchain.color}
          alt={selectedBlockchain.name}
        />
        <span className="text-sm font-medium">{selectedBlockchain.name}</span>
        <FaChevronDown
          size={10}
          className={`transition-transform mr-0 ml-auto duration-200 ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: AX.muted }}
        />
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
                className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors"
                style={{
                  backgroundColor: isSelected
                    ? 'rgba(24, 196, 140, 0.1)'
                    : 'transparent',
                  color: isSelected ? AX.mint : AX.text,
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'rgba(24, 196, 140, 0.05)';
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
                  <span className="ml-auto text-xs" style={{ color: AX.mint }}>
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
