import React from 'react';
import AiDrawerBase from './AiDrawerBase';
import { HomepageInsightPanel } from '~/components/insights/HomepageInsightPanel';

interface AiPulseDrawerProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  layoutKey?: string;
}

export default function AiPulseDrawer({ open, onOpen, onClose, layoutKey }: AiPulseDrawerProps) {
  return (
    <AiDrawerBase
      open={open}
      onOpen={onOpen}
      onClose={onClose}
      title="AI Market Pulse"
      pillLabel="AI Pulse"
      fabBottom={24}
      animationPrefix="aipulse"
      layoutKey={layoutKey}
    >
      <HomepageInsightPanel docked chromeless />
    </AiDrawerBase>
  );
}
