/**
 * Navigation guard for Pulse WebSocket processing
 *
 * This hook sets global navigation state so WebSocket handlers can
 * completely pause processing during navigation to prevent blocking.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { setNavigating } from '~/utils/navigationState';
import { pauseNotifications, resumeNotifications } from '~/stores/pulseStore';

export function usePulseNavigationGuard() {
  const router = useRouter();

  useEffect(() => {
    const handleRouteChangeStart = () => {
      // Set global navigation state - WebSocket handlers will check this
      setNavigating(true);
      // Also pause store notifications (legacy)
      pauseNotifications();
    };

    const handleRouteChangeComplete = () => {
      // Resume after navigation completes with small delay
      setTimeout(() => {
        setNavigating(false);
        resumeNotifications();
      }, 50);
    };

    const handleRouteChangeError = () => {
      setNavigating(false);
      resumeNotifications();
    };

    router.events.on('routeChangeStart', handleRouteChangeStart);
    router.events.on('routeChangeComplete', handleRouteChangeComplete);
    router.events.on('routeChangeError', handleRouteChangeError);

    return () => {
      router.events.off('routeChangeStart', handleRouteChangeStart);
      router.events.off('routeChangeComplete', handleRouteChangeComplete);
      router.events.off('routeChangeError', handleRouteChangeError);
    };
  }, [router]);
}
