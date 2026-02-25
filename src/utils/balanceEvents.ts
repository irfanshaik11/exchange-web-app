export function dispatchBalanceRefresh(chain: 'sol' | 'monad' = 'sol') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('balance-refresh', { detail: { chain } }));
  }
}
