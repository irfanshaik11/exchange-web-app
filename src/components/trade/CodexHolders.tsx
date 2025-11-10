import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Token } from '~/utils/db';
import HoldersTable from './HoldersTable';

interface CodexHoldersProps {
  token: Token | null;
}

const AX = {
  bg: "#101114",
  surface: "#1E1F26",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#E6E7EA",
  muted: "#9CA3AF",
  mint: "#70E0B0",
  mintHover: "#58B890",
  sell: "#FF4D7F",
};

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
  const [showBubblemap, setShowBubblemap] = useState(false);
  const [leftPaneWidth, setLeftPaneWidth] = useState<number>(50); // percentage
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const leftPaneWidthRef = useRef(leftPaneWidth);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Keep ref in sync with state
  useEffect(() => {
    leftPaneWidthRef.current = leftPaneWidth;
  }, [leftPaneWidth]);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('holdersSplitWidth', String(leftPaneWidth));
  }, [leftPaneWidth]);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('holdersSplitWidth');
    if (saved) {
      const parsed = parseFloat(saved);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
        setLeftPaneWidth(parsed);
      }
    }
  }, []);

  const clampWidth = useCallback((desired: number) => {
    // Allow full range resizing - from 0% to 100% so users can completely hide either view
    // 0% = holders table hidden, bubble map full width
    // 100% = bubble map hidden, holders table full width
    return Math.max(0, Math.min(100, desired));
  }, []);

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

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    // Only handle left mouse button
    if (e.button !== 0) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Set resizing state immediately
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.style.pointerEvents = 'auto';
    
    let isActive = true; // Track if resize is still active
    
    const onMove = (ev: MouseEvent) => {
      // Only resize if we're still in active resize mode
      if (!isActive) return;
      
      ev.preventDefault();
      ev.stopPropagation();
      
      if (!containerRef.current) return;
      
      // Get container's bounding rectangle to calculate relative position
      const containerRect = containerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;
      if (containerWidth === 0) return; // Avoid division by zero
      
      // Calculate cursor position relative to container's left edge
      // Allow cursor to be outside container - clamp the percentage result instead
      const cursorX = ev.clientX - containerRect.left;
      
      // Calculate new width as percentage based on cursor position
      // Clamp to 0-100% to handle cases where cursor is outside container bounds
      const newWidthPercent = Math.max(0, Math.min(100, (cursorX / containerWidth) * 100));
      const newWidth = clampWidth(newWidthPercent);
      
      setLeftPaneWidth(newWidth);
      leftPaneWidthRef.current = newWidth;
    };
    
    // Also handle window blur to stop resizing if window loses focus
    const onBlur = () => {
      if (isActive) {
        isActive = false;
        setIsResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.body.style.pointerEvents = '';
        
        // Remove all listeners
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('mouseup', onUp, true);
        window.removeEventListener('blur', onBlur);
      }
    };
    
    const onUp = (ev: MouseEvent) => {
      // Mark as inactive and clean up
      if (!isActive) return; // Already cleaned up
      isActive = false;
      
      ev.preventDefault();
      ev.stopPropagation();
      
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.style.pointerEvents = '';
      
      // Remove all listeners - use same options as when adding
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      window.removeEventListener('blur', onBlur);
    };
    
    // Add listeners to document to track mouse movement anywhere on the page
    // This allows resizing even when mouse moves away from the resizer
    // The resize follows the cursor position naturally
    // Use capture phase to ensure we catch events even when cursor is outside
    document.addEventListener('mousemove', onMove, { passive: false, capture: true });
    document.addEventListener('mouseup', onUp, { passive: false, capture: true });
    window.addEventListener('blur', onBlur);
  }, [clampWidth]);

  const handleBubblemapToggle = useCallback((show: boolean) => {
    setShowBubblemap(show);
    if (!show) {
      // Reset to full width when hiding bubblemap
      setLeftPaneWidth(100);
    } else {
      // Set to 50/50 split when showing bubblemap
      setLeftPaneWidth(50);
    }
  }, []);

  // Get table container width for responsive columns
  const [tableWidth, setTableWidth] = useState(1000);
  useEffect(() => {
    if (!tableContainerRef.current) return;
    
    const updateWidth = () => {
      if (tableContainerRef.current) {
        setTableWidth(tableContainerRef.current.offsetWidth);
      }
    };
    
    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    if (tableContainerRef.current) {
      resizeObserver.observe(tableContainerRef.current);
    }
    
    return () => resizeObserver.disconnect();
  }, [showBubblemap, leftPaneWidth]);

  return (
    <>
      <style jsx>{`
        .holders-container {
          height: 100%;
          display: flex;
          flex-direction: row;
          gap: 0;
        }
        .holders-table-container {
          min-width: 0;
          overflow: hidden;
        }
        .holders-resizer {
          width: 4px;
          min-width: 4px;
          background-color: ${AX.border};
          cursor: col-resize;
          position: relative;
          flex-shrink: 0;
        }
        .holders-resizer:hover {
          background-color: ${AX.muted};
        }
        .holders-resizer::before {
          content: '';
          position: absolute;
          left: 50%;
          top: 0;
          bottom: 0;
          width: 1px;
          background-color: ${AX.border};
          transform: translateX(-50%);
        }
        .holders-iframe-container {
          flex: 1;
          min-height: 600px;
          height: 100%;
        }
        .holders-iframe {
          width: 100%;
          height: 100%;
          border: none;
          display: block;
        }
      `}</style>
      <div 
        ref={containerRef}
        className="w-full h-full flex flex-row overflow-hidden holders-container"
      >
        {/* Left side: Holders Table */}
        <div 
          ref={tableContainerRef}
          className="holders-table-container"
          style={{ 
            width: showBubblemap ? `${leftPaneWidth}%` : '100%',
            minWidth: showBubblemap && leftPaneWidth === 0 ? 0 : 'auto',
            transition: isResizing ? 'none' : 'width 0.2s ease-out',
          }}
        >
          <HoldersTable 
            token={token} 
            onBubblemapToggle={handleBubblemapToggle}
            isBubblemapVisible={showBubblemap}
            containerWidth={tableWidth}
          />
        </div>

        {/* Resizer - show when bubblemap is visible (even at extremes when resizing) */}
        {showBubblemap && (leftPaneWidth > 0 && leftPaneWidth < 100 || isResizing) && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize holders table and bubble map"
            tabIndex={0}
            onMouseDown={handleResizeStart}
            className="holders-resizer"
            style={{ 
              cursor: 'col-resize',
              userSelect: 'none',
              touchAction: 'none',
              pointerEvents: 'auto',
            }}
          />
        )}

        {/* Right side: Bubble Map - only show when visible and has width */}
        {showBubblemap && leftPaneWidth < 100 && (
          <div 
            className="flex-1 flex flex-col overflow-hidden"
            style={{ 
              width: `${100 - leftPaneWidth}%`,
              minWidth: leftPaneWidth === 100 ? 0 : 'auto',
              transition: isResizing ? 'none' : 'width 0.2s ease-out',
            }}
          >
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

          <div className="mt-4 text-center flex-shrink-0 px-4 pb-4">
            <p className="text-xs" style={{ color: AX.muted }}>
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
        )}
      </div>
    </>
  );
};

export default CodexHolders;
