import { useState, useEffect, useCallback } from 'react';

export type NavLayout = 'top' | 'left';

const STORAGE_KEY = 'predictions-nav-layout';

export default function useNavLayout() {
  const [layout, setLayoutState] = useState<NavLayout>('top');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as NavLayout | null;
    if (saved === 'top' || saved === 'left') setLayoutState(saved);
    setMounted(true);
  }, []);

  const setLayout = useCallback((l: NavLayout) => {
    setLayoutState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const toggle = useCallback(() => {
    setLayoutState(prev => {
      const next = prev === 'top' ? 'left' : 'top';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { layout, setLayout, toggle, mounted };
}
