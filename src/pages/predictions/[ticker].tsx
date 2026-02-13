// Prediction market detail page - temporarily disabled
// To re-enable, restore the original content from git history

import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function MarketDetailPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);
  return null;
}
