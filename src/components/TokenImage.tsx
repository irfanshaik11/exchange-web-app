import React, { useState } from "react";
import Image from "next/image";
import { withImageFallback } from "../utils/images";
import AvatarImage from "./AvatarImage";
import { FaStar, FaRegStar } from "react-icons/fa";
import { useWatchlist } from "./WatchlistContext";
import type { Token } from "../utils/db";
import InterstatePopout from "./InterstatePopout";

interface TokenImageProps {
  token: Token;
  size?: number;
  className?: string;
}

export default function TokenImage({
  token,
  size = 32,
  className = "",
}: TokenImageProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();
  const isWatched = isInWatchlist(token.pair_address);

  const handleWatchlistClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent parent click events
    if (isWatched) {
      removeFromWatchlist(token.pair_address);
    } else {
      addToWatchlist(token);
    }
  };

  return (
    <div
      className={`group relative ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ display: "inline-block" }}
    >
      <div className="flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-neutral-800">
        <AvatarImage
          src={token.logo}
          name={token.name}
          symbol={token.symbol}
          width={size}
          height={size}
          className="h-8 w-8 object-cover"
        />
      </div>
      {/* Star overlay */}
      <div className="absolute inset-0 flex items-center justify-center rounded bg-black/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <button
          onClick={handleWatchlistClick}
          className="text-xl transition-transform hover:scale-110"
        >
          {isWatched ? (
            <FaStar className="text-yellow-400" />
          ) : (
            <FaRegStar className="text-white hover:text-yellow-400" />
          )}
        </button>
      </div>

      <InterstatePopout
        open={isHovered}
        onClose={() => setIsHovered(false)}
        align="top-right"
        className="z-[99999] flex w-64 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-900 p-2 shadow-2xl"
      >
        <div className="flex h-48 w-48 items-center justify-center overflow-hidden rounded-lg bg-neutral-800">
          <AvatarImage
            src={token.logo}
            name={token.name}
            symbol={token.symbol}
            width={192}
            height={192}
            loading="eager"
            className="h-full w-full object-contain"
          />
        </div>
      </InterstatePopout>
    </div>
  );
}
