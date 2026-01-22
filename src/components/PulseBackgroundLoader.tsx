/**
 * Background component that initializes the Pulse Web Worker
 *
 * The Web Worker runs WebSocket connections in a SEPARATE THREAD,
 * completely isolating it from React's main thread.
 * This prevents any blocking during navigation.
 */

import { useEffect } from 'react';
import { env } from '~/env';
import { initPulseWorker } from '~/utils/pulseWorkerBridge';

export function PulseBackgroundLoader() {
  useEffect(() => {
    // Get WebSocket URL from env
    // Format: https://api.example.com or wss://api.example.com
    const envUrl = env.NEXT_PUBLIC_WEBSOCKET_URL || '';
    if (!envUrl) {
      console.warn('[PulseBackgroundLoader] No WebSocket URL configured');
      return;
    }

    // Convert http(s) to ws(s) and remove any path suffix
    // e.g., https://api.example.com/v1/stream -> wss://api.example.com
    let wsBaseUrl = envUrl.replace(/^http/, 'ws');

    // Remove /v1/stream or similar path suffixes - worker adds these
    wsBaseUrl = wsBaseUrl.replace(/\/v1\/stream.*$/, '');
    wsBaseUrl = wsBaseUrl.replace(/\/+$/, ''); // Remove trailing slashes

    console.log('[PulseBackgroundLoader] Initializing worker with:', wsBaseUrl);
    initPulseWorker(wsBaseUrl);

    // Worker persists - no cleanup needed
    // (it will keep running in background)
  }, []);

  return null;
}
