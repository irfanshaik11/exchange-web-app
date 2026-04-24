export type OptimisticBalanceDetail = {
  tradeId: string;
  chain: 'sol';
  side: 'buy' | 'sell';
  perWalletDeltas: Array<{ address: string; deltaSol: number }>;
  expiresAt: number;
};

export type OptimisticRollbackDetail = {
  tradeId: string;
  reason?: string;
};

export function dispatchOptimisticBalance(detail: OptimisticBalanceDetail): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('balance-optimistic', { detail }));
  }
}

export function dispatchOptimisticRollback(tradeId: string, reason?: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('balance-optimistic-rollback', {
        detail: { tradeId, reason },
      }),
    );
  }
}

export function newTradeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
