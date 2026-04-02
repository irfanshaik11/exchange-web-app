import React from 'react';
import AiDrawerBase from './AiDrawerBase';
import { InsightPanel } from '~/components/insights/InsightPanel';

interface AiInsightsDrawerProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  source: 'polymarket' | 'dflow';
  marketId: string;
}

export default function AiInsightsDrawer({ open, onOpen, onClose, source, marketId }: AiInsightsDrawerProps) {
  return (
    <AiDrawerBase
      open={open}
      onOpen={onOpen}
      onClose={onClose}
      title="AI Insights"
      pillLabel="AI Insights"
      fabBottom={120}
      animationPrefix="aiinsights"
    >
      <InsightPanel source={source} marketId={marketId} docked chromeless />
    </AiDrawerBase>
  );
}
