// src/utils/waitlist.ts

export type WaitlistStatus = 'waiting' | 'invited' | 'activated' | 'removed';

export interface WaitlistRecordLite {
  waitlistNumber: string; // bigint as string
  status: WaitlistStatus;
}

/**
 * Returns true if the waitlist modal should be shown for this record.
 * Policy: show when user is still waiting and waitlistNumber > 0.
 */
export function shouldShowWaitlistModal(rec?: WaitlistRecordLite | null): boolean {
  if (!rec) return true;
  if (rec.status !== 'waiting') return false;
  const n = Number(rec.waitlistNumber || '0');
  return Number.isFinite(n) && n > 0;
}


