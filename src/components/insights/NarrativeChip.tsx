import React from 'react';

interface NarrativeChipProps {
  theme: string;
  text: string;
  marketCount: number;
}

export function NarrativeChip({ theme, text, marketCount }: NarrativeChipProps) {
  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-200 hover:border-white/[0.1]"
      style={{
        background: 'linear-gradient(135deg, rgba(129, 140, 248, 0.04) 0%, rgba(255,255,255,0.02) 100%)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div className="p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold text-zinc-200">{theme}</span>
          <span
            className="text-[9px] font-mono px-1.5 py-0.5 rounded-md"
            style={{
              background: 'rgba(129, 140, 248, 0.08)',
              color: '#818CF8',
              border: '1px solid rgba(129, 140, 248, 0.12)',
            }}
          >
            {marketCount} market{marketCount !== 1 ? 's' : ''}
          </span>
        </div>
        <p className="text-[10px] text-zinc-500 leading-relaxed line-clamp-2">{text}</p>
      </div>
    </div>
  );
}
