import React from 'react';
import AiDrawerBase from './AiDrawerBase';
import { HomepageInsightPanel } from '~/components/insights/HomepageInsightPanel';

interface AiPulseDrawerProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export default function AiPulseDrawer({ open, onOpen, onClose }: AiPulseDrawerProps) {
  return (
    <AiDrawerBase
      open={open}
      onOpen={onOpen}
      onClose={onClose}
      title="AI Market Pulse"
      pillLabel="AI Pulse"
      fabBottom={24}
      animationPrefix="aipulse"
    >
      <HomepageInsightPanel docked chromeless />
    </AiDrawerBase>
  );
}
