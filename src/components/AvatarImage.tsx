import React, { useEffect, useMemo, useState } from 'react';
import { withImageFallback } from '~/utils/images';
import { computeHashImageUrl } from '~/utils/imageHash';
import ImageBubble from './ImageBubble';

interface AvatarImageProps {
  src?: string | null;
  fallbackSrc?: string | null;
  name?: string | null;
  symbol?: string | null;
  width?: number;
  height?: number;
  className?: string;
  showBubble?: boolean;
  bubbleSrc?: string;
}

export default function AvatarImage({
  src,
  fallbackSrc,
  name,
  symbol,
  width = 48,
  height = 48,
  className = '',
  showBubble = true,
  bubbleSrc,
}: AvatarImageProps) {
  const normalizedSrc = useMemo(() => withImageFallback(src, fallbackSrc), [src, fallbackSrc]);
  const finalSrc = normalizedSrc; // Only use the normalized source, no random avatar fallback
  const [showImage, setShowImage] = useState<boolean>(!!finalSrc);

  useEffect(() => {
    setShowImage(!!finalSrc);
  }, [finalSrc]);

  const initial = (symbol?.charAt(0) || name?.charAt(0) || '?').toUpperCase();

  if (showImage && finalSrc) {
    const srcUrl = computeHashImageUrl(finalSrc) || finalSrc;
    return (
      <div className="relative border border-green-400 rounded-lg p-0.5">
        <img
          src={srcUrl}
          alt={name || symbol || ''}
          width={width}
          height={height}
          className={`${className} rounded-lg`}
          onError={() => setShowImage(false)}
        />
        {showBubble && <ImageBubble src={bubbleSrc} />}
      </div>
    );
  }

  return (
    <div
      className={`relative ${className} flex items-center justify-center bg-gradient-to-br from-gray-800 to-black text-white font-bold rounded-full shadow-lg border border-green-400`}
      style={{ width, height }}
    >
      <span className="text-lg">{initial}</span>
      {showBubble && <ImageBubble src={bubbleSrc} />}
    </div>
  );
}
