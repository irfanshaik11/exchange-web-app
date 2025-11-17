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
    id: 'sol', 
    name: 'Solana', 
    logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    color: '#14F195' 
  },
  { 
    id: 'eth', 
    name: 'Ethereum', 
    logo: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
    color: '#627EEA' 
  },
  { 
    id: 'bnb', 
    name: 'BNB Chain', 
    logo: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
    color: '#F3BA2F' 
  },
  { 
    id: 'base', 
    name: 'Base', 
    logo: 'https://assets.coingecko.com/coins/images/27545/small/Base_Icon.png',
    color: '#0052FF' 
  },
  { 
    id: 'monad', 
    name: 'Monad', 
    logo: 'https://pbs.twimg.com/profile_images/1751947427452035072/1W9PxY4-_400x400.jpg',
    color: '#9B59B6' 
  },
];

const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#E6E7EA",
  muted: "#9CA3AF",
  mint: "#18c48c",
};

// Helper component for blockchain logo with fallback
function BlockchainLogo({ logo, color, alt }: { logo: string; color: string; alt: string }) {
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    return (
      <div
        className="w-4 h-4 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
    );
  }

  return (
    <img
      src={logo}
      alt={alt}
      className="w-4 h-4 rounded-full object-cover flex-shrink-0"
      onError={() => setImageError(true)}
    />
  );
}

export default function BlockchainSwitcher() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get current chain from query parameter, default to 'sol'
  const currentChain = (router.query.chain as string) || 'sol';
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
    
    // Update the current page's chain query parameter
    const currentPath = router.pathname;
    router.push({
      pathname: currentPath,
      query: { ...router.query, chain: chainId },
    }, undefined, { shallow: true });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 h-8 rounded-full px-3 transition-all duration-300 ease-out"
        style={{
          backgroundColor: '#000000',
          color: AX.text,
        }}
        onMouseEnter={(e) => {
          if (!isOpen) {
            e.currentTarget.style.backgroundColor = "rgba(24, 196, 140, 0.08)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.backgroundColor = '#000000';
          }
        }}
      >
        <BlockchainLogo
          logo={selectedBlockchain.logo}
          color={selectedBlockchain.color}
          alt={selectedBlockchain.name}
        />
        <span className="text-xs font-medium">{selectedBlockchain.name}</span>
        <FaChevronDown
          size={10}
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
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

