import React, { useEffect, useMemo, useState } from "react";
import { withImageFallback } from "~/utils/images";
import { computeHashImageUrl } from "~/utils/imageHash";
import ImageBubble from "./ImageBubble";

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
  /**
   * Native <img> loading attribute. Defaults to "lazy" (good for tiny avatars
   * deep in tables). Pass "eager" for above-the-fold or popout uses where the
   * image is the main content and lazy-loading would cause a visible blank
   * frame on hover/open.
   */
  loading?: "lazy" | "eager";
}

export default function AvatarImage({
  src,
  fallbackSrc,
  name,
  symbol,
  width = 48,
  height = 48,
  className = "",
  showBubble = true,
  bubbleSrc,
  loading = "lazy",
}: AvatarImageProps) {
  const normalizedSrc = useMemo(
    () => withImageFallback(src, fallbackSrc),
    [src, fallbackSrc],
  );
  const finalSrc = normalizedSrc; // Only use the normalized source, no random avatar fallback
  const [showImage, setShowImage] = useState<boolean>(!!finalSrc);

  useEffect(() => {
    setShowImage(!!finalSrc);
  }, [finalSrc]);

  const initial = (symbol?.charAt(0) || name?.charAt(0) || "?").toUpperCase();

  if (showImage && finalSrc) {
    const srcUrl = computeHashImageUrl(finalSrc, width) || finalSrc;
    return (
      <div className="relative rounded-lg">
        <img
          src={srcUrl}
          alt={name || symbol || ""}
          width={width}
          height={height}
          loading={loading}
          decoding="async"
          className={`${className} rounded-lg`}
          onError={() => setShowImage(false)}
        />
        {showBubble && <ImageBubble src={bubbleSrc} />}
      </div>
    );
  }

  return (
    <div
      className={`relative ${className} flex items-center justify-center rounded-full bg-gradient-to-br from-gray-800 to-black font-bold text-white shadow-lg`}
      style={{ width, height }}
    >
      <span className="text-lg">{initial}</span>
      {showBubble && <ImageBubble src={bubbleSrc} />}
    </div>
  );
}
