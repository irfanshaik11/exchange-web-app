import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: false,
      retry: 1,
      retryDelay: 1000,
      networkMode: 'online',
    },
    mutations: {
      retry: 0,
    },
  },
});

if (typeof window !== 'undefined') {
  const persister = createSyncStoragePersister({
    storage: window.localStorage,
    key: 'INTERSTATE_CACHE_V1',
  });

  persistQueryClient({
    queryClient,
    persister,
    maxAge: 10 * 60 * 1000,
    buster: 'v1',
  });
}

