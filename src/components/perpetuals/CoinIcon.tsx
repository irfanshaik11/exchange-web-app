// src/components/perpetuals/CoinIcon.tsx
// Token icon for Hyperliquid perpetual coins.
// Shows image from CoinGecko/DexScreener cache, falls back to letter avatar.

import React, { useState } from "react";
import { useHyperliquidTokenImage } from "../../hooks/useHyperliquidTokenImage";
import { getCoinAvatarColor } from "../../utils/hyperliquidTokenImages";

interface CoinIconProps {
  coin: string;
  size?: number; // px
  className?: string;
}

export default function CoinIcon({ coin, size = 24, className = "" }: CoinIconProps) {
  const imageUrl = useHyperliquidTokenImage(coin);
  const [imgError, setImgError] = useState(false);

  if (imageUrl && !imgError) {
    return (
      <img
        src={imageUrl}
        alt={coin}
        width={size}
        height={size}
        className={`rounded-full object-cover flex-shrink-0 ${className}`}
        style={{
          width: size,
          height: size,
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
        onError={() => setImgError(true)}
      />
    );
  }

  // Letter avatar fallback
  return (
    <div
      className={`rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: getCoinAvatarColor(coin),
        fontSize: size * 0.4,
      }}
    >
      {coin.charAt(0)}
    </div>
  );
}
