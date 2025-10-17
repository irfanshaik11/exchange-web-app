import React from 'react';

interface ImageBubbleProps {
  src?: string;
  alt?: string;
  size?: number;
  className?: string;
  // Future AMM integration props
  ammType?: string;
  isActive?: boolean;
}

export default function ImageBubble({ 
  src = "/pump.svg", 
  alt = "Pump logo",
  size = 20,
  className = "",
  ammType,
  isActive = true
}: ImageBubbleProps) {
  // Future: Dynamic icon based on AMM type
  // const getAmmIcon = (ammType: string) => {
  //   switch(ammType) {
  //     case 'pump': return '/pump.svg';
  //     case 'raydium': return '/ray.svg';
  //     case 'meteora': return '/meteora.svg';
  //     default: return '/pump.svg';
  //   }
  // };
  
  const bubbleSrc = src; // Future: ammType ? getAmmIcon(ammType) : src;
  
  if (!isActive) return null;
  
  return (
    <div 
      className={`absolute bottom-0 right-0 bg-white rounded-full border border-green-400 flex items-center justify-center transform translate-x-1/2 translate-y-1/2 z-[99999] shadow-lg ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={bubbleSrc}
        alt={alt}
        className="w-3/4 h-3/4 object-contain"
      />
    </div>
  );
}
