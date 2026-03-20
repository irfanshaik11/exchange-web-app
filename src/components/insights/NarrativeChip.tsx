import React from 'react';

interface NarrativeChipProps {
  theme: string;
  text: string;
  marketCount: number;
}

export function NarrativeChip({ theme, text, marketCount }: NarrativeChipProps) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-medium text-zinc-200">{theme}</span>
          <span
            className="text-[9px] font-mono px-1.5 py-0.5 rounded-lg"
            style={{
              background: 'rgba(129, 140, 248, 0.06)',
              color: '#818CF8',
              border: '1px solid rgba(129, 140, 248, 0.1)',
            }}
          >
            {marketCount} market{marketCount !== 1 ? 's' : ''}
          </span>
        </div>
        <p className="text-[10px] text-zinc-500 leading-[1.6]">{text}</p>
      </div>
    </div>
  );
}
