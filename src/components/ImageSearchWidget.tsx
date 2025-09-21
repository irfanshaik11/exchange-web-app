import React, { useState } from 'react';
import { ImageSearchService } from '~/utils/imageSearch';

interface ImageSearchWidgetProps {
  className?: string;
}

export default function ImageSearchWidget({ className = '' }: ImageSearchWidgetProps) {
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const searchService = ImageSearchService.getInstance();

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchResults([]);

    try {
      // Search for tokens that match the query
      const response = await fetch(`/api/tokens/search?q=${encodeURIComponent(searchQuery)}`);
      const tokens = await response.json();

      const results: string[] = [];

      for (const token of tokens.slice(0, 5)) { // Limit to 5 tokens
        try {
          const imageResults = await searchService.searchForTokenImage({
            mint: token.mint,
            name: token.name,
            symbol: token.symbol,
            currentLogo: token.logo,
            uri: token.uri,
          });

          if (imageResults.length > 0) {
            const bestResult = imageResults.reduce((best, current) => 
              current.confidence > best.confidence ? current : best
            );

            // Update the token with the found image
            const success = await searchService.updateTokenImage(
              token.mint,
              bestResult.url,
              bestResult.source
            );

            if (success) {
              results.push(`✅ Found image for ${token.symbol} from ${bestResult.source}`);
            } else {
              results.push(`❌ Failed to update ${token.symbol}`);
            }
          } else {
            results.push(`🔍 No images found for ${token.symbol}`);
          }
        } catch (error) {
          results.push(`❌ Error searching ${token.symbol}: ${error}`);
        }
      }

      setSearchResults(results);
    } catch (error) {
      setSearchResults([`❌ Search failed: ${error}`]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className={`bg-neutral-800 rounded-lg p-4 border border-neutral-700 ${className}`}>
      <h3 className="text-lg font-semibold text-white mb-4">Search for Missing Images</h3>
      
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search for token symbol or name..."
          className="flex-1 px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white placeholder-neutral-400"
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button
          onClick={handleSearch}
          disabled={isSearching || !searchQuery.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-600 disabled:cursor-not-allowed text-white rounded font-medium"
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {searchResults.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-neutral-300">Search Results:</h4>
          <div className="space-y-1">
            {searchResults.map((result, index) => (
              <div key={index} className="text-sm text-neutral-300">
                {result}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 text-xs text-neutral-400">
        This will search for images from multiple sources including Pump.fun, Moonit, Jupiter, and more.
      </div>
    </div>
  );
}
