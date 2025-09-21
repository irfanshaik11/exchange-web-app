import React, { useEffect, useMemo, useState } from 'react';
import { withImageFallback } from '~/utils/images';

interface AvatarImageProps {
  src?: string | null;
  fallbackSrc?: string | null;
  name?: string | null;
  symbol?: string | null;
  width?: number;
  height?: number;
  className?: string;
}

export default function AvatarImage({
  src,
  fallbackSrc,
  name,
  symbol,
  width = 48,
  height = 48,
  className = '',
}: AvatarImageProps) {
  const normalizedSrc = useMemo(() => withImageFallback(src, fallbackSrc), [src, fallbackSrc]);
  const finalSrc = normalizedSrc; // Only use the normalized source, no random avatar fallback
  const [showImage, setShowImage] = useState<boolean>(!!finalSrc);

  useEffect(() => {
    setShowImage(!!finalSrc);
  }, [finalSrc]);

  const initial = (symbol?.charAt(0) || name?.charAt(0) || '?').toUpperCase();

  if (showImage && finalSrc) {
    const directSchemes = finalSrc.startsWith('data:') || finalSrc.startsWith('blob:');
    const srcUrl = directSchemes ? finalSrc : `/api/image?url=${encodeURIComponent(finalSrc)}`;
    return (
      <img
        src={srcUrl}
        alt={name || symbol || ''}
        width={width}
        height={height}
        className={className}
        onError={() => setShowImage(false)}
      />
    );
  }

  return (
    <div
      className={className + ' flex items-center justify-center bg-gradient-to-br from-gray-800 to-black text-white font-bold rounded-full shadow-lg'}
      style={{ width, height }}
    >
      <span className="text-lg">{initial}</span>
    </div>
  );
}
