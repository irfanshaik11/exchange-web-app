/**
 * LiveActivityFeed - Real-time activity stream
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  HiUserAdd,
  HiTrendingUp,
  HiUserGroup,
  HiSparkles,
} from 'react-icons/hi';

export interface ActivityEvent {
  id: string;
  type: 'signup' | 'trade' | 'referral' | 'milestone';
  title: string;
  description: string;
  timestamp: Date;
  metadata?: {
    amount?: number;
    symbol?: string;
    referralCode?: string;
    milestone?: number;
  };
}

interface LiveActivityFeedProps {
  events: ActivityEvent[];
  maxEvents?: number;
  className?: string;
}

const eventIcons: Record<ActivityEvent['type'], React.ReactNode> = {
  signup: <HiUserAdd className="w-4 h-4" />,
  trade: <HiTrendingUp className="w-4 h-4" />,
  referral: <HiUserGroup className="w-4 h-4" />,
  milestone: <HiSparkles className="w-4 h-4" />,
};

const eventColors: Record<ActivityEvent['type'], { bg: string; text: string }> = {
  signup: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  trade: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  referral: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  milestone: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
};

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const ActivityItem: React.FC<{ event: ActivityEvent; isNew: boolean }> = ({ event, isNew }) => {
  const colors = eventColors[event.type];

  return (
    <div
      className={`
        flex items-start gap-3 p-3 rounded-xl
        transition-all duration-500
        ${isNew ? 'bg-neutral-800/50 scale-100' : 'bg-transparent scale-100'}
        hover:bg-neutral-800/30
      `}
      style={{
        animation: isNew ? 'slideInRight 0.3s ease-out' : 'none',
      }}
    >
      <div className={`p-2 rounded-lg ${colors.bg} ${colors.text} flex-shrink-0`}>
        {eventIcons[event.type]}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-white truncate">{event.title}</span>
          {isNew && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-500 text-black animate-pulse">
              NEW
            </span>
          )}
        </div>
        <p className="text-xs text-neutral-400 truncate">{event.description}</p>
      </div>

      <span className="text-xs text-neutral-500 flex-shrink-0">{timeAgo(event.timestamp)}</span>
    </div>
  );
};

const LiveActivityFeed: React.FC<LiveActivityFeedProps> = ({
  events,
  maxEvents = 20,
  className = '',
}) => {
  const [newEventIds, setNewEventIds] = useState<Set<string>>(new Set());
  const previousEventsRef = useRef<string[]>([]);

  useEffect(() => {
    const currentIds = events.map((e) => e.id);
    const newIds = currentIds.filter((id) => !previousEventsRef.current.includes(id));

    if (newIds.length > 0) {
      setNewEventIds((prev) => new Set([...prev, ...newIds]));

      setTimeout(() => {
        setNewEventIds((prev) => {
          const updated = new Set(prev);
          newIds.forEach((id) => updated.delete(id));
          return updated;
        });
      }, 3000);
    }

    previousEventsRef.current = currentIds;
  }, [events]);

  const displayEvents = events.slice(0, maxEvents);

  return (
    <div
      className={`
        rounded-2xl bg-gradient-to-br from-neutral-900/90 via-neutral-900/70 to-neutral-950/90
        border border-neutral-800/50 backdrop-blur-sm
        overflow-hidden
        ${className}
      `}
    >
      <div className="flex items-center justify-between p-4 border-b border-neutral-800/50">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-white">Live Activity</h3>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
        </div>
        <span className="text-xs text-neutral-500">{events.length} events</span>
      </div>

      <div className="max-h-[400px] sm:max-h-[500px] overflow-y-auto custom-scrollbar">
        {displayEvents.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            <p className="text-sm">Waiting for activity...</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {displayEvents.map((event) => (
              <ActivityItem
                key={event.id}
                event={event}
                isNew={newEventIds.has(event.id)}
              />
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
};

export default LiveActivityFeed;
