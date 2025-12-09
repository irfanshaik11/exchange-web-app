import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useUser } from './UserContext';
import { env } from '~/env';

/**
 * PagePreloader - Preloads critical pages and their data for instant navigation
 * 
 * Strategy:
 * 1. Eager preload: Discover and Pulse (critical pages)
 * 2. Conditional preload: Portfolio (only if logged in)
 * 3. Background preload: After initial render to not block first paint
 */
export default function PagePreloader() {
  const router = useRouter();
  const { user } = useUser();
  const hasPreloadedRef = useRef(false);
  const preloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Don't preload on the page itself (wasteful)
    const currentPath = router.pathname;
    if (currentPath === '/discover' || currentPath === '/pulse' || currentPath === '/portfolio') {
      return;
    }

    // Clear any existing timeout
    if (preloadTimeoutRef.current) {
      clearTimeout(preloadTimeoutRef.current);
    }

    // Preload after a short delay to not block initial render
    preloadTimeoutRef.current = setTimeout(() => {
      if (hasPreloadedRef.current) return;
      hasPreloadedRef.current = true;

      // 1. Prefetch routes using Next.js router (preloads JS bundles)
      router.prefetch('/discover');
      router.prefetch('/pulse');
      
      if (user) {
        router.prefetch('/portfolio');
      }

      // 2. Prefetch API data for these pages
      preloadPageData(user);
    }, 1000); // Wait 1 second after mount to not block initial render

    return () => {
      if (preloadTimeoutRef.current) {
        clearTimeout(preloadTimeoutRef.current);
      }
    };
  }, [router, user]);

  // Reset preload flag when user changes (to preload portfolio if they log in)
  useEffect(() => {
    if (user && !hasPreloadedRef.current) {
      router.prefetch('/portfolio');
      preloadPageData(user);
    }
  }, [user, router]);

  return null;
}

/**
 * Preload API data for critical pages
 */
async function preloadPageData(user: any) {
  const baseUrl = env.NEXT_PUBLIC_GO_SERVICE_URL || '';
  const monadServiceUrl = process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL || '';

  // Use Promise.allSettled to not fail if one request fails
  const preloadPromises: Promise<any>[] = [];

  // 1. Preload Discover page data (trending tokens)
  preloadPromises.push(
    fetch('/api/token-service/pulse-trending?timeframe=1h&limit=50', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }).catch(err => {
      console.log('[Preloader] Discover data preload failed:', err);
    })
  );

  // 2. Preload Pulse page data (new, final-stretch, migrated)
  if (baseUrl) {
    // COMMENTED OUT: PulseTable is disabled, so Solana pulse data preloading is disabled
    // Solana pulse data
    // preloadPromises.push(
    //   fetch(`${baseUrl}/v1/pulse/new?limit=30`, {
    //     headers: { 'Accept': 'application/json' },
    //   }).catch(err => {
    //     console.log('[Preloader] Pulse new data preload failed:', err);
    //   })
    // );

    // preloadPromises.push(
    //   fetch(`${baseUrl}/v1/pulse/final-stretch?limit=30`, {
    //     headers: { 'Accept': 'application/json' },
    //   }).catch(err => {
    //     console.log('[Preloader] Pulse final-stretch data preload failed:', err);
    //   })
    // );

    // preloadPromises.push(
    //   fetch(`${baseUrl}/v1/pulse/migrated?limit=30`, {
    //     headers: { 'Accept': 'application/json' },
    //   }).catch(err => {
    //     console.log('[Preloader] Pulse migrated data preload failed:', err);
    //   })
    // );

    // Monad pulse data
    if (monadServiceUrl) {
      preloadPromises.push(
        fetch(`${monadServiceUrl}/v1/pulse/new?limit=30`, {
          headers: { 'Accept': 'application/json' },
        }).catch(err => {
          console.log('[Preloader] Monad pulse new data preload failed:', err);
        })
      );

      preloadPromises.push(
        fetch(`${monadServiceUrl}/v1/pulse/final-stretch?limit=30`, {
          headers: { 'Accept': 'application/json' },
        }).catch(err => {
          console.log('[Preloader] Monad pulse final-stretch data preload failed:', err);
        })
      );

      preloadPromises.push(
        fetch(`${monadServiceUrl}/v1/pulse/migrated?limit=30`, {
          headers: { 'Accept': 'application/json' },
        }).catch(err => {
          console.log('[Preloader] Monad pulse migrated data preload failed:', err);
        })
      );
    }
  }

  // 3. Portfolio page data is fetched client-side when user navigates
  // Route prefetching (via router.prefetch) is sufficient for instant navigation

  // Execute all preloads in parallel (fire and forget)
  Promise.allSettled(preloadPromises).then(() => {
    console.log('[Preloader] Page data preloading complete');
  });
}

