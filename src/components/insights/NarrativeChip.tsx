import React from 'react';

interface NarrativeChipProps {
  theme: string;
  text: string;
  marketCount: number;
}

export function NarrativeChip({ theme, text, marketCount }: NarrativeChipProps) {
  return (
    <div className="p-2.5 rounded-lg border border-white/[0.06] hover:bg-white/[0.03] transition-colors">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-zinc-200">{theme}</span>
        <span className="text-[10px] text-zinc-500">{marketCount} market{marketCount !== 1 ? 's' : ''}</span>
      </div>
      <p className="text-[10px] text-zinc-400 leading-relaxed line-clamp-2">{text}</p>
    </div>
  );
}
