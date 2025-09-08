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
  const [showImage, setShowImage] = useState<boolean>(!!normalizedSrc);

  useEffect(() => {
    setShowImage(!!normalizedSrc);
  }, [normalizedSrc]);

  const initial = (symbol?.charAt(0) || name?.charAt(0) || '?').toUpperCase();

  if (showImage && normalizedSrc) {
    const proxied = `/api/image?url=${encodeURIComponent(normalizedSrc)}`;
    return (
      // Use plain <img> to avoid Next domain allow-list issues for many gateways
      <img
        src={proxied}
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
      className={className + ' flex items-center justify-center bg-neutral-800 text-neutral-300 font-bold'}
      style={{ width, height }}
    >
      <span>{initial}</span>
    </div>
  );
}
