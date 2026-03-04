import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import { FaChevronDown } from 'react-icons/fa';

// Above header UI but below mobile menu panel so dropdown opens *above* the trigger inside the panel
const DROPDOWN_Z_INDEX = 10005;

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
  const [dropdownPosition, setDropdownPosition] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

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

  // Update dropdown position when open. On mobile (or when trigger is near bottom), open *above* the trigger so the popup shows on top of the dropdown box.
	const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const right = window.innerWidth - rect.right;
    const dropdownHeight = 100; // approx height of 2 options
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < dropdownHeight + 16 || rect.bottom > window.innerHeight * 0.6;
    setDropdownPosition(
      openAbove
        ? { bottom: window.innerHeight - rect.top + 8, right }
        : { top: rect.bottom + 8, right }
    );
  };

  useEffect(() => {
    if (!isOpen) {
      setDropdownPosition(null);
      return;
    }
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  // Close dropdown when clicking outside (trigger or portaled dropdown)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      const portaled = document.querySelector('[data-chain-switcher-dropdown]');
      if (portaled?.contains(target)) return;
      setIsOpen(false);
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
    console.log('[BlockchainSwitcher] Selecting chain:', chainId);
    console.log('[BlockchainSwitcher] Current path:', currentPath);
    console.log('[BlockchainSwitcher] Current query:', router.query);
    console.log('[BlockchainSwitcher] New query will be:', { ...router.query, chain: chainId });

    router.push({
      pathname: currentPath,
      query: { ...router.query, chain: chainId },
    }, undefined, { shallow: true });
  };
    const dropdownContent = isOpen && dropdownPosition && typeof document !== 'undefined' && (
			<div
				data-chain-switcher-dropdown
				className="fixed min-w-[160px] max-w-[200px] rounded-lg border shadow-lg overflow-hidden"
				style={{
					...(dropdownPosition.top !== undefined ? { top: dropdownPosition.top } : { bottom: dropdownPosition.bottom }),
					right: dropdownPosition.right,
					zIndex: DROPDOWN_Z_INDEX,
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
		);

      return (
				<>
					<div className="relative" ref={triggerRef}>
        <button
          onClick={() => !isOnTradePage && setIsOpen(!isOpen)}
          className={`w-full flex items-center gap-1.5 h-8 rounded-md px-2.5 transition-all duration-200 ease-out border ${isOnTradePage ? 'cursor-default opacity-75' : 'cursor-pointer'}`}
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
							}}>
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
      </div>
      {typeof document !== 'undefined' && dropdownContent && createPortal(dropdownContent, document.body)}
    </>
  );
}
